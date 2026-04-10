// Renaiss World Discord Bot v5
/**
 * 🌟 Renaiss World - Discord Bot v5
 * Renaiss星球 - 寵物對戰 RPG
 * 完整版本：無死路、隨機抽招、設置/角色按鈕
 */

const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { getRuntimeConstants } = require('./modules/systems/runtime/runtime-constants');

// 讀取 .env 檔案
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// ============== 設定 ==============
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  LANGUAGE: 'zh-TW' // 預設語言
};
const WORLD_BACKUP_NOTIFY_CHANNEL_ID = 1473923458751660063;

const { setupWorldStorage } = require('./modules/core/storage-paths');
const STORAGE = setupWorldStorage();
const DATA_DIR = STORAGE.dataDir;
const PLAYER_THREADS_FILE = path.join(DATA_DIR, 'player_threads.json');
const PLAYERS_DIR = path.join(DATA_DIR, 'players');
const PETS_FILE = path.join(DATA_DIR, 'pets.json');
const USER_WALLETS_FILE = path.join(DATA_DIR, 'user_wallets.json');
const SCRATCH_LOTTERY_FILE = path.join(DATA_DIR, 'scratch_lottery.json');
const {
  RESETDATA_PASSWORD,
  TELEPORT_DEVICE_COST,
  TELEPORT_DEVICE_DURATION_HOURS,
  TELEPORT_DEVICE_STOCK_LIMIT,
  CUSTOM_INPUT_MAX_LENGTH,
  CUSTOM_ACTION_CHANCE,
  BATTLE_ESTIMATE_SIMULATIONS,
  FRIEND_DUEL_ONLINE_TURN_MS,
  WAIT_COMBAT_MOVE,
  HUMAN_COMBAT_MOVE,
  MANUAL_ENEMY_RESPONSE_DELAY_MS,
  CHOICE_POOL_COUNT,
  CHOICE_DISPLAY_COUNT,
  BATTLE_ESTIMATE_MAX_TURNS,
  CUSTOM_INPUT_OPTION_RATE,
  SKILL_CHIP_PREFIX,
  PROTECTED_MOVE_IDS,
  ENCOUNTER_RECENT_WINDOW_TURNS,
  ENCOUNTER_RECENT_LIMIT,
  WANTED_AMBUSH_MIN_LEVEL,
  BATTLE_CADENCE_TURNS,
  AGGRESSIVE_CHOICE_TARGET_RATE,
  EARLY_GAME_GOLD_GUARANTEE_TURNS,
  PET_MOVE_LOADOUT_LIMIT,
  SHOP_SELL_SELECT_LIMIT,
  SHOP_HAGGLE_SELECT_LIMIT,
  SHOP_HAGGLE_BULK_SELECT_LIMIT,
  MARKET_LIST_PAGE_SIZE,
  MOVES_DETAIL_PAGE_SIZE,
  MAP_PAGE_SIZE,
  SHOP_HAGGLE_OFFER_TTL_MS,
  SHOP_HAGGLE_BLOCKED_ITEMS,
  NPC_DIALOGUE_LOG_LIMIT,
  PLAYER_CODEX_NPC_LIMIT,
  PLAYER_CODEX_DRAW_LIMIT,
  GENERATION_HISTORY_LIMIT,
  GENERATION_PENDING_STALE_MS,
  MAP_ENABLE_WIDE_ANSI,
  MARKET_GUARANTEE_GAP_TURNS,
  LOCATION_ARC_COMPLETE_TURNS,
  LOCATION_STORY_BATTLE_MIN_TURNS,
  LOCATION_ENTRY_GATE_ENABLED,
  LOCATION_ENTRY_MIN_WINRATE,
  PORTAL_GUIDE_MIN_TURNS,
  PORTAL_RESHOW_COOLDOWN_TURNS,
  WISH_POOL_GUIDE_MIN_TURNS,
  PET_PASSIVE_HEAL_PER_STORY_TURN,
  QUICK_SHOP_COOLDOWN_TURNS,
  ROAM_MOVE_BASE_CHANCE,
  ROAM_MOVE_EXPLORE_BONUS,
  ROAM_MOVE_WANDER_BONUS,
  STORY_THREAT_SCORE_THRESHOLD,
  RECENT_CHOICE_HISTORY_LIMIT,
  CHOICE_REPEAT_ACTION_COOLDOWN_TURNS,
  CHOICE_REPEAT_SIMILARITY_THRESHOLD,
  STORY_DIALOGUE_MAX_QUOTE_LEN,
  STORY_DIALOGUE_MAX_PER_STORY,
  STORY_GENERIC_SPEAKER_PATTERN,
  STORY_DIALOGUE_PIN_LIMIT,
  STORY_DIALOGUE_PIN_TTL_TURNS,
  MAINLINE_PIN_LIMIT,
  MAINLINE_PIN_TTL_TURNS,
  MAINLINE_CUE_PATTERN,
  MAINLINE_BRIDGE_LOCK_TTL_TURNS,
  MENTOR_SPAR_WIN_HP_RATIO,
  AGGRESSIVE_FOLLOWUP_MIN_TURNS,
  AGGRESSIVE_FOLLOWUP_WINDOW_TURNS,
  AGGRESSIVE_FOLLOWUP_TARGET_MAX_LEN,
  SHOP_HEAL_CRYSTAL_COST,
  SHOP_HEAL_CRYSTAL_RECOVER,
  SHOP_ENERGY_CRYSTAL_COST,
  SHOP_ENERGY_CRYSTAL_RECOVER,
  DIGITAL_CRYSTAL_EFFECT_FAIL_RATE
} = getRuntimeConstants(process.env);
let ensurePlayerGenerationSchemaCore = () => false;
let ensureStarterRewardStateCore = () => false;
let grantStarterFivePullIfNeededCore = async () => ({ addedMoves: 0, details: [] });
let trackActiveGameMessageCore = () => {};
let consumeFinanceNoticesCore = () => [];
let handleDrawMoveCore = async () => {};
let tryRecoverMainMenuAfterFailureCore = async () => false;
let notifyWorldBackupSuccessCore = async () => {};
let resumeExistingOnboardingOrGameCore = async () => false;
let tCore = (key) => key;
let stableHashCodeCore = (source = '') => String(source || '').length;

