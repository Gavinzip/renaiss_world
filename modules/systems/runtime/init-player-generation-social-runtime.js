const { createGenerationStateUtils } = require('../../content/generation/generation-state-utils');
const { createGenerationLifecycleUtils } = require('../../content/generation/generation-lifecycle-utils');
const { createFriendCoreUtils } = require('../social/friend-core-utils');

function initPlayerGenerationSocialRuntime(deps = {}) {
  const {
    CORE,
    CHOICE_DISPLAY_COUNT,
    NPC_DIALOGUE_LOG_LIMIT,
    GENERATION_HISTORY_LIMIT,
    ensurePlayerGenerationSchema,
    normalizeRecentChoiceHistory,
    normalizeMainlineBridgeLock,
    normalizePendingConflictFollowupState,
    normalizeMainlineForeshadowPins,
    normalizeStoryDialoguePins,
    normalizeNpcDialogueLog,
    normalizeMapViewMode,
    ensurePlayerCodexSchema,
    normalizeGenerationStatus,
    cloneChoiceSnapshot
  } = deps;

  const GENERATION_STATE_UTILS = createGenerationStateUtils({
    CHOICE_DISPLAY_COUNT,
    NPC_DIALOGUE_LOG_LIMIT,
    ensurePlayerGenerationSchema
  });
  const {
    cloneChoiceSnapshot: cloneChoiceSnapshotOut,
    normalizeGenerationStatus: normalizeGenerationStatusOut,
    normalizeNpcDialogueLog: normalizeNpcDialogueLogOut,
    appendNpcDialogueLog
  } = GENERATION_STATE_UTILS;

  const GENERATION_LIFECYCLE_UTILS = createGenerationLifecycleUtils({
    GENERATION_HISTORY_LIMIT,
    ensurePlayerGenerationSchema,
    normalizeGenerationStatus: normalizeGenerationStatus || normalizeGenerationStatusOut,
    cloneChoiceSnapshot: cloneChoiceSnapshot || cloneChoiceSnapshotOut
  });
  const {
    pushGenerationHistory,
    startGenerationState,
    updateGenerationState,
    finishGenerationState,
    restoreStoryFromGenerationState,
    restoreChoicesFromGenerationState
  } = GENERATION_LIFECYCLE_UTILS;

  const FRIEND_CORE_UTILS = createFriendCoreUtils({
    loadPlayer: CORE.loadPlayer,
    savePlayer: CORE.savePlayer,
    getAllPlayers: CORE.getAllPlayers
  });
  const {
    normalizeFriendId,
    ensurePlayerFriendState,
    removeFriendIdFromList,
    resetFriendPairState,
    removeFriendLinkFromPlayer,
    pruneMissingFriendLinksForPlayer,
    purgePlayerFromAllFriendLists,
    getPlayerDisplayNameById,
    isMutualFriend,
    finalizeMutualFriendship,
    createFriendRequest,
    acceptFriendRequest,
    cancelOutgoingFriendRequest,
    ensureFriendBattleStatsMap,
    getFriendBattleRecord,
    applyFriendBattleResult
  } = FRIEND_CORE_UTILS;

  return {
    cloneChoiceSnapshot: cloneChoiceSnapshotOut,
    normalizeGenerationStatus: normalizeGenerationStatusOut,
    normalizeNpcDialogueLog: normalizeNpcDialogueLog || normalizeNpcDialogueLogOut,
    appendNpcDialogueLog,
    pushGenerationHistory,
    startGenerationState,
    updateGenerationState,
    finishGenerationState,
    restoreStoryFromGenerationState,
    restoreChoicesFromGenerationState,
    normalizeFriendId,
    ensurePlayerFriendState,
    removeFriendIdFromList,
    resetFriendPairState,
    removeFriendLinkFromPlayer,
    pruneMissingFriendLinksForPlayer,
    purgePlayerFromAllFriendLists,
    getPlayerDisplayNameById,
    isMutualFriend,
    finalizeMutualFriendship,
    createFriendRequest,
    acceptFriendRequest,
    cancelOutgoingFriendRequest,
    ensureFriendBattleStatsMap,
    getFriendBattleRecord,
    applyFriendBattleResult,
    normalizeRecentChoiceHistory,
    normalizeMainlineBridgeLock,
    normalizePendingConflictFollowupState,
    normalizeMainlineForeshadowPins,
    normalizeStoryDialoguePins,
    normalizeMapViewMode,
    ensurePlayerCodexSchema
  };
}

module.exports = { initPlayerGenerationSocialRuntime };
