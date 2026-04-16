const fs = require('fs');
const path = require('path');

const { LEGACY_DATA_DIR } = require('../../core/storage-paths');

const LOOT_AUDIT_FILE = path.join(LEGACY_DATA_DIR, 'loot_audit.jsonl');

let writeQueue = Promise.resolve();

function appendLootAudit(entry = {}) {
  const payload = {
    loggedAt: new Date().toISOString(),
    ...entry
  };

  writeQueue = writeQueue
    .then(async () => {
      await fs.promises.mkdir(path.dirname(LOOT_AUDIT_FILE), { recursive: true });
      await fs.promises.appendFile(LOOT_AUDIT_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
    })
    .catch((error) => {
      console.error(`[LootAudit] append failed: ${String(error?.message || error)}`);
      return null;
    });

  return writeQueue;
}

module.exports = {
  LOOT_AUDIT_FILE,
  appendLootAudit
};
