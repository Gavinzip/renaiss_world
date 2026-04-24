const { createMapNavigationUtils } = require('../map/map-navigation-utils');
const { createMapUiUtils } = require('../map/map-ui-utils');
const { createMapSceneUtils } = require('../map/map-scene-utils');
const { createMessageFallbackUtils } = require('./utils/message-fallback-utils');
const { createOnboardingProfileUtils } = require('../player/onboarding-profile-utils');
const { createClaimPetUiUtils } = require('../pet/claim-pet-ui-utils');
const { createAdditionalPetUtils } = require('../pet/additional-pet-utils');

function initMapOnboardingRuntimeUtils(deps = {}) {
  const {
    CORE,
    PET,
    ISLAND_STORY,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    MAP_LOCATIONS,
    MAP_PAGE_SIZE,
    buildRegionMapSnapshot,
    getRegionLocationsByLocation,
    getPortalDestinations,
    getConnectedLocations,
    findLocationPath,
    getLocationPortalHub,
    getRegionPortalHubs,
    buildIslandMapAnsi,
    ISLAND_MAP_TEXT,
    getLocationProfile,
    getLocationStoryContext,
    getMapText,
    getRegionDisplayName,
    getLocationDisplayName,
    getNpcDisplayName,
    localizeDisplayText,
    canFreeRoamCurrentRegion,
    normalizeMapViewMode,
    getPlayerUILang,
    ensurePlayerIslandState,
    getPortalAccessContext,
    isMainPortalHubLocation,
    playerOwnsTeleportDevice,
    getPlayerMapViewMode,
    joinByLang,
    renderRegionMapImageBuffer,
    formatPortalDestinationDisplay,
    buildPortalUsageGuide,
    buildDeviceUsageGuide,
    updateInteractionMessage,
    trackActiveGameMessage,
    getTeleportDeviceStockInfo,
    formatTeleportDeviceRemaining,
    getPetMovePool,
    getPetCapacityForUser,
    normalizePetElementCode,
    normalizePetName,
    rollStarterMoveForElement,
    getLanguageSection
  } = deps;

  const MAP_NAVIGATION_UTILS = createMapNavigationUtils({
    getMapText,
    getPlayerUILang,
    getPortalDestinations,
    getConnectedLocations,
    findLocationPath,
    getLocationProfile,
    getRegionDisplayName,
    getLocationDisplayName,
    getRegionLocationsByLocation,
    isMainPortalHubLocation,
    getTeleportDeviceStockInfo,
    formatTeleportDeviceRemaining,
    canFreeRoamCurrentRegion,
    ensurePlayerIslandState,
    syncLocationArcLocation: deps.syncLocationArcLocation,
    canEnterLocation: deps.canEnterLocation,
    pickWeightedKey: deps.pickWeightedKey,
    computeStoryThreatScore: deps.computeStoryThreatScore,
    format1: deps.format1,
    shouldTriggerBattle: deps.shouldTriggerBattle,
    ISLAND_STORY,
    getRegionPortalHubs,
    getLocationPortalHub,
    LOCATION_ARC_COMPLETE_TURNS: deps.LOCATION_ARC_COMPLETE_TURNS,
    PORTAL_GUIDE_MIN_TURNS: deps.PORTAL_GUIDE_MIN_TURNS,
    PORTAL_RESHOW_COOLDOWN_TURNS: deps.PORTAL_RESHOW_COOLDOWN_TURNS,
    WISH_POOL_GUIDE_MIN_TURNS: deps.WISH_POOL_GUIDE_MIN_TURNS,
    LOCATION_ENTRY_GATE_ENABLED: deps.LOCATION_ENTRY_GATE_ENABLED,
    LOCATION_ENTRY_MIN_WINRATE: deps.LOCATION_ENTRY_MIN_WINRATE,
    STORY_THREAT_SCORE_THRESHOLD: deps.STORY_THREAT_SCORE_THRESHOLD,
    ROAM_MOVE_BASE_CHANCE: deps.ROAM_MOVE_BASE_CHANCE,
    ROAM_MOVE_EXPLORE_BONUS: deps.ROAM_MOVE_EXPLORE_BONUS,
    ROAM_MOVE_WANDER_BONUS: deps.ROAM_MOVE_WANDER_BONUS
  });

  const MAP_UI_UTILS = createMapUiUtils({
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    getMapText: (...args) => getMapText(...args),
    getLocationDisplayName: (...args) => getLocationDisplayName?.(...args),
    canFreeRoamCurrentRegion: (...args) => canFreeRoamCurrentRegion(...args),
    normalizeMapViewMode: (...args) => normalizeMapViewMode(...args),
    MAP_LOCATIONS,
    MAP_PAGE_SIZE
  });

  const {
    joinByLang: joinByLangCore,
    buildPortalUsageGuide: buildPortalUsageGuideCore,
    formatPortalDestinationDisplay: formatPortalDestinationDisplayCore,
    getPortalAccessContext: getPortalAccessContextCore,
    buildDeviceUsageGuide: buildDeviceUsageGuideCore,
    hasRoamTravelIntentText,
    isRoamEligibleAction,
    getRoamMoveChance,
    pickRoamDestination,
    maybeApplyRoamMovement,
    appendUniqueItem
  } = MAP_NAVIGATION_UTILS;

  const {
    buildRegionMoveSelectRow,
    buildMapComponents
  } = MAP_UI_UTILS;

  const MAP_SCENE_UTILS = createMapSceneUtils({
    CORE,
    ISLAND_STORY,
    getPlayerUILang: (...args) => getPlayerUILang(...args),
    getMapText: (...args) => getMapText(...args),
    ensurePlayerIslandState: (...args) => ensurePlayerIslandState(...args),
    buildRegionMapSnapshot,
    getRegionLocationsByLocation,
    getPortalDestinations,
    getPortalAccessContext: (...args) => getPortalAccessContextCore(...args),
    isMainPortalHubLocation: (...args) => isMainPortalHubLocation(...args),
    playerOwnsTeleportDevice: (...args) => playerOwnsTeleportDevice(...args),
    getPlayerMapViewMode: (...args) => getPlayerMapViewMode(...args),
    buildMapComponents: (...args) => buildMapComponents(...args),
    buildRegionMoveSelectRow: (...args) => buildRegionMoveSelectRow(...args),
    buildIslandMapAnsi,
    ISLAND_MAP_TEXT,
    getLocationProfile,
    getLocationStoryContext,
    joinByLang: (...args) => joinByLangCore(...args),
    getLocationDisplayName: (...args) => getLocationDisplayName?.(...args),
    getRegionDisplayName: (...args) => getRegionDisplayName?.(...args),
    localizeDisplayText: (...args) => localizeDisplayText?.(...args),
    renderRegionMapImageBuffer: (...args) => renderRegionMapImageBuffer(...args),
    formatPortalDestinationDisplay: (...args) => formatPortalDestinationDisplayCore(...args),
    getLocationPortalHub,
    getRegionPortalHubs,
    buildPortalUsageGuide: (...args) => buildPortalUsageGuideCore(...args),
    buildDeviceUsageGuide: (...args) => buildDeviceUsageGuideCore(...args),
    updateInteractionMessage: (...args) => updateInteractionMessage(...args),
    trackActiveGameMessage: (...args) => trackActiveGameMessage(...args),
    getTeleportDeviceStockInfo: (...args) => getTeleportDeviceStockInfo(...args),
    formatTeleportDeviceRemaining: (...args) => formatTeleportDeviceRemaining(...args),
    EmbedBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
  });

  const MESSAGE_FALLBACK_UTILS = createMessageFallbackUtils({
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
  });

  const ONBOARDING_PROFILE_UTILS = createOnboardingProfileUtils({
    CORE,
    PET,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    getPetMovePool: (...args) => getPetMovePool(...args),
    getLanguageSection: (...args) => getLanguageSection?.(...args)
  });

  const CLAIM_PET_UI_UTILS = createClaimPetUiUtils({
    CORE,
    getPetCapacityForUser: (...args) => getPetCapacityForUser(...args),
    getPetElementDisplayName: (...args) => ONBOARDING_PROFILE_UTILS.getPetElementDisplayName(...args),
    updateInteractionMessage: (...args) => updateInteractionMessage(...args),
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
  });

  const ADDITIONAL_PET_UTILS = createAdditionalPetUtils({
    CORE,
    PET,
    getPetCapacityForUser: (...args) => getPetCapacityForUser(...args),
    normalizePetElementCode: (...args) => normalizePetElementCode(...args),
    normalizePetName: (...args) => normalizePetName(...args),
    rollStarterMoveForElement: (...args) => rollStarterMoveForElement(...args)
  });

  return {
    ...MAP_NAVIGATION_UTILS,
    ...MAP_UI_UTILS,
    ...MAP_SCENE_UTILS,
    ...MESSAGE_FALLBACK_UTILS,
    ...ONBOARDING_PROFILE_UTILS,
    ...CLAIM_PET_UI_UTILS,
    ...ADDITIONAL_PET_UTILS
  };
}

module.exports = {
  initMapOnboardingRuntimeUtils
};
