async function run() {
  const modulePath = require.resolve('../../modules/systems/player/wallet-system');
  const originalFetch = global.fetch;
  const originalKey = process.env.BSCSCAN_API_KEY;

  const loadWallet = () => {
    delete require.cache[modulePath];
    return require('../../modules/systems/player/wallet-system');
  };

  try {
    process.env.BSCSCAN_API_KEY = 'test-key';
    let WALLET = loadWallet();

    // 1) API 回 NOTOK 不應默默當成 0
    global.fetch = async () => ({
      json: async () => ({ status: '0', message: 'NOTOK', result: 'Max rate limit reached' })
    });
    let threwNotOk = false;
    try {
      await WALLET.fetchUSDTTransfers('0x00f82d2f05280a7888a39d724486fcab808d17b2');
    } catch (e) {
      threwNotOk = /NOTOK|rate limit|tokentx/i.test(String(e?.message || ''));
    }
    if (!threwNotOk) throw new Error('expected NOTOK response to throw');

    // 2) 明確無交易要維持 0（合法）
    global.fetch = async () => ({
      json: async () => ({ status: '0', message: 'No transactions found', result: 'No transactions found' })
    });
    const empty = await WALLET.fetchUSDTTransfers('0x00f82d2f05280a7888a39d724486fcab808d17b2');
    if (Number(empty?.totalSpentUSDT || 0) !== 0) {
      throw new Error('expected no-transaction response to keep zero totals');
    }

    console.log('OK wallet-sync-api-guard-smoke');
  } finally {
    global.fetch = originalFetch;
    process.env.BSCSCAN_API_KEY = originalKey;
    delete require.cache[modulePath];
  }
}

run().catch((e) => {
  console.error('FAIL wallet-sync-api-guard-smoke:', e?.stack || e);
  process.exit(1);
});
