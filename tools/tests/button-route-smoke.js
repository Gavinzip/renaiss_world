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
    stats: { 財富: 100, 運氣: 1, 能量: 30, 生命: 100 },
    maxStats: { 能量: 100, 生命: 100 },
    currentStory: '測試故事',
    eventChoices: [{ name: '測試', choice: '測試', action: 'test' }],
    generationState: { status: 'done' },
    mapViewMode: 'text'
  };
  const pet = {
    id: 'pet1',
    ownerId: 'u1',
    name: 'SmokePet',
    hatched: true,
    waitingForName: false,
    type: '草屬性',
    hp: 100,
    maxHp: 100,
    moves: [{ name: '頭槌', damage: 10, energyCost: 1, speed: 10 }]
  };

  class DummyEmbed {
    setTitle() { return this; }
    setColor() { return this; }
    setDescription() { return this; }
    addFields() { return this; }
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
    buyFromSellListing: () => ({ success: false, reason: 'smoke-skip' }),
    cancelMyListing: () => ({ success: false, reason: 'smoke-skip' }),
    consumeFinanceNotices: () => [],
    playScratchLottery: () => ({ ok: true, won: false })
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
    ActionRowBuilder: DummyRow,
    ButtonBuilder: DummyButton,
    ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
    rejectIfNotThreadOwner: async () => false,
    rejectIfNotLatestThread: async () => false,
    saveMapReturnSnapshot: () => {},
    createButtonInteractionTemplateContext: () => ({}),
    attachButtonTemplateReplyAutoRestore: () => {},
    restoreButtonTemplateSnapshot: async () => {},
    tryRecoverEventButtonsAfterFailure: async () => false,
    tryRecoverMainMenuAfterFailure: async () => false,
    parseMarketTypeFromCustomId: () => 'renaiss',
    parseMarketAndPageFromCustomId: () => ({ marketType: 'renaiss', page: 0 }),
    getPlayerTempData: () => null,
    setPlayerTempData: () => {},
    buildElementSelectionPayload: () => ({ embed: {}, row: {} }),
    normalizeCharacterName: (v) => String(v || '').trim() || 'SmokeUser',
    normalizeCharacterGender: (v) => v || '男',
    normalizePetElementCode: () => '草',
    normalizePetName: (v) => String(v || '').trim() || 'SmokePet',
    parseNameSubmitProfileFromCustomId: () => ({ gender: '男', element: '草', alignment: '正派' }),
    getPlayerUILang: () => 'zh-TW',
    getMapText: () => ({
      mapNotFoundPlayer: 'player not found',
      portalNotReady: 'not ready',
      portalStoryLocked: 'story locked',
      portalInvalidDestination: 'invalid',
      portalDoneTitle: 'done',
      portalDoneDesc: () => 'done',
      portalBackStory: 'back',
      mapModeSwitchAscii: 'ascii',
      mapModeSwitchText: 'text'
    }),
    getPortalAccessContext: () => ({
      atPortalHub: false,
      crossRegionUnlocked: false,
      destinations: []
    }),
    getMarketTypeLabel: (t) => (t === 'digital' ? '神秘鑑價站' : 'Renaiss鑑價站'),
    extractStoryTailLine: () => '',
    composeActionBridgeStory: (_player, _choice, bridge) => bridge || 'bridge',
    composePostBattleStory: () => 'post battle',
    portalTeleportStory: () => 'teleported',
    resolvePlayerMainPet: () => ({ pet, changed: false }),
    estimateBattleOutcome: () => ({ winRate: 50 }),
    formatBattleElementDisplay: () => '未知屬性',
    resolveEnemyBattleElement: () => '未知屬性',
    getBattleElementRelation: () => null,
    getQuickShopCooldownInfo: () => ({ ready: true, remaining: 0 }),
    buildQuickShopNarrativeNotice: () => 'notice',
    buyShopCrystal: () => ({ success: false, reason: 'smoke-skip' }),
    openShopSession: () => {},
    consumeMapReturnSnapshot: () => null,
    snapshotHasUsableComponents: () => false,
    trackActiveGameMessage: () => {},
    acceptFriendRequest: () => ({ ok: true }),
    cancelOutgoingFriendRequest: () => ({ ok: true }),
    consumeTeleportDevice: () => true,
    getTeleportDeviceStockInfo: () => ({ count: 1, expiresAt: Date.now() + 3600_000 }),
    ensurePlayerIslandState: () => {},
    syncLocationArcLocation: () => {},
    queuePendingStoryTrigger: () => {},
    rememberPlayer: () => {},
    publishBattleWorldEvent: () => {},
    applyChoicePolicy: (_p, c) => c
  };

  const noop = () => undefined;
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return noop;
    }
  });
}