// ============== 初始化 ==============
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ============== Discord Client ==============
const CLIENT = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// ============== 模組 ==============
const CORE = require('./modules/core/game-core');
const PET = require('./modules/systems/pet/pet-system');
const BATTLE = require('./modules/systems/battle/battle-system');
const EVENTS = require('./modules/content/event-system');
const FOOD = require('./modules/systems/player/food-system');
const STORY = require('./modules/content/storyteller');
const GACHA = require('./modules/systems/gacha/gacha-system');
const WALLET = require('./modules/systems/player/wallet-system');
const WISH = require('./modules/content/wish-pool-ai');
const MAIN_STORY = require('./modules/content/story/main-story');
const ECON = require('./modules/systems/market/economy-system');
const MEMORY_INDEX = require('./modules/systems/data/memory-index');
const ISLAND_STORY = require('./modules/content/story/island-story');
const { startWorldBackupScheduler, runWorldBackup, getBackupDebugStatus } = require('./modules/systems/data/world-backup');
const {
  ISLAND_MAP_TEXT,
  buildIslandMapAnsi,
  MAP_LOCATIONS,
  getLocationProfile,
  getLocationStoryMetadata,
  getLocationStoryContext,
  getPortalDestinations,
  getLocationPortalHub,
  getRegionPortalHubs,
  getRegionLocationsByLocation,
  buildRegionMapSnapshot
} = require('./modules/content/world-map');
const { createInteractionMessageUtils } = require('./modules/systems/runtime/utils/interaction-message-utils');
const { initStoryRuntimeUtils } = require('./modules/systems/runtime/init-story-runtime-utils');
const { createThreadStorageUtils } = require('./modules/systems/runtime/utils/thread-storage-utils');
const { createThreadGuardUtils } = require('./modules/systems/runtime/utils/thread-guard-utils');
const { createUiLanguageUtils } = require('./modules/systems/runtime/utils/ui-language-utils');
const { createLoadingUtils } = require('./modules/systems/runtime/utils/loading-utils');
const { createMapSnapshotUtils } = require('./modules/systems/map/map-snapshot-utils');
const { createLocationArcUtils } = require('./modules/content/location-arc-utils');
const { createStoryTurnUtils } = require('./modules/content/story-turn-utils');
const { createThreadLifecycleUtils } = require('./modules/systems/runtime/utils/thread-lifecycle-utils');
const { createWorldTickUtils } = require('./modules/systems/runtime/utils/world-tick-utils');
const { createPlayerGenerationSchemaUtils } = require('./modules/content/generation/player-generation-schema-utils');
const { createFinanceAuditUtils } = require('./modules/systems/player/finance-audit-utils');
const { createMapTextUtils } = require('./modules/systems/map/map-text-utils');
const { createMapRenderUtils } = require('./modules/systems/map/map-render-utils');
const { createSettingsTextUtils } = require('./modules/systems/runtime/utils/settings-text-utils');
const { createSettingsMemoryTextUtils } = require('./modules/systems/ui/settings-memory-text-utils');
const { createEntryGateUtils } = require('./modules/systems/runtime/utils/entry-gate-utils');
const { registerInteractionDispatcher } = require('./modules/systems/routing/interaction-dispatcher-utils');
const { createNumberFormatUtils } = require('./modules/systems/runtime/utils/number-format-utils');
const { createPetCapacityUtils } = require('./modules/systems/player/pet-capacity-utils');
const { createPlayerContextUtils } = require('./modules/systems/player/player-context-utils');
const { createBattleCoreUtils } = require('./modules/systems/battle/battle-core-utils');
const { createGachaSlotUtils } = require('./modules/systems/gacha/gacha-slot-utils');
const { createReadyCommandRegisterUtils } = require('./modules/systems/runtime/ready-command-register-utils');
const { createUiTextUtils } = require('./modules/systems/runtime/ui-text-utils');
const { SLASH_COMMANDS } = require('./modules/systems/runtime/slash-commands');
const { initGameFeatureSystems } = require('./modules/systems/runtime/init-game-feature-systems');
const { initCommandInteractionWiring } = require('./modules/systems/runtime/init-command-interaction-wiring');
const { registerRuntimeHandlers } = require('./modules/systems/runtime/register-runtime-handlers');
const { initInteractionDispatcherDeps } = require('./modules/systems/runtime/init-interaction-dispatcher-deps');
const { initMapOnboardingRuntimeUtils } = require('./modules/systems/runtime/init-map-onboarding-runtime-utils');
const { initAdminRuntimeSystems } = require('./modules/systems/runtime/init-admin-runtime-systems');
const { initChoiceRuntimeSystems } = require('./modules/systems/runtime/init-choice-runtime-systems');
const { initBattleRuntimeDomain } = require('./modules/systems/runtime/init-battle-runtime-domain');
const { initPlayerGenerationSocialRuntime } = require('./modules/systems/runtime/init-player-generation-social-runtime');

