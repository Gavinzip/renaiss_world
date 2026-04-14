const fs = require('fs');
const path = require('path');
const { registerInteractionDispatcher } = require('../../modules/systems/routing/interaction-dispatcher-utils');

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

function createNoopDeps() {
  const player = {
    id: 'u1',
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
    }
  };
  const pet = {
    id: 'pet1',
    ownerId: 'u1',
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
  }
  class DummySelectMenu {
    setCustomId() { return this; }
    setPlaceholder() { return this; }
    setMinValues() { return this; }
    setMaxValues() { return this; }
    addOptions() { return this; }
  }

  const core = {
    loadPlayer: () => player,
    savePlayer: () => {},
    rememberPlayer: () => {},
    appendStoryContinuation: () => {},
    appendNpcMemory: () => {},
    loadPlayerThreads: () => ({}),
    getNearbyNpcIds: () => [],
    negotiationPrompt: () => '',
    getPlayerMemoryContextAsync: async () => '',
    getNearbyNpcMemoryContextAsync: async () => ''
  };
  const petSystem = {
    loadPet: () => pet,
    savePet: () => {},
    getPetById: () => pet
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
    restoreButtonTemplateSnapshot: async () => {},
    tryRecoverEventButtonsAfterFailure: async () => false,
    tryRecoverMainMenuAfterFailure: async () => false,
    parseMarketTypeFromCustomId: () => 'renaiss',
    parseMarketAndPageFromCustomId: () => ({ marketType: 'renaiss', page: 0 }),
    getPlayerTempData: () => null,
    setPlayerTempData: () => {},
    buildElementSelectionPayload: () => ({ embed: {}, row: {} }),
    normalizeCharacterName: (v) => String(v || '').trim() || 'SmokeUser',
    normalizeCharacterGender: (v) => v || 'male',
    normalizePetElementCode: () => 'grass',
    normalizePetName: (v) => String(v || '').trim() || 'SmokePet',
    parseNameSubmitProfileFromCustomId: () => ({ gender: 'male', element: 'grass', alignment: 'positive' }),
    getPlayerUILang: () => 'zh-TW',
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
      deviceDoneTitle: 'device done',
      deviceDoneDesc: () => 'device done',
      mapModeSwitchAscii: 'ascii',
      mapModeSwitchText: 'text',
      deviceNotOwned: 'device none',
      deviceInvalidDestination: 'device invalid',
      deviceAlreadyHere: () => 'already here',
      deviceTeleportStory: () => 'device teleported'
    }),
    getPortalAccessContext: () => ({
      atPortalHub: true,
      crossRegionUnlocked: true,
      destinations: ['敦煌', '廣州']
    }),
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
    normalizeEventChoices: (_player, choices) => choices,
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
    recordCashflow: () => {},
    applyChoicePolicy: (_p, c) => c,
    startTypingIndicator: () => {},
    stopTypingIndicator: () => {}
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

function sampleFromPrefix(prefix) {
  const preset = {
    'alloc_hp_': 'alloc_hp_pet1_1',
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
    'moves_open_pet_': 'moves_open_pet_pet1',
    'moves_page_next_': 'moves_page_next_pet1_0',
    'moves_page_prev_': 'moves_page_prev_pet1_0',
    'moves_show_equipment_': 'moves_show_equipment_pet1',
    'name_modal_': 'name_modal_1',
    'name_submit_': 'name_submit_legacy',
    'pet_eq_equip_': 'pet_eq_equip_pet1',
    'pet_eq_unequip_': 'pet_eq_unequip_pet1',
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
    'set_main_pet_': 'set_main_pet_pet1',
    'shop_buy_': 'shop_buy_renaiss_0',
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
    'wish_pool_submit_': 'wish_pool_submit_0'
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
    'custom_action_submit_'
  ];
  if (modalPrefixes.some((p) => id.startsWith(p))) return 'modal';
  if (id === 'battle_switch_select') return 'select';
  return 'button';
}

function manualSelectCases() {
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
    { id: 'pet_eq_equip_pet1', type: 'select' },
    { id: 'pet_eq_unequip_pet1', type: 'select' }
  ];
}

function buildTestCases() {
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
    const id = sampleFromPrefix(p);
    const entry = { id, type: detectInteractionType(id), source: `prefix:${p}` };
    const key = `${entry.type}::${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(entry);
  }
  for (const m of manualSelectCases()) {
    const key = `${m.type}::${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push({ ...m, source: 'manual' });
  }
  return all;
}

