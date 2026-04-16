const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const https = require('https');

const { loadEnvFromCandidates } = require('../../modules/core/load-env');

loadEnvFromCandidates([
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '..', '.env')
], { overrideExisting: false });

const TEMP_WORLD_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'renaiss-load-'));
process.env.APP_ENV = 'test';
process.env.WORLD_DATA_ROOT = TEMP_WORLD_ROOT;
process.env.MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || 'loadtest-mock-key';
process.env.AI_GLOBAL_CONCURRENCY = process.env.AI_GLOBAL_CONCURRENCY || '20';
process.env.AI_RATE_LIMIT_RETRIES = process.env.AI_RATE_LIMIT_RETRIES || '5';
process.env.AI_RATE_LIMIT_RETRY_DELAY_MS = process.env.AI_RATE_LIMIT_RETRY_DELAY_MS || '1000';
process.env.SQLITE_BUSY_TIMEOUT_MS = process.env.SQLITE_BUSY_TIMEOUT_MS || '5000';

const loadEnvModule = require('../../modules/core/load-env');
loadEnvModule.loadProjectEnv = () => ({ applied: 0, filePath: '', loaded: false });

const USER_COUNT = Math.max(10, Number(process.env.LOAD_TEST_USERS || 50));

const originalHttpsRequest = https.request;
const mockAttemptByBody = new Map();
const mockStats = {
  totalCalls: 0,
  total429: 0,
  storyResponses: 0,
  choiceResponses: 0,
  foreshadowResponses: 0
};

