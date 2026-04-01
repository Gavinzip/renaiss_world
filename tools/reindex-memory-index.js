const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const CORE = require('../game-core');

async function main() {
  try {
    const players = CORE.getAllPlayers();
    console.log(`[Reindex] players=${players.length}`);
    if (!players.length) {
      console.log('[Reindex] no players found');
      return;
    }

    const results = await CORE.rebuildAllPlayersMemoryIndex();
    let totalInserted = 0;
    let totalCleared = 0;

    for (const r of results) {
      const inserted = Number(r?.inserted || 0);
      const cleared = Number(r?.cleared || 0);
      totalInserted += inserted;
      totalCleared += cleared;
      console.log(`[Reindex] player=${r.playerId} cleared=${cleared} inserted=${inserted}`);
    }

    console.log(`[Reindex] done cleared=${totalCleared} inserted=${totalInserted}`);
  } catch (e) {
    console.error('[Reindex] failed:', e?.message || e);
    process.exitCode = 1;
  }
}

main();
