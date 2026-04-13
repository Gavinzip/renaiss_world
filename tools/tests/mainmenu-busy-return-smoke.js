const { createMainMenuFlowUtils } = require('../../modules/systems/ui/main-menu-flow-utils');

class DummyEmbed {
  constructor() {
    this.data = { title: '', color: 0, description: '' };
  }
  setTitle(v) { this.data.title = v; return this; }
  setColor(v) { this.data.color = v; return this; }
  setDescription(v) { this.data.description = v; return this; }
  addFields() { return this; }
}
class DummyRow {
  constructor() { this.components = []; }
  addComponents(...c) { this.components.push(...c.flat()); return this; }
}
class DummyButton {
  setCustomId() { return this; }
  setLabel() { return this; }
  setStyle() { return this; }
  setDisabled() { return this; }
}

async function run() {
  const sent = [];
  const thread = {
    id: 't1',
    async send(payload) { sent.push(payload); return { id: `s${sent.length}`, ...payload }; }
  };
  const player = {
    id: 'p1',
    name: 'tester',
    language: 'zh-TW',
    alignment: '正派',
    location: '襄陽城',
    level: 1,
    stats: { 財富: 10, 運氣: 5 },
    generationState: { status: 'pending', phase: 'generating_story' },
    currentStory: '',
    eventChoices: [],
    portalMenuOpen: false
  };
  const pet = { name: 'pika', type: '草屬性', hp: 100, maxHp: 100 };
  let busyCalled = 0;
  let tracked = null;
  const interaction = {
    deferred: true,
    replied: false,
    message: { id: 'm1' },
    async editReply(payload) { this.payload = payload; return payload; }
  };

  const utils = createMainMenuFlowUtils({
    CORE: { savePlayer() {}, getPlayerMemoryContextAsync: async () => '', getNearbyNpcMemoryContextAsync: async () => '' },
    PET: { loadPet: () => pet },
    ECON: { consumeFinanceNotices: () => [] },
    STORY: { generateChoicesWithAI: async () => [] },
    EmbedBuilder: DummyEmbed,
    ActionRowBuilder: DummyRow,
    ButtonBuilder: DummyButton,
    ButtonStyle: { Secondary: 2, Success: 3 },
    CHOICE_DISPLAY_COUNT: 5,
    resolvePlayerMainPet: () => ({ pet, changed: false }),
    ensurePlayerGenerationSchema: () => false,
    recordNearbyNpcEncounters: () => false,
    syncLocationArcLocation: () => {},
    restoreStoryFromGenerationState: () => false,
    restoreChoicesFromGenerationState: () => false,
    consumeWorldIntroOnce: () => '',
    consumeFinanceNotices: () => [],
    getPendingStoryTrigger: () => null,
    detectStitchedBattleStory: () => false,
    extractBattleChoiceHintFromStory: () => '',
    queuePendingStoryTrigger: () => {},
    applyChoicePolicy: (_p, c) => c,
    normalizeEventChoices: (_p, c) => c,
    updateGenerationState: () => {},
    finishGenerationState: () => {},
    getAdventureText: () => ({ statusLabel: '狀態', sectionChoices: '選項', sectionNewChoices: '新選項', chooseNumber: () => '請選擇' }),
    buildMainStatusBar: () => 'OK',
    buildChoiceOptionsText: () => '',
    buildMainlineProgressLine: () => '',
    getAlignmentColor: () => 0x00ff00,
    getPetElementDisplayName: () => '草屬性',
    getFactionPresenceHintForPlayer: () => 'none',
    buildPortalUsageGuide: () => '',
    formatPetHpWithRecovery: () => '100/100',
    buildEventChoiceButtons: () => [],
    appendMainMenuUtilityButtons: (btns) => { btns.push(new DummyButton()); },
    disableMessageComponents: async () => {},
    trackActiveGameMessage: (_player, _threadId, msgId) => { tracked = msgId; },
    tryAcquireStoryLock: () => false,
    notifyStoryBusy: async () => { busyCalled += 1; },
    startGenerationState: () => {},
    startLoadingAnimation: () => () => {},
    startTypingIndicator: () => () => {},
    getPlayerMemoryContextAsync: async () => '',
    getNearbyNpcMemoryContextAsync: async () => '',
    editOrSendFallback: async (_thread, _msg, payload) => ({ id: 'x', ...payload }),
    buildRetryGenerationComponents: () => [],
    getMainlineBridgeLock: () => null,
    consumeMainlineBridgeLock: () => {},
    clearPendingStoryTrigger: () => {},
    rememberStoryDialogues: () => ({ quotes: 0, mainline: 0 }),
    generateChoicesWithAI: async () => [],
    maybeInjectRareCustomInputChoice: (c) => c,
    triggerMainlineForeshadowAIInBackground: () => {},
    releaseStoryLock: () => {}
  });

  await utils.sendMainMenuToThread(thread, player, pet, interaction);

  if (busyCalled !== 0) throw new Error('should not call notifyStoryBusy during pending generation');
  if (!interaction.payload?.embeds?.length) throw new Error('should render pending loading embed');
  const desc = String(interaction.payload.embeds[0]?.data?.description || '');
  if (!desc.includes('正在')) throw new Error('pending loading embed should indicate generation status');
  if (!Array.isArray(interaction.payload.components) || interaction.payload.components.length <= 0) {
    throw new Error('pending loading embed should keep utility buttons');
  }
  if (tracked !== 'm1') throw new Error('active message should track interaction message id');
  if (sent.length !== 0) throw new Error('should not send new thread message when editReply works');
  console.log('OK mainmenu-busy-return-smoke');
}

run().catch((e) => {
  console.error('FAIL mainmenu-busy-return-smoke:', e?.stack || e);
  process.exit(1);
});
