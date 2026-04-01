const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { WORLD_DATA_ROOT, PROJECT_ROOT, getActiveWorldDataRoot } = require('./storage-paths');

const BACKUP_ENABLED = String(process.env.WORLD_BACKUP_ENABLED || '0').trim().toLowerCase() === '1';
const BACKUP_REPO = String(process.env.WORLD_BACKUP_REPO || '').trim();
const BACKUP_BRANCH = String(process.env.WORLD_BACKUP_BRANCH || 'main').trim() || 'main';
const CONFIGURED_REPO_DIR_RAW = String(process.env.WORLD_BACKUP_REPO_DIR || '').trim();
const BACKUP_SUBDIR = String(process.env.WORLD_BACKUP_SUBDIR || path.basename(WORLD_DATA_ROOT) || 'RENAISSANCEWORLD').trim();
const BACKUP_TZ = String(process.env.WORLD_BACKUP_TIMEZONE || 'Asia/Taipei').trim() || 'Asia/Taipei';
const BACKUP_HOUR = Math.max(0, Math.min(23, Number(process.env.WORLD_BACKUP_HOUR || 0)));
const BACKUP_MINUTE = Math.max(0, Math.min(59, Number(process.env.WORLD_BACKUP_MINUTE || 0)));
const BACKUP_RUN_ON_STARTUP = String(process.env.WORLD_BACKUP_RUN_ON_STARTUP || '0').trim().toLowerCase() === '1';
const BACKUP_GIT_NAME = String(process.env.WORLD_BACKUP_GIT_NAME || 'Renaiss World Bot').trim();
const BACKUP_GIT_EMAIL = String(process.env.WORLD_BACKUP_GIT_EMAIL || 'bot@renaiss.world').trim();

let _running = false;
let _lastRunMinuteKey = '';
let _timer = null;
let _repoDirCache = '';
let _onResult = null;

function _getBackupRepoDir() {
  if (_repoDirCache) return _repoDirCache;
  const activeRoot = getActiveWorldDataRoot();
  const defaultDir = path.join(path.dirname(activeRoot), '.renaiss_world_data_repo');
  const preferred = path.resolve(CONFIGURED_REPO_DIR_RAW || defaultDir);

  try {
    fs.mkdirSync(path.dirname(preferred), { recursive: true });
    _repoDirCache = preferred;
    return _repoDirCache;
  } catch (e) {
    const fallback = path.join(PROJECT_ROOT, '.renaiss_world_data_repo');
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    _repoDirCache = fallback;
    console.log(`[Backup] repo dir fallback to ${_repoDirCache}: ${String(e?.message || e)}`);
    return _repoDirCache;
  }
}

