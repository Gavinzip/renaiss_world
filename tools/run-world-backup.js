const { loadProjectEnv } = require('../modules/core/load-env');

loadProjectEnv();

const { setupWorldStorage } = require('../modules/core/storage-paths');
const { runWorldBackup } = require('../modules/systems/data/world-backup');

setupWorldStorage();

runWorldBackup('manual').then((res) => {
  if (res.ok) {
    console.log(`[Backup] manual done: changed=${Boolean(res.changed)}`);
    process.exit(0);
  }
  console.error(`[Backup] manual failed: ${res.error || res.reason || 'unknown'}`);
  process.exit(1);
});
