const { createMarketHelperUtils } = require('../market/market-helper-utils');
const { createPetChipUtils } = require('../pet/pet-chip-utils');
const { createMarketSessionUtils } = require('../market/market-session-utils');
const { createStoryLockUtils } = require('../../content/story-lock-utils');
const { createResetDataUtils } = require('./utils/reset-data-utils');
const { createSlashAdminUtils } = require('../routing/slash-admin-utils');
const { createSlashCommandListenerUtils } = require('../routing/slash-command-listener-utils');

function initAdminRuntimeSystems(deps = {}) {
  const {
    CORE,
    PET,
    ECON,
    MEMORY_INDEX,
    EVENTS,
    STORAGE,
    EmbedBuilder,
    SKILL_CHIP_PREFIX,
    PROTECTED_MOVE_IDS,
    PET_MOVE_LOADOUT_LIMIT,
    SHOP_HEAL_CRYSTAL_COST,
    SHOP_HEAL_CRYSTAL_RECOVER,
    SHOP_ENERGY_CRYSTAL_COST,
    SHOP_ENERGY_CRYSTAL_RECOVER,
    DIGITAL_CRYSTAL_EFFECT_FAIL_RATE,
    SHOP_HAGGLE_BLOCKED_ITEMS,
    STORY_GEN_LOCKS,
    STORY_GEN_LOCK_TTL_MS,
    RESETDATA_PASSWORD,
    PLAYERS_DIR,
    PETS_FILE,
    PLAYER_THREADS_FILE,
    USER_WALLETS_FILE,
    SCRATCH_LOTTERY_FILE,
    loadJsonObject,
    saveJsonObject,
    loadPlayerThreads,
    savePlayerThreads,
    releaseStoryLock,
    clearStoryLocks,
    runWorldBackup,
    getBackupDebugStatus,
    getMarketTypeLabel,
    rememberPlayer,
    recordCashflow,
    getPlayerOwnedPets,
    normalizePetMoveLoadout,
    getPetAttackMoves,
    getDraftItemName,
    getAllPetSkillMoves,
    getPetMovePool,
    normalizeEventChoices
  } = deps;

  const MARKET_HELPER_UTILS = createMarketHelperUtils({
    ECON,
    PET,
    getMarketTypeLabel,
    rememberPlayer,
    recordCashflow,
    SHOP_HEAL_CRYSTAL_COST,
    SHOP_HEAL_CRYSTAL_RECOVER,
    SHOP_ENERGY_CRYSTAL_COST,
    SHOP_ENERGY_CRYSTAL_RECOVER,
    DIGITAL_CRYSTAL_EFFECT_FAIL_RATE,
    SHOP_HAGGLE_BLOCKED_ITEMS,
    getPlayerOwnedPets,
    normalizePetMoveLoadout,
    getPetAttackMoves
  });
  const {
    parseMarketTypeFromCustomId,
    parseMarketAndPageFromCustomId,
    paginateList,
    buildPagedFieldChunks,
    buildMarketListingLine,
    buyShopCrystal,
    getRarityRank,
    normalizeListingRarity,
    estimateStoryReferencePriceByName,
    estimateMoveReferencePriceByTier,
    buildShopSellDraftOptions,
    buildShopHaggleDraftOptions,
    getDraftItemName: getDraftItemNameFromMarket,
    getHaggleCandidateFromPlayer,
    buildHaggleShadowPlayer,
    buildHaggleBulkShadowPlayer,
    consumeHaggleItemFromPlayer,
    consumeHaggleBulkItemsFromPlayer,
    extractPitchFromHaggleMessage
  } = MARKET_HELPER_UTILS;

  const PET_CHIP_UTILS = createPetChipUtils({
    SKILL_CHIP_PREFIX,
    PROTECTED_MOVE_IDS,
    PET_MOVE_LOADOUT_LIMIT,
    PET,
    getDraftItemName: getDraftItemName || getDraftItemNameFromMarket,
    getAllPetSkillMoves,
    getPetMovePool,
    getPetAttackMoves
  });
  const {
    extractSkillChipMoveName,
    addSkillChipToInventory,
    consumeSkillChipFromInventory,
    getLearnableSkillChipEntries,
    getForgettablePetMoves,
    learnMoveFromChipForPet
  } = PET_CHIP_UTILS;

  const MARKET_SESSION_UTILS = createMarketSessionUtils({
    normalizeEventChoices
  });
  const {
    cloneChoicesForSnapshot,
    openShopSession,
    leaveShopSession
  } = MARKET_SESSION_UTILS;

  const STORY_LOCK_UTILS = createStoryLockUtils({
    locks: STORY_GEN_LOCKS,
    ttlMs: STORY_GEN_LOCK_TTL_MS
  });
  const {
    tryAcquireStoryLock,
    releaseStoryLock: releaseStoryLockFromUtils,
    shuffleArray,
    chooseRandomUnique,
    pickWeightedKey
  } = STORY_LOCK_UTILS;

  const RESET_DATA_UTILS = createResetDataUtils({
    playersDir: PLAYERS_DIR,
    petsFile: PETS_FILE,
    playerThreadsFile: PLAYER_THREADS_FILE,
    userWalletsFile: USER_WALLETS_FILE,
    scratchLotteryFile: SCRATCH_LOTTERY_FILE,
    loadJsonObject,
    saveJsonObject,
    loadPlayerThreads,
    savePlayerThreads,
    petDeletePetByOwner: (id) => PET.deletePetByOwner(id),
    memoryClearPlayerRelatedMemories: (id) => MEMORY_INDEX.clearPlayerRelatedMemories(id),
    memoryClearAllMemories: () => MEMORY_INDEX.clearAllMemories(),
    coreClearPlayerNpcQuoteMemory: (id) => CORE.clearPlayerNpcQuoteMemory(id),
    coreClearAllNpcQuoteMemory: () => CORE.clearAllNpcQuoteMemory(),
    coreResetWorldState: (payload) => CORE.resetWorldState(payload),
    eventsClearWorldEvents: () => EVENTS.clearWorldEvents(),
    releaseStoryLock: (id) => (releaseStoryLock || releaseStoryLockFromUtils)(id),
    purgePlayerFromAllFriendLists: (id) => deps.purgePlayerFromAllFriendLists(id),
    clearStoryLocks
  });
  const {
    clearSelfCharacterData,
    clearTargetPlayerAllData,
    clearWorldRuntimeData,
    clearAllCharacterData
  } = RESET_DATA_UTILS;

  const SLASH_ADMIN_UTILS = createSlashAdminUtils({
    RESETDATA_PASSWORD,
    clearAllCharacterData,
    clearSelfCharacterData,
    clearTargetPlayerAllData,
    clearWorldRuntimeData,
    CORE,
    runWorldBackup,
    getBackupDebugStatus,
    STORAGE,
    EmbedBuilder
  });
  const {
    handleResetData,
    handleResetPlayerHistory,
    handleResetWorld,
    handleBackupWorld,
    handleBackupCheck,
    handleWarStatus
  } = SLASH_ADMIN_UTILS;

  const SLASH_COMMAND_LISTENER_UTILS = createSlashCommandListenerUtils();
  const { registerSlashCommandListener } = SLASH_COMMAND_LISTENER_UTILS;

  return {
    parseMarketTypeFromCustomId,
    parseMarketAndPageFromCustomId,
    paginateList,
    buildPagedFieldChunks,
    buildMarketListingLine,
    buyShopCrystal,
    getRarityRank,
    normalizeListingRarity,
    estimateStoryReferencePriceByName,
    estimateMoveReferencePriceByTier,
    buildShopSellDraftOptions,
    buildShopHaggleDraftOptions,
    getDraftItemName: getDraftItemNameFromMarket,
    getHaggleCandidateFromPlayer,
    buildHaggleShadowPlayer,
    buildHaggleBulkShadowPlayer,
    consumeHaggleItemFromPlayer,
    consumeHaggleBulkItemsFromPlayer,
    extractPitchFromHaggleMessage,
    extractSkillChipMoveName,
    addSkillChipToInventory,
    consumeSkillChipFromInventory,
    getLearnableSkillChipEntries,
    getForgettablePetMoves,
    learnMoveFromChipForPet,
    cloneChoicesForSnapshot,
    openShopSession,
    leaveShopSession,
    tryAcquireStoryLock,
    releaseStoryLock: releaseStoryLockFromUtils,
    shuffleArray,
    chooseRandomUnique,
    pickWeightedKey,
    clearSelfCharacterData,
    clearTargetPlayerAllData,
    clearWorldRuntimeData,
    clearAllCharacterData,
    handleResetData,
    handleResetPlayerHistory,
    handleResetWorld,
    handleBackupWorld,
    handleBackupCheck,
    handleWarStatus,
    registerSlashCommandListener
  };
}

module.exports = { initAdminRuntimeSystems };
