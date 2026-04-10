function createStoryLockUtils(deps = {}) {
  const locks = deps.locks instanceof Map ? deps.locks : new Map();
  const ttlMs = Math.max(1000, Number(deps.ttlMs || 180000));

  function tryAcquireStoryLock(userId, reason = 'story') {
    if (!userId) return true;
    const now = Date.now();
    const lock = locks.get(userId);
    if (lock && now - lock.startedAt < ttlMs) {
      return false;
    }
    locks.set(userId, { startedAt: now, reason });
    return true;
  }

  function releaseStoryLock(userId) {
    if (!userId) return;
    locks.delete(userId);
  }

  function shuffleArray(list = []) {
    const arr = Array.isArray(list) ? [...list] : [];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function chooseRandomUnique(list = [], count = 0) {
    if (!Array.isArray(list) || list.length === 0 || count <= 0) return [];
    return shuffleArray(list).slice(0, count);
  }

  function pickWeightedKey(weightEntries = []) {
    const valid = weightEntries
      .filter(([_, weight]) => Number.isFinite(Number(weight)) && Number(weight) > 0)
      .map(([key, weight]) => [key, Number(weight)]);
    if (valid.length === 0) return null;
    const total = valid.reduce((sum, [_, weight]) => sum + weight, 0);
    let roll = Math.random() * total;
    for (const [key, weight] of valid) {
      roll -= weight;
      if (roll <= 0) return key;
    }
    return valid[valid.length - 1][0];
  }

  return {
    tryAcquireStoryLock,
    releaseStoryLock,
    shuffleArray,
    chooseRandomUnique,
    pickWeightedKey
  };
}

module.exports = {
  createStoryLockUtils
};
