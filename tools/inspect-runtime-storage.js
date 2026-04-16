const fs = require('fs');
const path = require('path');

const { loadProjectEnv } = require('../modules/core/load-env');

loadProjectEnv();

const { setupWorldStorage, LEGACY_DATA_DIR } = require('../modules/core/storage-paths');
setupWorldStorage();

const CORE = require('../modules/core/game-core');
const { DB_FILE, countNamespaceEntries, listNamespaceKeys } = require('../modules/systems/data/runtime-state-sqlite');
const { safeReadJsonFileSync, normalizeObjectRecord } = require('../modules/systems/data/queued-json-store');

const DATA_DIR = LEGACY_DATA_DIR;
const PLAYERS_DIR = path.join(DATA_DIR, 'players');
const PETS_FILE = path.join(DATA_DIR, 'pets.json');
const USER_WALLETS_FILE = path.join(DATA_DIR, 'user_wallets.json');
const PLAYER_THREADS_FILE = path.join(DATA_DIR, 'player_threads.json');

function getMirrorPlayerIds() {
  try {
    return fs.readdirSync(PLAYERS_DIR)
      .filter((name) => name.endsWith('.json') && !name.endsWith('_memory.json'))
      .map((name) => String(name || '').replace(/\.json$/, '').trim())
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

function compareKeySets(dbKeys = [], mirrorKeys = []) {
  const dbSet = new Set(dbKeys);
  const mirrorSet = new Set(mirrorKeys);
  return {
    dbCount: dbKeys.length,
    mirrorCount: mirrorKeys.length,
    onlyDb: dbKeys.filter((key) => !mirrorSet.has(key)),
    onlyMirror: mirrorKeys.filter((key) => !dbSet.has(key))
  };
}

function singletonStatus(namespace, mirrorFile) {
  return {
    namespace,
    dbEntries: countNamespaceEntries(namespace),
    mirrorExists: fs.existsSync(mirrorFile)
  };
}

function main() {
  const petMirror = safeReadJsonFileSync(PETS_FILE, () => ({}), normalizeObjectRecord);
  const walletMirror = safeReadJsonFileSync(USER_WALLETS_FILE, () => ({}), normalizeObjectRecord);
  const threadMirror = safeReadJsonFileSync(PLAYER_THREADS_FILE, () => ({}), normalizeObjectRecord);

  console.log(JSON.stringify({
    inspectedAt: new Date().toISOString(),
    dataDir: DATA_DIR,
    sqliteDb: DB_FILE,
    sqliteExists: fs.existsSync(DB_FILE),
    players: CORE.inspectPlayerStorage(),
    pets: compareKeySets(listNamespaceKeys('pet_state').sort(), Object.keys(petMirror).sort()),
    wallets: compareKeySets(listNamespaceKeys('wallet_settings').sort(), Object.keys(walletMirror).sort()),
    playerThreads: compareKeySets(listNamespaceKeys('player_threads').sort(), Object.keys(threadMirror).sort()),
    worldState: singletonStatus('world_state', path.join(DATA_DIR, 'world.json')),
    npcQuotes: singletonStatus('npc_quotes', path.join(DATA_DIR, 'npc_quote_memory.json')),
    worldEvents: singletonStatus('world_events', path.join(DATA_DIR, 'world_events.json')),
    lastTick: singletonStatus('last_tick', path.join(DATA_DIR, 'last_tick.json')),
    marketBoard: singletonStatus('market_board', path.join(DATA_DIR, 'player_market_board.json')),
    scratchLottery: singletonStatus('scratch_lottery', path.join(DATA_DIR, 'scratch_lottery.json')),
    playerFiles: getMirrorPlayerIds().length
  }, null, 2));
}

main();
