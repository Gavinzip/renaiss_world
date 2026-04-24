const { createStoryBridgeUtils } = require('../../content/story-bridge-utils');
const { createAdventureStatusUtils } = require('../../content/adventure-status-utils');
const { createWorldEventsUtils } = require('../../content/world-events-utils');
const { createStoryAnalysisUtils } = require('../../content/story-analysis-utils');
const { createStoryMemoryPinsUtils } = require('../../content/story/story-memory-pins-utils');
const { createTeleportDeviceUtils } = require('../map/teleport-device-utils');

function initStoryRuntimeUtils(deps = {}) {
  const {
    CORE,
    EVENTS,
    STORY,
    ISLAND_STORY,
    MAIN_STORY,
    getLocationPortalHub,
    normalizeLangCode,
    getLanguageSection,
    getLocationDisplayName,
    getNpcDisplayName,
    localizeDisplayText,
    formatWorldEventText,
    formatPetHpWithRecovery,
    getPetElementDisplayName,
    normalizeComparableStoryText,
    extractStoryDialogues,
    appendNpcDialogueLog,
    ensurePlayerGenerationSchema,
    ensurePlayerCodexSchema,
    normalizeMapViewMode,
    MAINLINE_BRIDGE_LOCK_TTL_TURNS,
    STORY_DIALOGUE_MAX_QUOTE_LEN,
    STORY_DIALOGUE_PIN_LIMIT,
    STORY_DIALOGUE_PIN_TTL_TURNS,
    MAINLINE_CUE_PATTERN,
    MAINLINE_PIN_LIMIT,
    MAINLINE_PIN_TTL_TURNS,
    TELEPORT_DEVICE_DURATION_HOURS,
    TELEPORT_DEVICE_STOCK_LIMIT
  } = deps;

  const STORY_BRIDGE_UTILS = createStoryBridgeUtils({
    MAINLINE_BRIDGE_LOCK_TTL_TURNS
  });
  const ADVENTURE_STATUS_UTILS = createAdventureStatusUtils({
    normalizeLangCode,
    getLanguageSection,
    getLocationDisplayName,
    getNpcDisplayName,
    formatPetHpWithRecovery,
    getPetElementDisplayName,
    ISLAND_STORY,
    MAIN_STORY
  });
  const WORLD_EVENTS_UTILS = createWorldEventsUtils({
    CORE,
    EVENTS,
    getLocationDisplayName,
    getNpcDisplayName,
    localizeDisplayText,
    formatWorldEventText
  });
  const STORY_ANALYSIS_UTILS = createStoryAnalysisUtils();
  const STORY_MEMORY_PINS_UTILS = createStoryMemoryPinsUtils({
    CORE,
    STORY,
    normalizeComparableStoryText,
    extractStoryDialogues,
    appendNpcDialogueLog,
    ensurePlayerGenerationSchema,
    ensurePlayerCodexSchema,
    normalizeMapViewMode,
    STORY_DIALOGUE_MAX_QUOTE_LEN,
    STORY_DIALOGUE_PIN_LIMIT,
    STORY_DIALOGUE_PIN_TTL_TURNS,
    MAINLINE_CUE_PATTERN,
    MAINLINE_PIN_LIMIT,
    MAINLINE_PIN_TTL_TURNS
  });
  const TELEPORT_DEVICE_DURATION_MS = TELEPORT_DEVICE_DURATION_HOURS * 60 * 60 * 1000;
  const TELEPORT_DEVICE_UTILS = createTeleportDeviceUtils({
    durationMs: TELEPORT_DEVICE_DURATION_MS,
    stockLimit: TELEPORT_DEVICE_STOCK_LIMIT,
    getLocationPortalHub
  });

  return {
    ...STORY_BRIDGE_UTILS,
    ...ADVENTURE_STATUS_UTILS,
    ...WORLD_EVENTS_UTILS,
    ...STORY_ANALYSIS_UTILS,
    ...STORY_MEMORY_PINS_UTILS,
    ...TELEPORT_DEVICE_UTILS
  };
}

module.exports = {
  initStoryRuntimeUtils
};