function hashString(input = '') {
  let hash = 0;
  const text = String(input || '');
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(list = [], ratio = 0.95) {
  if (!Array.isArray(list) || list.length <= 0) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return Math.round(sorted[index]);
}

function average(list = []) {
  if (!Array.isArray(list) || list.length <= 0) return 0;
  const total = list.reduce((sum, value) => sum + Number(value || 0), 0);
  return Math.round(total / list.length);
}

function summarizeLatencies(list = []) {
  return {
    count: list.length,
    avgMs: average(list),
    p95Ms: percentile(list, 0.95),
    maxMs: list.length > 0 ? Math.max(...list) : 0
  };
}

function parsePrompt(body = '') {
  try {
    const parsed = JSON.parse(String(body || '{}'));
    return String(parsed?.messages?.[0]?.content || '');
  } catch {
    return '';
  }
}

function extractPromptField(prompt = '', label = '') {
  const matched = String(prompt || '').match(new RegExp(`${label}：([^\\n]+)`));
  return String(matched?.[1] || '').trim();
}

function detectMockPromptType(prompt = '') {
  const text = String(prompt || '');
  if (/importance/i.test(text) && /JSON array/i.test(text)) return 'foreshadow';
  if (/styleTag/i.test(text) || /只輸出 JSON 陣列/i.test(text) || /回傳 JSON 陣列/i.test(text)) return 'choices';
  return 'story';
}

function buildMockStory(prompt = '') {
  const location = extractPromptField(prompt, '位置').split('-')[0].trim() || '襄陽城';
  const playerName = extractPromptField(prompt, '玩家') || '壓測玩家';
  const petName = extractPromptField(prompt, '寵物') || '測試寵物';
  return [
    `${playerName}貼著 ${location} 的石牆放慢腳步，先把沿街攤位留下的封存艙編號逐一記在袖口內側，免得剛聽見的線索再次散掉。`,
    `${petName}在腳邊低聲示警，我順勢繞到檢測燈投下的陰影裡，把剛拿到的口供和牆上的轉運時間表做比對，發現兩筆紀錄的時間差被人刻意改動過。`,
    `這代表有人正在用更乾淨的路線轉走貨樣；眼下最穩的做法不是硬衝，而是先把來源、批次與交接者三條線索鎖在同一個節點，再決定下一步。`
  ].join('\n\n');
}

function buildMockChoiceSet() {
  return [
    {
      name: '追查灰帳',
      choice: '沿灰帳線索比對昨夜封存艙檢測紀錄',
      desc: '把口供與檢測編號交叉比對',
      tag: '[🔍需探索]',
      move_to: '',
      action: 'explore',
      styleTag: '穩健',
      hiddenMeta: { law: 1, harm: 0, trust: 1, selfInterest: 0, targetFaction: 'civic', witnessRisk: 0 },
      dynamicEvent: { archetype: '', phase: 'offered', intensity: 1, chainHint: '' }
    },
    {
      name: '口供交換',
      choice: '向巡夜更夫套取第二份口供核對封存艙來源',
      desc: '用舊編號換取新線索',
      tag: '[🤝需社交]',
      move_to: '',
      action: 'social',
      styleTag: '交涉',
      hiddenMeta: { law: 0, harm: 0, trust: 1, selfInterest: 0, targetFaction: 'civic', witnessRisk: 0 },
      dynamicEvent: { archetype: '', phase: 'offered', intensity: 1, chainHint: '' }
    },
    {
      name: '黑市驗貨',
      choice: '帶著可疑樣本去黑市請人檢測比對批次',
      desc: '查清貨樣是否已被調包',
      tag: '[💰需花錢]',
      move_to: '',
      action: 'trade',
      styleTag: '灰線',
      hiddenMeta: { law: -1, harm: 0, trust: -1, selfInterest: 1, targetFaction: 'gray', witnessRisk: 0 },
      dynamicEvent: { archetype: '', phase: 'offered', intensity: 1, chainHint: '' }
    },
    {
      name: '尾隨信差',
      choice: '尾隨搬運信差到側巷確認線索交接點',
      desc: '觀察交接者與時間差',
      tag: '[🔥高風險]',
      move_to: '',
      action: 'explore',
      styleTag: '追獵',
      hiddenMeta: { law: -1, harm: 0, trust: 0, selfInterest: 1, targetFaction: 'gray', witnessRisk: 1 },
      dynamicEvent: { archetype: '', phase: 'offered', intensity: 2, chainHint: '暗巷交接' }
    },
    {
      name: '攔截搬運',
      choice: '在碼頭攔截搬運人員逼問封存艙線索（會進入戰鬥）',
      desc: '直接撕開護貨層看誰在支援',
      tag: '[⚔️會戰鬥]',
      move_to: '',
      action: 'fight',
      styleTag: '強奪',
      hiddenMeta: { law: -2, harm: 2, trust: -2, selfInterest: 1, targetFaction: 'digital', witnessRisk: 1 },
      dynamicEvent: { archetype: '', phase: 'offered', intensity: 3, chainHint: '碼頭衝突' }
    }
  ];
}

function buildMockForeshadow(prompt = '') {
  const location = extractPromptField(prompt, '場景地點') || '襄陽城';
  return [
    {
      text: `${location} 的灰帳紀錄被人改過，真正的封存艙批次仍在等下一次轉運窗口。`,
      importance: 0.92
    }
  ];
}

function buildMockPayload(promptType = 'story', prompt = '') {
  if (promptType === 'choices') {
    mockStats.choiceResponses += 1;
    return JSON.stringify(buildMockChoiceSet());
  }
  if (promptType === 'foreshadow') {
    mockStats.foreshadowResponses += 1;
    return JSON.stringify(buildMockForeshadow(prompt));
  }
  mockStats.storyResponses += 1;
  return buildMockStory(prompt);
}

function installMockAi() {
  https.request = function patchedHttpsRequest(options, callback) {
    let requestBody = '';
    let timeoutMs = 0;
    let finished = false;
    let timeoutTimer = null;
    const req = new EventEmitter();

    req.write = (chunk) => {
      requestBody += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
    };

    req.setTimeout = (ms, handler) => {
      timeoutMs = Math.max(0, Number(ms || 0));
      if (typeof handler === 'function') {
        req.__timeoutHandler = handler;
      }
    };

    req.destroy = (error) => {
      if (finished) return;
      finished = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      process.nextTick(() => req.emit('error', error || new Error('request destroyed')));
    };

    req.end = () => {
      const prompt = parsePrompt(requestBody);
      const promptType = detectMockPromptType(prompt);
      const nextAttempt = (mockAttemptByBody.get(requestBody) || 0) + 1;
      mockAttemptByBody.set(requestBody, nextAttempt);
      mockStats.totalCalls += 1;

      const hash = hashString(requestBody);
      const rateLimitBudget = hash % 9 === 0 ? 2 : (hash % 4 === 0 ? 1 : 0);
      const shouldRateLimit = nextAttempt <= rateLimitBudget;
      const delayMs = shouldRateLimit ? 30 + (hash % 30) : 90 + (hash % 60);

      if (timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          if (finished) return;
          finished = true;
          if (typeof req.__timeoutHandler === 'function') req.__timeoutHandler();
        }, timeoutMs);
      }

      setTimeout(() => {
        if (finished) return;
        finished = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);

        const res = new EventEmitter();
        if (shouldRateLimit) {
          mockStats.total429 += 1;
          res.statusCode = 429;
          callback(res);
          process.nextTick(() => {
            res.emit('data', JSON.stringify({ error: { message: 'rate limit exceeded' } }));
            res.emit('end');
          });
          return;
        }

        res.statusCode = 200;
        callback(res);
        process.nextTick(() => {
          res.emit('data', JSON.stringify({
            choices: [{
              message: { content: buildMockPayload(promptType, prompt) },
              finish_reason: 'stop'
            }],
            base_resp: { status_code: 0, status_msg: 'success' }
          }));
          res.emit('end');
        });
      }, delayMs);
    };

    return req;
  };
}

