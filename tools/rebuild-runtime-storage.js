const path = require('path');

const { loadProjectEnv } = require('../modules/core/load-env');

loadProjectEnv();

const { setupWorldStorage, LEGACY_DATA_DIR } = require('../modules/core/storage-paths');
setupWorldStorage();

const CORE = require('../modules/core/game-core');
const PET = require('../modules/systems/pet/pet-system');
const WALLET = require('../modules/systems/player/wallet-system');
const { safeReadJsonFileSync, normalizeObjectRecord } = require('../modules/systems/data/queued-json-store');
const { createSqliteMirroredObjectRepository, createSqliteMirroredSingletonStore } = require('../modules/systems/data/sqlite-mirrored-state');

const DATA_DIR = LEGACY_DATA_DIR;
const PLAYER_THREADS_FILE = path.join(DATA_DIR, 'player_threads.json');
const USER_WALLETS_FILE = path.join(DATA_DIR, 'user_wallets.json');
const PETS_FILE = path.join(DATA_DIR, 'pets.json');
const WORLD_FILE = path.join(DATA_DIR, 'world.json');
const WORLD_EVENTS_FILE = path.join(DATA_DIR, 'world_events.json');
const LAST_TICK_FILE = path.join(DATA_DIR, 'last_tick.json');
const MARKET_BOARD_FILE = path.join(DATA_DIR, 'player_market_board.json');
const SCRATCH_FILE = path.join(DATA_DIR, 'scratch_lottery.json');
const NPC_QUOTES_FILE = path.join(DATA_DIR, 'npc_quote_memory.json');

function normalizeThreadEntry(value) {
  if (value === null || value === undefined) return null;
  const safe = String(value || '').trim();
  return safe || null;
}

function normalizeWalletSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [userId, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    out[String(userId || '').trim()] = {
      ...entry,
      walletAddress: entry.walletAddress !== undefined && entry.walletAddress !== null
        ? String(entry.walletAddress).toLowerCase().trim()
        : entry.walletAddress
    };
  }
  return out;
}

function normalizePetStorePayload(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [rawId, pet] of Object.entries(value)) {
    const id = String(rawId || pet?.id || '').trim();
    if (!id || !pet || typeof pet !== 'object' || Array.isArray(pet)) continue;
    out[id] = { ...pet, id };
  }
  return out;
}

function normalizeWorldStatePayload(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    world: source.world && typeof source.world === 'object' && !Array.isArray(source.world) ? source.world : {},
    agents: Array.isArray(source.agents) ? source.agents : [],
    agentMemories: source.agentMemories && typeof source.agentMemories === 'object' && !Array.isArray(source.agentMemories)
      ? source.agentMemories
      : {},
    agentInventories: source.agentInventories && typeof source.agentInventories === 'object' && !Array.isArray(source.agentInventories)
      ? source.agentInventories
      : {}
  };
}

function normalizeNpcQuoteStorePayload(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    version: Math.max(1, Number(source.version || 1)),
    quotesByPlayer: source.quotesByPlayer && typeof source.quotesByPlayer === 'object' && !Array.isArray(source.quotesByPlayer)
      ? source.quotesByPlayer
      : {}
  };
}

function normalizeWorldEventsPayload(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    events: Array.isArray(source.events) ? source.events : [],
    modifiedLocations: source.modifiedLocations && typeof source.modifiedLocations === 'object' && !Array.isArray(source.modifiedLocations)
      ? source.modifiedLocations
      : {}
  };
}

function normalizeLastTickPayload(value = {}) {
  return {
    date: String(value?.date || '2000-01-01'),
    timestamp: Math.max(0, Number(value?.timestamp || 0))
  };
}

function normalizeMarketBoardPayload(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    version: 1,
    updatedAt: Math.max(0, Number(source.updatedAt || Date.now())),
    listings: Array.isArray(source.listings) ? source.listings : []
  };
}

function normalizeScratchStatePayload(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    jackpotPool: Math.max(0, Number(source.jackpotPool || 0)),
    plays: Math.max(0, Number(source.plays || 0)),
    wins: Math.max(0, Number(source.wins || 0)),
    losses: Math.max(0, Number(source.losses || 0)),
    updatedAt: Math.max(0, Number(source.updatedAt || Date.now()))
  };
}