function selectValuesFor(customId) {
  const id = String(customId || '');
  if (id === 'battle_switch_select') return ['pet1'];
  if (id.startsWith('map_region_move_')) return ['襄陽城'];
  if (id === 'moves_pet_select') return ['pet1'];
  if (id === 'moves_learn_chip') return ['pet1::spore_haze'];
  if (id === 'moves_unlearn_chip') return ['pet1::spore_haze'];
  if (id === 'moves_assign') return ['pet1::head_butt'];
  if (id.startsWith('pmkt_buy_select_')) return ['pmktbuy_1'];
  if (id.startsWith('shop_buy_select_')) return ['shopbuy_1'];
  if (id.startsWith('shop_sell_select_')) return ['sellidx_0'];
  if (id.startsWith('shop_haggle_select_')) return ['haggleidx_0'];
  if (id.startsWith('shop_haggle_bulk_select_')) return ['bulkidx_0'];
  if (id.startsWith('pet_eq_equip_')) return ['helmet::0'];
  if (id.startsWith('pet_eq_unequip_')) return ['helmet'];
  return ['1'];
}

function createInteraction(customId, type = 'button') {
  const state = { deferred: false, replied: false };
  return {
    customId,
    user: { id: 'u1', username: 'SmokeUser' },
    channelId: 'c1',
    message: {
      id: 'm1',
      components: [],
      async delete() {},
      async edit() {}
    },
    values: type === 'select' ? selectValuesFor(customId) : ['1'],
    fields: { getTextInputValue: () => 'smoke-input' },
    channel: {
      id: 'c1',
      isThread: () => true,
      parent: { id: 'p1', isThread: () => false },
      async send() { return { id: 'msg-smoke', components: [] }; }
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
    async reply() { state.replied = true; },
    async followUp() {},
    async update() { state.replied = true; },
    async showModal() {},
    async editReply() {}
  };
}

async function main() {
  const originalError = console.error;
  const dispatchFailures = [];
  console.error = (...args) => {
    const line = args.map((v) => String(v)).join(' ');
    if (line.includes('[Interaction] handler failed')) dispatchFailures.push(line);
    originalError(...args);
  };

  const client = createFakeClient();
  const deps = createNoopDeps();
  registerInteractionDispatcher(client, deps);
  const handler = client.getHandler('interactionCreate');
  if (typeof handler !== 'function') {
    throw new Error('dispatcher handler not registered');
  }

  const cases = buildTestCases();
  const failures = [];
  const results = [];

  for (const c of cases) {
    const interaction = createInteraction(c.id, c.type);
    try {
      await handler(interaction);
      results.push({ ...c, ok: true });
    } catch (err) {
      failures.push({
        id: c.id,
        type: c.type,
        source: c.source,
        error: String(err?.message || err)
      });
      results.push({ ...c, ok: false, error: String(err?.message || err) });
    }
  }

  if (dispatchFailures.length > 0) {
    for (const line of dispatchFailures) {
      const idMatch = line.match(/cid=([^ ]+)/);
      const id = String(idMatch?.[1] || '').trim();
      if (!id) continue;
      const row = results.find((r) => r.id === id);
      if (row) {
        row.ok = false;
        row.error = line;
      }
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failRows = results.filter((r) => !r.ok);
  const summary = {
    total: results.length,
    ok: okCount,
    failed: failRows.length
  };

  const outDir = path.resolve(__dirname, '../tests/results');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const outFile = path.join(outDir, `interaction_route_sim_${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ summary, failed: failRows, results }, null, 2), 'utf8');

  if (failRows.length > 0) {
    console.log(`FAIL interaction-route-sim: ${summary.failed}/${summary.total}`);
    console.log(`Report: ${outFile}`);
    for (const row of failRows.slice(0, 30)) {
      console.log(` - [${row.type}] ${row.id} (${row.source}) => ${row.error || 'dispatcher error'}`);
    }
    console.error = originalError;
    process.exit(1);
  }

  console.log(`OK interaction-route-sim (${summary.ok}/${summary.total})`);
  console.log(`Report: ${outFile}`);
  console.error = originalError;
}

main().catch((err) => {
  console.error('FAIL interaction-route-sim (fatal):', err?.stack || err);
  process.exit(1);
});