function restoreMockAi() {
  https.request = originalHttpsRequest;
}

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

function createRouteDeps() {
  const player = {
    id: 'route-user',
    name: 'RouteUser',
    language: 'zh-TW',
    location: '襄陽城',
    alignment: '正派',
    level: 1,
    stats: { 財富: 100, 運氣: 1, 能量: 40, 生命: 100 },
    maxStats: { 能量: 100, 生命: 100 },
    currentStory: 'route smoke',
    mapViewMode: 'text'
  };
  const pet = {
    id: 'route-pet',
    ownerId: 'route-user',
    name: 'RoutePet',
    hatched: true,
    waitingForName: false,
    type: '草',
    hp: 100,
    maxHp: 100
  };

  const delay = async (base = 8) => {
    await sleep(base + Math.floor(Math.random() * 8));
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

  return {
    CORE: {
      loadPlayer: () => ({ ...player }),
      savePlayer: () => {},
      rememberPlayer: () => {}
    },
    PET: {
      loadPet: () => ({ ...pet }),
      getPetById: () => ({ ...pet })
    },
    ECON: {
      ensurePlayerEconomy: () => {}
    },
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
    getPlayerTempData: () => null,
    setPlayerTempData: () => {},
    getPlayerUILang: () => 'zh-TW',
    getMapText: () => ({}),
    resolvePlayerMainPet: () => ({ pet, changed: false }),
    queuePendingStoryTrigger: () => {},
    publishBattleWorldEvent: () => {},
    composePostBattleStory: () => 'battle story',
    sendOnboardingLanguageSelection: async () => {},
    showFriendsMenu: async () => { await delay(6); },
    sendMainMenuToThread: async () => { await delay(12); },
    showMainMenu: async () => { await delay(14); },
    showSettingsHub: async () => { await delay(8); },
    showSettings: async () => { await delay(8); },
    showRenaissWorldGuide: async () => { await delay(8); },
    resumeExistingOnboardingOrGame: async () => false,
    showCharacter: async () => { await delay(10); },
    showInventory: async () => { await delay(10); },
    showInventoryFusionLab: async () => { await delay(10); },
    showFriendAddModal: async () => {},
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
    sendOnboardingWalletPrompt: async () => {},
    handleOnboardingWalletTextSubmit: async () => {},
    handleOnboardingWalletSkip: async () => {},
    handleOnboardingWalletContinue: async () => {},
    handleHatchEgg: async () => {},
    handleDrawMove: async () => {},
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
    showCodex: async () => {},
    showNpcCodex: async () => {},
    showSkillCodex: async () => {},
    showFinanceLedger: async () => {},
    showMemoryAudit: async () => {},
    showMemoryRecap: async () => {},
    showQuickShopEntry: async () => {},
    openNpcMarketByType: async () => {},
    showPlayerMarketBoard: async () => {},
    showWorldShop: async () => {},
    showGacha: async () => {},
    handleGachaSingle: async () => {},
    handleGachaTen: async () => {},
    showCharacterNameModal: async () => {},
    acceptFriendRequest: () => ({ ok: true }),
    cancelOutgoingFriendRequest: () => ({ ok: true }),
    getPlayerDisplayNameById: () => 'OtherUser',
    abortFriendDuel: () => {},
    disableMessageComponents: async () => {},
    recordInteractionCoverage: () => {}
  };
}

function createInteraction(customId, userId) {
  const state = { deferred: false, replied: false };
  return {
    customId,
    user: { id: userId, username: `User-${userId}` },
    channelId: 'route-c1',
    message: {
      id: 'route-m1',
      components: [],
      async delete() {},
      async edit() {}
    },
    values: ['1'],
    fields: { getTextInputValue: () => 'input' },
    channel: {
      id: 'route-c1',
      isThread: () => false,
      parent: { id: 'route-p1', isThread: () => false },
      async send() { return { id: 'route-msg', components: [] }; }
    },
    guild: { id: 'route-g1' },
    get deferred() { return state.deferred; },
    get replied() { return state.replied; },
    isButton: () => true,
    isModalSubmit: () => false,
    isStringSelectMenu: () => false,
    isChatInputCommand: () => false,
    async deferUpdate() { state.deferred = true; },
    async reply() { state.replied = true; },
    async followUp() {},
    async update() { state.replied = true; },
    async showModal() {},
    async editReply() {}
  };
}

async function createTestPlayers(CORE, PET) {
  const rows = [];
  const factions = ['正派', '機變派'];
  for (let i = 0; i < USER_COUNT; i++) {
    const userId = `load_user_${Date.now()}_${i}`;
    const player = CORE.createPlayer(userId, `壓測玩家${i + 1}`, '男', '無門無派');
    player.alignment = factions[i % factions.length];
    player.location = '襄陽城';
    player.language = 'zh-TW';
    CORE.savePlayer(player);

    const egg = PET.createPetEgg(userId, player.alignment);
    const pet = PET.hatchEgg(egg);
    pet.name = `壓測寵物${i + 1}`;
    PET.savePet(pet);
    rows.push({ userId, playerName: player.name });
  }

  if (typeof CORE.flushPlayerStorage === 'function') await CORE.flushPlayerStorage();
  if (typeof PET.flushPetStore === 'function') await PET.flushPetStore();
  return rows;
}

async function cleanupTestPlayers(rows, CORE, PET) {
  for (const row of rows) {
    if (typeof CORE.deletePlayerStorage === 'function') {
      CORE.deletePlayerStorage(row.userId);
    }
    if (typeof PET.deletePetByOwner === 'function') {
      PET.deletePetByOwner(row.userId);
    }
  }
  if (typeof CORE.flushPlayerStorage === 'function') await CORE.flushPlayerStorage();
  if (typeof PET.flushPetStore === 'function') await PET.flushPetStore();
}

async function runAiEventPressure(CORE, PET, EVENTS, STORY, users) {
  const storyLatencies = [];
  const choiceLatencies = [];
  let failures = 0;
  let timeoutFailures = 0;

  const jobs = users.map(async (row, index) => {
    const player = CORE.loadPlayer(row.userId);
    const pet = PET.loadPet(row.userId);
    if (!player || !pet) throw new Error(`missing player/pet ${row.userId}`);

    const generatedChoices = EVENTS.generateEventChoices(player, {});
    player.eventChoices = Array.isArray(generatedChoices) && generatedChoices.length > 0
      ? generatedChoices
      : [{ name: '追查異常批次', choice: '追查異常批次線索', tag: '[🔍需探索]', action: 'explore' }];
    player.currentStory = `第 ${index + 1} 位玩家正在壓測故事流程`;
    CORE.savePlayer(player);

    const selectedChoice = player.eventChoices[0];
    try {
      EVENTS.executeEvent(selectedChoice, player);
      CORE.savePlayer(player);

      const startedStory = Date.now();
      const story = await STORY.generateStory(selectedChoice, player, pet, selectedChoice.choice || selectedChoice.name);
      storyLatencies.push(Date.now() - startedStory);

      const startedChoices = Date.now();
      const nextChoices = await STORY.generateChoicesWithAI(player, pet, story, '');
      choiceLatencies.push(Date.now() - startedChoices);

      if (!story || String(story).trim().length < 40) {
        throw new Error(`story too short for ${row.userId}`);
      }
      if (!Array.isArray(nextChoices) || nextChoices.length !== 5) {
        throw new Error(`invalid choice count for ${row.userId}`);
      }
    } catch (error) {
      failures += 1;
      if (/timeout/i.test(String(error?.message || ''))) timeoutFailures += 1;
    }
  });

  await Promise.all(jobs);

  return {
    users: users.length,
    failures,
    timeoutFailures,
    story: summarizeLatencies(storyLatencies),
    choices: summarizeLatencies(choiceLatencies),
    failRate: Number((failures / Math.max(1, users.length)).toFixed(4)),
    timeoutRate: Number((timeoutFailures / Math.max(1, users.length)).toFixed(4))
  };
}

async function runRoutePressure(registerInteractionDispatcher) {
  const client = createFakeClient();
  const deps = createRouteDeps();
  registerInteractionDispatcher(client, deps);
  const handler = client.getHandler('interactionCreate');
  if (typeof handler !== 'function') {
    throw new Error('interaction dispatcher not registered');
  }

  const metrics = {
    main_menu: [],
    open_character: [],
    show_inventory: []
  };
  let failures = 0;

  const actions = [];
  for (let i = 0; i < USER_COUNT; i++) {
    const userId = `route_user_${i}`;
    actions.push({ route: 'main_menu', interaction: createInteraction('main_menu', userId) });
    actions.push({ route: 'open_character', interaction: createInteraction('open_character', userId) });
    actions.push({ route: 'show_inventory', interaction: createInteraction('show_inventory', userId) });
  }

  await Promise.all(actions.map(async ({ route, interaction }) => {
    const startedAt = Date.now();
    try {
      await handler(interaction);
      metrics[route].push(Date.now() - startedAt);
    } catch {
      failures += 1;
    }
  }));

  return {
    totalActions: actions.length,
    failures,
    failRate: Number((failures / Math.max(1, actions.length)).toFixed(4)),
    mainMenu: summarizeLatencies(metrics.main_menu),
    inventory: summarizeLatencies(metrics.show_inventory),
    profile: summarizeLatencies(metrics.open_character)
  };
}

async function main() {
  installMockAi();

  const CORE = require('../../modules/core/game-core');
  const PET = require('../../modules/systems/pet/pet-system');
  const EVENTS = require('../../modules/content/event-system');
  const STORY = require('../../modules/content/storyteller');
  const { registerInteractionDispatcher } = require('../../modules/systems/routing/interaction-dispatcher-utils');

  try {
    if (typeof CORE.loadWorld === 'function') {
      try {
        CORE.loadWorld();
      } catch {}
    }

    const users = await createTestPlayers(CORE, PET);
    const aiSummary = await runAiEventPressure(CORE, PET, EVENTS, STORY, users);
    const routeSummary = await runRoutePressure(registerInteractionDispatcher);
    const perf = STORY.getAIPerfStats();

    await cleanupTestPlayers(users, CORE, PET);
    await sleep(50);

    const report = {
      testedAt: new Date().toISOString(),
      users: USER_COUNT,
      tempWorldRoot: TEMP_WORLD_ROOT,
      ai: aiSummary,
      routes: routeSummary,
      aiQueue: perf.runtime,
      aiPerf: {
        config: perf.config,
        story: perf.story,
        choices: perf.choices
      },
      mockAi: mockStats
    };

    console.log(JSON.stringify(report, null, 2));

    const hasFailures = aiSummary.failures > 0 || routeSummary.failures > 0;
    const exceededConcurrency = Number(perf.runtime?.maxActive || 0) > Number(perf.config?.globalConcurrency || 0);
    if (hasFailures || exceededConcurrency) {
      if (exceededConcurrency) {
        console.error('FAIL load-concurrency-smoke: AI active requests exceeded configured global concurrency');
      } else {
        console.error('FAIL load-concurrency-smoke: concurrent flow reported failures');
      }
      process.exit(1);
    }

    console.log(`OK load-concurrency-smoke (${USER_COUNT} users)`);
  } finally {
    restoreMockAi();
    try {
      fs.rmSync(TEMP_WORLD_ROOT, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((error) => {
  restoreMockAi();
  console.error('FAIL load-concurrency-smoke (fatal):', error?.stack || error);
  process.exit(1);
});
