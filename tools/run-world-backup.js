const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const { setupWorldStorage } = require('../storage-paths');
const { runWorldBackup } = require('../world-backup');

setupWorldStorage();

runWorldBackup('manual').then((res) => {
  if (res.ok) {
    console.log(`[Backup] manual done: changed=${Boolean(res.changed)}`);
    process.exit(0);
  }
  console.error(`[Backup] manual failed: ${res.error || res.reason || 'unknown'}`);
  process.exit(1);
});

