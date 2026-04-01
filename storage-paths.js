const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = __dirname;
const LEGACY_DATA_DIR = path.join(PROJECT_ROOT, 'data');
const APP_ENV = String(process.env.APP_ENV || 'local').trim().toLowerCase() || 'local';
const DEFAULT_WORLD_DATA_ROOT = APP_ENV === 'server' ? '/world/RENAISSANCEWORLD' : LEGACY_DATA_DIR;
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

function _migrateLegacyDataOnce() {
  if (!WORLD_DATA_MIGRATE_ONCE) return;
  if (!fs.existsSync(LEGACY_DATA_DIR)) return;
  if (!fs.lstatSync(LEGACY_DATA_DIR).isDirectory()) return;
  _ensureDir(WORLD_DATA_ROOT);
  if (!_isDirectoryEmpty(WORLD_DATA_ROOT)) return;
  fs.cpSync(LEGACY_DATA_DIR, WORLD_DATA_ROOT, { recursive: true, dereference: true });
  console.log(`[Storage] Migrated initial data: ${LEGACY_DATA_DIR} -> ${WORLD_DATA_ROOT}`);
}

function _ensureLegacySymlink() {
  if (path.resolve(WORLD_DATA_ROOT) === path.resolve(LEGACY_DATA_DIR)) {
    _ensureDir(LEGACY_DATA_DIR);
    return;
  }

  _ensureDir(WORLD_DATA_ROOT);
  _migrateLegacyDataOnce();

  if (fs.existsSync(LEGACY_DATA_DIR)) {
    const stat = fs.lstatSync(LEGACY_DATA_DIR);
    if (stat.isSymbolicLink()) {
      const currentTarget = path.resolve(path.dirname(LEGACY_DATA_DIR), fs.readlinkSync(LEGACY_DATA_DIR));
      if (currentTarget === WORLD_DATA_ROOT) return;
      fs.unlinkSync(LEGACY_DATA_DIR);
    } else {
      const backupPath = `${LEGACY_DATA_DIR}_local_backup_${_timestamp()}`;
      fs.renameSync(LEGACY_DATA_DIR, backupPath);
      console.log(`[Storage] Existing local data moved to backup: ${backupPath}`);
    }
  }

  fs.symlinkSync(WORLD_DATA_ROOT, LEGACY_DATA_DIR, 'dir');
  console.log(`[Storage] Linked ${LEGACY_DATA_DIR} -> ${WORLD_DATA_ROOT}`);
}

function setupWorldStorage() {
  try {
    _ensureLegacySymlink();
    return {
      appEnv: APP_ENV,
      dataDir: LEGACY_DATA_DIR,
      worldDataRoot: ACTIVE_WORLD_DATA_ROOT = WORLD_DATA_ROOT,
      usingSymlink: path.resolve(WORLD_DATA_ROOT) !== path.resolve(LEGACY_DATA_DIR),
      fallback: false
    };
  } catch (e) {
    _ensureDir(LEGACY_DATA_DIR);
    console.log(`[Storage] setup failed at ${WORLD_DATA_ROOT}, fallback to local data dir: ${String(e?.message || e)}`);
    return {
      appEnv: APP_ENV,
      dataDir: LEGACY_DATA_DIR,
      worldDataRoot: ACTIVE_WORLD_DATA_ROOT = LEGACY_DATA_DIR,
      usingSymlink: false,
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
