const fs = require('fs');
const path = require('path');

async function run() {
  const walletPath = path.join(process.cwd(), 'data', 'user_wallets.json');
  const modulePath = require.resolve('../../modules/systems/player/wallet-system');
  const originalRaw = fs.readFileSync(walletPath, 'utf8');
  const original = JSON.parse(originalRaw);
  const testId = '__wallet_claim_idempotent_test__';
  let WALLET = null;

  try {
    const seeded = {
      ...original,
      [testId]: {
      walletAddress: '0x1111111111111111111111111111111111111111',
      boundAt: new Date().toISOString(),
      pendingRNS: 0,
      walletRnsClaimed: 1000,
      walletRnsLastSyncedAt: null
      }
    };
    fs.writeFileSync(walletPath, JSON.stringify(seeded, null, 2));

    delete require.cache[modulePath];
    WALLET = require('../../modules/systems/player/wallet-system');
    if (typeof WALLET.replaceWalletSettings === 'function') {
      WALLET.replaceWalletSettings(seeded);
      if (typeof WALLET.flushWalletSettings === 'function') {
        await WALLET.flushWalletSettings();
      }
    }

    const step1 = WALLET.applyWalletRnsDelta(testId, 900);
    if (!step1.success || step1.delta !== 0 || step1.claimedAfter !== 1000) {
      throw new Error(`step1 expected no credit, got ${JSON.stringify(step1)}`);
    }

    const step2 = WALLET.applyWalletRnsDelta(testId, 1200);
    if (!step2.success || step2.delta !== 200 || step2.claimedAfter !== 1200) {
      throw new Error(`step2 expected +200 credit, got ${JSON.stringify(step2)}`);
    }

    const step3 = WALLET.applyWalletRnsDelta(testId, 1200);
    if (!step3.success || step3.delta !== 0 || step3.claimedAfter !== 1200) {
      throw new Error(`step3 expected no duplicate credit, got ${JSON.stringify(step3)}`);
    }

    const latest = WALLET.getWalletData(testId);
    if (Number(latest?.walletRnsClaimed || 0) !== 1200) {
      throw new Error(`walletRnsClaimed expected 1200, got ${latest?.walletRnsClaimed}`);
    }

    console.log('OK wallet-claim-idempotent-smoke');
  } finally {
    if (WALLET && typeof WALLET.replaceWalletSettings === 'function') {
      WALLET.replaceWalletSettings(original);
      if (typeof WALLET.flushWalletSettings === 'function') {
        await WALLET.flushWalletSettings();
      }
    }
    fs.writeFileSync(walletPath, originalRaw);
    delete require.cache[modulePath];
  }
}

run().catch((e) => {
  console.error('FAIL wallet-claim-idempotent-smoke:', e?.stack || e);
  process.exit(1);
});