function _runGit(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${err}`);
  }
  return (result.stdout || '').trim();
}

function _hasGitStagedChanges(cwd) {
  const result = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd, encoding: 'utf-8' });
  return result.status === 1;
}

function _copyWorldDataToRepo() {
  const backupRepoDir = _getBackupRepoDir();
  const worldDataRoot = getActiveWorldDataRoot();
  const targetDir = path.join(backupRepoDir, BACKUP_SUBDIR);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(worldDataRoot, targetDir, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const resolved = path.resolve(src);
      if (resolved.startsWith(path.resolve(backupRepoDir))) return false;
      return true;
    }
  });
}

function _ensureRepoReady() {
  const backupRepoDir = _getBackupRepoDir();
  const gitDir = path.join(backupRepoDir, '.git');
  if (!fs.existsSync(gitDir)) {
    fs.mkdirSync(path.dirname(backupRepoDir), { recursive: true });
    _runGit(['clone', '--branch', BACKUP_BRANCH, '--single-branch', BACKUP_REPO, backupRepoDir], PROJECT_ROOT);
  } else {
    _runGit(['fetch', 'origin', BACKUP_BRANCH], backupRepoDir);
    _runGit(['checkout', BACKUP_BRANCH], backupRepoDir);
    _runGit(['pull', '--ff-only', 'origin', BACKUP_BRANCH], backupRepoDir);
  }

  _runGit(['config', 'user.name', BACKUP_GIT_NAME], backupRepoDir);
  _runGit(['config', 'user.email', BACKUP_GIT_EMAIL], backupRepoDir);
}

function _getTzNowParts(tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(new Date());

  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute)
  };
}

async function runWorldBackup(reason = 'manual') {
  if (!BACKUP_ENABLED) return { ok: false, skipped: true, reason: 'disabled' };
  if (!BACKUP_REPO) return { ok: false, skipped: true, reason: 'missing_repo' };
  if (_running) return { ok: false, skipped: true, reason: 'already_running' };

  _running = true;
  try {
    _ensureRepoReady();
    _copyWorldDataToRepo();
    const backupRepoDir = _getBackupRepoDir();
    _runGit(['add', '-A'], backupRepoDir);

    if (!_hasGitStagedChanges(backupRepoDir)) {
      return { ok: true, changed: false, reason, repo: BACKUP_REPO, branch: BACKUP_BRANCH };
    }

    const now = new Date();
    const stamp = now.toISOString().replace('T', ' ').slice(0, 19);
    _runGit(['commit', '-m', `backup(world): ${stamp} [${reason}]`], backupRepoDir);
    _runGit(['push', 'origin', BACKUP_BRANCH], backupRepoDir);
    return { ok: true, changed: true, reason, repo: BACKUP_REPO, branch: BACKUP_BRANCH };
  } catch (e) {
    return { ok: false, changed: false, reason, error: String(e?.message || e), repo: BACKUP_REPO, branch: BACKUP_BRANCH };
  } finally {
    _running = false;
  }
}

function _emitResult(result) {
  if (typeof _onResult !== 'function') return;
  Promise.resolve(_onResult(result)).catch((e) => {
    console.log(`[Backup] notify hook failed: ${String(e?.message || e)}`);
  });
}

function _scheduleTick() {
  const now = _getTzNowParts(BACKUP_TZ);
  const minuteKey = `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')} ${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;
  const shouldRun = now.hour === BACKUP_HOUR && now.minute === BACKUP_MINUTE;
  if (!shouldRun || _lastRunMinuteKey === minuteKey) return;

  _lastRunMinuteKey = minuteKey;
  runWorldBackup('scheduled').then((res) => {
    if (res.ok) {
      console.log(`[Backup] scheduled done: changed=${Boolean(res.changed)} repo=${BACKUP_REPO}`);
    } else {
      console.log(`[Backup] scheduled failed: ${res.error || res.reason || 'unknown'}`);
    }
    _emitResult(res);
  });
}

function startWorldBackupScheduler(onResult) {
  _onResult = typeof onResult === 'function' ? onResult : null;
  if (!BACKUP_ENABLED) {
    console.log('[Backup] disabled (WORLD_BACKUP_ENABLED != 1)');
    return;
  }

  if (!BACKUP_REPO) {
    console.log('[Backup] disabled: WORLD_BACKUP_REPO is empty');
    return;
  }

  const worldDataRoot = getActiveWorldDataRoot();
  if (!fs.existsSync(worldDataRoot)) {
    fs.mkdirSync(worldDataRoot, { recursive: true });
  }

  console.log(`[Backup] scheduler on ${BACKUP_TZ} ${String(BACKUP_HOUR).padStart(2, '0')}:${String(BACKUP_MINUTE).padStart(2, '0')}`);
  if (BACKUP_RUN_ON_STARTUP) {
    runWorldBackup('startup').then((res) => {
      if (res.ok) {
        console.log(`[Backup] startup done: changed=${Boolean(res.changed)} repo=${BACKUP_REPO}`);
      } else {
        console.log(`[Backup] startup failed: ${res.error || res.reason || 'unknown'}`);
      }
      _emitResult(res);
    });
  }

  if (_timer) clearInterval(_timer);
  _timer = setInterval(_scheduleTick, 30 * 1000);
}

module.exports = {
  runWorldBackup,
  startWorldBackupScheduler
};
