function createSettingsMemoryTextUtils(deps = {}) {
  const {
    normalizeLangCode = (v) => v || 'zh-TW',
    // Global language resource accessor (section-based).
    getLanguageSection = null
  } = deps;

  function getSettingsHubText(lang = 'zh-TW') {
    const code = normalizeLangCode(lang);
    const fallbackMap = {
      'zh-TW': {
        title: '⚙️ 設定中心',
        desc: '設定語言、錢包同步與記憶檢查。',
        btnMemory: '🧠 記憶檢查',
        btnSystem: '🛠️ 系統設定',
        btnBack: '🔙 返回主選單'
      },
      'zh-CN': {
        title: '⚙️ 设置中心',
        desc: '设置语言、钱包同步与记忆检查。',
        btnMemory: '🧠 记忆检查',
        btnSystem: '🛠️ 系统设置',
        btnBack: '🔙 返回主选单'
      },
      en: {
        title: '⚙️ Settings Hub',
        desc: 'Language, wallet sync, and memory audit settings.',
        btnMemory: '🧠 Memory Audit',
        btnSystem: '🛠️ System Settings',
        btnBack: '🔙 Back to Menu'
      }
    };
    if (typeof getLanguageSection === 'function') {
      const fromGlobal = getLanguageSection('settingsHubText', code);
      if (fromGlobal && typeof fromGlobal === 'object' && Object.keys(fromGlobal).length > 0) {
        return fromGlobal;
      }
    }
    return fallbackMap[code] || fallbackMap['zh-TW'];
  }

  function getMemoryRecapText(lang = 'zh-TW') {
    const code = normalizeLangCode(lang);
    const fallbackMap = {
      'zh-TW': {
        title: '🧠 記憶回顧',
        loading: '⏳ AI 正在整理你的角色記憶...',
        fallbackHint: '（AI 回顧暫時不可用，以下為系統濃縮）',
        noStory: '目前還沒有足夠故事可回顧，先多推進幾回合再來看。',
        backProfile: '💳 返回檔案',
        backMenu: '返回主選單'
      },
      'zh-CN': {
        title: '🧠 记忆回顾',
        loading: '⏳ AI 正在整理你的角色记忆...',
        fallbackHint: '（AI 回顾暂时不可用，以下为系统浓缩）',
        noStory: '目前还没有足够故事可回顾，先多推进几回合再来查看。',
        backProfile: '💳 返回档案',
        backMenu: '返回主选单'
      },
      en: {
        title: '🧠 Memory Recap',
        loading: '⏳ AI is compiling your character memory recap...',
        fallbackHint: '(AI recap unavailable for now; showing system digest)',
        noStory: 'Not enough story progress yet. Play a few more turns and check again.',
        backProfile: '💳 Back to Profile',
        backMenu: 'Back to Menu'
      }
    };
    if (typeof getLanguageSection === 'function') {
      const fromGlobal = getLanguageSection('memoryRecapText', code);
      if (fromGlobal && typeof fromGlobal === 'object' && Object.keys(fromGlobal).length > 0) {
        return fromGlobal;
      }
    }
    return fallbackMap[code] || fallbackMap['zh-TW'];
  }

  return {
    getSettingsHubText,
    getMemoryRecapText
  };
}

module.exports = {
  createSettingsMemoryTextUtils
};
