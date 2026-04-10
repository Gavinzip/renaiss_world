function createUiTextUtils(deps = {}) {
  const {
    normalizeLangCode = (v) => String(v || 'zh-TW'),
    defaultLanguage = 'zh-TW'
  } = deps;

  const TEXT = {
    'zh-TW': {
      welcome: '歡迎來到 Renaiss 星球！',
      welcomeBack: '你回來了！繼續你的冒險吧！',
      choosePath: '選擇你的道路',
      journey: 'Renaiss 星球探險之旅',
      continue: '➡️ 繼續',
      settings: '⚙️ 設置',
      character: '👤 角色',
      back: '🔙 返回',
      petCreated: '寵物誕生！',
      drawMove: '🎰 抽取天賦招式！',
      enterName: '📝 為寵物取名',
      adventure: '🌟 探險選項',
      combat: '⚔️ 戰鬥',
      flee: '🏃 逃跑',
      victory: '🏆 勝利！',
      defeat: '💀 失敗...',
      hp: '生命',
      atk: '攻擊',
      def: '防禦',
      gold: 'Rns 代幣'
    },
    'zh-CN': {
      welcome: '欢迎来到 Renaiss 星球！',
      welcomeBack: '你回来了！继续你的冒险吧！',
      choosePath: '选择你的道路',
      journey: 'Renaiss 星球探险之旅',
      continue: '➡️ 继续',
      settings: '⚙️ 设置',
      character: '👤 角色',
      back: '🔙 返回',
      petCreated: '宠物诞生！',
      drawMove: '🎰 抽取天赋招式！',
      enterName: '📝 为宠物取名',
      adventure: '🌟 探险选项',
      combat: '⚔️ 战斗',
      flee: '🏃 逃跑',
      victory: '🏆 胜利！',
      defeat: '💀 失败...',
      hp: '生命',
      atk: '攻击',
      def: '防御',
      gold: 'Rns 代币'
    },
    en: {
      welcome: 'Welcome to Renaiss Planet!',
      welcomeBack: 'Welcome back! Continue your adventure!',
      choosePath: 'Choose Your Path',
      journey: 'Renaiss Adventure Journey',
      continue: '➡️ Continue',
      settings: '⚙️ Settings',
      character: '👤 Character',
      back: '🔙 Back',
      petCreated: 'Pet Born!',
      drawMove: '🎰 Draw Talent Move!',
      enterName: '📝 Name Your Pet',
      adventure: '🌟 Adventure Options',
      combat: '⚔️ Combat',
      flee: '🏃 Flee',
      victory: '🏆 Victory!',
      defeat: '💀 Defeat...',
      hp: 'HP',
      atk: 'ATK',
      def: 'DEF',
      gold: 'Rns Token'
    }
  };

  function t(key, lang = 'zh-TW') {
    const code = normalizeLangCode(lang || defaultLanguage || 'zh-TW');
    return TEXT[code]?.[key] || TEXT['zh-TW']?.[key] || key;
  }

  return {
    TEXT,
    t
  };
}

module.exports = {
  createUiTextUtils
};
