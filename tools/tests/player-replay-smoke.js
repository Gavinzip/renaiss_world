const fs = require('fs');
const path = require('path');
const { registerInteractionDispatcher } = require('../../modules/systems/routing/interaction-dispatcher-utils');

const INTERACTION_FAIL_TEXT = '❌ 互動處理失敗';
const DEFAULT_PLAYER_ID = '1051129116419702784';

function createFakeClient() {
  const handlers = new Map();
  return {
    on(event, fn) {
      handlers.set(event, fn);
    },
    getHandler(event) {
      return handlers.get(event);
    }
  };
}

function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}

function readJsonIfExists(filePath = '') {
  try {
    if (!filePath) return null;
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function parseArgs(argv = []) {
  const out = {
    playerId: process.env.SMOKE_PLAYER_ID || DEFAULT_PLAYER_ID,
    playerPath: process.env.SMOKE_PLAYER_PATH || '',
    petsPath: process.env.SMOKE_PETS_PATH || path.resolve(__dirname, '../../data/pets.json'),
    scenarioOnly: false,
    routeOnly: false,
    useRealData: true
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = String(argv[i] || '').trim();
    if (!a) continue;
    if (a === '--scenario-only') {
      out.scenarioOnly = true;
      continue;
    }
    if (a === '--route-only') {
      out.routeOnly = true;
      continue;
    }
    if (a === '--no-real-data') {
      out.useRealData = false;
      continue;
    }
    if (a === '--player-id' && argv[i + 1]) {
      out.playerId = String(argv[i + 1]).trim() || out.playerId;
      i += 1;
      continue;
    }
    if (a === '--player-path' && argv[i + 1]) {
      out.playerPath = path.resolve(String(argv[i + 1]));
      i += 1;
      continue;
    }
    if (a === '--pets-path' && argv[i + 1]) {
      out.petsPath = path.resolve(String(argv[i + 1]));
      i += 1;
      continue;
    }
  }
  return out;
}

function buildDefaultPlayer(playerId = 'u1') {
  return {
    id: playerId,
    name: 'SmokeUser',
    language: 'zh-TW',
    location: '襄陽城',
    alignment: '正派',
    level: 1,
    stats: { 財富: 10000, 運氣: 1, 能量: 30, 生命: 100 },
    maxStats: { 能量: 100, 生命: 100 },
    currentStory: '測試故事',
    eventChoices: [{ name: '測試', choice: '測試', action: 'test' }],
    generationState: { status: 'done' },
    mapViewMode: 'text',
    inventory: ['技能晶片：孢霧惑心'],
    shopSession: {
      open: true,
      marketType: 'renaiss',
      sellDraftOptions: [{ itemName: '測試素材', itemRef: { source: 'inventory' }, quantityMax: 1 }],
      haggleDraftOptions: [{ itemName: '測試素材', itemRef: { source: 'inventory' }, quantityMax: 1 }]
    },
    mainStory: { mission: { regions: { central_core: { keyFound: false } } } },
    regionFreeRoam: {}
  };
}

function buildDefaultPet(playerId = 'u1') {
  return {
    id: `pet_${playerId}_smoke`,
    ownerId: playerId,
    name: 'SmokePet',
    hatched: true,
    waitingForName: false,
    type: '草',
    hp: 100,
    maxHp: 100,
    attack: 10,
    moves: [
      { id: 'head_butt', name: '頭槌', baseDamage: 10, speed: 10, effect: {} },
      { id: 'spore_haze', name: '孢霧惑心', baseDamage: 16, speed: 10, effect: {} }
    ],
    activeMoveIds: ['head_butt']
  };
}

function ensurePlayerDefaults(player) {
  const p = player && typeof player === 'object' ? player : {};
  if (!p.id) p.id = DEFAULT_PLAYER_ID;
  if (!p.name) p.name = 'SmokeUser';
  if (!p.language) p.language = 'zh-TW';
  if (!p.location) p.location = '襄陽城';
  if (!p.stats || typeof p.stats !== 'object') p.stats = {};
  if (!Number.isFinite(Number(p.stats.財富))) p.stats.財富 = 1000;
  if (!Number.isFinite(Number(p.stats.生命))) p.stats.生命 = 100;
  if (!Number.isFinite(Number(p.stats.能量))) p.stats.能量 = 30;
  if (!p.maxStats || typeof p.maxStats !== 'object') p.maxStats = { 生命: 100, 能量: 100 };
  if (!Array.isArray(p.eventChoices) || p.eventChoices.length === 0) {
    p.eventChoices = [{ name: '測試', choice: '測試', action: 'test' }];
  }
  if (!Array.isArray(p.inventory)) p.inventory = [];
  if (!p.generationState || typeof p.generationState !== 'object') p.generationState = { status: 'done' };
  if (!p.mainStory || typeof p.mainStory !== 'object') p.mainStory = { mission: { regions: { central_core: { keyFound: false } } } };
  if (!p.mainStory.mission || typeof p.mainStory.mission !== 'object') p.mainStory.mission = { regions: { central_core: { keyFound: false } } };
  if (!p.mainStory.mission.regions || typeof p.mainStory.mission.regions !== 'object') p.mainStory.mission.regions = { central_core: { keyFound: false } };
  if (!p.mainStory.mission.regions.central_core || typeof p.mainStory.mission.regions.central_core !== 'object') {
    p.mainStory.mission.regions.central_core = { keyFound: false };
  }
  if (!p.regionFreeRoam || typeof p.regionFreeRoam !== 'object') p.regionFreeRoam = {};
  return p;
}

function pickPetForPlayer(petsRaw, player) {
  if (!petsRaw || typeof petsRaw !== 'object') return null;
  const byId = String(player?.activePetId || player?.mainPetId || '').trim();
  if (byId && petsRaw[byId] && typeof petsRaw[byId] === 'object') return cloneJson(petsRaw[byId]);
  const all = Object.values(petsRaw);
  const row = all.find((pet) => String(pet?.ownerId || '') === String(player?.id || ''));
  return row ? cloneJson(row) : null;
}

function createNoopDeps(options = {}) {
  const playerId = String(options.playerId || DEFAULT_PLAYER_ID);
  const useRealData = options.useRealData !== false;
  const playerFixturePath = options.playerPath
    ? path.resolve(String(options.playerPath))
    : path.resolve(__dirname, `../../data/players/${playerId}.json`);
  const petsFixturePath = options.petsPath
    ? path.resolve(String(options.petsPath))
    : path.resolve(__dirname, '../../data/pets.json');

  const fixturePlayer = useRealData ? readJsonIfExists(playerFixturePath) : null;
  const fixturePets = useRealData ? readJsonIfExists(petsFixturePath) : null;

  const player = ensurePlayerDefaults(fixturePlayer ? cloneJson(fixturePlayer) : buildDefaultPlayer(playerId));
  player.id = String(player.id || playerId);

  const pickedPet = pickPetForPlayer(fixturePets, player);
  const pet = pickedPet || buildDefaultPet(player.id);
  if (!pet.id) pet.id = `pet_${player.id}_smoke`;
  if (!pet.ownerId) pet.ownerId = player.id;
  if (!pet.name) pet.name = 'SmokePet';
  if (!Array.isArray(pet.moves) || pet.moves.length === 0) {
    pet.moves = [{ id: 'head_butt', name: '頭槌', baseDamage: 10, speed: 10, effect: {} }];
  }
  if (!Array.isArray(pet.activeMoveIds) || pet.activeMoveIds.length === 0) {
    pet.activeMoveIds = [String(pet.moves[0]?.id || 'head_butt')];
  }
  if (!player.activePetId) player.activePetId = pet.id;
  if (!player.mainPetId) player.mainPetId = pet.id;

  class DummyEmbed {
    setTitle() { return this; }
    setColor() { return this; }
    setDescription() { return this; }
    addFields() { return this; }
    setImage() { return this; }
  }
  class DummyRow {
    constructor() { this.components = []; }
    addComponents(...comps) { this.components.push(...comps.flat()); return this; }
  }
  class DummyButton {
    setCustomId() { return this; }
    setLabel() { return this; }
    setStyle() { return this; }
    setDisabled() { return this; }
    setEmoji() { return this; }
  }
  class DummySelectMenu {
    setCustomId() { return this; }
    setPlaceholder() { return this; }
    setMinValues() { return this; }
    setMaxValues() { return this; }
    addOptions() { return this; }
  }

  const core = {
    loadPlayer: (id) => (String(id || '') === String(player.id || '') ? player : null),
    savePlayer: (next) => {
      if (!next || typeof next !== 'object') return;
      Object.assign(player, next);
    },
    rememberPlayer: () => {},
    appendStoryContinuation: () => {},
    appendNpcMemory: () => {},
    loadPlayerThreads: () => ({ [String(player.id || '')]: String(player.activeThreadId || 'c1') }),
    getNearbyNpcIds: () => [],
    negotiationPrompt: () => '',
    getPlayerMemoryContextAsync: async () => '',
    getNearbyNpcMemoryContextAsync: async () => ''
  };
  const petSystem = {
    loadPet: (ownerId) => (String(ownerId || '') === String(player.id || '') ? pet : null),
    savePet: () => {},
    getPetById: (petId) => (String(petId || '') === String(pet.id || '') ? pet : null)
  };
  const econ = {
    ensurePlayerEconomy: () => {},
    buyFromSellListing: () => ({
      success: true,
      itemName: '測試素材',
      quantity: 1,
      totalPrice: 100,
      marketType: 'renaiss',
      deliveryNotes: []
    }),
    cancelMyListing: () => ({ success: true }),
    consumeFinanceNotices: () => [],
    playScratchLottery: () => ({ success: true, message: '刮刮樂測試', jackpotPool: 0 })
  };

  const portalHubs = ['襄陽城', '敦煌', '廣州', '草原部落', '星潮港', '光明頂'];

  const base = {
    CORE: core,
    PET: petSystem,
    ECON: econ,
    SHOP_HAGGLE_OFFER_TTL_MS: 120000,
    FRIEND_DUEL_ONLINE_TURN_MS: 20000,
    TELEPORT_DEVICE_COST: 200,
    TELEPORT_DEVICE_DURATION_HOURS: 6,
    TELEPORT_DEVICE_STOCK_LIMIT: 99,
    EmbedBuilder: DummyEmbed,
    AttachmentBuilder: class DummyAttachment {},
    ActionRowBuilder: DummyRow,
    ButtonBuilder: DummyButton,
    StringSelectMenuBuilder: DummySelectMenu,
    ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
    rejectIfNotThreadOwner: async () => false,
    rejectIfNotLatestThread: async () => false,
    saveMapReturnSnapshot: () => {},
    createButtonInteractionTemplateContext: () => ({}),
    attachButtonTemplateReplyAutoRestore: () => {},
    lockPressedButtonImmediately: async () => {},
    disableMessageComponents: async () => {},
    restoreButtonTemplateSnapshot: async () => {},
    tryRecoverEventButtonsAfterFailure: async () => false,
    tryRecoverMainMenuAfterFailure: async () => false,
    parseMarketTypeFromCustomId: () => 'renaiss',
    parseMarketAndPageFromCustomId: () => ({ marketType: 'renaiss', page: 0 }),
    getPlayerTempData: () => null,
    setPlayerTempData: () => {},
    buildElementSelectionPayload: () => ({ embed: {}, row: {} }),
    normalizeCharacterName: (v) => String(v || '').trim() || String(player.name || 'SmokeUser'),
    normalizeCharacterGender: (v) => v || 'male',
    normalizePetElementCode: () => 'grass',
    normalizePetName: (v) => String(v || '').trim() || String(pet.name || 'SmokePet'),
    parseNameSubmitProfileFromCustomId: () => ({ gender: 'male', element: 'grass', alignment: 'positive' }),
    getPlayerUILang: () => String(player.language || 'zh-TW'),
    getMapText: () => ({
      mapNotFoundPlayer: 'player not found',
      portalNotReady: 'not ready',
      portalStoryLocked: 'story locked',
      portalNoDestination: 'no destination',
      portalInvalidDestination: 'invalid',
      portalDoneTitle: 'done',
      portalDoneDesc: () => 'done',
      portalBackStory: 'back',
      portalTeleportStory: () => 'teleported',
      portalDestinationDisabled: () => 'disabled',
      deviceDoneTitle: 'device done',
      deviceDoneDesc: () => 'device done',
      mapModeSwitchAscii: 'ascii',
      mapModeSwitchText: 'text',
      deviceNotOwned: 'device none',
      deviceInvalidDestination: 'device invalid',
      deviceAlreadyHere: () => 'already here',
      deviceTeleportStory: () => 'device teleported'
    }),
    getPortalAccessContext: () => {
      const atPortalHub = portalHubs.includes(String(player.location || ''));
      const unlocked = Boolean(player?.mainStory?.mission?.regions?.central_core?.keyFound || player?.regionFreeRoam?.['中原核心']);
      const destinationEntries = portalHubs
        .filter((loc) => loc !== String(player.location || ''))
        .map((loc, idx) => ({
          location: loc,
          enabled: Boolean(unlocked && idx === 0),
          state: idx === 0 ? 'next' : 'locked'
        }));
      return {
        atPortalHub,
        crossRegionUnlocked: unlocked,
        destinationEntries,
        destinations: destinationEntries.filter((r) => r.enabled).map((r) => r.location)
      };
    },
    getMarketTypeLabel: (t) => (t === 'digital' ? '神秘鑑價站' : 'Renaiss鑑價站'),
    extractStoryTailLine: () => '',
    composeActionBridgeStory: (_player, _choice, bridge) => bridge || 'bridge',
    composePostBattleStory: () => 'post battle',
    portalTeleportStory: () => 'teleported',
    deviceTeleportStory: () => 'device teleported',
    resolvePlayerMainPet: () => ({ pet, changed: false }),
    estimateBattleOutcome: () => ({ winRate: 50 }),
    formatBattleElementDisplay: () => '未知屬性',
    resolveEnemyBattleElement: () => '未知屬性',
    getBattleElementRelation: () => null,
    getPlayerDisplayNameById: () => 'OtherUser',
    normalizeMapViewMode: () => 'text',
    normalizeEventChoices: (_playerObj, choices) => choices,
    getRegionLocationsByLocation: () => ['襄陽城', '敦煌', '廣州'],
    getQuickShopCooldownInfo: () => ({ ready: true, remaining: 0 }),
    buildQuickShopNarrativeNotice: () => 'notice',
    buyShopCrystal: () => ({ success: true, message: '水晶測試', cost: 200 }),
    openShopSession: () => {},
    consumeMapReturnSnapshot: () => null,
    snapshotHasUsableComponents: () => false,
    trackActiveGameMessage: () => {},
    acceptFriendRequest: () => ({ ok: true }),
    cancelOutgoingFriendRequest: () => ({ ok: true }),
    consumeTeleportDevice: () => ({ remainingCount: 0 }),
    getTeleportDeviceStockInfo: () => ({ count: 1, soonestRemainingMs: 3600_000 }),
    formatTeleportDeviceRemaining: () => '1h',
    ensurePlayerIslandState: () => {},
    syncLocationArcLocation: () => {},
    queuePendingStoryTrigger: () => {},
    rememberPlayer: () => {},
    publishBattleWorldEvent: () => {},
    recordInteractionCoverage: () => {},
    recordCashflow: () => {},
    applyChoicePolicy: (_p, c) => c,
    startTypingIndicator: () => {},
    stopTypingIndicator: () => {},
    __smoke: {
      player,
      pet,
      playerId: String(player.id || ''),
      playerName: String(player.name || ''),
      petId: String(pet.id || ''),
      fixture: {
        playerPath: playerFixturePath,
        petsPath: petsFixturePath,
        useRealData
      }
    }
  };

  Object.assign(base, {
    handleWalletInteractions: async () => false,
    handleClaimPetInteractions: async () => false,
    handleFriendInteractions: async () => false,
    handleBattleSwitchSelect: async () => {},
    handlePetEquipmentEquipSelect: async () => {},
    handlePetEquipmentUnequipSelect: async () => {},
    handleMapRegionMoveSelect: async () => false,
    handleMovesSelectMenu: async () => false,
    handleMarketSelectMenu: async () => false,
    handleMarketPostModal: async () => {},
    handleWorldShopSellModal: async () => {},
    createCharacterWithName: async () => {},
    handleEvent: async () => {},
    handleChooseGender: async () => {},
    handleChoosePetElement: async () => {},
    handleLegacyAlignmentChoice: async () => {},
    sendOnboardingLanguageSelection: async () => {},
    handleHatchEgg: async () => {},
    handleDrawMove: async () => {},
    showFriendsMenu: async () => {},
    sendMainMenuToThread: async () => {},
    showMainMenu: async () => {},
    showSettingsHub: async () => {},
    showSettings: async () => {},
    showRenaissWorldGuide: async () => {},
    resumeExistingOnboardingOrGame: async () => false,
    showCharacter: async () => {},
    showFriendAddModal: async () => {},
    showFriendCharacter: async () => {},
    startFriendDuel: async () => {},
    clearOnlineFriendDuelTimer: () => {},
    showIslandMap: async () => {},
    showPortalSelection: async () => {},
    showTeleportDeviceSelection: async () => {},
    startManualBattleOnline: async () => {},
    startManualBattle: async () => {},
    startAutoBattle: async () => {},
    continueBattleWithHuman: async () => {},
    handleFight: async () => {},
    handleUseMove: async () => {},
    handleOnlineFriendDuelChoice: async () => {},
    toggleBattleLayoutMode: () => 'desktop',
    renderManualBattle: async () => {},
    handleBattleWait: async () => {},
    handleBattleSwitchOpen: async () => {},
    handleBattleSwitchCancel: async () => {},
    handleFlee: async () => {},
    showMovesList: async () => {},
    showInventory: async () => {},
    showInventoryFusionLab: async () => {},
    handleInventoryFusionConfirm: async () => {},
    handleInventoryFusionClear: async () => {},
    showPetEquipmentView: async () => {},
    showPlayerCodex: async () => {},
    showNpcCodex: async () => {},
    showSkillCodex: async () => {},
    showFinanceLedger: async () => {},
    showMemoryAudit: async () => {},
    showMemoryRecap: async () => {},
    showWorldShopScene: async () => {},
    showPlayerMarketMenu: async () => {},
    showPlayerMarketListings: async () => {},
    showMyMarketListings: async () => {},
    showWorldShopSellPicker: async () => {},
    showWorldShopHagglePicker: async () => {},
    showWorldShopHaggleBulkPicker: async () => {},
    consumeHaggleBulkItemsFromPlayer: () => [],
    consumeHaggleItemFromPlayer: () => null,
    extractPitchFromHaggleMessage: () => '',
    showWorldShopBuyPanel: async () => {},
    playScratchLottery: () => ({ ok: true, won: false }),
    grantTeleportDevice: () => ({}),
    leaveShopSession: () => {},
    showProfile: async () => {},
    showGacha: async () => {},
    handleGachaResult: async () => {},
    handleAllocateHP: async () => {},
    showAllocateHpModal: async () => {},
    handleAllocateHpModalSubmit: async () => {},
    handleContinueWithWalletButton: async () => {},
    handleEnterPetNameButton: async () => {},
    handleSkipNameButton: async () => {},
    handleNameSubmit: async () => {}
  });

  const missingFactory = (prop) => (..._args) => {
    throw new Error(`Missing dependency called: ${String(prop)}`);
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol') return undefined;
      return missingFactory(prop);
    }
  });
}