const INTERACTION_MESSAGE_UTILS = createInteractionMessageUtils();
const {
  findMessageInChannel,
  disableMessageComponents,
  lockPressedButtonImmediately,
  isModalLauncherButtonId,
  snapshotMessageComponentsForRestore,
  createButtonInteractionTemplateContext,
  attachButtonTemplateReplyAutoRestore,
  restoreButtonTemplateSnapshot,
  updateInteractionMessage
} = INTERACTION_MESSAGE_UTILS;
const LOADING_UTILS = createLoadingUtils();
const {
  startLoadingAnimation,
  startTypingIndicator
} = LOADING_UTILS;
const MAP_SNAPSHOT_UTILS = createMapSnapshotUtils({ CORE });
const {
  saveMapReturnSnapshot,
  consumeMapReturnSnapshot,
  snapshotHasUsableComponents
} = MAP_SNAPSHOT_UTILS;
const THREAD_STORAGE_UTILS = createThreadStorageUtils({
  playerThreadsFile: PLAYER_THREADS_FILE
});
const {
  loadPlayerThreads,
  savePlayerThreads,
  loadJsonObject,
  saveJsonObject,
  setPlayerThread,
  getPlayerThread,
  getThreadOwnerUserId
} = THREAD_STORAGE_UTILS;
const THREAD_LIFECYCLE_UTILS = createThreadLifecycleUtils({
  CLIENT,
  ChannelType,
  getPlayerThread: (...args) => getPlayerThread(...args),
  setPlayerThread: (...args) => setPlayerThread(...args)
});
const {
  closeOldThread,
  createNewThread
} = THREAD_LIFECYCLE_UTILS;
const WORLD_TICK_UTILS = createWorldTickUtils({
  CLIENT,
  CORE,
  EVENTS,
  EmbedBuilder,
  loadPlayerThreads: (...args) => loadPlayerThreads(...args),
  getIsRunning: () => true
});
const {
  startAutoTick
} = WORLD_TICK_UTILS;
const NUMBER_FORMAT_UTILS = createNumberFormatUtils();
const {
  getMarketTypeLabel,
  formatFinanceAmount,
  round1,
  format1,
  getMoveSpeedValue
} = NUMBER_FORMAT_UTILS;
const FINANCE_AUDIT_UTILS = createFinanceAuditUtils({ CORE, ECON });
const {
  recordCashflow,
  buildFinanceLedgerText,
  buildMemoryAuditRows,
  buildMemoryAuditText
} = FINANCE_AUDIT_UTILS;
const PLAYER_CONTEXT_UTILS = createPlayerContextUtils({
  CORE,
  MAIN_STORY,
  DIGITAL_MASK_TURNS: Math.max(1, Number(process.env.DIGITAL_MASK_TURNS || 12))
});
const {
  getFactionPresenceHintForPlayer,
  isDigitalMaskPhaseForPlayer,
  getBattleFighterType
} = PLAYER_CONTEXT_UTILS;
const BATTLE_CORE_UTILS = createBattleCoreUtils({
  CORE,
  PET,
  BATTLE,
  getHumanCombatMove: () => HUMAN_COMBAT_MOVE,
  getWaitCombatMove: () => WAIT_COMBAT_MOVE,
  PET_MOVE_LOADOUT_LIMIT: Math.max(1, Math.min(5, Number(process.env.PET_MOVE_LOADOUT_LIMIT || 5))),
  BATTLE_ESTIMATE_MAX_TURNS: 16,
  BATTLE_ESTIMATE_SIMULATIONS: Math.max(20, Math.min(500, Number(process.env.BATTLE_ESTIMATE_SIMULATIONS || 100))),
  getBattleFighterType: (...args) => getBattleFighterType(...args),
  getMoveSpeedValue,
  getLocationProfile,
  normalizePetElementCode: (...args) => normalizePetElementCode(...args)
});
const {
  cloneStatusState,
  buildHumanCombatant,
  resolvePlayerMainPet,
  getBattlePetStateSnapshot,
  setBattlePetStateSnapshot,
  hasPetSwapBlockingStatus,
  getBattleSwitchCandidates,
  getActiveCombatant,
  getPlayerOwnedPets,
  isFleeLikeMove,
  getPetAttackMoves,
  getAllPetSkillMoves,
  getPetMovePool,
  normalizePetMoveLoadout,
  getCombatantMoves,
  persistCombatantState,
  estimateBattleOutcome,
  pickBestMoveForAI,
  getLocationDifficultyForPlayer,
  isLikelyHumanoidEnemyName,
  resolveEnemyIsMonster,
  buildNpcCompanionPet,
  applyNpcCompanionPet,
  pickFallbackEnemyNamesByDifficulty,
  sanitizeInferredEnemyName,
  inferEnemyNameFromText,
  inferEnemyNameFromContext,
  getBattleEnemyName,
  applyBeginnerZoneEnemyBalance,
  applyBeginnerZoneDangerVariant,
  buildEnemyForBattle
} = BATTLE_CORE_UTILS;
const PET_CAPACITY_UTILS = createPetCapacityUtils({
  WALLET,
  getPlayerOwnedPets: (...args) => getPlayerOwnedPets(...args)
});
const { getPetCapacityForUser } = PET_CAPACITY_UTILS;
const ENTRY_GATE_UTILS = createEntryGateUtils({
  CORE,
  PET,
  BATTLE,
  ISLAND_STORY,
  getLocationProfile,
  LOCATION_ARC_COMPLETE_TURNS: Math.max(3, Math.min(16, Number(process.env.LOCATION_ARC_COMPLETE_TURNS || 10))),
  LOCATION_ENTRY_GATE_ENABLED: String(process.env.LOCATION_ENTRY_GATE_ENABLED || '1') !== '0',
  LOCATION_ENTRY_MIN_WINRATE: Math.max(1, Math.min(99, Number(process.env.LOCATION_ENTRY_MIN_WINRATE || 50))),
  syncLocationArcLocation: (...args) => syncLocationArcLocation(...args),
  ensureLocationStoryProgressEntry: (...args) => ensureLocationStoryProgressEntry(...args),
  buildHumanCombatant,
  getActiveCombatant,
  getCombatantMoves,
  getBattleFighterType: (...args) => getBattleFighterType(...args)
});
const {
  getPlayerProgressDifficultyTier,
  ensureEntryGateProgressState,
  calculateCurrentCombatPower,
  getEntryTierBaselinePower,
  ensurePlayerIslandState,
  syncCurrentIslandStoryProgress,
  buildLocationEntryBaselineEnemy,
  canEnterLocation
} = ENTRY_GATE_UTILS;
const LOCATION_ARC_UTILS = createLocationArcUtils({
  ensurePlayerIslandState,
  getLocationProfile,
  ISLAND_STORY,
  LOCATION_ARC_COMPLETE_TURNS: Math.max(3, Math.min(16, Number(process.env.LOCATION_ARC_COMPLETE_TURNS || 10))),
  getPlayerStoryTurns: (...args) => getPlayerStoryTurns(...args),
  isPortalChoice: (...args) => isPortalChoice(...args),
  isWishPoolChoice: (...args) => isWishPoolChoice(...args),
  isMarketChoice: (...args) => isMarketChoice(...args)
});
const {
  ensureLocationStoryProgressEntry,
  ensureLocationArcState,
  ensureRegionFreeRoamState,
  unlockRegionFreeRoamByLocation,
  canFreeRoamCurrentRegion,
  syncLocationArcLocation,
  incrementLocationArcTurns,
  getCurrentLocationExposure,
  getCurrentLocationStoryProgress,
  hasCurrentLocationStoryBattleDone,
  markCurrentLocationStoryBattleDone,
  markSystemChoiceExposure
} = LOCATION_ARC_UTILS;
const UI_LANGUAGE_UTILS = createUiLanguageUtils({
  configLanguage: CONFIG.LANGUAGE,
  ButtonBuilder,
  ButtonStyle,
  buildQuickShopButton: (player) => buildQuickShopButton(player)
});
const {
  setPlayerTempData,
  getPlayerTempData,
  clearPlayerTempData,
  normalizeLangCode,
  getPlayerUILang,
  getUtilityButtonLabels,
  appendMainMenuUtilityButtons
} = UI_LANGUAGE_UTILS;
const UI_TEXT_UTILS = createUiTextUtils({
  normalizeLangCode: (...args) => normalizeLangCode(...args),
  defaultLanguage: CONFIG.LANGUAGE
});
({
  t: tCore
} = UI_TEXT_UTILS);
const GACHA_SLOT_UTILS = createGachaSlotUtils();
const {
  buildSlotReels,
  buildGachaReelLines
} = GACHA_SLOT_UTILS;
const SETTINGS_TEXT_UTILS = createSettingsTextUtils({
  normalizeLangCode: (...args) => normalizeLangCode(...args)
});
const {
  getSettingsText
} = SETTINGS_TEXT_UTILS;
const SETTINGS_MEMORY_TEXT_UTILS = createSettingsMemoryTextUtils({
  normalizeLangCode: (...args) => normalizeLangCode(...args)
});
const {
  getSettingsHubText,
  getMemoryRecapText
} = SETTINGS_MEMORY_TEXT_UTILS;
const MAP_TEXT_UTILS = createMapTextUtils({
  normalizeLangCode: (...args) => normalizeLangCode(...args),
  TELEPORT_DEVICE_COST,
  TELEPORT_DEVICE_DURATION_HOURS,
  LOCATION_ENTRY_MIN_WINRATE: Math.max(1, Math.min(99, Number(process.env.LOCATION_ENTRY_MIN_WINRATE || 50))),
  format1
});
const {
  getMapText,
  portalTeleportStory
} = MAP_TEXT_UTILS;
const MAP_RENDER_UTILS = createMapRenderUtils({
  rootDir: __dirname,
  MAP_ENABLE_WIDE_ANSI
});
const {
  normalizeMapViewMode,
  getPlayerMapViewMode,
  renderRegionMapImageBuffer
} = MAP_RENDER_UTILS;
const STORY_TURN_UTILS = createStoryTurnUtils({
  QUICK_SHOP_COOLDOWN_TURNS: Math.max(1, Math.min(20, Number(process.env.QUICK_SHOP_COOLDOWN_TURNS || 5))),
  getPlayerUILang: (...args) => getPlayerUILang(...args),
  getUtilityButtonLabels: (...args) => getUtilityButtonLabels(...args),
  ButtonBuilder,
  ButtonStyle,
  getMarketTypeLabel
});
const {
  getPlayerStoryTurns,
  getQuickShopCooldownInfo,
  buildQuickShopButton,
  extractStoryTailLine,
  buildQuickShopNarrativeNotice,
  incrementPlayerStoryTurns
} = STORY_TURN_UTILS;
const MAP_ONBOARDING_RUNTIME_UTILS = initMapOnboardingRuntimeUtils({
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
  getLocationPortalHub,
  getRegionPortalHubs,
  buildIslandMapAnsi,
  ISLAND_MAP_TEXT,
  getLocationProfile,
  getLocationStoryContext,
  getMapText: (...args) => getMapText(...args),
  canFreeRoamCurrentRegion: (...args) => canFreeRoamCurrentRegion(...args),
  normalizeMapViewMode: (...args) => normalizeMapViewMode(...args),
  getPlayerUILang: (...args) => getPlayerUILang(...args),
  ensurePlayerIslandState: (...args) => ensurePlayerIslandState(...args),
  getPortalAccessContext: (...args) => getPortalAccessContext(...args),
  isMainPortalHubLocation: (...args) => isMainPortalHubLocation(...args),
  playerOwnsTeleportDevice: (...args) => playerOwnsTeleportDevice(...args),
  getPlayerMapViewMode: (...args) => getPlayerMapViewMode(...args),
  joinByLang: (...args) => joinByLang(...args),
  renderRegionMapImageBuffer: (...args) => renderRegionMapImageBuffer(...args),
  formatPortalDestinationDisplay: (...args) => formatPortalDestinationDisplay(...args),
  buildPortalUsageGuide: (...args) => buildPortalUsageGuide(...args),
  buildDeviceUsageGuide: (...args) => buildDeviceUsageGuide(...args),
  updateInteractionMessage: (...args) => updateInteractionMessage(...args),
  trackActiveGameMessage: (...args) => trackActiveGameMessage(...args),
  getTeleportDeviceStockInfo: (...args) => getTeleportDeviceStockInfo(...args),
  formatTeleportDeviceRemaining: (...args) => formatTeleportDeviceRemaining(...args),
  getPetMovePool: (...args) => getPetMovePool(...args),
  getPetCapacityForUser: (...args) => getPetCapacityForUser(...args),
  normalizePetElementCode: (...args) => normalizePetElementCode(...args),
  normalizePetName: (...args) => normalizePetName(...args),
  rollStarterMoveForElement: (...args) => rollStarterMoveForElement(...args),
  LOCATION_ARC_COMPLETE_TURNS,
  PORTAL_GUIDE_MIN_TURNS,
  PORTAL_RESHOW_COOLDOWN_TURNS,
  WISH_POOL_GUIDE_MIN_TURNS,
  LOCATION_ENTRY_GATE_ENABLED,
  LOCATION_ENTRY_MIN_WINRATE,
  STORY_THREAT_SCORE_THRESHOLD,
  ROAM_MOVE_BASE_CHANCE,
  ROAM_MOVE_EXPLORE_BONUS,
  ROAM_MOVE_WANDER_BONUS
});
const {
  joinByLang,
  buildPortalUsageGuide,
  formatPortalDestinationDisplay,
  getPortalAccessContext,
  buildDeviceUsageGuide,
  hasRoamTravelIntentText,
  isRoamEligibleAction,
  getRoamMoveChance,
  pickRoamDestination,
  maybeApplyRoamMovement,
  appendUniqueItem,
  buildRegionMoveSelectRow,
  buildMapComponents,
  showIslandMap,
  showPortalSelection,
  showTeleportDeviceSelection,
  buildRetryGenerationComponents,
  editOrSendFallback,
  getLanguageText,
  getWorldIntroTemplate,
  consumeWorldIntroOnce,
  normalizeCharacterGender,
  normalizePetElementCode,
  getPetElementColor,
  getPetElementDisplayName,
  normalizeKnownBattleElement,
  getBattleElementEmoji,
  formatBattleElementDisplay,
  resolveEnemyBattleElement,
  getBattleElementRelation,
  pickDefaultPetNameByElement,
  normalizeCharacterName,
  normalizePetName,
  getMoveTierMeta,
  rollStarterMoveForElement,
  buildGenderSelectionPayload,
  buildElementSelectionPayload,
  showCharacterNameModal,
  showOnboardingPetNameModal,
  parseNameSubmitProfileFromCustomId,
  normalizePlayerAlignment,
  formatAlignmentLabel,
  getAlignmentColor,
  showClaimPetElementPanel,
  showClaimPetNameModal,
  createAdditionalPetForPlayer
} = MAP_ONBOARDING_RUNTIME_UTILS;
const ONLINE_FRIEND_DUEL_TIMERS = new Map();
const BATTLE_RUNTIME_DOMAIN = initBattleRuntimeDomain({
  CORE,
  PET,
  BATTLE,
  EVENTS,
  ECON,
  CLIENT,
  ONLINE_FRIEND_DUEL_TIMERS,
  findMessageInChannel,
  trackActiveGameMessage: (...args) => trackActiveGameMessage(...args),
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  format1,
  getMoveSpeedValue,
  chooseRandomUnique: (...args) => chooseRandomUnique(...args),
  getLocationProfile,
  normalizePetElementCode: (...args) => normalizePetElementCode(...args),
  getBattleFighterType: (...args) => getBattleFighterType(...args),
  stableHashCodeCore,
  getPlayerStoryTurns: (...args) => getPlayerStoryTurns(...args),
  MENTOR_SPAR_WIN_HP_RATIO,
  WANTED_AMBUSH_MIN_LEVEL,
  BATTLE_CADENCE_TURNS,
  getAllPetSkillMoves: (...args) => getAllPetSkillMoves(...args),
  getLocationDifficultyForPlayer: (...args) => getLocationDifficultyForPlayer(...args),
  resolvePlayerMainPet: (...args) => resolvePlayerMainPet(...args),
  getActiveCombatant: (...args) => getActiveCombatant(...args),
  getCombatantMoves: (...args) => getCombatantMoves(...args),
  persistCombatantState: (...args) => persistCombatantState(...args),
  hasPetSwapBlockingStatus: (...args) => hasPetSwapBlockingStatus(...args),
  getBattleSwitchCandidates: (...args) => getBattleSwitchCandidates(...args),
  estimateBattleOutcome: (...args) => estimateBattleOutcome(...args),
  pickBestMoveForAI: (...args) => pickBestMoveForAI(...args),
  getPlayerOwnedPets: (...args) => getPlayerOwnedPets(...args),
  canPetFight: CORE.canPetFight,
  loadPlayer: CORE.loadPlayer,
  getPetById: PET.getPetById,
  cloneStatusState,
  buildEnemyForBattle: (...args) => buildEnemyForBattle(...args),
  WAIT_COMBAT_MOVE,
  FRIEND_DUEL_ONLINE_TURN_MS,
  PET_MOVE_LOADOUT_LIMIT,
  isFleeLikeMove: (...args) => isFleeLikeMove(...args),
  finalizeFriendDuel: (...args) => finalizeFriendDuel(...args),
  publishBattleWorldEvent: (...args) => publishBattleWorldEvent(...args),
  queuePendingStoryTrigger: (...args) => queuePendingStoryTrigger(...args),
  rememberPlayer: (...args) => rememberPlayer(...args),
  formatRecoveryTurnsShort: (...args) => formatRecoveryTurnsShort(...args),
  appendStoryContinuation: (...args) => CORE.appendStoryContinuation(...args),
  recordCashflow: (...args) => recordCashflow(...args),
  getBattleElementRelation: (...args) => getBattleElementRelation(...args),
  formatBattleElementDisplay: (...args) => formatBattleElementDisplay(...args),
  getPetElementDisplayName: (...args) => getPetElementDisplayName(...args),
  resolveEnemyBattleElement: (...args) => resolveEnemyBattleElement(...args),
  MANUAL_ENEMY_RESPONSE_DELAY_MS,
  tCore,
  MAIN_STORY,
  PET_PASSIVE_HEAL_PER_STORY_TURN,
  isImmediateBattleChoice: (...args) => isImmediateBattleChoice(...args),
  getPlayerUILang: (...args) => getPlayerUILang(...args),
  HUMAN_COMBAT_MOVE
});
const {
  normalizeNpcAlignTag,
  isNpcHostileByProfile,
  getPlayerWantedPressure,
  getWantedEscalationProfile,
  getBattleCadenceInfo,
  ensureMentorSparRecord,
  getCompletedMentorIds,
  hasMentorSparCompleted,
  chooseMentorTeachTemplatesFromSeed,
  isEligibleNearbyMentorNpc,
  getNearbyMentorCandidatesForPlayer,
  isMentorSparChoice,
  buildMentorSparCooldownInfo,
  buildMentorCooldownReplacementChoice,
  assignNearbyMentorToChoice,
  enforceMentorSparAvailability,
  cloneMoveTemplateForBattle,
  buildMoveTemplateByNameMap,
  getMentorCandidatesForPlayer,
  resolveMentorCandidateForEvent,
  chooseMentorTeachMoves,
  buildMentorSparResult,
  describeMoveEffects,
  normalizeBattleLayoutMode,
  getBattleLayoutMode,
  toggleBattleLayoutMode,
  getOnlineBattleLayoutMode,
  toggleOnlineBattleLayoutMode,
  buildBattleMoveDetails,
  ensureBattleEnergyState,
  advanceBattleTurnEnergy,
  buildBattleActionRows,
  clipBattleCellText,
  extractActionExtra,
  buildActionPanelLines,
  buildDualActionPanels,
  buildDualActionPanelsMobile,
  buildBattleMobileCombinedLayout,
  buildActionViewFromPhase,
  buildAIBattleStory,
  padBattleLabel,
  formatBattleHpValue,
  buildManualBattleBoard,
  buildManualBattleBoardMobile,
  sendBattleMessage,
  buildManualBattlePayload,
  buildBattleSwitchPayload,
  buildFriendDuelEnemyFromPet,
  buildFriendDuelEnemyTeamFromPlayer,
  trySwitchFriendDuelEnemy,
  trySwitchFriendDuelPlayerPet,
  buildFriendDuelEnemyFromPlayer,
  parseOnlineFriendDuelAction,
  getOnlineFriendDuelState,
  getOnlineFriendDuelHostPlayer,
  canOperateOnlineFriendDuel,
  shouldBypassThreadGuardForOnlineFriendDuel,
  clearOnlineFriendDuelTimer,
  editOnlineFriendDuelMessage,
  pickBestMoveForOnlineEnemy,
  resolveOnlineSubmittedMove,
  scheduleOnlineFriendDuelTimer,
  resolveOnlineFriendDuelTurnByTimeout,
  trimButtonLabel,
  buildOnlineFriendDuelButtons,
  buildFriendDuelResultRow,
  getOnlineFriendDuelRivalMoves,
  formatOnlineFriendDuelMoveList,
  formatOnlineFriendChoiceText,
  formatOnlineHostMoveDetails,
  buildOnlineFriendDuelActionView,
  buildOnlineFriendDuelPayload,
  startManualBattleOnline,
  handleOnlineFriendDuelChoice,
  rememberPlayer,
  applyMainStoryCombatProgress,
  notifyStoryBusy,
  shouldTriggerBattle,
  applyPassivePetRecovery,
  applyPetRecoveryTurnTick,
  maybeGenerateTradeGoodFromChoice,
  summarizeBattleDetailForStory,
  composePostBattleStory,
  composeActionBridgeStory,
  maybeResolveMentorSparResult,
  recordMentorSparCompletion,
  finalizeMentorSparVictory,
  finalizeMentorSparDefeat,
  formatPetHpWithRecovery,
  showTrueGameOver,
  showPetDefeatedTransition,
  continueBattleWithHuman,
  renderManualBattle,
  handleBattleSwitchOpen,
  handleBattleSwitchCancel,
  handleBattleSwitchSelect,
  startManualBattle,
  startAutoBattle,
  handleFight,
  handleUseMove,
  handleBattleWait,
  handleFlee
} = BATTLE_RUNTIME_DOMAIN;
const THREAD_GUARD_UTILS = createThreadGuardUtils({
  shouldBypassThreadGuardForOnlineFriendDuel,
  getThreadOwnerUserId
});
const {
  rejectIfNotThreadOwner,
  rejectIfNotLatestThread: rejectIfNotLatestThreadCore
} = THREAD_GUARD_UTILS;
const rejectIfNotLatestThread = (interaction, userId) =>
  rejectIfNotLatestThreadCore(interaction, userId, getPlayerThread);
