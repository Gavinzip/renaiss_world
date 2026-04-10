const fs = require('fs');
const path = require('path');

function createThreadStorageUtils(deps = {}) {
  const playerThreadsFile = String(deps.playerThreadsFile || '').trim();

  function loadPlayerThreads() {
    if (!playerThreadsFile || !fs.existsSync(playerThreadsFile)) return {};
    try {
      return JSON.parse(fs.readFileSync(playerThreadsFile, 'utf8'));
    } catch {
      return {};
    }
  }

  function savePlayerThreads(threads) {
    if (!playerThreadsFile) return;
    fs.writeFileSync(playerThreadsFile, JSON.stringify(threads, null, 2));
  }

  function loadJsonObject(filePath) {
    try {
      if (!fs.existsSync(filePath)) return {};
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed;
    } catch {
      return {};
    }
  }

  function saveJsonObject(filePath, data) {
    const safe = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(safe, null, 2));
  }

  function setPlayerThread(userId, threadId) {
    const threads = loadPlayerThreads();
    if (threadId === null || threadId === undefined) {
      delete threads[userId];
    } else {
      threads[userId] = threadId;
    }
    savePlayerThreads(threads);
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