async function main() {
  const threadsRepo = createSqliteMirroredObjectRepository({
    namespace: 'player_threads',
    mirrorFilePath: PLAYER_THREADS_FILE,
    defaultValueFactory: () => ({}),
    normalizeAll: normalizeObjectRecord,
    normalizeEntry: normalizeThreadEntry
  });
  const worldStateStore = createSqliteMirroredSingletonStore({
    namespace: 'world_state',
    mirrorFilePath: WORLD_FILE,
    defaultValueFactory: () => ({ world: {}, agents: [], agentMemories: {}, agentInventories: {} }),
    normalize: normalizeWorldStatePayload
  });
  const npcQuotesStore = createSqliteMirroredSingletonStore({
    namespace: 'npc_quotes',
    mirrorFilePath: NPC_QUOTES_FILE,
    defaultValueFactory: () => ({ version: 1, quotesByPlayer: {} }),
    normalize: normalizeNpcQuoteStorePayload
  });
  const worldEventsStore = createSqliteMirroredSingletonStore({
    namespace: 'world_events',
    mirrorFilePath: WORLD_EVENTS_FILE,
    defaultValueFactory: () => ({ events: [], modifiedLocations: {} }),
    normalize: normalizeWorldEventsPayload
  });
  const lastTickStore = createSqliteMirroredSingletonStore({
    namespace: 'last_tick',
    mirrorFilePath: LAST_TICK_FILE,
    defaultValueFactory: () => ({ date: '2000-01-01', timestamp: 0 }),
    normalize: normalizeLastTickPayload
  });
  const marketBoardStore = createSqliteMirroredSingletonStore({
    namespace: 'market_board',
    mirrorFilePath: MARKET_BOARD_FILE,
    defaultValueFactory: () => ({ version: 1, updatedAt: Date.now(), listings: [] }),
    normalize: normalizeMarketBoardPayload
  });
  const scratchStore = createSqliteMirroredSingletonStore({
    namespace: 'scratch_lottery',
    mirrorFilePath: SCRATCH_FILE,
    defaultValueFactory: () => ({ jackpotPool: 0, plays: 0, wins: 0, losses: 0, updatedAt: Date.now() }),
    normalize: normalizeScratchStatePayload
  });

  const playerReport = CORE.rebuildPlayerStorageFromMirrors({ pruneMissing: true });
  await CORE.flushPlayerStorage();

  const petData = safeReadJsonFileSync(PETS_FILE, () => ({}), normalizePetStorePayload);
  PET.replaceAllPets(petData);
  await PET.flushPetStore();

  const walletData = safeReadJsonFileSync(USER_WALLETS_FILE, () => ({}), normalizeWalletSettings);
  WALLET.replaceWalletSettings(walletData);
  await WALLET.flushWalletSettings();

  const threadData = safeReadJsonFileSync(PLAYER_THREADS_FILE, () => ({}), normalizeObjectRecord);
  threadsRepo.replaceAll(threadData);
  await threadsRepo.flush();

  worldStateStore.replace(safeReadJsonFileSync(
    WORLD_FILE,
    () => ({ world: {}, agents: [], agentMemories: {}, agentInventories: {} }),
    normalizeWorldStatePayload
  ));
  npcQuotesStore.replace(safeReadJsonFileSync(
    NPC_QUOTES_FILE,
    () => ({ version: 1, quotesByPlayer: {} }),
    normalizeNpcQuoteStorePayload
  ));
  worldEventsStore.replace(safeReadJsonFileSync(
    WORLD_EVENTS_FILE,
    () => ({ events: [], modifiedLocations: {} }),
    normalizeWorldEventsPayload
  ));
  lastTickStore.replace(safeReadJsonFileSync(
    LAST_TICK_FILE,
    () => ({ date: '2000-01-01', timestamp: 0 }),
    normalizeLastTickPayload
  ));
  marketBoardStore.replace(safeReadJsonFileSync(
    MARKET_BOARD_FILE,
    () => ({ version: 1, updatedAt: Date.now(), listings: [] }),
    normalizeMarketBoardPayload
  ));
  scratchStore.replace(safeReadJsonFileSync(
    SCRATCH_FILE,
    () => ({ jackpotPool: 0, plays: 0, wins: 0, losses: 0, updatedAt: Date.now() }),
    normalizeScratchStatePayload
  ));

  await Promise.all([
    worldStateStore.flush(),
    npcQuotesStore.flush(),
    worldEventsStore.flush(),
    lastTickStore.flush(),
    marketBoardStore.flush(),
    scratchStore.flush()
  ]);

  const worldState = worldStateStore.read();
  const npcQuotes = npcQuotesStore.read();
  const worldEvents = worldEventsStore.read();
  const marketBoard = marketBoardStore.read();
  const scratch = scratchStore.read();

  console.log(JSON.stringify({
    rebuiltAt: new Date().toISOString(),
    dataDir: DATA_DIR,
    players: playerReport,
    pets: { total: Object.keys(petData).length },
    wallets: { total: Object.keys(walletData).length },
    threads: { total: Object.keys(threadData).length },
    worldState: { agents: Array.isArray(worldState.agents) ? worldState.agents.length : 0 },
    npcQuotes: { players: Object.keys(npcQuotes.quotesByPlayer || {}).length },
    worldEvents: { events: Array.isArray(worldEvents.events) ? worldEvents.events.length : 0 },
    lastTick: lastTickStore.read(),
    marketBoard: { listings: Array.isArray(marketBoard.listings) ? marketBoard.listings.length : 0 },
    scratch
  }, null, 2));
}

main().catch((error) => {
  console.error('[storage:rebuild] failed:', error?.stack || error);
  process.exitCode = 1;
});
