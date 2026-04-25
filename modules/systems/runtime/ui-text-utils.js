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
      petNaming: '寵物命名',
      customInputName: '✍️ 自訂行動',
      customInputChoice: '＿＿＿＿（自行輸入接下來要做的事）',
      customInputDesc: '你可自行輸入接下來想進行的行動',
      customInputModalTitle: '✍️ 自訂行動',
      customInputModalLabel: '你接下來想做什麼？',
      customInputModalPlaceholder: '例如：我去跟茶師談判，要求先合作再分成',
      customInputModalOpenFailed: '⚠️ 無法開啟自訂輸入框，請再點一次。',
      customInputSelectedChoice: (text) => `自訂行動：「${text}」`,
      wishPoolModalTitle: '🪙 許願池',
      wishPoolModalLabel: '你想許下什麼願望？',
      wishPoolModalPlaceholder: '例如：希望賺很多錢、希望變強、希望遇到貴人...',
      wishPoolModalOpenFailed: '⚠️ 無法開啟許願輸入框，請再點一次。',
      wishPoolSelectedChoice: (text) => `在許願池許願：「${text}」`,
      choiceFallbackLabel: (index) => `選項${index}`
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
      petNaming: '宠物命名',
      customInputName: '✍️ 自定义行动',
      customInputChoice: '＿＿＿＿（自行输入接下来要做的事）',
      customInputDesc: '你可以自行输入接下来想进行的行动',
      customInputModalTitle: '✍️ 自定义行动',
      customInputModalLabel: '你接下来想做什么？',
      customInputModalPlaceholder: '例如：我去跟茶师谈判，要求先合作再分成',
      customInputModalOpenFailed: '⚠️ 无法打开自定义输入框，请再点一次。',
      customInputSelectedChoice: (text) => `自定义行动：“${text}”`,
      wishPoolModalTitle: '🪙 许愿池',
      wishPoolModalLabel: '你想许下什么愿望？',
      wishPoolModalPlaceholder: '例如：希望赚很多钱、希望变强、希望遇到贵人...',
      wishPoolModalOpenFailed: '⚠️ 无法打开许愿输入框，请再点一次。',
      wishPoolSelectedChoice: (text) => `在许愿池许愿：“${text}”`,
      choiceFallbackLabel: (index) => `选项${index}`
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
      petNaming: 'Pet Naming',
      customInputName: '✍️ Custom Action',
      customInputChoice: '＿＿＿＿(Enter your next action)',
      customInputDesc: 'Write the next action you want to take.',
      customInputModalTitle: '✍️ Custom Action',
      customInputModalLabel: 'What do you want to do next?',
      customInputModalPlaceholder: 'For example: negotiate with the tea master first, then split the profits later',
      customInputModalOpenFailed: '⚠️ Unable to open the custom input box. Please tap again.',
      customInputSelectedChoice: (text) => `Custom action: "${text}"`,
      wishPoolModalTitle: '🪙 Wish Pool',
      wishPoolModalLabel: 'What do you want to wish for?',
      wishPoolModalPlaceholder: 'For example: make more money, become stronger, meet a benefactor...',
      wishPoolModalOpenFailed: '⚠️ Unable to open the wish input box. Please tap again.',
      wishPoolSelectedChoice: (text) => `Make a wish: "${text}"`,
      choiceFallbackLabel: (index) => `Option ${index}`
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
