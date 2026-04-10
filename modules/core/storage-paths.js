const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const LEGACY_DATA_DIR = path.join(PROJECT_ROOT, 'data');
const APP_ENV = String(process.env.APP_ENV || 'local').trim().toLowerCase() || 'local';
const LOCAL_EXTERNAL_DATA_ROOT = path.join(os.homedir(), '.renaiss_world_data', 'RENAISSANCEWORLD');
const DEFAULT_WORLD_DATA_ROOT = APP_ENV === 'server' ? '/world/RENAISSANCEWORLD' : LOCAL_EXTERNAL_DATA_ROOT;
const WORLD_DATA_ROOT = path.resolve(String(process.env.WORLD_DATA_ROOT || DEFAULT_WORLD_DATA_ROOT).trim() || DEFAULT_WORLD_DATA_ROOT);
let ACTIVE_WORLD_DATA_ROOT = WORLD_DATA_ROOT;
const WORLD_DATA_MIGRATE_ONCE = String(process.env.WORLD_DATA_MIGRATE_ONCE || '1').trim().toLowerCase() !== '0';

function _timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function _isDirectoryEmpty(dir) {
  try {
    const names = fs.readdirSync(dir);
    return names.length === 0;
  } catch {
    return true;
  }
}

function _ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function _migrateLegacyDataOnce(targetRoot) {
  if (!WORLD_DATA_MIGRATE_ONCE) return;
  if (!fs.existsSync(LEGACY_DATA_DIR)) return;
  if (!fs.lstatSync(LEGACY_DATA_DIR).isDirectory()) return;
  _ensureDir(targetRoot);
  if (!_isDirectoryEmpty(targetRoot)) return;
  fs.cpSync(LEGACY_DATA_DIR, targetRoot, { recursive: true, dereference: true });
  console.log(`[Storage] Migrated initial data: ${LEGACY_DATA_DIR} -> ${targetRoot}`);
}

function _ensureLegacySymlink(targetRoot) {
  const resolvedTarget = path.resolve(targetRoot);
  if (resolvedTarget === path.resolve(LEGACY_DATA_DIR)) {
    _ensureDir(LEGACY_DATA_DIR);
    return;
  }

  _ensureDir(resolvedTarget);
  _migrateLegacyDataOnce(resolvedTarget);

  if (fs.existsSync(LEGACY_DATA_DIR)) {
    const stat = fs.lstatSync(LEGACY_DATA_DIR);
    if (stat.isSymbolicLink()) {
      const currentTarget = path.resolve(path.dirname(LEGACY_DATA_DIR), fs.readlinkSync(LEGACY_DATA_DIR));
      if (currentTarget === resolvedTarget) return;
      fs.unlinkSync(LEGACY_DATA_DIR);
    } else {
      const backupPath = `${LEGACY_DATA_DIR}_local_backup_${_timestamp()}`;
      fs.renameSync(LEGACY_DATA_DIR, backupPath);
      console.log(`[Storage] Existing local data moved to backup: ${backupPath}`);
    }
  }

  fs.symlinkSync(resolvedTarget, LEGACY_DATA_DIR, 'dir');
  console.log(`[Storage] Linked ${LEGACY_DATA_DIR} -> ${resolvedTarget}`);
}

function setupWorldStorage() {
  const fallbackRoot = path.resolve(
    String(process.env.WORLD_DATA_FALLBACK_ROOT || LOCAL_EXTERNAL_DATA_ROOT).trim() || LOCAL_EXTERNAL_DATA_ROOT
  );
  try {
    _ensureLegacySymlink(WORLD_DATA_ROOT);
    return {
      appEnv: APP_ENV,
      dataDir: LEGACY_DATA_DIR,
      worldDataRoot: ACTIVE_WORLD_DATA_ROOT = WORLD_DATA_ROOT,
      usingSymlink: path.resolve(WORLD_DATA_ROOT) !== path.resolve(LEGACY_DATA_DIR),
      fallback: false
    };
  } catch (e) {
    console.log(`[Storage] setup failed at ${WORLD_DATA_ROOT}, fallback to external root ${fallbackRoot}: ${String(e?.message || e)}`);
    _ensureLegacySymlink(fallbackRoot);
    return {
      appEnv: APP_ENV,
      dataDir: LEGACY_DATA_DIR,
      worldDataRoot: ACTIVE_WORLD_DATA_ROOT = fallbackRoot,
      usingSymlink: true,
      fallback: true
    };
  }
}

function getActiveWorldDataRoot() {
  return ACTIVE_WORLD_DATA_ROOT;
}

module.exports = {
  PROJECT_ROOT,
  LEGACY_DATA_DIR,
  WORLD_DATA_ROOT,
  getActiveWorldDataRoot,
  setupWorldStorage
};