const CHOICE_RUNTIME_SYSTEMS = initChoiceRuntimeSystems({
  CORE,
  PET,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  getLocationProfile,
  getPortalDestinations,
  getNearbyMentorCandidatesForPlayer: (...args) => getNearbyMentorCandidatesForPlayer(...args),
  syncLocationArcLocation: (...args) => syncLocationArcLocation(...args),
  hasMainStoryTravelGateCue: (...args) => hasMainStoryTravelGateCue(...args),
  hasPortalTransitionCue: (...args) => hasPortalTransitionCue(...args),
  hasMarketNarrativeCue: (...args) => hasMarketNarrativeCue(...args),
  computeStoryThreatScore: (...args) => computeStoryThreatScore(...args),
  hasRoamTravelIntentText: (...args) => hasRoamTravelIntentText(...args),
  getPlayerStoryTurns: (...args) => getPlayerStoryTurns(...args),
  getRecentChoiceHistory: (...args) => getRecentChoiceHistory(...args),
  getChoiceRiskCategory: (...args) => getChoiceRiskCategory(...args),
  isPortalChoice: (...args) => isPortalChoice(...args),
  isWishPoolChoice: (...args) => isWishPoolChoice(...args),
  isMarketChoice: (...args) => isMarketChoice(...args),
  isImmediateBattleChoice: (...args) => isImmediateBattleChoice(...args),
  normalizeChoiceFingerprintText: (...args) => normalizeChoiceFingerprintText(...args),
  computeChoiceSimilarityByTokens: (...args) => computeChoiceSimilarityByTokens(...args),
  buildLocationFeatureTextForChoiceScoring: (...args) => buildLocationFeatureTextForChoiceScoring(...args),
  textIncludesAnyKeyword: (...args) => textIncludesAnyKeyword(...args),
  extractStoryEndingFocus: (...args) => extractStoryEndingFocus(...args),
  applyStoryThreatGate: (...args) => applyStoryThreatGate(...args),
  hasCurrentLocationStoryBattleDone: (...args) => hasCurrentLocationStoryBattleDone(...args),
  getBattleCadenceInfo: (...args) => getBattleCadenceInfo(...args),
  getPlayerWantedPressure: (...args) => getPlayerWantedPressure(...args),
  getWantedEscalationProfile: (...args) => getWantedEscalationProfile(...args),
  resolveLocationStoryBattleTarget: (...args) => resolveLocationStoryBattleTarget(...args),
  normalizeConflictTargetName: (...args) => normalizeConflictTargetName(...args),
  getPendingConflictFollowup: (...args) => getPendingConflictFollowup(...args),
  clearPendingConflictFollowup: (...args) => clearPendingConflictFollowup(...args),
  markSystemChoiceExposure: (...args) => markSystemChoiceExposure(...args),
  normalizePetElementCode: (...args) => normalizePetElementCode(...args),
  isNpcHostileByProfile: (...args) => isNpcHostileByProfile(...args),
  normalizeNpcAlignTag: (...args) => normalizeNpcAlignTag(...args),
  extractStoryDialogues: (...args) => extractStoryDialogues(...args),
  buildEnemyForBattle: (...args) => buildEnemyForBattle(...args),
  estimateBattleOutcome: (...args) => estimateBattleOutcome(...args),
  format1,
  CHOICE_DISPLAY_COUNT,
  CUSTOM_INPUT_OPTION_RATE,
  STORY_THREAT_SCORE_THRESHOLD,
  RECENT_CHOICE_HISTORY_LIMIT,
  CHOICE_REPEAT_ACTION_COOLDOWN_TURNS,
  CHOICE_REPEAT_SIMILARITY_THRESHOLD,
  LOCATION_ARC_COMPLETE_TURNS,
  PORTAL_RESHOW_COOLDOWN_TURNS,
  PORTAL_GUIDE_MIN_TURNS,
  WISH_POOL_GUIDE_MIN_TURNS,
  MARKET_GUARANTEE_GAP_TURNS,
  EARLY_GAME_GOLD_GUARANTEE_TURNS,
  AGGRESSIVE_CHOICE_TARGET_RATE,
  WANTED_AMBUSH_MIN_LEVEL,
  CHOICE_POOL_COUNT,
  AGGRESSIVE_FOLLOWUP_TARGET_MAX_LEN,
  AGGRESSIVE_FOLLOWUP_MIN_TURNS,
  AGGRESSIVE_FOLLOWUP_WINDOW_TURNS,
  PLAYER_CODEX_NPC_LIMIT,
  PLAYER_CODEX_DRAW_LIMIT,
  STORY_GENERIC_SPEAKER_PATTERN,
  STORY_DIALOGUE_MAX_QUOTE_LEN,
  STORY_DIALOGUE_MAX_PER_STORY,
  appendMainMenuUtilityButtons: (...args) => appendMainMenuUtilityButtons(...args),
  getCurrentLocationExposure: (...args) => getCurrentLocationExposure(...args),
  getLocationDifficultyForPlayer: (...args) => getLocationDifficultyForPlayer(...args),
  isDigitalMaskPhaseForPlayer: (...args) => isDigitalMaskPhaseForPlayer(...args)
});
const {
  buildLocationFeatureTextForChoiceScoring,
  textIncludesAnyKeyword,
  normalizeChoiceFingerprintText,
  buildChoiceFingerprint,
  computeChoiceSimilarityByTokens,
  normalizeRecentChoiceHistory,
  ensureRecentChoiceHistory,
  getRecentChoiceHistory,
  recordPlayerChoiceHistory,
  getNearbySystemAvailabilityForChoiceScoring,
  buildChoiceContextSignals,
  computeChoiceContinuityScore,
  isCombatChoice,
  isBuyChoice,
  isImmediateBattleChoice,
  isHostileImmediateBattleChoice,
  ensureBattleMarkerSuffix,
  getChoiceRiskCategory,
  stripChoicePrefix,
  stripImmediateBattleMarker,
  extractStoryEndingFocus,
  computeStoryThreatScore,
  downgradeImmediateBattleChoice,
  applyStoryThreatGate,
  formatChoiceText,
  createCustomInputChoice,
  maybeInjectRareCustomInputChoice,
  buildBattlePreviewHint,
  appendBattlePreviewToChoice,
  buildChoiceOptionsText,
  buildEventChoiceButtons,
  tryRecoverEventButtonsAfterFailure,
  ensurePlayerCodexSchema,
  recordNpcEncounter,
  recordNearbyNpcEncounters,
  formatCodexLines,
  normalizeStorySpeakerText,
  normalizeComparableStoryText,
  detectSpeakerGroup,
  isGenericSpeaker,
  toAlphaIndex,
  aliasGenericSpeaker,
  extractStoryDialogues,
  buildStoryBattleEnemyFromNpc,
  getNearbyStoryBattleNpcCandidates,
  scoreStoryBattleNpcCandidate,
  collectRecentStorySpeakerHints,
  normalizeConflictTargetName,
  pickStoryConflictDisplayName,
  normalizePendingConflictFollowupState,
  getPendingConflictFollowup,
  clearPendingConflictFollowup,
  setPendingConflictFollowup,
  scoreStoryBindingForNpc,
  resolveLocationStoryBattleTarget,
  isPortalChoice,
  isWishPoolChoice,
  normalizeEventChoices,
  hasPortalTransitionCue,
  hasMainStoryTravelGateCue,
  isMarketChoice,
  hasMarketNarrativeCue,
  ensureLocationStoryBattleChoiceAvailability,
  isAggressiveChoice,
  ensureBattleCadenceChoiceAvailability,
  ensureAggressiveChoiceAvailability,
  ensurePendingConflictImmediateBattleChoice,
  shouldCountCombatForLocationStory,
  ensureEarlyGameIncomeChoice,
  createGuaranteedLocationStoryBattleChoice,
  applyChoicePolicy
} = CHOICE_RUNTIME_SYSTEMS;
const PLAYER_GENERATION_SOCIAL_RUNTIME = initPlayerGenerationSocialRuntime({
  CORE,
  CHOICE_DISPLAY_COUNT: 5,
  NPC_DIALOGUE_LOG_LIMIT: Math.max(20, Math.min(200, Number(process.env.NPC_DIALOGUE_LOG_LIMIT || 80))),
  GENERATION_HISTORY_LIMIT: Math.max(5, Math.min(100, Number(process.env.GENERATION_HISTORY_LIMIT || 20))),
  ensurePlayerGenerationSchema: (...args) => ensurePlayerGenerationSchemaCore(...args),
  normalizeRecentChoiceHistory: (...args) => normalizeRecentChoiceHistory(...args),
  normalizeMainlineBridgeLock: (...args) => normalizeMainlineBridgeLock(...args),
  normalizePendingConflictFollowupState: (...args) => normalizePendingConflictFollowupState(...args),
  normalizeMainlineForeshadowPins: (...args) => normalizeMainlineForeshadowPinsCore(...args),
  normalizeStoryDialoguePins: (...args) => normalizeStoryDialoguePinsCore(...args),
  normalizeMapViewMode: (...args) => normalizeMapViewMode(...args),
  ensurePlayerCodexSchema: (...args) => ensurePlayerCodexSchema(...args),
  // use generation-state defaults from initPlayerGenerationSocialRuntime
  // to avoid self-recursive wrappers during runtime wiring.
});
const {
  cloneChoiceSnapshot,
  normalizeGenerationStatus,
  normalizeNpcDialogueLog,
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
  applyFriendBattleResult
} = PLAYER_GENERATION_SOCIAL_RUNTIME;