function parseRouteSignatures() {
  const dispatcherPath = path.resolve(__dirname, '../../modules/systems/routing/interaction-dispatcher-utils.js');
  const src = fs.readFileSync(dispatcherPath, 'utf8');
  const exact = new Set([...src.matchAll(/customId\s*===\s*'([^']+)'/g)].map((m) => m[1]));
  const prefix = new Set([...src.matchAll(/customId\.startsWith\('([^']+)'\)/g)].map((m) => m[1]));
  return { exact: Array.from(exact), prefix: Array.from(prefix) };
}

function sampleFromPrefix(prefix, ctx = {}) {
  const petId = String(ctx.petId || 'pet1');
  const userId = String(ctx.userId || 'u1');
  const preset = {
    'alloc_hp_': `alloc_hp_${petId}_1`,
    'alloc_hp_open_': `alloc_hp_open_${petId}`,
    'alloc_hp_modal_': `alloc_hp_modal_${petId}`,
    'char_name_submit_': 'char_name_submit_male',
    'choose_element_': 'choose_element_grass',
    'custom_action_submit_': 'custom_action_submit_0',
    'device_jump_': 'device_jump_0',
    'draw_move_': 'draw_move_1',
    'event_': 'event_0',
    'fdonline_': 'fdonline_submit_0',
    'fight_': 'fight_0',
    'flee_': 'flee_0',
    'friend_accept_': 'friend_accept_u2',
    'friend_cancel_': 'friend_cancel_u2',
    'friend_duel_': 'friend_duel_u2',
    'friend_view_': 'friend_view_u2',
    'inv_fusion_clear_': 'inv_fusion_clear_0',
    'inv_fusion_confirm_': 'inv_fusion_confirm_0',
    'inv_fusion_open_': 'inv_fusion_open_0',
    'inv_fusion_page_next_': 'inv_fusion_page_next_0',
    'inv_fusion_page_prev_': 'inv_fusion_page_prev_0',
    'inv_fusion_pick_': 'inv_fusion_pick_0',
    'inv_page_next_': 'inv_page_next_items_0',
    'inv_page_prev_': 'inv_page_prev_items_0',
    'inv_tab_': 'inv_tab_items_0',
    'map_goto_': 'map_goto_襄陽城',
    'map_page_': 'map_page_0',
    'map_view_': 'map_view_text_0',
    'moves_open_pet_': `moves_open_pet_${petId}`,
    'moves_page_next_': `moves_page_next_${petId}_0`,
    'moves_page_prev_': `moves_page_prev_${petId}_0`,
    'moves_show_equipment_': `moves_show_equipment_${petId}`,
    'name_modal_': 'name_modal_1',
    'name_submit_': 'name_submit_legacy',
    'pet_eq_equip_': `pet_eq_equip_${petId}`,
    'pet_eq_unequip_': `pet_eq_unequip_${petId}`,
    'pmkt_buy_': 'pmkt_buy_1',
    'pmkt_cancel_': 'pmkt_cancel_1',
    'pmkt_fill_': 'pmkt_fill_1',
    'pmkt_modal_buy_': 'pmkt_modal_buy_renaiss',
    'pmkt_modal_sell_': 'pmkt_modal_sell_renaiss',
    'pmkt_my_': 'pmkt_my_renaiss_0',
    'pmkt_post_buy_': 'pmkt_post_buy_renaiss',
    'pmkt_post_sell_': 'pmkt_post_sell_renaiss',
    'pmkt_view_sell_': 'pmkt_view_sell_renaiss_0',
    'portal_jump_': 'portal_jump_0',
    'quick_shop_': 'quick_shop_renaiss',
    'select_lang_': 'select_lang_zh-TW',
    'set_main_pet_': `set_main_pet_${petId}`,
    'shop_buy_': 'shop_buy_renaiss',
    'shop_buy_device_': 'shop_buy_device_renaiss',
    'shop_buy_energy_crystal_': 'shop_buy_energy_crystal_renaiss',
    'shop_buy_heal_crystal_': 'shop_buy_heal_crystal_renaiss',
    'shop_buy_item_': 'shop_buy_item_1',
    'shop_buy_point_': 'shop_buy_point_renaiss',
    'shop_haggle_all_': 'shop_haggle_all_renaiss',
    'shop_haggle_cancel_': 'shop_haggle_cancel_renaiss',
    'shop_haggle_confirm_': 'shop_haggle_confirm_renaiss',
    'shop_npc_haggle_': 'shop_npc_haggle_renaiss',
    'shop_open_': 'shop_open_renaiss',
    'shop_post_sell_': 'shop_post_sell_renaiss',
    'shop_scratch_': 'shop_scratch_renaiss',
    'shop_sell_modal_': 'shop_sell_modal_renaiss',
    'use_move_': 'use_move_0',
    'wish_pool_submit_': 'wish_pool_submit_0',
    'friend_accept_': `friend_accept_${userId}`
  };
  return preset[prefix] || `${prefix}smoke`;
}

function detectInteractionType(customId) {
  const id = String(customId || '');
  const modalPrefixes = [
    'pmkt_modal_buy_',
    'pmkt_modal_sell_',
    'shop_sell_modal_',
    'char_name_submit_',
    'name_modal_',
    'name_submit_',
    'wish_pool_submit_',
    'custom_action_submit_',
    'alloc_hp_modal_'
  ];
  if (modalPrefixes.some((p) => id.startsWith(p))) return 'modal';
  if (id === 'battle_switch_select') return 'select';
  return 'button';
}

function manualSelectCases(ctx = {}) {
  const petId = String(ctx.petId || 'pet1');
  return [
    { id: 'map_region_move_0', type: 'select' },
    { id: 'moves_pet_select', type: 'select' },
    { id: 'moves_learn_chip', type: 'select' },
    { id: 'moves_unlearn_chip', type: 'select' },
    { id: 'moves_assign', type: 'select' },
    { id: 'pmkt_buy_select_renaiss', type: 'select' },
    { id: 'shop_buy_select_renaiss', type: 'select' },
    { id: 'shop_sell_select_renaiss', type: 'select' },
    { id: 'shop_haggle_select_renaiss', type: 'select' },
    { id: 'shop_haggle_bulk_select_renaiss', type: 'select' },
    { id: `pet_eq_equip_${petId}`, type: 'select' },
    { id: `pet_eq_unequip_${petId}`, type: 'select' }
  ];
}

function buildTestCases(ctx = {}) {
  const { exact, prefix } = parseRouteSignatures();
  const all = [];
  const seen = new Set();
  for (const id of exact) {
    const entry = { id, type: detectInteractionType(id), source: 'exact' };
    const key = `${entry.type}::${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(entry);
  }
  for (const p of prefix) {
    const id = sampleFromPrefix(p, ctx);
    const entry = { id, type: detectInteractionType(id), source: `prefix:${p}` };
    const key = `${entry.type}::${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(entry);
  }
  for (const m of manualSelectCases(ctx)) {
    const key = `${m.type}::${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push({ ...m, source: 'manual' });
  }
  return all;
}

function selectValuesFor(customId, ctx = {}) {
  const id = String(customId || '');
  const petId = String(ctx.petId || 'pet1');
  if (id === 'battle_switch_select') return [petId];
  if (id.startsWith('map_region_move_')) return ['襄陽城'];
  if (id === 'moves_pet_select') return [petId];
  if (id === 'moves_learn_chip') return [`${petId}::spore_haze`];
  if (id === 'moves_unlearn_chip') return [`${petId}::spore_haze`];
  if (id === 'moves_assign') return [`${petId}::head_butt`];
  if (id.startsWith('pmkt_buy_select_')) return ['pmktbuy_1'];
  if (id.startsWith('shop_buy_select_')) return ['shopbuy_1'];
  if (id.startsWith('shop_sell_select_')) return ['sellidx_0'];
  if (id.startsWith('shop_haggle_select_')) return ['haggleidx_0'];
  if (id.startsWith('shop_haggle_bulk_select_')) return ['bulkidx_0'];
  if (id.startsWith('pet_eq_equip_')) return ['helmet::0'];
  if (id.startsWith('pet_eq_unequip_')) return ['helmet'];
  return ['1'];
}

function createInteraction(customId, type = 'button', ctx = {}) {
  const state = { deferred: false, replied: false };
  const notices = [];
  const recordPayload = (payload) => {
    if (!payload) return;
    if (typeof payload === 'string') {
      notices.push(payload);
      return;
    }
    if (payload && typeof payload === 'object' && typeof payload.content === 'string') {
      notices.push(payload.content);
    }
  };
  const userId = String(ctx.userId || 'u1');
  const threadId = String(ctx.threadId || 'c1');
  return {
    customId,
    user: { id: userId, username: String(ctx.userName || 'SmokeUser') },
    channelId: threadId,
    __notices: notices,
    message: {
      id: 'm1',
      components: [],
      async delete() {},
      async edit(payload) { recordPayload(payload); }
    },
    values: type === 'select' ? selectValuesFor(customId, ctx) : ['1'],
    fields: {
      getTextInputValue: (fieldId) => (String(fieldId || '') === 'alloc_hp_amount' ? '1' : 'smoke-input')
    },
    channel: {
      id: threadId,
      isThread: () => true,
      parent: { id: 'p1', isThread: () => false },
      async send(payload) {
        recordPayload(payload);
        return { id: 'msg-smoke', components: [] };
      }
    },
    guild: { id: 'g1' },
    get deferred() { return state.deferred; },
    get replied() { return state.replied; },
    isButton: () => type === 'button',
    isModalSubmit: () => type === 'modal',
    isStringSelectMenu: () => type === 'select',
    isChatInputCommand: () => false,
    async deferUpdate() { state.deferred = true; },
    async deferReply() { state.deferred = true; },
    async reply(payload) { recordPayload(payload); state.replied = true; },
    async followUp(payload) { recordPayload(payload); },
    async update(payload) { recordPayload(payload); state.replied = true; },
    async showModal() {},
    async editReply(payload) { recordPayload(payload); }
  };
}

function hasInteractionFailureNotice(interaction) {
  const rows = Array.isArray(interaction?.__notices) ? interaction.__notices : [];
  return rows.some((line) => String(line || '').includes(INTERACTION_FAIL_TEXT));
}

function resolvePortalJumpId(deps) {
  try {
    const player = deps?.__smoke?.player;
    const access = typeof deps?.getPortalAccessContext === 'function'
      ? deps.getPortalAccessContext(player)
      : null;
    const entries = Array.isArray(access?.destinationEntries) ? access.destinationEntries : [];
    const idx = entries.findIndex((row) => Boolean(row?.enabled));
    if (idx >= 0) return `portal_jump_${idx}`;
  } catch {}
  return null;
}

async function runScenarioReplay(handler, deps, ctx = {}) {
  const player = deps?.__smoke?.player;
  if (player && player.mainStory && player.mainStory.mission && player.mainStory.mission.regions && player.mainStory.mission.regions.central_core) {
    player.location = '襄陽城';
    player.mainStory.mission.regions.central_core.keyFound = true;
    player.regionFreeRoam = player.regionFreeRoam && typeof player.regionFreeRoam === 'object' ? player.regionFreeRoam : {};
    player.regionFreeRoam['中原核心'] = { unlockedAt: Date.now(), byLocation: '襄陽城' };
  }

  const steps = [
    'main_menu',
    'open_profile',
    'open_character',
    'show_moves',
    `moves_open_pet_${String(ctx.petId || 'pet1')}`,
    'open_gacha',
    'gacha_single',
    'show_inventory',
    'inv_tab_items_0',
    'inv_tab_goods_0',
    'inv_tab_equipment_0',
    'show_codex',
    'show_codex_npc',
    'show_codex_skill',
    'show_finance_ledger',
    'show_memory_audit',
    'show_memory_recap',
    'map_page_0',
    'map_open_portal',
    'map_open_device',
    'device_jump_0',
    'event_0',
    'shop_open_renaiss',
    'pmkt_open_renaiss',
    'open_settings',
    'world_guide',
    'open_friends',
    'open_friend_add_modal',
    'map_back_main'
  ];
  const portalJump = resolvePortalJumpId(deps);
  if (portalJump) steps.splice(20, 0, portalJump);

  const results = [];
  for (const id of steps) {
    const type = detectInteractionType(id);
    const interaction = createInteraction(id, type, ctx);
    let thrown = '';
    try {
      await handler(interaction);
    } catch (err) {
      thrown = String(err?.message || err || 'unknown error');
    }
    const failedNotice = hasInteractionFailureNotice(interaction);
    const ok = !thrown && !failedNotice;
    results.push({
      id,
      type,
      ok,
      error: thrown || (failedNotice ? INTERACTION_FAIL_TEXT : '')
    });
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const originalError = console.error;
  const dispatchFailures = [];
  console.error = (...vals) => {
    const line = vals.map((v) => String(v)).join(' ');
    if (line.includes('[Interaction] handler failed')) dispatchFailures.push(line);
    originalError(...vals);
  };

  const client = createFakeClient();
  const deps = createNoopDeps(args);
  registerInteractionDispatcher(client, deps);
  const handler = client.getHandler('interactionCreate');
  if (typeof handler !== 'function') {
    throw new Error('dispatcher handler not registered');
  }

  const smokeCtx = {
    userId: String(deps?.__smoke?.playerId || 'u1'),
    userName: String(deps?.__smoke?.playerName || 'SmokeUser'),
    petId: String(deps?.__smoke?.petId || 'pet1'),
    threadId: String(deps?.__smoke?.player?.activeThreadId || 'c1')
  };

  const routeResults = [];
  if (!args.scenarioOnly) {
    const routeCases = buildTestCases(smokeCtx);
    for (const c of routeCases) {
      const interaction = createInteraction(c.id, c.type, smokeCtx);
      let thrown = '';
      try {
        await handler(interaction);
      } catch (err) {
        thrown = String(err?.message || err || 'unknown error');
      }
      const failedNotice = hasInteractionFailureNotice(interaction);
      routeResults.push({
        ...c,
        ok: !thrown && !failedNotice,
        error: thrown || (failedNotice ? INTERACTION_FAIL_TEXT : '')
      });
    }
  }

  const scenarioResults = args.routeOnly ? [] : await runScenarioReplay(handler, deps, smokeCtx);

  if (dispatchFailures.length > 0) {
    for (const line of dispatchFailures) {
      const idMatch = line.match(/cid=([^ ]+)/);
      const id = String(idMatch?.[1] || '').trim();
      if (!id) continue;
      const row = routeResults.find((r) => r.id === id) || scenarioResults.find((r) => r.id === id);
      if (!row) continue;
      row.ok = false;
      row.error = line;
    }
  }

  const allRows = [...routeResults, ...scenarioResults];
  const failRows = allRows.filter((r) => !r.ok);
  const summary = {
    mode: {
      route: !args.scenarioOnly,
      scenario: !args.routeOnly
    },
    fixture: deps?.__smoke?.fixture || {},
    player: {
      id: smokeCtx.userId,
      name: smokeCtx.userName,
      petId: smokeCtx.petId
    },
    routeTotal: routeResults.length,
    routeFailed: routeResults.filter((r) => !r.ok).length,
    scenarioTotal: scenarioResults.length,
    scenarioFailed: scenarioResults.filter((r) => !r.ok).length,
    total: allRows.length,
    failed: failRows.length
  };

  const outDir = path.resolve(__dirname, '../tests/results');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const outFile = path.join(outDir, `player_replay_smoke_${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ summary, failed: failRows, routeResults, scenarioResults }, null, 2), 'utf8');

  if (failRows.length > 0) {
    console.log(`FAIL player-replay-smoke: ${summary.failed}/${summary.total}`);
    console.log(`Report: ${outFile}`);
    for (const row of failRows.slice(0, 40)) {
      console.log(` - [${row.type || 'step'}] ${row.id} => ${row.error || 'dispatcher error'}`);
    }
    console.error = originalError;
    process.exit(1);
  }

  console.log(`OK player-replay-smoke (${summary.total}/${summary.total})`);
  console.log(`Report: ${outFile}`);
  console.log(`Fixture player: ${deps?.__smoke?.fixture?.playerPath || 'default-inline'}`);
  console.error = originalError;
}

main().catch((err) => {
  console.error('FAIL player-replay-smoke (fatal):', err?.stack || err);
  process.exit(1);
});
