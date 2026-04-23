const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_VOLATILE_FILE_PATTERNS = Object.freeze([
  /^memory_index\.sqlite(?:-wal|-shm)?$/i,
  /^runtime_state\.sqlite(?:-wal|-shm)?$/i,
  /^interaction_coverage\.json$/i,
  /^last_tick\.json$/i,
  /^world_events\.json$/i,
  /^loot_audit\.jsonl$/i
]);

function normalizeRelPath(relPath = '') {
  const raw = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  return raw;
}

function shouldExcludeVolatilePath(relPath = '', patterns = DEFAULT_VOLATILE_FILE_PATTERNS) {
  const normalized = normalizeRelPath(relPath);
  if (!normalized) return false;
  const fileName = path.posix.basename(normalized);
  return patterns.some((pattern) => pattern.test(fileName));
}

function shouldIncludeSnapshotPath(relPath = '', options = {}) {
  const includeVolatile = Boolean(options.includeVolatile);
  if (includeVolatile) return true;
  return !shouldExcludeVolatilePath(relPath, options.volatilePatterns);
}

function copyWorldDataSnapshot(worldDataRoot, targetDir, options = {}) {
  const sourceRoot = path.resolve(String(worldDataRoot || '').trim());
  const outputDir = path.resolve(String(targetDir || '').trim());
  if (!sourceRoot || !outputDir) {
    throw new Error('copyWorldDataSnapshot requires source and target directories');
  }
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(outputDir), { recursive: true });
  fs.cpSync(sourceRoot, outputDir, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const resolved = path.resolve(src);
      const rel = path.relative(sourceRoot, resolved);
      if (!rel || rel === '' || rel === '.') return true;
      return shouldIncludeSnapshotPath(rel, options);
    }
  });
  return outputDir;
}

function runTar(args = [], cwd = process.cwd()) {
  const result = spawnSync('tar', args, { cwd, encoding: 'utf-8' });
  if (result.status !== 0) {
    const errorText = String(result.stderr || result.stdout || result.error?.message || '').trim();
    throw new Error(`tar ${args.join(' ')} failed: ${errorText}`);
  }
}

function createWorldSnapshotArchive(worldDataRoot, backupSubdir, options = {}) {
  const safeSubdir = String(backupSubdir || '').trim() || 'RENAISSANCEWORLD';
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'renaiss-world-backup-'));
  const snapshotDir = path.join(tempRoot, safeSubdir);
  copyWorldDataSnapshot(worldDataRoot, snapshotDir, options);

  const archiveFileName = `${safeSubdir}.tar.gz`;
  const archivePath = path.join(tempRoot, archiveFileName);
  runTar(['-czf', archivePath, '-C', tempRoot, safeSubdir], tempRoot);

  return {
    archivePath,
    archiveFileName,
    snapshotDir,
    tempRoot,
    cleanup: () => {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
}

function atomicReplaceWorldDataFromSnapshot(snapshotDir, worldDataRoot) {
  const sourceDir = path.resolve(String(snapshotDir || '').trim());
  const targetRoot = path.resolve(String(worldDataRoot || '').trim());
  if (!sourceDir || !targetRoot) {
    throw new Error('atomicReplaceWorldDataFromSnapshot requires source and target directories');
  }
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`snapshot source not found: ${sourceDir}`);
  }
  const worldParent = path.dirname(targetRoot);
  const tempRestoreDir = path.join(worldParent, `${path.basename(targetRoot)}.__restore_tmp__${Date.now()}`);
  fs.rmSync(tempRestoreDir, { recursive: true, force: true });
  fs.mkdirSync(worldParent, { recursive: true });
  fs.cpSync(sourceDir, tempRestoreDir, { recursive: true, dereference: true });
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.renameSync(tempRestoreDir, targetRoot);
}

function restoreWorldDataFromArchive(archivePath, backupSubdir, worldDataRoot) {
  const safeArchivePath = path.resolve(String(archivePath || '').trim());
  if (!safeArchivePath || !fs.existsSync(safeArchivePath)) {
    throw new Error(`backup archive not found: ${safeArchivePath}`);
  }
  const safeSubdir = String(backupSubdir || '').trim() || 'RENAISSANCEWORLD';
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'renaiss-world-restore-'));
  try {
    runTar(['-xzf', safeArchivePath, '-C', tempRoot], tempRoot);
    const sourceDir = path.join(tempRoot, safeSubdir);
    if (!fs.existsSync(sourceDir)) {
      const children = fs.readdirSync(tempRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      if (children.length === 1) {
        atomicReplaceWorldDataFromSnapshot(path.join(tempRoot, children[0]), worldDataRoot);
        return;
      }
      throw new Error(`archive does not contain expected subdir: ${safeSubdir}`);
    }
    atomicReplaceWorldDataFromSnapshot(sourceDir, worldDataRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

module.exports = {
  DEFAULT_VOLATILE_FILE_PATTERNS,
  shouldExcludeVolatilePath,
  shouldIncludeSnapshotPath,
  copyWorldDataSnapshot,
  createWorldSnapshotArchive,
  atomicReplaceWorldDataFromSnapshot,
  restoreWorldDataFromArchive
};
