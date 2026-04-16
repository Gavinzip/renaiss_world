const fs = require('fs');
const path = require('path');

function createResetDataUtils(deps = {}) {
  const playersDir = String(deps.playersDir || '').trim();
  const petsFile = String(deps.petsFile || '').trim();
  const playerThreadsFile = String(deps.playerThreadsFile || '').trim();
  const userWalletsFile = String(deps.userWalletsFile || '').trim();
  const scratchLotteryFile = String(deps.scratchLotteryFile || '').trim();

  const loadJsonObject = deps.loadJsonObject;
  const saveJsonObject = deps.saveJsonObject;
  const loadPlayerThreads = deps.loadPlayerThreads;
  const savePlayerThreads = deps.savePlayerThreads;
  const petDeletePetByOwner = deps.petDeletePetByOwner;
  const memoryClearPlayerRelatedMemories = deps.memoryClearPlayerRelatedMemories;
  const memoryClearAllMemories = deps.memoryClearAllMemories;
  const coreClearPlayerNpcQuoteMemory = deps.coreClearPlayerNpcQuoteMemory;
  const coreClearAllNpcQuoteMemory = deps.coreClearAllNpcQuoteMemory;
  const coreDeletePlayerStorage = deps.coreDeletePlayerStorage;
  const coreClearAllPlayerStorage = deps.coreClearAllPlayerStorage;
  const coreResetWorldState = deps.coreResetWorldState;
  const walletDeleteWallet = deps.walletDeleteWallet;
  const walletReplaceAll = deps.walletReplaceAll;
  const scratchResetState = deps.scratchResetState;
  const eventsClearWorldEvents = deps.eventsClearWorldEvents;
  const releaseStoryLock = deps.releaseStoryLock;
  const purgePlayerFromAllFriendLists = deps.purgePlayerFromAllFriendLists;
  const clearStoryLocks = deps.clearStoryLocks;

  function clearSelfCharacterData(userId) {
    const id = String(userId || '').trim();
    if (!id) throw new Error('missing user id');
    const report = {
      scope: 'self',
      removedPlayerFile: false,
      removedLegacyMemoryFile: false,
      removedPet: false,
      removedThread: false,
      removedWallet: false,
      clearedSemanticMemory: 0,
      clearedNpcQuotes: 0,
      purgedFriendRefsPlayers: 0,
      purgedFriendRefsLinks: 0
    };

    const playerFile = path.join(playersDir, `${id}.json`);
    const legacyMemoryFile = path.join(playersDir, `${id}_memory.json`);

    if (typeof coreDeletePlayerStorage === 'function') {
      const storageReport = coreDeletePlayerStorage(id) || {};
      report.removedPlayerFile = Boolean(storageReport.removedPlayerFile);
      report.removedLegacyMemoryFile = Boolean(storageReport.removedLegacyMemoryFile);
    } else {
      if (fs.existsSync(playerFile)) {
        fs.unlinkSync(playerFile);
        report.removedPlayerFile = true;
      }
      if (fs.existsSync(legacyMemoryFile)) {
        fs.unlinkSync(legacyMemoryFile);
        report.removedLegacyMemoryFile = true;
      }
    }

    if (typeof petDeletePetByOwner === 'function') {
      report.removedPet = Boolean(petDeletePetByOwner(id));
    }

    const threads = typeof loadPlayerThreads === 'function' ? loadPlayerThreads() : {};
    if (Object.prototype.hasOwnProperty.call(threads, id)) {
      delete threads[id];
      if (typeof savePlayerThreads === 'function') savePlayerThreads(threads);
      report.removedThread = true;
    }

    if (typeof walletDeleteWallet === 'function') {
      report.removedWallet = Boolean(walletDeleteWallet(id));
    } else {
      const wallets = typeof loadJsonObject === 'function' ? loadJsonObject(userWalletsFile) : {};
      if (Object.prototype.hasOwnProperty.call(wallets, id)) {
        delete wallets[id];
        if (typeof saveJsonObject === 'function') saveJsonObject(userWalletsFile, wallets);
        report.removedWallet = true;
      }
    }

    if (typeof memoryClearPlayerRelatedMemories === 'function') {
      report.clearedSemanticMemory = Number(memoryClearPlayerRelatedMemories(id) || 0);
    }
    if (typeof coreClearPlayerNpcQuoteMemory === 'function') {
      report.clearedNpcQuotes = Number(coreClearPlayerNpcQuoteMemory(id) || 0);
    }

    if (typeof releaseStoryLock === 'function') releaseStoryLock(id);
    const purge = typeof purgePlayerFromAllFriendLists === 'function'
      ? purgePlayerFromAllFriendLists(id)
      : null;
    report.purgedFriendRefsPlayers = Number(purge?.affectedPlayers || 0);
    report.purgedFriendRefsLinks = Number(purge?.removedLinks || 0);
    return report;
  }

  function clearTargetPlayerAllData(userId) {
    const id = String(userId || '').trim();
    if (!id) throw new Error('missing user id');
    return clearSelfCharacterData(id);
  }

  function clearWorldRuntimeData(mode = 'events') {
    const report = {
      mode: (String(mode || '').trim().toLowerCase() === 'all') ? 'all' : 'events',
      core: false,
      board: false
    };
    try {
      if (typeof coreResetWorldState === 'function') {
        coreResetWorldState({ mode: report.mode });
        report.core = true;
      }
    } catch (e) {
      console.error('[reset] CORE.resetWorldState 失敗:', e?.message || e);
    }
    try {
      if (typeof eventsClearWorldEvents === 'function') {
        eventsClearWorldEvents();
        report.board = true;
      }
    } catch (e) {
      console.error('[reset] EVENTS.clearWorldEvents 失敗:', e?.message || e);
    }
    return report;
  }

  function clearAllCharacterData(options = {}) {
    const clearWorld = options?.clearWorld !== false;
    const worldMode = String(options?.worldMode || 'all').trim().toLowerCase() === 'events' ? 'events' : 'all';
    const report = {
      scope: 'all',
      removedPlayerFiles: 0,
      removedLegacyMemoryFiles: 0,
      resetPets: false,
      resetThreads: false,
      resetWallets: false,
      resetScratchLottery: false,
      clearedSemanticMemory: 0,
      clearedNpcQuotes: 0,
      resetWorldCore: false,
      resetWorldBoard: false
    };

    if (typeof coreClearAllPlayerStorage === 'function') {
      const storageReport = coreClearAllPlayerStorage() || {};
      report.removedPlayerFiles = Number(storageReport.removedPlayerFiles || 0);
      report.removedLegacyMemoryFiles = Number(storageReport.removedLegacyMemoryFiles || 0);
    } else {
      fs.mkdirSync(playersDir, { recursive: true });
      const names = fs.readdirSync(playersDir);
      for (const name of names) {
        if (!name.endsWith('.json')) continue;
        const target = path.join(playersDir, name);
        fs.unlinkSync(target);
        if (name.endsWith('_memory.json')) report.removedLegacyMemoryFiles += 1;
        else report.removedPlayerFiles += 1;
      }
    }

    if (typeof saveJsonObject === 'function') {
      saveJsonObject(petsFile, {});
      report.resetPets = true;
      if (typeof savePlayerThreads === 'function') savePlayerThreads({});
      else saveJsonObject(playerThreadsFile, {});
      report.resetThreads = true;
      if (typeof walletReplaceAll === 'function') walletReplaceAll({});
      else saveJsonObject(userWalletsFile, {});
      report.resetWallets = true;
      if (typeof scratchResetState === 'function') scratchResetState();
      else saveJsonObject(scratchLotteryFile, {});
      report.resetScratchLottery = true;
    }

    if (typeof memoryClearAllMemories === 'function') {
      report.clearedSemanticMemory = Number(memoryClearAllMemories() || 0);
    }
    if (typeof coreClearAllNpcQuoteMemory === 'function') {
      report.clearedNpcQuotes = Number(coreClearAllNpcQuoteMemory() || 0);
    }

    if (clearWorld) {
      const worldReport = clearWorldRuntimeData(worldMode);
      report.resetWorldCore = Boolean(worldReport.core);
      report.resetWorldBoard = Boolean(worldReport.board);
    }

    if (typeof clearStoryLocks === 'function') clearStoryLocks();
    return report;
  }

  return {
    clearSelfCharacterData,
    clearTargetPlayerAllData,
    clearWorldRuntimeData,
    clearAllCharacterData
  };
}

module.exports = {
  createResetDataUtils
};