try {
  CORE.loadWorld();
} catch (e) {
  console.log('[世界] 載入失敗:', e.message);
}

const t = (key, lang = 'zh-TW') => tCore(key, lang);

async function notifyWorldBackupSuccess(result) {
  return notifyWorldBackupSuccessCore(result);
}

async function resumeExistingOnboardingOrGame(interaction, user) {
  return resumeExistingOnboardingOrGameCore(interaction, user);
}

const trackActiveGameMessage = (player, channelId, messageId) => trackActiveGameMessageCore(player, channelId, messageId);
const consumeFinanceNotices = (player, limit = 3) => consumeFinanceNoticesCore(player, limit);

async function handleDrawMove(interaction, user) {
  return handleDrawMoveCore(interaction, user);
}

const STORY_GEN_LOCKS = new Map();
const STORY_GEN_LOCK_TTL_MS = 180000;
const STORY_RUNTIME_UTILS = initStoryRuntimeUtils({
  CORE,
  EVENTS,
  STORY,
  ISLAND_STORY,
  MAIN_STORY,
  getLocationPortalHub: (...args) => getLocationPortalHub(...args),
  normalizeLangCode: (...args) => normalizeLangCode(...args),
  formatPetHpWithRecovery: (...args) => formatPetHpWithRecovery(...args),
  normalizeComparableStoryText: (...args) => normalizeComparableStoryText(...args),
  extractStoryDialogues: (...args) => extractStoryDialogues(...args),
  appendNpcDialogueLog: (...args) => appendNpcDialogueLog(...args),
  ensurePlayerGenerationSchema: (...args) => ensurePlayerGenerationSchemaCore(...args),
  ensurePlayerCodexSchema: (...args) => ensurePlayerCodexSchema(...args),
  normalizeMapViewMode: (...args) => normalizeMapViewMode(...args),
  MAINLINE_BRIDGE_LOCK_TTL_TURNS,
  STORY_DIALOGUE_MAX_QUOTE_LEN,
  STORY_DIALOGUE_PIN_LIMIT,
  STORY_DIALOGUE_PIN_TTL_TURNS,
  MAINLINE_CUE_PATTERN,
  MAINLINE_PIN_LIMIT,
  MAINLINE_PIN_TTL_TURNS,
  TELEPORT_DEVICE_DURATION_HOURS,
  TELEPORT_DEVICE_STOCK_LIMIT
});
const {
  formatRecoveryTurnsShort,
  normalizePendingStoryTrigger,
  queuePendingStoryTrigger,
  getPendingStoryTrigger,
  clearPendingStoryTrigger,
  normalizeMainlineBridgeLock,
  getMainlineBridgeLock,
  setMainlineBridgeLock,
  clearMainlineBridgeLock,
  consumeMainlineBridgeLock,
  getAdventureText,
  buildMainStatusBar,
  getIslandMainlineProgressMeta,
  buildMainlineProgressLine,
  normalizeWorldEventEntry,
  getMergedWorldEvents,
  publishWorldEvent,
  publishBattleWorldEvent,
  detectStitchedBattleStory,
  extractBattleChoiceHintFromStory,
  normalizeStoryDialoguePins: normalizeStoryDialoguePinsCore,
  upsertStoryDialoguePins: upsertStoryDialoguePinsCore,
  extractMainlineForeshadowClues: extractMainlineForeshadowCluesCore,
  normalizeMainlineForeshadowPins: normalizeMainlineForeshadowPinsCore,
  upsertMainlineForeshadowPins: upsertMainlineForeshadowPinsCore,
  rememberStoryDialogues: rememberStoryDialoguesCore,
  triggerMainlineForeshadowAIInBackground: triggerMainlineForeshadowAIInBackgroundCore,
  formatTeleportDeviceRemaining,
  normalizeTeleportDeviceStock,
  getTeleportDeviceStockInfo,
  playerOwnsTeleportDevice,
  grantTeleportDevice,
  consumeTeleportDevice,
  isMainPortalHubLocation
} = STORY_RUNTIME_UTILS;
stableHashCodeCore = STORY_RUNTIME_UTILS.stableHashCode;
const ADMIN_RUNTIME_SYSTEMS = initAdminRuntimeSystems({
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
  releaseStoryLock: (...args) => releaseStoryLock(...args),
  clearStoryLocks: () => STORY_GEN_LOCKS.clear(),
  runWorldBackup: (...args) => runWorldBackup(...args),
  getBackupDebugStatus: (...args) => getBackupDebugStatus(...args),
  getMarketTypeLabel,
  rememberPlayer,
  recordCashflow,
  getPlayerOwnedPets,
  normalizePetMoveLoadout,
  getPetAttackMoves,
  getAllPetSkillMoves,
  getPetMovePool,
  normalizeEventChoices,
  purgePlayerFromAllFriendLists
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
  getDraftItemName,
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
  releaseStoryLock,
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
} = ADMIN_RUNTIME_SYSTEMS;
const RUNTIME_BASE_DEPS = {
  CLIENT,
  CORE,
  PET,
  BATTLE,
  ECON,
  STORY,
  EVENTS,
  WISH,
  WALLET,
  MAIN_STORY,
  ISLAND_STORY,
  GACHA,
  GACHA_CONFIG: GACHA.GACHA_CONFIG,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  CHOICE_DISPLAY_COUNT,
  CUSTOM_INPUT_MAX_LENGTH,
  BATTLE_ESTIMATE_SIMULATIONS,
  MENTOR_SPAR_WIN_HP_RATIO,
  WANTED_AMBUSH_MIN_LEVEL,
  PET_PASSIVE_HEAL_PER_STORY_TURN,
  LOCATION_ENTRY_MIN_WINRATE,
  MOVES_DETAIL_PAGE_SIZE,
  PET_MOVE_LOADOUT_LIMIT,
  MARKET_LIST_PAGE_SIZE,
  SHOP_SELL_SELECT_LIMIT,
  SHOP_HAGGLE_SELECT_LIMIT,
  SHOP_HAGGLE_BULK_SELECT_LIMIT,
  FRIEND_DUEL_ONLINE_TURN_MS,
  WORLD_BACKUP_NOTIFY_CHANNEL_ID,
  resolvePlayerMainPet,
  ensurePlayerGenerationSchema: (...args) => ensurePlayerGenerationSchemaCore(...args),
  recordNearbyNpcEncounters,
  syncLocationArcLocation,
  rememberPlayer: (...args) => rememberPlayer(...args),
  restoreStoryFromGenerationState,
  restoreChoicesFromGenerationState,
  consumeWorldIntroOnce,
  consumeFinanceNotices,
  getPendingStoryTrigger: (...args) => getPendingStoryTrigger(...args),
  detectStitchedBattleStory: (...args) => detectStitchedBattleStory(...args),
  extractBattleChoiceHintFromStory: (...args) => extractBattleChoiceHintFromStory(...args),
  queuePendingStoryTrigger: (...args) => queuePendingStoryTrigger(...args),
  applyChoicePolicy,
  normalizeEventChoices,
  updateGenerationState,
  getAdventureText: (...args) => getAdventureText(...args),
  buildMainStatusBar: (...args) => buildMainStatusBar(...args),
  buildChoiceOptionsText,
  buildMainlineProgressLine: (...args) => buildMainlineProgressLine(...args),
  getAlignmentColor,
  formatPetHpWithRecovery,
  buildEventChoiceButtons,
  appendMainMenuUtilityButtons,
  disableMessageComponents,
  trackActiveGameMessage,
  tryAcquireStoryLock: (...args) => tryAcquireStoryLock(...args),
  notifyStoryBusy,
  startGenerationState,
  startLoadingAnimation,
  startTypingIndicator,
  getPlayerMemoryContextAsync: (...args) => CORE.getPlayerMemoryContextAsync(...args),
  getNearbyNpcMemoryContextAsync: (...args) => CORE.getNearbyNpcMemoryContextAsync(...args),
  editOrSendFallback,
  buildRetryGenerationComponents,
  getMainlineBridgeLock: (...args) => getMainlineBridgeLock(...args),
  consumeMainlineBridgeLock: (...args) => consumeMainlineBridgeLock(...args),
  clearPendingStoryTrigger: (...args) => clearPendingStoryTrigger(...args),
  rememberStoryDialogues: (...args) => rememberStoryDialoguesCore(...args),
  maybeInjectRareCustomInputChoice,
  triggerMainlineForeshadowAIInBackground: (...args) => triggerMainlineForeshadowAIInBackgroundCore(...args),
  releaseStoryLock: (...args) => releaseStoryLock(...args),
  ensurePlayerIslandState,
  getRegionLocationsByLocation,
  getMapText: (...args) => getMapText(...args),
  normalizeMapViewMode: (...args) => normalizeMapViewMode(...args),
  showIslandMap,
  showPortalSelection,
  showTeleportDeviceSelection,
  recordNpcEncounter,
  setMainlineBridgeLock: (...args) => setMainlineBridgeLock(...args),
  buildPortalUsageGuide,
  canEnterLocation,
  buildMentorSparResult,
  resolveLocationStoryBattleTarget,
  getPlayerWantedPressure,
  getFactionPresenceHintForPlayer,
  appendNpcDialogueLog,
  recordCashflow,
  appendUniqueItem,
  appendNpcMemory: (...args) => CORE.appendNpcMemory?.(...args),
  maybeGenerateTradeGoodFromChoice,
  maybeApplyRoamMovement,
  getPlayerStoryTurns,
  shouldTriggerBattle,
  isAggressiveChoice,
  pickStoryConflictDisplayName,
  clearPendingConflictFollowup,
  setPendingConflictFollowup,
  recordPlayerChoiceHistory,
  isDigitalMaskPhaseForPlayer,
  incrementPlayerStoryTurns,
  applyPetRecoveryTurnTick,
  incrementLocationArcTurns,
  syncCurrentIslandStoryProgress,
  getLocationStoryMetadata,
  getLocationPortalHub,
  applyPassivePetRecovery,
  composeActionBridgeStory,
  buildEnemyForBattle,
  publishBattleWorldEvent: (...args) => publishBattleWorldEvent(...args),
  shouldCountCombatForLocationStory,
  markCurrentLocationStoryBattleDone,
  estimateBattleOutcome,
  formatBattleElementDisplay,
  resolveEnemyBattleElement,
  getBattleElementRelation,
  createGuaranteedLocationStoryBattleChoice,
  publishWorldEvent: (...args) => publishWorldEvent(...args),
  getPortalDestinations,
  addWorldEvent: (...args) => EVENTS.addWorldEvent?.(...args),
  executeEvent: (...args) => EVENTS.executeEvent?.(...args),
  negotiationPrompt: (...args) => CORE.negotiationPrompt?.(...args),
  finishGenerationState,
  getMergedWorldEvents: (...args) => getMergedWorldEvents(...args),
  updateInteractionMessage,
  getPlayerTempData,
  setPlayerTempData,
  clearPlayerTempData,
  getPlayerUILang,
  buildGenderSelectionPayload,
  buildElementSelectionPayload,
  showCharacterNameModal,
  showOnboardingPetNameModal,
  normalizeCharacterName,
  normalizePetName,
  pickDefaultPetNameByElement,
  normalizeCharacterGender,
  normalizePetElementCode,
  normalizePlayerAlignment,
  getLanguageText,
  getPetMovePool,
  getMoveTierMeta,
  getPetElementDisplayName,
  getPetElementColor,
  resumeExistingOnboardingOrGame,
  t,
  format1,
  getMoveSpeedValue,
  normalizePetMoveLoadout,
  grantStarterFivePullIfNeeded: (...args) => grantStarterFivePullIfNeededCore(...args),
  rollStarterMoveForElement,
  getSettingsHubText,
  round1,
  getPlayerOwnedPets,
  getPetAttackMoves,
  getLearnableSkillChipEntries,
  getForgettablePetMoves,
  describeMoveEffects,
  getMarketTypeLabel,
  buildMarketListingLine,
  parseMarketTypeFromCustomId,
  parseMarketAndPageFromCustomId,
  paginateList,
  buildPagedFieldChunks,
  estimateStoryReferencePriceByName,
  normalizeListingRarity,
  buildShopSellDraftOptions,
  buildShopHaggleDraftOptions,
  buildHaggleShadowPlayer,
  buildHaggleBulkShadowPlayer,
  extractPitchFromHaggleMessage,
  getDraftItemName,
  consumeHaggleItemFromPlayer,
  consumeHaggleBulkItemsFromPlayer,
  openShopSession,
  leaveShopSession,
  buyShopCrystal,
  getQuickShopCooldownInfo,
  buildQuickShopNarrativeNotice,
  getTeleportDeviceStockInfo,
  formatTeleportDeviceRemaining,
  consumeTeleportDevice,
  playScratchLottery: (...args) => ECON.playScratchLottery(...args),
  grantTeleportDevice,
  buildFinanceLedgerText,
  buildMemoryAuditRows,
  buildMemoryAuditText,
  getMemoryRecapText,
  generatePlayerMemoryRecap: (...args) => STORY.generatePlayerMemoryRecap?.(...args),
  getAllPetSkillMoves,
  extractSkillChipMoveName,
  addSkillChipToInventory,
  normalizeFriendId,
  ensurePlayerFriendState,
  getPlayerDisplayNameById,
  trimButtonLabel,
  isMutualFriend,
  getFriendBattleRecord,
  clearOnlineFriendDuelTimer,
  buildFriendDuelEnemyTeamFromPlayer,
  cloneStatusState,
  formatBattleHpValue,
  applyFriendBattleResult,
  getSettingsText,
  getWorldIntroTemplate,
  getPetCapacityForUser,
  ensureMentorSparRecord,
  buildSlotReels,
  buildGachaReelLines
};
const GAME_FEATURE_SYSTEMS = initGameFeatureSystems(RUNTIME_BASE_DEPS);
const {
  sendMainMenuToThread,
  handleEvent,
  showWalletBindModal,
  syncWalletAndApplyNow,
  syncWalletInBackground,
  handleWalletBind,
  handleWalletSyncNow,
  sendOnboardingLanguageSelection,
  handleContinueWithWalletButton,
  handleLegacyAlignmentChoice,
  handleChooseGender,
  handleChoosePetElement,
  createCharacterWithName,
  handleHatchEgg,
  handleEnterPetNameButton,
  handleNameSubmit,
  handleSkipNameButton,
  showMainMenu,
  showSettingsHub,
  showMovesList,
  showFinanceLedger,
  showMemoryAudit,
  showMemoryRecap,
  showPlayerMarketMenu,
  showPlayerMarketListings,
  showMyMarketListings,
  showWorldShopHaggleAllOffer,
  showWorldShopHaggleBulkPicker,
  showWorldShopHagglePicker,
  showWorldShopHaggleOffer,
  showWorldShopSellPicker,
  showWorldShopSellModal,
  handleWorldShopSellModal,
  showMarketPostModal,
  handleMarketPostModal,
  showWorldShopBuyPanel,
  showWorldShopScene,
  showInventory,
  collectPlayerCodexData,
  showPlayerCodex,
  showNpcCodex,
  showSkillCodex,
  showSettings,
  showRenaissWorldGuide,
  showProfile,
  showGacha,
  handleGachaResult,
  handleAllocateHP,
  showCharacter,
  showFriendAddModal,
  showFriendsMenu,
  showFriendCharacter,
  startFriendDuel,
  showFriendManualModePicker,
  buildFriendDuelSnapshot,
  restoreFriendDuelSnapshot,
  finalizeFriendDuel
} = GAME_FEATURE_SYSTEMS;
({
  ensureStarterRewardStateCore,
  grantStarterFivePullIfNeededCore,
  trackActiveGameMessageCore,
  consumeFinanceNoticesCore,
  handleDrawMoveCore,
  tryRecoverMainMenuAfterFailureCore,
  notifyWorldBackupSuccessCore,
  resumeExistingOnboardingOrGameCore
} = GAME_FEATURE_SYSTEMS);

const COMMAND_INTERACTION_WIRING = initCommandInteractionWiring({
  ...RUNTIME_BASE_DEPS,
  ...GAME_FEATURE_SYSTEMS,
  createNewThread,
  setPlayerThread,
  sendMainMenuToThread,
  ensurePlayerGenerationSchema: (...args) => ensurePlayerGenerationSchemaCore(...args)
});
const {
  handleStart,
  handlePet,
  handleMovesSelectMenu,
  handleClaimPetInteractions,
  handleMapRegionMoveSelect,
  handleMarketSelectMenu,
  handleWalletInteractions,
  handleFriendInteractions
} = COMMAND_INTERACTION_WIRING;

const PLAYER_GENERATION_SCHEMA_UTILS = createPlayerGenerationSchemaUtils({
  ensurePlayerCodexSchema: (...args) => ensurePlayerCodexSchema(...args),
  normalizeMapViewMode: (...args) => normalizeMapViewMode(...args),
  normalizeNpcDialogueLog: (...args) => normalizeNpcDialogueLog(...args),
  normalizeStoryDialoguePins: (...args) => normalizeStoryDialoguePinsCore(...args),
  normalizeMainlineForeshadowPins: (...args) => normalizeMainlineForeshadowPinsCore(...args),
  normalizePendingConflictFollowupState: (...args) => normalizePendingConflictFollowupState(...args),
  normalizeRecentChoiceHistory: (...args) => normalizeRecentChoiceHistory(...args),
  normalizeMainlineBridgeLock: (...args) => normalizeMainlineBridgeLock(...args),
  normalizeGenerationStatus: (...args) => normalizeGenerationStatus(...args),
  cloneChoiceSnapshot: (...args) => cloneChoiceSnapshot(...args),
  GENERATION_PENDING_STALE_MS,
  GENERATION_HISTORY_LIMIT
});
({
  ensurePlayerGenerationSchema: ensurePlayerGenerationSchemaCore
} = PLAYER_GENERATION_SCHEMA_UTILS);

// ============== 啟動完成 ==============
const READY_COMMAND_REGISTER_UTILS = createReadyCommandRegisterUtils({
  CLIENT,
  STORAGE,
  startWorldBackupScheduler: (...args) => startWorldBackupScheduler(...args),
  notifyWorldBackupSuccess: (...args) => notifyWorldBackupSuccess(...args),
  startAutoTick: (...args) => startAutoTick(...args),
  commands: SLASH_COMMANDS
});
const { registerReadyHandlers } = READY_COMMAND_REGISTER_UTILS;

const INTERACTION_DISPATCHER_DEPS = initInteractionDispatcherDeps({
  ...RUNTIME_BASE_DEPS,
  ...GAME_FEATURE_SYSTEMS,
  ...COMMAND_INTERACTION_WIRING,
  SHOP_HAGGLE_OFFER_TTL_MS,
  FRIEND_DUEL_ONLINE_TURN_MS,
  TELEPORT_DEVICE_COST,
  TELEPORT_DEVICE_DURATION_HOURS,
  TELEPORT_DEVICE_STOCK_LIMIT,
  rejectIfNotThreadOwner,
  rejectIfNotLatestThread,
  saveMapReturnSnapshot,
  createButtonInteractionTemplateContext,
  attachButtonTemplateReplyAutoRestore,
  consumeMapReturnSnapshot,
  snapshotHasUsableComponents,
  restoreButtonTemplateSnapshot,
  startManualBattle,
  startManualBattleOnline,
  startAutoBattle,
  continueBattleWithHuman,
  handleFight,
  handleUseMove,
  handleOnlineFriendDuelChoice,
  toggleBattleLayoutMode,
  renderManualBattle,
  handleBattleWait,
  handleBattleSwitchOpen,
  handleBattleSwitchCancel,
  handleFlee,
  tryRecoverMainMenuAfterFailure: (...args) => tryRecoverMainMenuAfterFailureCore(...args),
});

registerRuntimeHandlers(CLIENT, {
  registerReadyHandlers,
  registerSlashCommandListener,
  registerInteractionDispatcher,
  handleStart,
  handleWarStatus,
  handleResetData,
  handleResetPlayerHistory,
  handleResetWorld,
  handleBackupWorld,
  handleBackupCheck,
  interactionDeps: INTERACTION_DISPATCHER_DEPS
});

// ============== 啟動 ==============
if (require.main === module) {
  CLIENT.login(CONFIG.DISCORD_TOKEN).catch(err => {
    console.error('[Bot]', err.message);
  });
  console.log('[Renaiss World] 🌟 系統啟動中...');
}

module.exports = {
  canEnterLocation,
  buildLocationEntryBaselineEnemy,
  syncCurrentIslandStoryProgress,
  ensurePlayerIslandState
};
