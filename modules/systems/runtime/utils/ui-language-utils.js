function createUiLanguageUtils(deps = {}) {
  const configLanguage = String(deps.configLanguage || 'zh-TW').trim() || 'zh-TW';
  const ButtonBuilder = deps.ButtonBuilder;
  const ButtonStyle = deps.ButtonStyle;
  // Global language resource accessor (section-based).
  const getLanguageSection = typeof deps.getLanguageSection === 'function'
    ? deps.getLanguageSection
    : null;
  const buildQuickShopButton = typeof deps.buildQuickShopButton === 'function'
    ? deps.buildQuickShopButton
    : (() => null);

  const playerTempData = {};

  function setPlayerTempData(userId, key, value) {
    if (!playerTempData[userId]) playerTempData[userId] = {};
    playerTempData[userId][key] = value;
  }

  function getPlayerTempData(userId, key) {
    return playerTempData[userId]?.[key] || null;
  }

  function clearPlayerTempData(userId) {
    delete playerTempData[userId];
  }

  function normalizeLangCode(lang = 'zh-TW') {
    const raw = String(lang || '').trim();
    const lower = raw.toLowerCase();
    if (
      raw === 'zh-CN' ||
      lower === 'zh-cn' ||
      lower === 'zh_cn' ||
      lower === 'zh-hans' ||
      lower === 'cn' ||
      lower === 'sc' ||
      lower.includes('简体')
    ) return 'zh-CN';
    if (
      raw === 'en' ||
      lower === 'english' ||
      lower === 'en_us' ||
      lower === 'en-us' ||
      lower.startsWith('en-')
    ) return 'en';
    return 'zh-TW';
  }

  function getPlayerUILang(player = null) {
    return normalizeLangCode(player?.language || configLanguage || 'zh-TW');
  }

  function getUtilityButtonLabels(lang = 'zh-TW') {
    const fallbackMap = {
      'zh-TW': {
        inventory: '🎒 背包',
        moves: '🐾 寵物',
        character: '👤 個人',
        settings: '⚙️ 設定',
        friends: '🤝 好友',
        codex: '📚 圖鑑',
        gacha: '🎰 抽獎',
        map: '🗺️ 地圖',
        quickShopReady: '🏪 鑑價站',
        quickShopCooldown: (remaining) => `🏪 鑑價站 ${remaining}T`
      },
      'zh-CN': {
        inventory: '🎒 背包',
        moves: '🐾 宠物',
        character: '👤 个人',
        settings: '⚙️ 设置',
        friends: '🤝 好友',
        codex: '📚 图鉴',
        gacha: '🎰 抽奖',
        map: '🗺️ 地图',
        quickShopReady: '🏪 鉴价站',
        quickShopCooldown: (remaining) => `🏪 鉴价站 ${remaining}T`
      },
      en: {
        inventory: '🎒 Bag',
        moves: '🐾 Pet',
        character: '👤 Character',
        settings: '⚙️ Settings',
        friends: '🤝 Friends',
        codex: '📚 Codex',
        gacha: '🎰 Draw',
        map: '🗺️ Map',
        quickShopReady: '🏪 Appraisal',
        quickShopCooldown: (remaining) => `🏪 Appraisal ${remaining}T`
      }
    };
    if (getLanguageSection) {
      const fromGlobal = getLanguageSection('utilityButtonLabels', lang);
      if (fromGlobal && typeof fromGlobal === 'object' && Object.keys(fromGlobal).length > 0) {
        return fromGlobal;
      }
    }
    return fallbackMap[lang] || fallbackMap['zh-TW'];
  }

  function appendMainMenuUtilityButtons(buttons = [], player = null) {
    const list = Array.isArray(buttons) ? buttons : [];
    const uiLang = getPlayerUILang(player);
    const labels = getUtilityButtonLabels(uiLang);
    list.push(
      new ButtonBuilder().setCustomId('show_inventory').setLabel(labels.inventory).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('show_moves').setLabel(labels.moves).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_character').setLabel(labels.character).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_settings').setLabel(labels.settings).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_friends').setLabel(labels.friends).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('show_codex').setLabel(labels.codex).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_gacha').setLabel(labels.gacha).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_map').setLabel(labels.map).setStyle(ButtonStyle.Secondary),
      buildQuickShopButton(player)
    );
    return list;
  }

  return {
    setPlayerTempData,
    getPlayerTempData,
    clearPlayerTempData,
    normalizeLangCode,
    getPlayerUILang,
    getUtilityButtonLabels,
    appendMainMenuUtilityButtons
  };
}

module.exports = { createUiLanguageUtils };
