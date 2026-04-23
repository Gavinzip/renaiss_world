function createUiTextUtils(deps = {}) {
  const {
    normalizeLangCode = (v) => String(v || 'zh-TW'),
    defaultLanguage = 'zh-TW',
    // Global language resource accessor (section-based).
    getLanguageSection = null
  } = deps;

  const FALLBACK_TEXT = {
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
      gold: 'Rns 代幣',
      pet: '寵物',
      element: '屬性',
      location: '位置',
      luck: '幸運',
      wanted: '通緝級',
      speed: '速度',
      name: '名字',
      gender: '性別',
      partnerElement: '夥伴屬性',
      petCapacity: '寵物額度',
      petList: '寵物列表',
      petManagement: '寵物管理',
      petNamed: '寵物已命名',
      petNaming: '寵物命名'
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
      gold: 'Rns 代币',
      pet: '宠物',
      element: '属性',
      location: '位置',
      luck: '幸运',
      wanted: '通缉级',
      speed: '速度',
      name: '名字',
      gender: '性别',
      partnerElement: '伙伴属性',
      petCapacity: '宠物额度',
      petList: '宠物列表',
      petManagement: '宠物管理',
      petNamed: '宠物已命名',
      petNaming: '宠物命名'
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
      gold: 'Rns',
      pet: 'Pet',
      element: 'Element',
      location: 'Location',
      luck: 'Luck',
      wanted: 'Wanted Lv',
      speed: 'Speed',
      name: 'Name',
      gender: 'Gender',
      partnerElement: 'Partner Element',
      petCapacity: 'Pet Capacity',
      petList: 'Pet List',
      petManagement: 'Pet Management',
      petNamed: 'Pet Named',
      petNaming: 'Pet Naming'
    }
  };

  function getTextMap(lang = 'zh-TW') {
    const code = normalizeLangCode(lang || defaultLanguage || 'zh-TW');
    if (typeof getLanguageSection === 'function') {
      const fromGlobal = getLanguageSection('uiText', code);
      if (fromGlobal && typeof fromGlobal === 'object' && Object.keys(fromGlobal).length > 0) {
        return fromGlobal;
      }
    }
    return FALLBACK_TEXT[code] || FALLBACK_TEXT['zh-TW'];
  }

  function t(key, lang = 'zh-TW') {
    const code = normalizeLangCode(lang || defaultLanguage || 'zh-TW');
    const map = getTextMap(code);
    return map?.[key] || FALLBACK_TEXT['zh-TW']?.[key] || key;
  }

  return {
    // Keep compatibility for old callers that read TEXT directly.
    TEXT: FALLBACK_TEXT,
    getTextMap,
    t
  };
}

module.exports = {
  createUiTextUtils
};
