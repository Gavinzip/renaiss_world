const { createOnboardingRuntimeFlowUtils } = require('../../modules/systems/player/onboarding-runtime-flow-utils');

class DummyEmbed {
  setTitle() { return this; }
  setColor() { return this; }
  setDescription() { return this; }
  addFields() { return this; }
}
class DummyRow {
  constructor() { this.components = []; }
  addComponents(...components) { this.components.push(...components.flat()); return this; }
}
class DummyButton {
  setCustomId() { return this; }
  setLabel() { return this; }
  setStyle() { return this; }
}

async function waitUntil(fn, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return null;
}

async function run() {
  const originalRetryDelay = process.env.WALLET_BIND_SYNC_RETRY_DELAY_MS;
  process.env.WALLET_BIND_SYNC_RETRY_DELAY_MS = '1';

  const calls = { getAssets: 0, followUps: [] };
  const WALLET = {
    bindWallet: () => ({ success: true, address: '0x1234567890abcdef1234567890abcdef12345678' }),
    getPlayerWalletAssets: async () => {
      calls.getAssets += 1;
      if (calls.getAssets < 3) {
        throw new Error('temporary rpc error');
      }
      return {
        success: true,
        assets: {
          cardFMV: 120,
          cardCount: 1,
          packTxCount: 10,
          packSpentUSDT: 100,
          tradeSpentUSDT: 20,
          totalSpentUSDT: 120
        },
        rns: 60
      };
    },
    applyWalletRnsDelta: () => ({
      success: true,
      walletTotalRns: 60,
      delta: 60,
      pendingAfter: 60,
      claimedBefore: 0
    }),
    updateWalletData: () => {},
    getMaxPetsByFMV: () => 2,
    getWalletAddress: () => '0x1234567890abcdef1234567890abcdef12345678'
  };

  const utils = createOnboardingRuntimeFlowUtils({
    CORE: {
      loadPlayer: () => null,
      savePlayer: () => {},
      createPlayer: () => ({ stats: {} })
    },
    PET: {},
    BATTLE: {},
    ECON: { ensurePlayerEconomy: () => {} },
    WALLET,
    EmbedBuilder: DummyEmbed,
    ActionRowBuilder: DummyRow,
    ButtonBuilder: DummyButton,
    ButtonStyle: { Success: 1, Secondary: 2, Primary: 3 },
    ModalBuilder: class {},
    TextInputBuilder: class {},
    TextInputStyle: {},
    updateInteractionMessage: async () => {},
    getPlayerTempData: () => null,
    setPlayerTempData: () => {},
    clearPlayerTempData: () => {},
    getPlayerUILang: () => 'zh-TW',
    buildGenderSelectionPayload: () => ({}),
    buildElementSelectionPayload: () => ({}),
    showCharacterNameModal: async () => {},
    showOnboardingPetNameModal: async () => {},
    normalizeCharacterName: (v) => v,
    normalizePetName: (v) => v,
    pickDefaultPetNameByElement: () => 'pet',
    normalizeCharacterGender: () => '男',
    normalizePetElementCode: () => '水',
    normalizePlayerAlignment: () => '正派',
    getLanguageText: () => ({}),
    getPetMovePool: () => [],
    getMoveTierMeta: () => ({ color: 0, emoji: '', name: '' }),
    getPetElementDisplayName: () => '水屬性',
    getPetElementColor: () => 0,
    resumeExistingOnboardingOrGame: async () => false,
    t: () => '',
    format1: (v) => String(v),
    getMoveSpeedValue: () => 0,
    formatPetHpWithRecovery: () => '0/0',
    grantStarterFivePullIfNeeded: () => null,
    rollStarterMoveForElement: () => null,
    sendMainMenuToThread: async () => {},
    getSettingsHubText: () => ({})
  });

  const interaction = {
    fields: { getTextInputValue: () => '0x1234567890abcdef1234567890abcdef12345678' },
    update: async () => {},
    followUp: async (payload) => { calls.followUps.push(payload); }
  };

  await utils.handleWalletBind(interaction, { id: 'u1' });
  const done = await waitUntil(() => calls.followUps.find((x) => String(x?.content || '').includes('錢包資料背景同步完成')));

  if (!done) throw new Error('expected success followUp after retries');
  if (calls.getAssets !== 3) throw new Error(`expected 3 attempts, got ${calls.getAssets}`);

  if (typeof originalRetryDelay === 'undefined') {
    delete process.env.WALLET_BIND_SYNC_RETRY_DELAY_MS;
  } else {
    process.env.WALLET_BIND_SYNC_RETRY_DELAY_MS = originalRetryDelay;
  }
  console.log('OK wallet-bind-retry-smoke');
}

run().catch((e) => {
  delete process.env.WALLET_BIND_SYNC_RETRY_DELAY_MS;
  console.error('FAIL wallet-bind-retry-smoke:', e?.stack || e);
  process.exit(1);
});
