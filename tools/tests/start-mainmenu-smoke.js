const { createMainMenuFlowUtils } = require('../../modules/systems/ui/main-menu-flow-utils');

class DummyEmbed {
  setTitle() { return this; }
  setColor() { return this; }
  setDescription() { return this; }
  addFields() { return this; }
}
class DummyRow {
  constructor(){ this.components=[]; }
  addComponents(...c){ this.components.push(...c.flat()); return this; }
}
class DummyButton {
  setCustomId(){ return this; }
  setLabel(){ return this; }
  setStyle(){ return this; }
  setDisabled(){ return this; }
}

async function run() {
  const sent = [];
  const thread = {
    id: 't1',
    async send(payload){ sent.push(payload); return { id: String(sent.length), ...payload }; }
  };

  const player = {
    id: 'p1',
    name: 'tester',
    language: 'zh-TW',
    alignment: '正派',
    location: '襄陽城',
    level: 1,
    stats: { 財富: 0, 運氣: 1 },
    maxStats: { 能量: 100 },
    generationState: { status: 'done' },
    currentStory: '測試故事',
    eventChoices: [{ name: '測試選項', choice: '測試選項', action: 'test' }],
    portalMenuOpen: false
  };
  const pet = { name: 'pika', type: '草屬性', hp: 100, maxHp: 100 };

  const utils = createMainMenuFlowUtils({
    CORE: { savePlayer(){}, getPlayerMemoryContextAsync: async()=>'', getNearbyNpcMemoryContextAsync: async()=>'' },
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
    buildChoiceOptionsText: () => '\n1. 測試',
    buildMainlineProgressLine: () => '',
    getAlignmentColor: () => 0x00ff00,
    getPetElementDisplayName: () => '草屬性',
    getFactionPresenceHintForPlayer: () => 'none',
    buildPortalUsageGuide: () => '',
    formatPetHpWithRecovery: () => '100/100',
    buildEventChoiceButtons: () => [],
    appendMainMenuUtilityButtons: () => {},
    disableMessageComponents: async () => {},
    trackActiveGameMessage: () => {},
    tryAcquireStoryLock: () => true,
    notifyStoryBusy: async () => {},
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

  await utils.sendMainMenuToThread(thread, player, pet, null);
  if (sent.length === 0) throw new Error('no message sent');
  console.log('OK start-mainmenu-smoke');
}

run().catch((e) => {
  console.error('FAIL start-mainmenu-smoke:', e?.stack || e);
  process.exit(1);
});
