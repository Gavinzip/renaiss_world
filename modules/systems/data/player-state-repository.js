const fs = require('fs');
const path = require('path');

const { atomicWriteJson, deepCloneJson, safeReadJsonFileSync } = require('./queued-json-store');
const {
  clearNamespace,
  countNamespaceEntries,
  listNamespaceKeys,
  readNamespaceEntry,
  readNamespaceObject,
  replaceNamespaceObject,
  upsertNamespaceEntry,
  deleteNamespaceEntry
} = require('./runtime-state-sqlite');

function createPlayerStateRepository(options = {}) {
  const namespace = String(options.namespace || 'player_state').trim() || 'player_state';
  const mirrorDirPath = path.resolve(String(options.mirrorDirPath || '.'));
  const normalizeStorage = typeof options.normalizeStorage === 'function'
    ? options.normalizeStorage
    : (player) => player;
  const normalizeRuntime = typeof options.normalizeRuntime === 'function'
    ? options.normalizeRuntime
    : (player) => player;
  const onWriteError = typeof options.onWriteError === 'function'
    ? options.onWriteError
    : () => {};

  const cache = new Map();
  const deletedIds = new Set();
  let writeQueue = Promise.resolve();
  let loadedAll = false;
  let clearedAll = false;

  function getPlayerFilePath(playerId) {
    return path.join(mirrorDirPath, `${playerId}.json`);
  }

  function safePlayerId(playerId) {
    return String(playerId || '').trim();
  }

  function readPlayerFromMirror(playerId) {
    const safeId = safePlayerId(playerId);
    if (!safeId) return null;
    const filePath = getPlayerFilePath(safeId);
    const parsed = safeReadJsonFileSync(
      filePath,
      () => null,
      (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null)
    );
    return parsed ? normalizeRuntime(parsed) : null;
  }

  function persistMirrorSnapshot(playerId, snapshot) {
    return atomicWriteJson(getPlayerFilePath(playerId), snapshot);
  }

  function enqueueWrite(task) {
    writeQueue = writeQueue
      .then(task)
      .catch((error) => {
        onWriteError(error);
        return null;
      });
    return writeQueue;
  }

  function ensureBootstrappedFromMirrors() {
    if (countNamespaceEntries(namespace) > 0) return;
    if (!fs.existsSync(mirrorDirPath)) return;
    const names = fs.readdirSync(mirrorDirPath).filter((name) => name.endsWith('.json') && !name.endsWith('_memory.json'));
    if (!names.length) return;
    const entries = {};
    for (const fileName of names) {
      const playerId = String(fileName || '').replace(/\.json$/, '').trim();
      if (!playerId) continue;
      const parsed = readPlayerFromMirror(playerId);
      if (!parsed) continue;
      entries[playerId] = normalizeStorage(parsed);
    }
    if (Object.keys(entries).length > 0) {
      replaceNamespaceObject(namespace, entries);
    }
  }

  ensureBootstrappedFromMirrors();

  function get(playerId) {
    const id = safePlayerId(playerId);
    if (!id) return null;
    if (deletedIds.has(id)) return null;
    if (clearedAll && !cache.has(id)) return null;
    if (cache.has(id)) {
      const cached = cache.get(id);
      return cached ? deepCloneJson(cached) : null;
    }

    const fromDb = readNamespaceEntry(namespace, id);
    if (fromDb && typeof fromDb === 'object' && !Array.isArray(fromDb)) {
      const normalized = normalizeRuntime(fromDb);
      cache.set(id, normalized ? deepCloneJson(normalized) : null);
      return normalized ? deepCloneJson(normalized) : null;
    }

    const fromMirror = readPlayerFromMirror(id);
    if (fromMirror) {
      const storageSnapshot = normalizeStorage(fromMirror);
      cache.set(id, deepCloneJson(fromMirror));
      enqueueWrite(async () => {
        await fs.promises.mkdir(mirrorDirPath, { recursive: true });
        upsertNamespaceEntry(namespace, id, storageSnapshot);
      });
      return deepCloneJson(fromMirror);
    }

    cache.set(id, null);
    return null;
  }

  function save(player) {
    const normalizedPlayer = normalizeStorage(player);
    const id = safePlayerId(normalizedPlayer?.id);
    if (!normalizedPlayer || !id) return null;
    const runtimeSnapshot = normalizeRuntime(normalizedPlayer);
    clearedAll = false;
    deletedIds.delete(id);
    cache.set(id, deepCloneJson(runtimeSnapshot));
    const storageSnapshot = deepCloneJson(normalizedPlayer);
    enqueueWrite(async () => {
      await fs.promises.mkdir(mirrorDirPath, { recursive: true });
      upsertNamespaceEntry(namespace, id, storageSnapshot);
      await persistMirrorSnapshot(id, storageSnapshot);
    });
    return deepCloneJson(runtimeSnapshot);
  }

  function listAll() {
    const merged = new Map();
    for (const [id, player] of cache.entries()) {
      merged.set(id, player ? deepCloneJson(player) : null);
    }

    if (!clearedAll && !loadedAll) {
      const allPlayers = readNamespaceObject(namespace);
      for (const [id, rawPlayer] of Object.entries(allPlayers)) {
        if (!id || deletedIds.has(id) || merged.has(id)) continue;
        const normalized = normalizeRuntime(rawPlayer);
        merged.set(id, normalized ? deepCloneJson(normalized) : null);
        cache.set(id, normalized ? deepCloneJson(normalized) : null);
      }
      loadedAll = true;
    }

    const out = [];
    for (const [id, player] of merged.entries()) {
      if (!player || deletedIds.has(id)) continue;
      out.push(deepCloneJson(player));
    }
    return out;
  }

  function deleteById(playerId) {
    const id = safePlayerId(playerId);
    if (!id) return { removedPlayerFile: false };
    const filePath = getPlayerFilePath(id);
    const existed = cache.has(id)
      ? Boolean(cache.get(id))
      : (readNamespaceEntry(namespace, id) !== undefined || fs.existsSync(filePath));
    cache.delete(id);
    deletedIds.add(id);
    enqueueWrite(async () => {
      deleteNamespaceEntry(namespace, id);
      await fs.promises.rm(filePath, { force: true });
    });
    return { removedPlayerFile: existed };
  }

  function clearAll() {
    const mirrorIds = fs.existsSync(mirrorDirPath)
      ? fs.readdirSync(mirrorDirPath)
        .filter((name) => name.endsWith('.json') && !name.endsWith('_memory.json'))
        .map((name) => String(name || '').replace(/\.json$/, '').trim())
        .filter(Boolean)
      : [];
    const dbIds = listNamespaceKeys(namespace);
    const removedIds = new Set([...mirrorIds, ...dbIds]);
    for (const [id, player] of cache.entries()) {
      if (player) removedIds.add(id);
    }

    cache.clear();
    deletedIds.clear();
    for (const id of removedIds) {
      deletedIds.add(id);
    }
    clearedAll = true;
    loadedAll = true;

    enqueueWrite(async () => {
      await fs.promises.mkdir(mirrorDirPath, { recursive: true });
      clearNamespace(namespace);
      await Promise.all(
        mirrorIds.map((id) => fs.promises.rm(getPlayerFilePath(id), { force: true }))
      );
    });

    return { removedPlayerFiles: removedIds.size };
  }

  function rebuildFromMirrors(options = {}) {
    const pruneMissing = options.pruneMissing !== false;
    const entries = {};
    const mirrorIds = [];
    if (fs.existsSync(mirrorDirPath)) {
      const names = fs.readdirSync(mirrorDirPath).filter((name) => name.endsWith('.json') && !name.endsWith('_memory.json'));
      for (const fileName of names) {
        const id = String(fileName || '').replace(/\.json$/, '').trim();
        if (!id) continue;
        const parsed = readPlayerFromMirror(id);
        if (!parsed) continue;
        entries[id] = normalizeStorage(parsed);
        mirrorIds.push(id);
      }
    }

    cache.clear();
    deletedIds.clear();
    for (const [id, stored] of Object.entries(entries)) {
      const runtimeValue = normalizeRuntime(stored);
      cache.set(id, runtimeValue ? deepCloneJson(runtimeValue) : null);
    }
    loadedAll = true;
    clearedAll = pruneMissing && Object.keys(entries).length === 0;

    const snapshot = deepCloneJson(entries);
    enqueueWrite(async () => {
      if (pruneMissing) {
        replaceNamespaceObject(namespace, snapshot);
      } else {
        for (const [id, stored] of Object.entries(snapshot)) {
          upsertNamespaceEntry(namespace, id, stored);
        }
      }
    });

    return {
      rebuiltPlayers: mirrorIds.length,
      pruneMissing
    };
  }

  function inspect() {
    const mirrorIds = fs.existsSync(mirrorDirPath)
      ? fs.readdirSync(mirrorDirPath)
        .filter((name) => name.endsWith('.json') && !name.endsWith('_memory.json'))
        .map((name) => String(name || '').replace(/\.json$/, '').trim())
        .filter(Boolean)
      : [];
    const dbIds = listNamespaceKeys(namespace);
    const mirrorSet = new Set(mirrorIds);
    const dbSet = new Set(dbIds);
    const onlyMirror = mirrorIds.filter((id) => !dbSet.has(id));
    const onlyDb = dbIds.filter((id) => !mirrorSet.has(id));
    return {
      namespace,
      mirrorDirPath,
      dbCount: dbIds.length,
      mirrorCount: mirrorIds.length,
      onlyDb,
      onlyMirror
    };
  }

  async function flush() {
    await writeQueue;
  }

  return {
    clearAll,
    deleteById,
    flush,
    get,
    inspect,
    listAll,
    rebuildFromMirrors,
    save
  };
}

module.exports = {
  createPlayerStateRepository
};