function createInteraction(customId, type = 'button') {
  const state = { deferred: false, replied: false };
  const base = {
    customId,
    user: { id: 'u1', username: 'SmokeUser' },
    channelId: 'c1',
    message: {
      id: 'm1',
      components: [],
      async delete() {},
      async edit() {}
    },
    values: ['1'],
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
    async reply() { state.replied = true; },
    async followUp() {},
    async update() { state.replied = true; },
    async showModal() {},
    async editReply() {}
  };
  return base;
}

function buildTestCases() {
  const eqButtons = [
    'open_map','main_menu','retry_story_generation','open_settings','open_settings_system','open_renaiss_world',
    'world_back_settings','settings_back','open_character','open_friends','friend_refresh','open_friend_add_modal',
    'map_open_portal','map_open_device','map_back_main','battle_mode_manual','battle_mode_manual_back',
    'battle_mode_manual_offline','battle_mode_manual_online','battle_mode_ai','battle_continue_human','fight_retry',
    'battle_toggle_layout','battle_wait','battle_switch_pet','battle_switch_cancel','show_moves','show_inventory',
    'show_codex','show_codex_npc','show_codex_skill','show_finance_ledger','show_memory_audit','show_memory_recap',
    'quick_shop_entry','pmkt_open_renaiss','pmkt_open_digital','shop_leave','open_profile','open_gacha',
    'gacha_single','gacha_ten','continue_with_wallet','enter_pet_name','skip_name','hatch_egg',
    'choose_gender_male','choose_gender_female','choose_positive','choose_negative','restart_onboarding',
    'battle_switch_select','pet_onboard_name_submit','lang_zh','lang_en','lang_zh-CN','lang_zh-TW'
  ];
  const startsButton = [
    'choose_element_草','draw_move_1','select_lang_zh-TW','friend_accept_u2','friend_cancel_u2','friend_view_u2',
    'friend_duel_u2','map_view_text_0','map_page_1','portal_jump_0','device_jump_0','map_goto_襄陽城',
    'event_0','fight_0','use_move_0','fdonline_submit_1','flee_0','moves_page_prev_0','moves_page_next_1',
    'set_main_pet_pet1','inv_page_prev_0','inv_page_next_1','quick_shop_renaiss','pmkt_view_sell_0',
    'pmkt_my_0','pmkt_post_sell_renaiss','pmkt_post_buy_renaiss','pmkt_buy_1','pmkt_fill_1','pmkt_cancel_1',
    'shop_open_renaiss','shop_post_sell_renaiss','shop_npc_haggle_renaiss','shop_haggle_all_renaiss',
    'shop_haggle_cancel_renaiss','shop_haggle_confirm_renaiss','shop_buy_item_1','shop_scratch_renaiss',
    'shop_buy_point_renaiss','shop_buy_device_renaiss','shop_buy_heal_crystal_renaiss','shop_buy_energy_crystal_renaiss',
    'shop_buy_1','alloc_hp_10','name_modal_1'
  ];
  const modalIds = [
    'pmkt_modal_sell_renaiss',
    'pmkt_modal_buy_renaiss',
    'shop_sell_modal_renaiss',
    'char_name_submit_male',
    'name_submit_legacy',
    'wish_pool_submit_0',
    'custom_action_submit_0'
  ];
  const selectIds = [
    'battle_switch_select',
    'map_region_move_0',
    'moves_select_equip',
    'market_select_buy'
  ];
  return [
    ...eqButtons.map((id) => ({ id, type: id === 'battle_switch_select' ? 'select' : 'button' })),
    ...startsButton.map((id) => ({ id, type: 'button' })),
    ...modalIds.map((id) => ({ id, type: 'modal' })),
    ...selectIds.map((id) => ({ id, type: 'select' }))
  ];
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

  for (const c of cases) {
    const interaction = createInteraction(c.id, c.type);
    try {
      await handler(interaction);
    } catch (err) {
      failures.push({
        id: c.id,
        type: c.type,
        error: String(err?.message || err)
      });
    }
  }

  if (dispatchFailures.length > 0) {
    console.error(`FAIL button-route-smoke: dispatcher logged ${dispatchFailures.length} handler failures`);
    for (const line of dispatchFailures.slice(0, 30)) {
      console.error(` - ${line}`);
    }
    console.error = originalError;
    process.exit(1);
  }

  if (failures.length > 0) {
    console.error(`FAIL button-route-smoke: ${failures.length}/${cases.length}`);
    for (const f of failures.slice(0, 30)) {
      console.error(` - [${f.type}] ${f.id}: ${f.error}`);
    }
    console.error = originalError;
    process.exit(1);
  }

  console.log(`OK button-route-smoke (${cases.length} cases)`);
  console.error = originalError;
}

main().catch((err) => {
  console.error('FAIL button-route-smoke (fatal):', err?.stack || err);
  process.exit(1);
});
