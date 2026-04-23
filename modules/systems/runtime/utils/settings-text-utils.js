function createSettingsTextUtils(deps = {}) {
  const {
    normalizeLangCode = (lang = 'zh-TW') => String(lang || 'zh-TW'),
    // Global language resource accessor (section-based).
    getLanguageSection = null
  } = deps;

  function getSettingsText(lang = 'zh-TW') {
    const code = normalizeLangCode(lang);
    const fallbackMap = {
      'zh-TW': {
        title: '⚙️ 設定',
        desc: '遊戲設置（可在此查看世界導讀）',
        fieldLanguage: '🌐 語言 / Language',
        fieldWallet: '💳 錢包',
        fieldWorldIntro: '📖 世界導讀',
        currentPrefix: '目前：',
        langNameZhTw: '中文（繁體）',
        langNameZhCn: '中文（簡體）',
        langNameKo: '한국어',
        langNameEn: 'English',
        walletBound: (addr) => `已綁定：\`${addr || 'unknown'}\``,
        walletUnbound: '未綁定（可中途綁定，立即入帳）',
        btnSyncWallet: '🔄 同步資產',
        btnBindWallet: '💳 綁定錢包',
        btnBack: '🔙 返回',
        btnWorld: '🌍 Renaiss世界',
        worldTitle: '🌍 Renaiss 世界',
        worldDescSuffix: '主線會由你的行動被動觸發。',
        btnBackSettings: '⚙️ 返回設定',
        btnBackAdventure: '🔙 返回冒險'
      },
      'zh-CN': {
        title: '⚙️ 设置',
        desc: '游戏设置（可在此查看世界导读）',
        fieldLanguage: '🌐 语言 / Language',
        fieldWallet: '💳 钱包',
        fieldWorldIntro: '📖 世界导读',
        currentPrefix: '当前：',
        langNameZhTw: '中文（繁体）',
        langNameZhCn: '中文（简体）',
        langNameKo: '한국어',
        langNameEn: 'English',
        walletBound: (addr) => `已绑定：\`${addr || 'unknown'}\``,
        walletUnbound: '未绑定（可中途绑定，立即入账）',
        btnSyncWallet: '🔄 同步资产',
        btnBindWallet: '💳 绑定钱包',
        btnBack: '🔙 返回',
        btnWorld: '🌍 Renaiss世界',
        worldTitle: '🌍 Renaiss 世界',
        worldDescSuffix: '主线会由你的行动被动触发。',
        btnBackSettings: '⚙️ 返回设置',
        btnBackAdventure: '🔙 返回冒险'
      },
      en: {
        title: '⚙️ Settings',
        desc: 'Game settings (world primer available here)',
        fieldLanguage: '🌐 Language',
        fieldWallet: '💳 Wallet',
        fieldWorldIntro: '📖 World Primer',
        currentPrefix: 'Current:',
        langNameZhTw: 'Traditional Chinese',
        langNameZhCn: 'Simplified Chinese',
        langNameKo: 'Korean',
        langNameEn: 'English',
        walletBound: (addr) => `Bound: \`${addr || 'unknown'}\``,
        walletUnbound: 'Not bound (you can bind anytime and sync instantly)',
        btnSyncWallet: '🔄 Sync Assets',
        btnBindWallet: '💳 Bind Wallet',
        btnBack: '🔙 Back',
        btnWorld: '🌍 Renaiss World',
        worldTitle: '🌍 Renaiss World',
        worldDescSuffix: 'Main story is passively triggered by your actions.',
        btnBackSettings: '⚙️ Back to Settings',
        btnBackAdventure: '🔙 Back to Adventure'
      }
    };
    if (typeof getLanguageSection === 'function') {
      const fromGlobal = getLanguageSection('settingsText', code);
      if (fromGlobal && typeof fromGlobal === 'object' && Object.keys(fromGlobal).length > 0) {
        return fromGlobal;
      }
    }
    return fallbackMap[code] || fallbackMap['zh-TW'];
  }

  return {
    getSettingsText
  };
}

module.exports = { createSettingsTextUtils };
