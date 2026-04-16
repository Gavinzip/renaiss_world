const {
  createQueuedJsonObjectRegistry,
  normalizeObjectRecord
} = require('../../data/queued-json-store');
const { createSqliteMirroredObjectRepository } = require('../../data/sqlite-mirrored-state');

function createThreadStorageUtils(deps = {}) {
  const playerThreadsFile = String(deps.playerThreadsFile || '').trim();
  const JSON_OBJECT_REGISTRY = createQueuedJsonObjectRegistry();
  const playerThreadsStore = playerThreadsFile
    ? createSqliteMirroredObjectRepository({
      namespace: String(deps.namespace || 'player_threads'),
      mirrorFilePath: playerThreadsFile,
      defaultValueFactory: () => ({}),
      normalizeAll: normalizeObjectRecord,
      normalizeEntry: (value) => {
        if (value === null || value === undefined) return null;
        const safe = String(value || '').trim();
        return safe || null;
      }
    })
    : null;

  function loadPlayerThreads() {
    return playerThreadsStore ? playerThreadsStore.getAll() : {};
  }

  function savePlayerThreads(threads) {
    if (!playerThreadsStore) return {};
    return playerThreadsStore.replaceAll(threads);
  }

  function loadJsonObject(filePath) {
    return JSON_OBJECT_REGISTRY.loadJsonObject(filePath);
  }

  function saveJsonObject(filePath, data) {
    return JSON_OBJECT_REGISTRY.saveJsonObject(filePath, data);
  }

  function setPlayerThread(userId, threadId) {
    if (!playerThreadsStore) return {};
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) return loadPlayerThreads();
    if (threadId === null || threadId === undefined) {
      playerThreadsStore.deleteEntry(safeUserId);
      return loadPlayerThreads();
    }
    playerThreadsStore.setEntry(safeUserId, threadId);
    return loadPlayerThreads();
  }

  function getPlayerThread(userId) {
    const threads = loadPlayerThreads();
    return threads[userId] || null;
  }

  function getThreadOwnerUserId(threadId) {
    if (!threadId) return null;
    const threads = loadPlayerThreads();
    for (const [uid, tid] of Object.entries(threads)) {
      if (tid === threadId) return uid;
    }
    return null;
  }

  return {
    loadPlayerThreads,
    savePlayerThreads,
    loadJsonObject,
    saveJsonObject,
    setPlayerThread,
    getPlayerThread,
    getThreadOwnerUserId
  };
}

module.exports = {
  createThreadStorageUtils
};
