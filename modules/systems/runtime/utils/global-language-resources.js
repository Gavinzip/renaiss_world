const CONTENT_LOCALIZATION = require('./content-localization-utils');

function createGlobalLanguageResources(deps = {}) {
  const {
    normalizeLangCode = (lang = 'zh-TW') => String(lang || 'zh-TW')
  } = deps;
  const translateTextToKo = typeof CONTENT_LOCALIZATION.translateTextToKo === 'function'
    ? CONTENT_LOCALIZATION.translateTextToKo
    : (text = '') => String(text || '');
  let mapTextUtilsFactory = null;
  const koreanSectionCache = new Map();

  function normalizeLang(lang = 'zh-TW') {
    const raw = String(normalizeLangCode(lang) || lang || '').trim();
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
    if (
      raw === 'ko' ||
      raw === 'ko-KR' ||
      lower === 'ko' ||
      lower === 'ko-kr' ||
      lower === 'kr' ||
      lower === 'korean' ||
      lower.includes('한국')
    ) return 'ko';
    return 'zh-TW';
  }

  function localizeValueToKorean(value = null) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return translateTextToKo(value);
    if (typeof value === 'function') {
      return (...args) => translateTextToKo(String(value(...args) || ''));
    }
    if (Array.isArray(value)) return value.map((item) => localizeValueToKorean(item));
    if (typeof value === 'object') {
      const out = {};
      for (const [key, row] of Object.entries(value)) {
        out[key] = localizeValueToKorean(row);
      }
      return out;
    }
    return value;
  }

  function isPlainObject(value = null) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function mergeLocalizedKoreanValue(baseValue = null, overrideValue = null) {
    if (overrideValue === undefined) return baseValue;
    if (baseValue === undefined) return overrideValue;
    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      const out = { ...baseValue };
      for (const [key, value] of Object.entries(overrideValue)) {
        out[key] = mergeLocalizedKoreanValue(baseValue[key], value);
      }
      return out;
    }
    return overrideValue;
  }

  function getKoreanSection(section = '', rows = {}) {
    const key = String(section || '').trim();
    if (!key) return {};
    if (koreanSectionCache.has(key)) return koreanSectionCache.get(key);
    const hasKoOverride = Object.prototype.hasOwnProperty.call(rows || {}, 'ko');
    const baseSource = rows?.en || rows?.['zh-TW'] || rows?.ko || {};
    const baseLocalized = localizeValueToKorean(baseSource);
    const localized = hasKoOverride
      ? mergeLocalizedKoreanValue(baseLocalized, localizeValueToKorean(rows?.ko))
      : baseLocalized;
    koreanSectionCache.set(key, localized);
    return localized;
  }

  function resolveMapText(lang = 'zh-TW', context = {}) {
    try {
      if (!mapTextUtilsFactory) {
        // Lazy-load to avoid unnecessary startup overhead.
        // Also keeps map text centralized behind this global accessor.
        // eslint-disable-next-line global-require
        const { createMapTextUtils } = require('../../map/map-text-utils');
        mapTextUtilsFactory = createMapTextUtils;
      }
      if (typeof mapTextUtilsFactory !== 'function') return {};
      const format1 = typeof context?.format1 === 'function' ? context.format1 : (v) => String(v ?? 0);
      const mapTextUtils = mapTextUtilsFactory({
        normalizeLangCode: (v = 'zh-TW') => normalizeLang(v),
        TELEPORT_DEVICE_COST: Number(context?.TELEPORT_DEVICE_COST ?? 200),
        TELEPORT_DEVICE_DURATION_HOURS: Number(context?.TELEPORT_DEVICE_DURATION_HOURS ?? 6),
        LOCATION_ENTRY_MIN_WINRATE: Number(context?.LOCATION_ENTRY_MIN_WINRATE ?? 50),
        format1
      });
      return mapTextUtils?.getMapText?.(lang) || {};
    } catch {
      return {};
    }
  }

  const RESOURCES = {
    // Used by: modules/systems/runtime/ui-text-utils.js
    uiText: {
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
    },

    // Used by: modules/systems/runtime/utils/settings-text-utils.js
    settingsText: {
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
    },

    // Used by: modules/systems/ui/settings-memory-text-utils.js
    settingsHubText: {
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
    },

    // Used by: modules/systems/ui/settings-memory-text-utils.js
    memoryRecapText: {
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
    },

    // Used by: modules/systems/runtime/utils/ui-language-utils.js
    utilityButtonLabels: {
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
    },

    // Used by: modules/content/adventure-status-utils.js
    adventureText: {
      'zh-TW': {
        statusLabel: '狀態',
        statusHp: '氣血',
        statusEnergy: '能量',
        statusCurrency: 'Rns 代幣',
        fieldPet: '🐾 寵物',
        fieldHp: '⚔️ 氣血',
        fieldCurrency: '💰 Rns 代幣',
        fieldLocation: '📍 位置',
        fieldLuck: '🌟 幸運',
        fieldWanted: '🚨 通緝級',
        mainlineDone: (location) => `📖 本區主線：已完成（${location}）`,
        mainlineProgress: (location) => `📖 本區主線：進行中（${location}）`,
        missionBoss: (done) => `｜關鍵任務：擊敗四巨頭全員（${done ? '已完成' : '未完成'}）`,
        missionNpc: (name, location, done) => `｜關鍵NPC：${name}@${location}（${done ? '已完成' : '未完成'}）`,
        sectionChoices: '🆕 選項',
        sectionNewChoices: '🆕 新選項',
        chooseNumber: (max) => `請選擇編號（1-${max}）`,
        sectionWorldEvents: '📢 世界事件',
        lastChoice: '📍 上個選擇',
        sectionPrevStory: '📜 前情提要',
        sectionUpcomingChoices: '🆕 即將更新選項',
        turnMoved: (from, to) => `🧭 本回合移動：${from} → ${to}`,
        rewardGoldDelta: (gold) => `💰 +${gold} Rns 代幣`,
        rewardWantedLevel: (level) => `⚠️ 通緝等級: ${level}`,
        rewardSoldCount: (count) => `🏪 已售出 ${count} 件`,
        rewardItemGain: (item) => `📦 取得 ${item}`,
        rewardPetRevived: (name) => `🐾 ${name} 復活完成（2回合制）`,
        rewardPassiveHealSingle: (name, heal) => `🩹 ${name} 行進恢復 +${heal} HP`,
        rewardPassiveHealSummary: (preview, total) => `🩹 行進恢復：${preview}｜合計 +${total} HP`
      },
      'zh-CN': {
        statusLabel: '状态',
        statusHp: '气血',
        statusEnergy: '能量',
        statusCurrency: 'Rns 代币',
        fieldPet: '🐾 宠物',
        fieldHp: '⚔️ 气血',
        fieldCurrency: '💰 Rns 代币',
        fieldLocation: '📍 位置',
        fieldLuck: '🌟 幸运',
        fieldWanted: '🚨 通缉级',
        mainlineDone: (location) => `📖 本区主线：已完成（${location}）`,
        mainlineProgress: (location) => `📖 本区主线：进行中（${location}）`,
        missionBoss: (done) => `｜关键任务：击败四巨头全员（${done ? '已完成' : '未完成'}）`,
        missionNpc: (name, location, done) => `｜关键NPC：${name}@${location}（${done ? '已完成' : '未完成'}）`,
        sectionChoices: '🆕 选项',
        sectionNewChoices: '🆕 新选项',
        chooseNumber: (max) => `请选择编号（1-${max}）`,
        sectionWorldEvents: '📢 世界事件',
        lastChoice: '📍 上个选择',
        sectionPrevStory: '📜 前情提要',
        sectionUpcomingChoices: '🆕 即将更新选项',
        turnMoved: (from, to) => `🧭 本回合移动：${from} → ${to}`,
        rewardGoldDelta: (gold) => `💰 +${gold} Rns 代币`,
        rewardWantedLevel: (level) => `⚠️ 通缉等级: ${level}`,
        rewardSoldCount: (count) => `🏪 已售出 ${count} 件`,
        rewardItemGain: (item) => `📦 取得 ${item}`,
        rewardPetRevived: (name) => `🐾 ${name} 复活完成（2回合制）`,
        rewardPassiveHealSingle: (name, heal) => `🩹 ${name} 行进恢复 +${heal} HP`,
        rewardPassiveHealSummary: (preview, total) => `🩹 行进恢复：${preview}｜合计 +${total} HP`
      },
      en: {
        statusLabel: 'Status',
        statusHp: 'HP',
        statusEnergy: 'Energy',
        statusCurrency: 'Rns Tokens',
        fieldPet: '🐾 Pet',
        fieldHp: '⚔️ HP',
        fieldCurrency: '💰 Rns',
        fieldLocation: '📍 Location',
        fieldLuck: '🌟 Luck',
        fieldWanted: '🚨 Wanted Lv',
        mainlineDone: (location) => `📖 Local Mainline: Completed (${location})`,
        mainlineProgress: (location) => `📖 Local Mainline: In Progress (${location})`,
        missionBoss: (done) => ` | Key Mission: Defeat all Four Commanders (${done ? 'Done' : 'Pending'})`,
        missionNpc: (name, location, done) => ` | Key NPC: ${name}@${location} (${done ? 'Done' : 'Pending'})`,
        sectionChoices: '🆕 Choices',
        sectionNewChoices: '🆕 New Choices',
        chooseNumber: (max) => `Choose a number (1-${max})`,
        sectionWorldEvents: '📢 World Events',
        lastChoice: '📍 Previous Choice',
        sectionPrevStory: '📜 Previous Context',
        sectionUpcomingChoices: '🆕 Incoming Choices',
        turnMoved: (from, to) => `🧭 Moved this turn: ${from} → ${to}`,
        rewardGoldDelta: (gold) => `💰 +${gold} Rns`,
        rewardWantedLevel: (level) => `⚠️ Wanted Lv: ${level}`,
        rewardSoldCount: (count) => `🏪 Sold ${count} item(s)`,
        rewardItemGain: (item) => `📦 Obtained ${item}`,
        rewardPetRevived: (name) => `🐾 ${name} has fully revived (2-turn system)`,
        rewardPassiveHealSingle: (name, heal) => `🩹 ${name} recovered +${heal} HP while moving`,
        rewardPassiveHealSummary: (preview, total) => `🩹 Travel recovery: ${preview} | Total +${total} HP`
      },
      ko: {
        statusLabel: '상태',
        statusHp: 'HP',
        statusEnergy: '에너지',
        statusCurrency: 'Rns 토큰',
        fieldPet: '🐾 펫',
        fieldHp: '⚔️ HP',
        fieldCurrency: '💰 Rns',
        fieldLocation: '📍 위치',
        fieldLuck: '🌟 행운',
        fieldWanted: '🚨 수배 레벨',
        mainlineDone: (location) => `📖 지역 메인라인: 완료 (${location})`,
        mainlineProgress: (location) => `📖 지역 메인라인: 진행 중 (${location})`,
        missionBoss: (done) => ` | 핵심 임무: 4대 지휘관 전원 격파 (${done ? '완료' : '진행 중'})`,
        missionNpc: (name, location, done) => ` | 핵심 NPC: ${name}@${location} (${done ? '완료' : '진행 중'})`,
        sectionChoices: '🆕 선택지',
        sectionNewChoices: '🆕 새 선택지',
        chooseNumber: (max) => `번호를 선택하세요 (1-${max})`,
        sectionWorldEvents: '📢 세계 이벤트',
        lastChoice: '📍 이전 선택',
        sectionPrevStory: '📜 이전 스토리',
        sectionUpcomingChoices: '🆕 곧 갱신될 선택지',
        turnMoved: (from, to) => `🧭 이번 턴 이동: ${from} → ${to}`,
        rewardGoldDelta: (gold) => `💰 +${gold} Rns 토큰`,
        rewardWantedLevel: (level) => `⚠️ 수배 레벨: ${level}`,
        rewardSoldCount: (count) => `🏪 ${count}개 판매 완료`,
        rewardItemGain: (item) => `📦 ${item} 획득`,
        rewardPetRevived: (name) => `🐾 ${name} 부활 완료 (2턴 시스템)`,
        rewardPassiveHealSingle: (name, heal) => `🩹 ${name} 이동 중 +${heal} HP 회복`,
        rewardPassiveHealSummary: (preview, total) => `🩹 이동 회복: ${preview}｜총 +${total} HP`
      }
    },

    // Used by: modules/systems/player/onboarding-profile-utils.js
    onboardingLanguageText: {
      'zh-TW': {
        welcome: '歡迎來到 Renaiss 星球！',
        welcomeDesc: '在這個世界，你需要：\n• 選擇你的角色性別並先命名角色\n• 選擇夥伴寵物屬性（水/火/草）並命名寵物\n• 完成開局抽獎後開始探索事件、戰鬥與任務',
        chooseGenderHint: '請先選擇你的角色性別：',
        onboardingFooter: '選完性別先命名角色，再選寵物屬性與寵物名字即可開局',
        male: '男生角色',
        maleDesc: '主角為男性形象，劇情稱謂會對應調整',
        female: '女生角色',
        femaleDesc: '主角為女性形象，劇情稱謂會對應調整',
        chooseElementHint: '請選擇你的起始寵物屬性：',
        water: '水屬性',
        waterDesc: '控制 + 回復 + 持續干擾，節奏穩健',
        fire: '火屬性',
        fireDesc: '爆發 + 壓制 + 反制，節奏強攻',
        grass: '草屬性',
        grassDesc: '防禦 + 毒蝕 + 回復，續戰能力強',
        charNameModalTitle: '📛 為你的角色取個名字',
        charNameLabel: '角色名字',
        charNamePlaceholder: '輸入你在 Renaiss 星球的名字',
        petNameModalTitle: '🐾 為你的寵物取名',
        petNameLabel: '寵物名字',
        petNamePlaceholder: '輸入名字（1-6個字）',
        elementChoiceInvalid: '⚠️ 屬性選擇資料錯誤，請重新操作。'
      },
      'zh-CN': {
        welcome: '欢迎来到 Renaiss 星球！',
        welcomeDesc: '在这个世界，你需要：\n• 选择你的角色性别并先命名角色\n• 选择伙伴宠物属性（水/火/草）并命名宠物\n• 完成开局抽奖后开始探索事件、战斗与任务',
        chooseGenderHint: '请先选择你的角色性别：',
        onboardingFooter: '选完性别先命名角色，再选宠物属性与宠物名字即可开局',
        male: '男生角色',
        maleDesc: '主角为男性形象，剧情称谓会对应调整',
        female: '女生角色',
        femaleDesc: '主角为女性形象，剧情称谓会对应调整',
        chooseElementHint: '请选择你的起始宠物属性：',
        water: '水属性',
        waterDesc: '控制 + 回复 + 持续干扰，节奏稳健',
        fire: '火属性',
        fireDesc: '爆发 + 压制 + 反制，节奏强攻',
        grass: '草属性',
        grassDesc: '防御 + 毒蚀 + 回复，续战能力强',
        charNameModalTitle: '📛 为你的角色取个名字',
        charNameLabel: '角色名字',
        charNamePlaceholder: '输入你在 Renaiss 星球的名字',
        petNameModalTitle: '🐾 为你的宠物取名',
        petNameLabel: '宠物名字',
        petNamePlaceholder: '输入名字（1-6个字）',
        elementChoiceInvalid: '⚠️ 属性选择资料错误，请重新操作。'
      },
      en: {
        welcome: 'Welcome to Renaiss Planet!',
        welcomeDesc: 'In this world, you need to:\n• Choose character gender and name your character first\n• Choose starter pet element (Water / Fire / Grass) and name your pet\n• Finish the starter draw, then begin exploration, battles, and quests',
        chooseGenderHint: 'Choose your character gender first:',
        onboardingFooter: 'Choose gender, name your character, then pick pet element and pet name to start.',
        male: 'Male',
        maleDesc: 'Story pronouns and role narration follow male profile',
        female: 'Female',
        femaleDesc: 'Story pronouns and role narration follow female profile',
        chooseElementHint: 'Choose your starter pet element:',
        water: 'Water',
        waterDesc: 'Control + sustain + chip damage',
        fire: 'Fire',
        fireDesc: 'Burst + pressure + counterattack',
        grass: 'Grass',
        grassDesc: 'Defense + poison + recovery',
        charNameModalTitle: '📛 Name Your Character',
        charNameLabel: 'Character Name',
        charNamePlaceholder: 'Enter your name on Renaiss',
        petNameModalTitle: '🐾 Name Your Pet',
        petNameLabel: 'Pet Name',
        petNamePlaceholder: 'Enter a name (1-6 chars)',
        elementChoiceInvalid: '⚠️ Invalid element selection. Please try again.'
      }
    },

    // Used by: modules/systems/player/onboarding-profile-utils.js
    worldIntroTemplate: {
      'zh-TW': [
        '你身在 Renaiss 海域。這片星域由 Renaiss 長年維運，是航道、交易與居住秩序的核心。',
        '但在明面秩序之外，另一股勢力正與既有體系長期角力，雙方在各區節點不斷拉鋸。',
        '主角群由你與你的夥伴寵物展開；你每一次探索、交易、戰鬥、撤退，都會改寫下一段劇情。',
        'Renaiss 的前線核心由 Winchman、Tom、Harry、Kathy、Ryan 協同維持，重點是守住航道與民生據點。',
        '這是開放世界，沒有固定主線按鈕；章節、流言、戰況與角色命運都由你的選擇被動推進。',
        '世界會記住你做過的事，並把後果擴散成所有玩家可見的長期傳聞。'
      ].join('\n'),
      'zh-CN': [
        '你身在 Renaiss 海域。这片星域长期由 Renaiss 维运，是航道、交易与居住秩序的核心。',
        '但在明面秩序之外，另一股势力正与既有体系长期角力，双方在各区节点持续拉锯。',
        '主角群由你与伙伴宠物展开；你每一次探索、交易、战斗、撤退，都会改写下一段剧情。',
        'Renaiss 前线核心由 Winchman、Tom、Harry、Kathy、Ryan 协同维持，重点是守住航道与民生据点。',
        '这是开放世界，没有固定主线按钮；章节、流言、战况与角色命运都由你的选择被动推进。',
        '世界会记住你做过的事，并把后果扩散成所有玩家可见的长期传闻。'
      ].join('\n'),
      en: [
        'You are in the Renaiss Sea, a star region long maintained by Renaiss as the backbone of routes, trade, and civil order.',
        'Beyond the visible order, a rival force keeps contesting that system across multiple regional nodes.',
        'The protagonists are you and your partner creature; each exploration, trade, battle, or retreat rewrites your next chapter.',
        'Renaiss frontline operations are coordinated by Winchman, Tom, Harry, Kathy, and Ryan to keep routes and civilian hubs stable.',
        'This is an open world with no fixed main-story button; chapters, rumors, and outcomes are passively triggered by your choices.',
        'The world remembers your actions and propagates the consequences as shared long-term rumors.'
      ].join('\n'),
      ko: [
        '당신은 Renaiss 해역에 있습니다. 이 성역은 오랫동안 Renaiss가 유지해 온 항로, 거래, 거주 질서의 핵심입니다.',
        '겉으로 보이는 질서 뒤에서는 또 다른 세력이 기존 체계와 장기적으로 충돌하며 각 지역 거점에서 줄다리기를 이어가고 있습니다.',
        '주인공은 당신과 파트너 펫입니다. 탐험, 거래, 전투, 후퇴의 모든 선택이 다음 장면의 전개를 바꿉니다.',
        'Renaiss 전선 핵심은 Winchman, Tom, Harry, Kathy, Ryan이 협력해 유지하며, 항로와 민생 거점을 지키는 것이 최우선입니다.',
        '이곳은 고정 메인 퀘스트 버튼이 없는 오픈 월드입니다. 장면, 소문, 전황, 인물 운명은 당신의 선택에 따라 수동적으로 진행됩니다.',
        '세계는 당신의 행동을 기억하고, 그 결과를 모든 플레이어가 볼 수 있는 장기 소문으로 확산합니다.'
      ].join('\n')
    },

    // Used by: modules/systems/map/map-render-utils.js
    mapRenderLegendLabels: {
      'zh-TW': { you: '目前位置', portal: '主傳送門', city: '城市', forest: '森林' },
      'zh-CN': { you: '目前位置', portal: '主传送门', city: '城市', forest: '森林' },
      en: { you: 'You', portal: 'Portal Hub', city: 'City', forest: 'Forest' },
      ko: { you: '현재 위치', portal: '주 포털', city: '도시', forest: '숲' }
    },

    // Used by: modules/systems/map/map-render-utils.js
    mapRegionNames: {
      '北境高原': { 'zh-TW': '北境高原', 'zh-CN': '北境高原', en: 'Northern Highlands', ko: '북부 고원' },
      '中原核心': { 'zh-TW': '中原核心', 'zh-CN': '中原核心', en: 'Central Core', ko: '중앙 핵심권' },
      '西域沙海': { 'zh-TW': '西域沙海', 'zh-CN': '西域沙海', en: 'Western Sandsea', ko: '서부 사해' },
      '南疆水網': { 'zh-TW': '南疆水網', 'zh-CN': '南疆水网', en: 'Southern Waterways', ko: '남부 수로지대' },
      '群島航線': { 'zh-TW': '群島航線', 'zh-CN': '群岛航线', en: 'Archipelago Routes', ko: '군도 항로' },
      '隱秘深域': { 'zh-TW': '隱秘深域', 'zh-CN': '隐秘深域', en: 'Hidden Deep Zone', ko: '은밀 심역' }
    },

    locationDisplayNames: {
      '河港鎮': { 'zh-TW': '河港鎮', 'zh-CN': '河港镇', en: 'Riverport Town', ko: '하항진' },
      '襄陽城': { 'zh-TW': '襄陽城', 'zh-CN': '襄阳城', en: 'Xiangyang City', ko: '양양성' },
      '龍脊山道': { 'zh-TW': '龍脊山道', 'zh-CN': '龙脊山道', en: 'Dragonspine Pass', ko: '용척산도' },
      '洛陽城': { 'zh-TW': '洛陽城', 'zh-CN': '洛阳城', en: 'Luoyang City', ko: '낙양성' },
      '墨林古道': { 'zh-TW': '墨林古道', 'zh-CN': '墨林古道', en: 'Inkwood Ancient Trail', ko: '묵림고도' },
      '大都': { 'zh-TW': '大都', 'zh-CN': '大都', en: 'Grand Capital', ko: '대도' },
      '皇城內廷': { 'zh-TW': '皇城內廷', 'zh-CN': '皇城内廷', en: 'Inner Imperial Court', ko: '황성 내정' },
      '青石關': { 'zh-TW': '青石關', 'zh-CN': '青石关', en: 'Bluestone Pass', ko: '청석관' },
      '敦煌': { 'zh-TW': '敦煌', 'zh-CN': '敦煌', en: 'Dunhuang', ko: '돈황' },
      '喀什爾': { 'zh-TW': '喀什爾', 'zh-CN': '喀什尔', en: 'Kashir', ko: '카시르' },
      '赤沙前哨': { 'zh-TW': '赤沙前哨', 'zh-CN': '赤沙前哨', en: 'Redsand Outpost', ko: '적사 전초기지' },
      '砂輪遺站': { 'zh-TW': '砂輪遺站', 'zh-CN': '砂轮遗站', en: 'Sandwheel Ruin Station', ko: '사륜 유적역' },
      '鳴沙廢城': { 'zh-TW': '鳴沙廢城', 'zh-CN': '鸣沙废城', en: 'Singing Sands Ruincity', ko: '명사 폐성' },
      '廣州': { 'zh-TW': '廣州', 'zh-CN': '广州', en: 'Guangzhou', ko: '광저우' },
      '海潮碼頭': { 'zh-TW': '海潮碼頭', 'zh-CN': '海潮码头', en: 'Tidewharf Pier', ko: '해조 부두' },
      '鏡湖渡口': { 'zh-TW': '鏡湖渡口', 'zh-CN': '镜湖渡口', en: 'Mirrorlake Ferry', ko: '경호 나루터' },
      '大理': { 'zh-TW': '大理', 'zh-CN': '大理', en: 'Dali', ko: '대리' },
      '雲棧茶嶺': { 'zh-TW': '雲棧茶嶺', 'zh-CN': '云栈茶岭', en: 'Cloudridge Tea Range', ko: '운잔 차령' },
      '南疆苗疆': { 'zh-TW': '南疆苗疆', 'zh-CN': '南疆苗疆', en: 'Southern Miao Frontier', ko: '남강 묘강' },
      '霧雨古祭壇': { 'zh-TW': '霧雨古祭壇', 'zh-CN': '雾雨古祭坛', en: 'Mistrain Ancient Altar', ko: '무우 고제단' },
      '草原部落': { 'zh-TW': '草原部落', 'zh-CN': '草原部落', en: 'Grassland Tribe', ko: '초원 부족' },
      '霜狼哨站': { 'zh-TW': '霜狼哨站', 'zh-CN': '霜狼哨站', en: 'Frostwolf Outpost', ko: '상랑 초소' },
      '雪白山莊': { 'zh-TW': '雪白山莊', 'zh-CN': '雪白山庄', en: 'Snowwhite Manor', ko: '설백 산장' },
      '玄冰裂谷': { 'zh-TW': '玄冰裂谷', 'zh-CN': '玄冰裂谷', en: 'Blackice Rift', ko: '현빙 열곡' },
      '星潮港': { 'zh-TW': '星潮港', 'zh-CN': '星潮港', en: 'Starsea Port', ko: '성조항' },
      '珊瑚環礁': { 'zh-TW': '珊瑚環礁', 'zh-CN': '珊瑚环礁', en: 'Coral Atoll', ko: '산호 환초' },
      '桃花島': { 'zh-TW': '桃花島', 'zh-CN': '桃花岛', en: 'Peach Blossom Isle', ko: '도화도' },
      '潮汐試煉島': { 'zh-TW': '潮汐試煉島', 'zh-CN': '潮汐试炼岛', en: 'Tidal Trial Isle', ko: '조석 시련도' },
      '蓬萊觀測島': { 'zh-TW': '蓬萊觀測島', 'zh-CN': '蓬莱观测岛', en: 'Penglai Observation Isle', ko: '봉래 관측도' },
      '光明頂': { 'zh-TW': '光明頂', 'zh-CN': '光明顶', en: 'Brightpeak Summit', ko: '광명정' },
      '無光礦坑': { 'zh-TW': '無光礦坑', 'zh-CN': '无光矿坑', en: 'Lightless Mine', ko: '무광 광산' },
      '黑木崖': { 'zh-TW': '黑木崖', 'zh-CN': '黑木崖', en: 'Blackwood Cliff', ko: '흑목애' },
      '天機遺都': { 'zh-TW': '天機遺都', 'zh-CN': '天机遗都', en: 'Celestial Mechanism Ruins', ko: '천기 유도' },
      '死亡之海': { 'zh-TW': '死亡之海', 'zh-CN': '死亡之海', en: 'Sea of Death', ko: '사망의 해' }
    },

    npcDisplayNames: {
      '灰帳記錄員': { 'zh-TW': '灰帳記錄員', 'zh-CN': '灰账记录员', en: 'Gray Ledger Recorder', ko: '회장 기록원' },
      '轉運站調度員': { 'zh-TW': '轉運站調度員', 'zh-CN': '转运站调度员', en: 'Transit Dispatcher', ko: '환적장 조정원' },
      '工坊試樣師': { 'zh-TW': '工坊試樣師', 'zh-CN': '工坊试样师', en: 'Workshop Assayer', ko: '공방 시료 감정사' },
      '滲透聯絡員': { 'zh-TW': '滲透聯絡員', 'zh-CN': '渗透联络员', en: 'Infiltration Liaison', ko: '잠입 연락원' },
      '四巨頭': { 'zh-TW': '四巨頭', 'zh-CN': '四巨头', en: 'Four Commanders', ko: '사대 거두' },
      '季衡': { 'zh-TW': '季衡', 'zh-CN': '季衡', en: 'Ji Heng', ko: '계형' },
      '牡丹': { 'zh-TW': '牡丹', 'zh-CN': '牡丹', en: 'Peony', ko: '모란' },
      '小周': { 'zh-TW': '小周', 'zh-CN': '小周', en: 'Zhou', ko: '샤오저우' },
      '老船伕': { 'zh-TW': '老船伕', 'zh-CN': '老船夫', en: 'Old Boatman', ko: '늙은 뱃사공' },
      '聯絡員': { 'zh-TW': '聯絡員', 'zh-CN': '联络员', en: 'Liaison', ko: '연락원' },
      '摩爾・Digital鑑價員': { 'zh-TW': '摩爾・Digital鑑價員', 'zh-CN': '摩尔・Digital鉴价员', en: 'Moore, Digital Appraiser', ko: '모어 · 디지털 감정원' },
      '艾洛・Renaiss鑑價員': { 'zh-TW': '艾洛・Renaiss鑑價員', 'zh-CN': '艾洛・Renaiss鉴价员', en: 'Aero, Renaiss Appraiser', ko: '에어로 · 르네이스 감정원' }
    },

    enemyDisplayNames: {
      '可達鴨': { 'zh-TW': '可達鴨', 'zh-CN': '可达鸭', en: 'Psyduck', ko: '고라파덕' },
      '可达鸭': { 'zh-TW': '可達鴨', 'zh-CN': '可达鸭', en: 'Psyduck', ko: '고라파덕' },
      '哥布林': { 'zh-TW': '哥布林', 'zh-CN': '哥布林', en: 'Goblin', ko: '고블린' },
      '神秘男子': { 'zh-TW': '神秘男子', 'zh-CN': '神秘男子', en: 'Mysterious Man', ko: '수수께끼의 남자' },
      '輕聲道': { 'zh-TW': '輕聲道', 'zh-CN': '轻声道', en: 'Whisperpath', ko: '작게 속삭인 자' },
      '匿名滲透者': { 'zh-TW': '可疑尾隨者', 'zh-CN': '可疑尾随者', en: 'Suspicious Tail', ko: '수상한 추적자' },
      '匿名渗透者': { 'zh-TW': '可疑尾隨者', 'zh-CN': '可疑尾随者', en: 'Suspicious Tail', ko: '수상한 추적자' }
    },

    termDisplayNames: {
      '封存艙': { 'zh-TW': '封存艙', 'zh-CN': '封存舱', en: 'sealed pod', ko: '봉인 포드' },
      '封存舱': { 'zh-TW': '封存艙', 'zh-CN': '封存舱', en: 'sealed pod', ko: '봉인 포드' },
      '工坊碎件': { 'zh-TW': '工坊碎件', 'zh-CN': '工坊碎件', en: 'workshop fragments', ko: '공방 파편' },
      '工坊試樣': { 'zh-TW': '工坊試樣', 'zh-CN': '工坊试样', en: 'workshop sample', ko: '공방 시료' },
      '茶棚': { 'zh-TW': '茶棚', 'zh-CN': '茶棚', en: 'tea stall', ko: '찻집 노점' },
      '渡船棧道': { 'zh-TW': '渡船棧道', 'zh-CN': '渡船栈道', en: 'ferry gangway', ko: '나룻배 잔교' },
      '蘆葦灣': { 'zh-TW': '蘆葦灣', 'zh-CN': '芦苇湾', en: 'reed cove', ko: '갈대 만' },
      '港務塔': { 'zh-TW': '港務塔', 'zh-CN': '港务塔', en: 'port tower', ko: '항무 탑' },
      '港務估測屏': { 'zh-TW': '港務估測屏', 'zh-CN': '港务估测屏', en: 'port appraisal board', ko: '항무 감정 보드' },
      '修復臺': { 'zh-TW': '修復臺', 'zh-CN': '修复台', en: 'repair bench', ko: '수복대' },
      '修復台': { 'zh-TW': '修復臺', 'zh-CN': '修复台', en: 'repair bench', ko: '수복대' },
      '鑑價站': { 'zh-TW': '鑑價站', 'zh-CN': '鉴价站', en: 'appraisal counter', ko: '감정소' },
      '神秘鑑價站': { 'zh-TW': '神秘鑑價站', 'zh-CN': '神秘鉴价站', en: 'mysterious appraisal counter', ko: '신비 감정소' },
      'Renaiss鑑價站': { 'zh-TW': 'Renaiss鑑價站', 'zh-CN': 'Renaiss鉴价站', en: 'Renaiss appraisal counter', ko: '르네이스 감정소' }
    },

    worldEventTemplates: {
      'zh-TW': {
        battle_start: ({ actor, location, target, impact }) => `⚔️ ${actor} 在${location}與 ${target} 爆發交鋒。${impact ? ` ${impact}` : ''}`,
        battle_win: ({ actor, location, target, impact }) => `🏆 ${actor} 在${location}擊敗了 ${target}。${impact ? ` ${impact}` : ''}`,
        battle_flee: ({ actor, location, target, impact }) => `🏃 ${actor} 在${location}成功脫離 ${target} 的追擊。${impact ? ` ${impact}` : ''}`,
        battle_flee_fail: ({ actor, location, target, impact }) => `🩸 ${actor} 在${location}嘗試逃離 ${target} 失敗，局勢惡化。${impact ? ` ${impact}` : ''}`,
        pet_down: ({ actor, location, target, impact }) => `💥 ${actor} 的夥伴在${location}被 ${target} 重創倒下。${impact ? ` ${impact}` : ''}`,
        player_down: ({ actor, location, target, impact }) => `☠️ ${actor} 在${location}與 ${target} 一戰中敗亡。${impact ? ` ${impact}` : ''}`,
        npc_respawn: ({ target }) => `✨ ${target} 康復歸來！`,
        npc_death: ({ target, actor, impact }) => `💀 NPC ${target} 已被 ${actor} 擊殺！${impact ? ` ${impact}` : ''}`,
        monster_death: ({ target, actor, impact }) => `💀 怪物 ${target} 已被 ${actor} 擊殺！${impact ? ` ${impact}` : ''}`,
        npc_defeat: ({ target, actor, impact }) => `⚔️ NPC ${target} 被 ${actor} 擊退，已撤離現場。${impact ? ` ${impact}` : ''}`
      },
      'zh-CN': {
        battle_start: ({ actor, location, target, impact }) => `⚔️ ${actor} 在${location}与 ${target} 爆发交锋。${impact ? ` ${impact}` : ''}`,
        battle_win: ({ actor, location, target, impact }) => `🏆 ${actor} 在${location}击败了 ${target}。${impact ? ` ${impact}` : ''}`,
        battle_flee: ({ actor, location, target, impact }) => `🏃 ${actor} 在${location}成功脱离 ${target} 的追击。${impact ? ` ${impact}` : ''}`,
        battle_flee_fail: ({ actor, location, target, impact }) => `🩸 ${actor} 在${location}尝试逃离 ${target} 失败，局势恶化。${impact ? ` ${impact}` : ''}`,
        pet_down: ({ actor, location, target, impact }) => `💥 ${actor} 的伙伴在${location}被 ${target} 重创倒下。${impact ? ` ${impact}` : ''}`,
        player_down: ({ actor, location, target, impact }) => `☠️ ${actor} 在${location}与 ${target} 一战中败亡。${impact ? ` ${impact}` : ''}`,
        npc_respawn: ({ target }) => `✨ ${target} 康复归来！`,
        npc_death: ({ target, actor, impact }) => `💀 NPC ${target} 已被 ${actor} 击杀！${impact ? ` ${impact}` : ''}`,
        monster_death: ({ target, actor, impact }) => `💀 怪物 ${target} 已被 ${actor} 击杀！${impact ? ` ${impact}` : ''}`,
        npc_defeat: ({ target, actor, impact }) => `⚔️ NPC ${target} 被 ${actor} 击退，已撤离现场。${impact ? ` ${impact}` : ''}`
      },
      en: {
        battle_start: ({ actor, location, target, impact }) => `⚔️ ${actor} clashed with ${target} at ${location}.${impact ? ` ${impact}` : ''}`,
        battle_win: ({ actor, location, target, impact }) => `🏆 ${actor} defeated ${target} at ${location}.${impact ? ` ${impact}` : ''}`,
        battle_flee: ({ actor, location, target, impact }) => `🏃 ${actor} escaped ${target}'s pursuit at ${location}.${impact ? ` ${impact}` : ''}`,
        battle_flee_fail: ({ actor, location, target, impact }) => `🩸 ${actor} failed to escape ${target} at ${location}, and the situation worsened.${impact ? ` ${impact}` : ''}`,
        pet_down: ({ actor, location, target, impact }) => `💥 ${actor}'s partner was knocked down by ${target} at ${location}.${impact ? ` ${impact}` : ''}`,
        player_down: ({ actor, location, target, impact }) => `☠️ ${actor} was defeated by ${target} at ${location}.${impact ? ` ${impact}` : ''}`,
        npc_respawn: ({ target }) => `✨ ${target} has recovered and returned!`,
        npc_death: ({ target, actor, impact }) => `💀 NPC ${target} was killed by ${actor}.${impact ? ` ${impact}` : ''}`,
        monster_death: ({ target, actor, impact }) => `💀 Monster ${target} was killed by ${actor}.${impact ? ` ${impact}` : ''}`,
        npc_defeat: ({ target, actor, impact }) => `⚔️ NPC ${target} was driven off by ${actor}.${impact ? ` ${impact}` : ''}`
      },
      ko: {
        battle_start: ({ actor, location, target, impact }) => `⚔️ ${actor}이(가) ${location}에서 ${target}와 충돌했다.${impact ? ` ${impact}` : ''}`,
        battle_win: ({ actor, location, target, impact }) => `🏆 ${actor}이(가) ${location}에서 ${target}을(를) 쓰러뜨렸다.${impact ? ` ${impact}` : ''}`,
        battle_flee: ({ actor, location, target, impact }) => `🏃 ${actor}이(가) ${location}에서 ${target}의 추격을 따돌렸다.${impact ? ` ${impact}` : ''}`,
        battle_flee_fail: ({ actor, location, target, impact }) => `🩸 ${actor}이(가) ${location}에서 ${target}에게서 벗어나지 못했고 국면이 악화됐다.${impact ? ` ${impact}` : ''}`,
        pet_down: ({ actor, location, target, impact }) => `💥 ${actor}의 동료가 ${location}에서 ${target}에게 크게 당해 쓰러졌다.${impact ? ` ${impact}` : ''}`,
        player_down: ({ actor, location, target, impact }) => `☠️ ${actor}이(가) ${location}에서 ${target}에게 패배했다.${impact ? ` ${impact}` : ''}`,
        npc_respawn: ({ target }) => `✨ ${target}이(가) 회복되어 돌아왔다!`,
        npc_death: ({ target, actor, impact }) => `💀 NPC ${target}이(가) ${actor}에게 쓰러졌다.${impact ? ` ${impact}` : ''}`,
        monster_death: ({ target, actor, impact }) => `💀 몬스터 ${target}이(가) ${actor}에게 쓰러졌다.${impact ? ` ${impact}` : ''}`,
        npc_defeat: ({ target, actor, impact }) => `⚔️ NPC ${target}이(가) ${actor}에게 밀려 현장에서 이탈했다.${impact ? ` ${impact}` : ''}`
      }
    },

    // Used by: modules/systems/ui/player-panel-utils.js
    playerPanelText: {
      'zh-TW': {
        skillChipPrefix: '技能晶片：',
        fusionBlockedItems: ['乾糧一包', '水囊'],
        fusionSlots: {
          helmet: '頭盔（攻擊）',
          armor: '盔甲（生命+防禦）',
          belt: '腰帶（生命）',
          shoes: '鞋子（速度）',
          unknown: '未知槽位'
        },
        finance: {
          notFound: '❌ 找不到角色！',
          title: '💸 資金流水',
          desc: '以下為你最近的收入與支出紀錄。',
          currentRns: '💰 目前 Rns',
          unreadNotices: '📬 未讀金流通知',
          recentLedger: '📒 最近 20 筆流水',
          noUnread: '（目前無未讀）',
          tokenUnit: 'Rns 代幣',
          backInventory: '🎒 返回背包',
          backMenu: '返回主選單'
        },
        memoryAudit: {
          notFound: '❌ 找不到角色！',
          noRecords: '暫無記錄',
          title: '🧠 記憶檢查',
          desc: '查看每回合寫入記憶的內容，以及為何被判定需要保留。',
          streamTitle: '最近24筆流水',
          categorySummary: '📊 類別分佈',
          categoryDefault: '一般記憶',
          backMenu: '返回主選單'
        },
        codex: {
          overviewTitle: '📚 圖鑑總覽',
          overviewDesc: '可分開查看 NPC 圖鑑與技能圖鑑。未收集項目只顯示數量，不顯示名稱。',
          npcProgress: '🤝 NPC 圖鑑進度',
          skillProgress: '🧬 技能圖鑑進度',
          unknownCount: '🕶️ 未收集（隱藏名稱）',
          npcButton: '🤝 NPC圖鑑',
          skillButton: '🧬 技能圖鑑',
          npcTitle: '🤝 NPC 圖鑑',
          npcCollected: '已收集 NPC',
          npcUnknown: '未收集 NPC',
          npcEmpty: '（尚未遇到 NPC）',
          skillTitle: '🧬 技能圖鑑',
          skillCollected: '已收集技能',
          skillUnknown: '未收集技能',
          skillEmpty: '（尚未抽到技能）',
          backCodex: '📚 回圖鑑',
          canFight: '可交鋒',
          canDraw: '可抽取'
        },
        moves: {
          notFoundPlayer: '❌ 找不到角色！',
          noPet: '❌ 沒有寵物！',
          statusFixed: '🏃固定',
          statusInnate: '🛠️固有',
          statusCarried: '✅攜帶',
          tierEpic: '史詩',
          tierRare: '稀有',
          tierCommon: '普通',
          effectNone: '無效果',
          dotTick2: (value, detail) => `\n   ⏱️ 持續傷害第2跳：${value}（${detail}）`,
          noAttackMoves: '（無招式）',
          noSkillChips: '（背包目前沒有技能晶片）',
          noAttackLearned: '（尚未學習攻擊招式）',
          notLearnable: '不可學',
          reasonNotLearnable: '不可學',
          reasonUnknownSkill: '未知技能',
          reasonElementMismatch: '屬性不符',
          reasonLearned: '已學會',
          markLearnable: '✅可學',
          markLearned: '📘已學',
          markBlocked: '🚫不可學',
          manage: (name, element) => `**目前管理：${name}**（${element}）`,
          formula: '傷害公式：**基礎傷害 + 攻擊加成**（攻擊加成 = ⌊ATK × 0.2⌋）',
          petAtk: (atk, bonus, scaleText) => `本寵 ATK ${atk} → 攻擊加成 +${bonus}${scaleText}`,
          dotHint: '持續傷害：列表顯示「第2跳」預估值（若效果不足2回合則不顯示）',
          learnHint: '學習入口：請用下拉選單「學習技能晶片」',
          sortHint: '學習清單排序：史詩 > 稀有 > 普通',
          unlearnHint: '取消學習：會退回技能晶片到背包，可拿去賣',
          loadoutRule: (cap) => `上陣規則：已學會的攻擊招式會自動上陣；上限 **${cap}**（逃跑不占名額）`,
          loadoutNow: (count, cap, full) => `目前上陣名額：${count}/${cap}${full ? '（已滿；點選學習時會提示先取消一招）' : ''}`,
          unlocked: (n) => `已解鎖招式：${n}`,
          chips: (all, learnableCount, learnableKinds) => `背包晶片：${all} 枚｜可學：${learnableCount} 枚 / ${learnableKinds} 種`,
          blockedReasons: (text) => `目前不可學原因：${text}`,
          upgradePoints: (points, hp) => `升級點數：${points} 點（每點 +${hp} HP，可批量）`,
          activePet: (name) => `主上場寵物：${name}`,
          title: '🐾 寵物管理',
          fieldMoves: (name, p, t) => `🧭 ${name} 招式清單（第 ${p}/${t} 頁）`,
          fieldChips: (p, t) => `🎒 可學習技能晶片（第 ${p}/${t} 頁）`,
          fieldOverview: '🐾 全寵物攜帶總覽',
          carriedSummary: (n, cap, names) => `攜帶：${n}/${cap}｜${names}`,
          petSelectDesc: (n, cap) => `攜帶 ${n}/${cap} 招`,
          petSelectPlaceholder: '選擇要管理的寵物',
          learnPlaceholder: (n) => `學習技能晶片（${n} 枚，依稀有度）`,
          unlearnPlaceholder: '取消學習（依稀有度，退回技能晶片）',
          prevPage: '⬅️ 上一頁',
          nextPage: '➡️ 下一頁',
          setMain: '🎯 設主上場',
          activeMain: '✅ 主上場',
          profile: '💳 檔案',
          allocHp: (remain) => `❤️ 自訂加點（可分配 ${remain}）`,
          equipment: '🛡️ 目前裝備',
          pointHint: (hp, remain) => `每點 +${hp} HP｜目前可分配 ${remain} 點`,
          damageInstantLabel: '直傷',
          damageTotalLabel: '總傷',
          speedLabel: '速度',
          damageInstantShort: '直',
          damageTotalShort: '總',
          unknownElement: '未知',
          elementBalanceSuffix: (scale) => `｜屬性平衡 x${scale}`
        },
        inventory: {
          notFoundPlayer: '❌ 找不到角色！',
          bagTitle: (name) => `🎒 ${name} 的行囊`,
          pageLabel: (view, page, total) => `目前分頁：${view}（第 ${page}/${total} 頁）`,
          carrying: '你身上攜帶的物品',
          fusionReady: (count) => `寶物融合：可用藏品 ${count} 件（需 3 件）`,
          tabItems: '📦 物品',
          tabGoods: '🧰 藏品',
          tabEquipment: '🛡️ 裝備',
          goodsField: (p, t) => `🧰 藏品（第 ${p}/${t} 頁）`,
          equipWorn: (count) => `🛡️ 目前穿戴（背包 ${count} 件）`,
          equipBonus: '📈 裝備總加成',
          equipBag: (p, t) => `🎒 裝備背包（第 ${p}/${t} 頁）`,
          itemField: (p, t) => `📦 物品（第 ${p}/${t} 頁）`,
          herbField: (p, t) => `🌿 草藥（第 ${p}/${t} 頁）`,
          prevPage: '⬅️ 上一頁',
          nextPage: '➡️ 下一頁',
          fusionButton: '🧪 融合寶物',
          empty: '（空）',
          tokenUnit: 'Rns 代幣',
          sourceLabelInventory: '背包',
          sourceLabelGoods: '藏品'
        },
        equipment: {
          notEquipped: '未裝備',
          unnamedGear: '未命名裝備',
          estimateLabel: '估值',
          totalBonus: '總加成',
          noPetEquipmentData: '（尚未有寵物裝備資料）',
          noPetEquipped: '（目前尚未有任何寵物穿戴裝備）',
          petLabel: '寵物',
          notFoundPlayer: '❌ 找不到角色！',
          title: '🛡️ 寵物裝備管理',
          currentPet: '目前寵物',
          intro: '每隻寵物可獨立穿戴頭盔/盔甲/腰帶/鞋子。',
          slotsTitle: '🎯 裝備欄位',
          loreTitle: '📜 裝備敘述',
          loreEmpty: '（目前沒有裝備敘述）',
          ownershipTitle: '🐾 裝備歸屬',
          equipPlaceholder: '從裝備背包裝上到目前寵物',
          unequipPlaceholder: '拆下目前寵物的已裝備欄位',
          backPetPanel: '🐾 返回寵物管理',
          profile: '💳 檔案',
          bagNo: '背包編號',
          unequipHint: '拆下後會回到裝備背包',
          petDataExpired: '⚠️ 寵物資料失效，請重新開啟裝備頁。',
          equipFailed: '⚠️ 無法裝備，請重新選擇。',
          unequipFailed: '⚠️ 拆裝失敗，請重新操作。',
          gearWord: '裝備',
          equipSuccess: (petName, equippedName) => `✅ 已為 ${petName} 裝上：${equippedName}`,
          unequipSuccess: (unequippedName) => `↩️ 已拆下：${unequippedName}`
        }
      },
      'zh-CN': {
        skillChipPrefix: '技能晶片：',
        fusionBlockedItems: ['乾糧一包', '水囊'],
        fusionSlots: {
          helmet: '头盔（攻击）',
          armor: '盔甲（生命+防御）',
          belt: '腰带（生命）',
          shoes: '鞋子（速度）',
          unknown: '未知槽位'
        },
        finance: {
          notFound: '❌ 找不到角色！',
          title: '💸 资金流水',
          desc: '以下为你最近的收入与支出记录。',
          currentRns: '💰 当前 Rns',
          unreadNotices: '📬 未读金流通知',
          recentLedger: '📒 最近 20 笔流水',
          noUnread: '（目前无未读）',
          tokenUnit: 'Rns 代币',
          backInventory: '🎒 返回背包',
          backMenu: '返回主选单'
        },
        memoryAudit: {
          notFound: '❌ 找不到角色！',
          noRecords: '暂无记录',
          title: '🧠 记忆检查',
          desc: '查看每回合写入记忆的内容，以及为何被判定需要保留。',
          streamTitle: '最近24笔流水',
          categorySummary: '📊 类别分布',
          categoryDefault: '一般记忆',
          backMenu: '返回主选单'
        },
        codex: {
          overviewTitle: '📚 图鉴总览',
          overviewDesc: '可分开查看 NPC 图鉴与技能图鉴。未收集项目只显示数量，不显示名称。',
          npcProgress: '🤝 NPC 图鉴进度',
          skillProgress: '🧬 技能图鉴进度',
          unknownCount: '🕶️ 未收集（隐藏名称）',
          npcButton: '🤝 NPC图鉴',
          skillButton: '🧬 技能图鉴',
          npcTitle: '🤝 NPC 图鉴',
          npcCollected: '已收集 NPC',
          npcUnknown: '未收集 NPC',
          npcEmpty: '（尚未遇到 NPC）',
          skillTitle: '🧬 技能图鉴',
          skillCollected: '已收集技能',
          skillUnknown: '未收集技能',
          skillEmpty: '（尚未抽到技能）',
          backCodex: '📚 回图鉴',
          canFight: '可交锋',
          canDraw: '可抽取'
        },
        moves: {
          notFoundPlayer: '❌ 找不到角色！',
          noPet: '❌ 没有宠物！',
          statusFixed: '🏃固定',
          statusInnate: '🛠️固有',
          statusCarried: '✅携带',
          tierEpic: '史诗',
          tierRare: '稀有',
          tierCommon: '普通',
          effectNone: '无效果',
          dotTick2: (value, detail) => `\n   ⏱️ 持续伤害第2跳：${value}（${detail}）`,
          noAttackMoves: '（无招式）',
          noSkillChips: '（背包目前没有技能晶片）',
          noAttackLearned: '（尚未学习攻击招式）',
          notLearnable: '不可学',
          reasonNotLearnable: '不可学',
          reasonUnknownSkill: '未知技能',
          reasonElementMismatch: '属性不符',
          reasonLearned: '已学会',
          markLearnable: '✅可学',
          markLearned: '📘已学',
          markBlocked: '🚫不可学',
          manage: (name, element) => `**当前管理：${name}**（${element}）`,
          formula: '伤害公式：**基础伤害 + 攻击加成**（攻击加成 = ⌊ATK × 0.2⌋）',
          petAtk: (atk, bonus, scaleText) => `本宠 ATK ${atk} → 攻击加成 +${bonus}${scaleText}`,
          dotHint: '持续伤害：列表显示「第2跳」估算值（效果不足2回合时不显示）',
          learnHint: '学习入口：请使用下拉选单「学习技能晶片」',
          sortHint: '学习清单排序：史诗 > 稀有 > 普通',
          unlearnHint: '取消学习会退回技能晶片到背包，可拿去卖',
          loadoutRule: (cap) => `上阵规则：已学会的攻击招式会自动上阵；上限 **${cap}**（逃跑不占名额）`,
          loadoutNow: (count, cap, full) => `当前上阵名额：${count}/${cap}${full ? '（已满；请先取消一招）' : ''}`,
          unlocked: (n) => `已解锁招式：${n}`,
          chips: (all, learnableCount, learnableKinds) => `背包晶片：${all} 枚｜可学：${learnableCount} 枚 / ${learnableKinds} 种`,
          blockedReasons: (text) => `当前不可学原因：${text}`,
          upgradePoints: (points, hp) => `升级点数：${points} 点（每点 +${hp} HP，可批量）`,
          activePet: (name) => `主上场宠物：${name}`,
          title: '🐾 宠物管理',
          fieldMoves: (name, p, t) => `🧭 ${name} 招式清单（第 ${p}/${t} 页）`,
          fieldChips: (p, t) => `🎒 可学习技能晶片（第 ${p}/${t} 页）`,
          fieldOverview: '🐾 全宠物携带总览',
          carriedSummary: (n, cap, names) => `携带：${n}/${cap}｜${names}`,
          petSelectDesc: (n, cap) => `携带 ${n}/${cap} 招`,
          petSelectPlaceholder: '选择要管理的宠物',
          learnPlaceholder: (n) => `学习技能晶片（${n} 枚，依稀有度）`,
          unlearnPlaceholder: '取消学习（依稀有度，退回技能晶片）',
          prevPage: '⬅️ 上一页',
          nextPage: '➡️ 下一页',
          setMain: '🎯 设主上场',
          activeMain: '✅ 主上场',
          profile: '💳 档案',
          allocHp: (remain) => `❤️ 自定义加点（可分配 ${remain}）`,
          equipment: '🛡️ 当前装备',
          pointHint: (hp, remain) => `每点 +${hp} HP｜当前可分配 ${remain} 点`,
          damageInstantLabel: '直伤',
          damageTotalLabel: '总伤',
          speedLabel: '速度',
          damageInstantShort: '直',
          damageTotalShort: '总',
          unknownElement: '未知',
          elementBalanceSuffix: (scale) => `｜属性平衡 x${scale}`
        },
        inventory: {
          notFoundPlayer: '❌ 找不到角色！',
          bagTitle: (name) => `🎒 ${name} 的行囊`,
          pageLabel: (view, page, total) => `当前分页：${view}（第 ${page}/${total} 页）`,
          carrying: '你身上携带的物品',
          fusionReady: (count) => `宝物融合：可用藏品 ${count} 件（需 3 件）`,
          tabItems: '📦 物品',
          tabGoods: '🧰 藏品',
          tabEquipment: '🛡️ 装备',
          goodsField: (p, t) => `🧰 藏品（第 ${p}/${t} 页）`,
          equipWorn: (count) => `🛡️ 当前穿戴（背包 ${count} 件）`,
          equipBonus: '📈 装备总加成',
          equipBag: (p, t) => `🎒 装备背包（第 ${p}/${t} 页）`,
          itemField: (p, t) => `📦 物品（第 ${p}/${t} 页）`,
          herbField: (p, t) => `🌿 草药（第 ${p}/${t} 页）`,
          prevPage: '⬅️ 上一页',
          nextPage: '➡️ 下一页',
          fusionButton: '🧪 融合宝物',
          empty: '（空）',
          tokenUnit: 'Rns 代币',
          sourceLabelInventory: '背包',
          sourceLabelGoods: '藏品'
        },
        equipment: {
          notEquipped: '未装备',
          unnamedGear: '未命名装备',
          estimateLabel: '估值',
          totalBonus: '总加成',
          noPetEquipmentData: '（暂无宠物装备资料）',
          noPetEquipped: '（目前尚无宠物穿戴装备）',
          petLabel: '宠物',
          notFoundPlayer: '❌ 找不到角色！',
          title: '🛡️ 宠物装备管理',
          currentPet: '当前宠物',
          intro: '每只宠物可独立穿戴头盔/盔甲/腰带/鞋子。',
          slotsTitle: '🎯 装备栏位',
          loreTitle: '📜 装备叙述',
          loreEmpty: '（目前没有装备叙述）',
          ownershipTitle: '🐾 装备归属',
          equipPlaceholder: '从装备背包装上到当前宠物',
          unequipPlaceholder: '拆下当前宠物的已装备栏位',
          backPetPanel: '🐾 返回宠物管理',
          profile: '💳 档案',
          bagNo: '背包编号',
          unequipHint: '拆下后会回到装备背包',
          petDataExpired: '⚠️ 宠物资料失效，请重新打开装备页。',
          equipFailed: '⚠️ 无法装备，请重新选择。',
          unequipFailed: '⚠️ 拆装失败，请重新操作。',
          gearWord: '装备',
          equipSuccess: (petName, equippedName) => `✅ 已为 ${petName} 装上：${equippedName}`,
          unequipSuccess: (unequippedName) => `↩️ 已拆下：${unequippedName}`
        }
      },
      ko: {
        skillChipPrefix: '스킬 칩: ',
        fusionBlockedItems: ['건량 한 팩', '물 주머니'],
        fusionSlots: {
          helmet: '헬멧 (공격력)',
          armor: '갑옷 (HP+방어력)',
          belt: '벨트 (HP)',
          shoes: '신발 (속도)',
          unknown: '알 수 없는 슬롯'
        },
        inventory: {
          notFoundPlayer: '❌ 캐릭터를 찾을 수 없습니다!',
          bagTitle: (name) => `🎒 ${name}의 가방`,
          pageLabel: (view, page, total) => `현재 탭: ${view} (페이지 ${page}/${total})`,
          carrying: '현재 소지 중인 아이템',
          fusionReady: (count) => `융합: 사용 가능한 수집품 ${count}개 (필요 3개)`,
          tabItems: '📦 아이템',
          tabGoods: '🧰 수집품',
          tabEquipment: '🛡️ 장비',
          goodsField: (p, t) => `🧰 수집품 (페이지 ${p}/${t})`,
          equipWorn: (count) => `🛡️ 장착 중 (가방 ${count})`,
          equipBonus: '📈 장비 보너스',
          equipBag: (p, t) => `🎒 장비 가방 (페이지 ${p}/${t})`,
          itemField: (p, t) => `📦 아이템 (페이지 ${p}/${t})`,
          herbField: (p, t) => `🌿 약초 (페이지 ${p}/${t})`,
          prevPage: '⬅️ 이전',
          nextPage: '➡️ 다음',
          fusionButton: '🧪 수집품 융합',
          empty: '(비어 있음)',
          tokenUnit: 'Rns',
          sourceLabelInventory: '가방',
          sourceLabelGoods: '수집품'
        },
        equipment: {
          notEquipped: '장착 안 됨',
          unnamedGear: '이름 없는 장비',
          estimateLabel: '평가가',
          totalBonus: '총 보너스',
          noPetEquipmentData: '(펫 장비 데이터가 없습니다)',
          noPetEquipped: '(장비를 착용한 펫이 아직 없습니다)',
          petLabel: '펫',
          notFoundPlayer: '❌ 캐릭터를 찾을 수 없습니다!',
          title: '🛡️ 펫 장비 관리',
          currentPet: '현재 펫',
          intro: '각 펫은 헬멧/갑옷/벨트/신발 슬롯을 독립적으로 사용합니다.',
          slotsTitle: '🎯 장비 슬롯',
          loreTitle: '📜 장비 설명',
          loreEmpty: '(장비 설명이 없습니다)',
          ownershipTitle: '🐾 장비 소유 현황',
          equipPlaceholder: '가방에서 현재 펫에게 장착',
          unequipPlaceholder: '현재 펫 슬롯 장비 해제',
          backPetPanel: '🐾 펫 관리로 돌아가기',
          profile: '💳 프로필',
          bagNo: '가방',
          unequipHint: '해제하면 장비 가방으로 돌아갑니다',
          petDataExpired: '⚠️ 펫 데이터가 만료되었습니다. 장비 페이지를 다시 열어 주세요.',
          equipFailed: '⚠️ 장착할 수 없습니다. 다시 선택해 주세요.',
          unequipFailed: '⚠️ 해제에 실패했습니다. 다시 시도해 주세요.',
          gearWord: '장비',
          equipSuccess: (petName, equippedName) => `✅ ${petName}에게 장착: ${equippedName}`,
          unequipSuccess: (unequippedName) => `↩️ 장비 해제: ${unequippedName}`
        }
      },
      en: {
        skillChipPrefix: 'Skill Chip: ',
        fusionBlockedItems: ['Ration Pack', 'Water Flask'],
        fusionSlots: {
          helmet: 'Helmet (ATK)',
          armor: 'Armor (HP+DEF)',
          belt: 'Belt (HP)',
          shoes: 'Shoes (SPD)',
          unknown: 'Unknown Slot'
        },
        finance: {
          notFound: '❌ Character not found!',
          title: '💸 Cashflow Ledger',
          desc: 'Recent income and expense records are listed below.',
          currentRns: '💰 Current Rns',
          unreadNotices: '📬 Unread Cashflow Notices',
          recentLedger: '📒 Latest 20 Ledger Entries',
          noUnread: '(No unread notices)',
          tokenUnit: 'Rns',
          backInventory: '🎒 Back to Inventory',
          backMenu: 'Back to Menu'
        },
        memoryAudit: {
          notFound: '❌ Character not found!',
          noRecords: 'No records',
          title: '🧠 Memory Audit',
          desc: 'Detailed log of what was written into memory each turn and why.',
          streamTitle: 'Recent 24 Records',
          categorySummary: '📊 Category Summary',
          categoryDefault: 'General',
          backMenu: 'Back to Menu'
        },
        codex: {
          overviewTitle: '📚 Codex Overview',
          overviewDesc: 'NPC Codex and Skill Codex are separated. Uncollected entries show counts only.',
          npcProgress: '🤝 NPC Progress',
          skillProgress: '🧬 Skill Progress',
          unknownCount: '🕶️ Uncollected (hidden names)',
          npcButton: '🤝 NPC Codex',
          skillButton: '🧬 Skill Codex',
          npcTitle: '🤝 NPC Codex',
          npcCollected: 'Collected NPCs',
          npcUnknown: 'Uncollected NPCs',
          npcEmpty: '(none yet)',
          skillTitle: '🧬 Skill Codex',
          skillCollected: 'Collected Skills',
          skillUnknown: 'Uncollected Skills',
          skillEmpty: '(none yet)',
          backCodex: '📚 Back Codex',
          canFight: 'Fightable',
          canDraw: 'Drawable'
        },
        moves: {
          notFoundPlayer: '❌ Character not found!',
          noPet: '❌ No pet found!',
          statusFixed: '🏃Fixed',
          statusInnate: '🛠️Innate',
          statusCarried: '✅Carried',
          tierEpic: 'Epic',
          tierRare: 'Rare',
          tierCommon: 'Common',
          effectNone: 'No effect',
          dotTick2: (value, detail) => `\n   ⏱️ DoT Tick #2: ${value} (${detail})`,
          noAttackMoves: '(No moves)',
          noSkillChips: '(No skill chips in bag)',
          noAttackLearned: '(No attack move learned yet)',
          notLearnable: 'Not learnable',
          reasonNotLearnable: 'Not learnable',
          reasonUnknownSkill: 'Unknown skill',
          reasonElementMismatch: 'Element mismatch',
          reasonLearned: 'Already learned',
          markLearnable: '✅Learnable',
          markLearned: '📘Learned',
          markBlocked: '🚫Blocked',
          manage: (name, element) => `**Managing: ${name}** (${element})`,
          formula: 'Damage Formula: **Base Damage + ATK Bonus** (ATK Bonus = ⌊ATK × 0.2⌋)',
          petAtk: (atk, bonus, scaleText) => `This pet ATK ${atk} -> Bonus +${bonus}${scaleText}`,
          dotHint: 'DoT display: shows expected Tick #2 only (hidden when duration < 2 turns).',
          learnHint: 'Learn entry: use dropdown "Learn Skill Chip".',
          sortHint: 'Learn list sorting: Epic > Rare > Common.',
          unlearnHint: 'Unlearn returns chip back to bag for selling/reuse.',
          loadoutRule: (cap) => `Loadout rule: learned attack moves auto-carry; cap **${cap}** (Flee excluded).`,
          loadoutNow: (count, cap, full) => `Current loadout slots: ${count}/${cap}${full ? ' (full; unlearn one first)' : ''}`,
          unlocked: (n) => `Unlocked moves: ${n}`,
          chips: (all, learnableCount, learnableKinds) => `Skill chips in bag: ${all} | Learnable: ${learnableCount} / ${learnableKinds} types`,
          blockedReasons: (text) => `Blocked reasons: ${text}`,
          upgradePoints: (points, hp) => `Upgrade points: ${points} (+${hp} HP each, batch supported)`,
          activePet: (name) => `Active pet: ${name}`,
          title: '🐾 Pet Management',
          fieldMoves: (name, p, t) => `🧭 ${name} Move List (Page ${p}/${t})`,
          fieldChips: (p, t) => `🎒 Learnable Skill Chips (Page ${p}/${t})`,
          fieldOverview: '🐾 Team Carry Overview',
          carriedSummary: (n, cap, names) => `Carried: ${n}/${cap} | ${names}`,
          petSelectDesc: (n, cap) => `Carried ${n}/${cap} moves`,
          petSelectPlaceholder: 'Select a pet to manage',
          learnPlaceholder: (n) => `Learn Skill Chip (${n} total, by rarity)`,
          unlearnPlaceholder: 'Unlearn move (returns chip, by rarity)',
          prevPage: '⬅️ Prev',
          nextPage: '➡️ Next',
          setMain: '🎯 Set Active',
          activeMain: '✅ Active',
          profile: '💳 Profile',
          allocHp: (remain) => `❤️ Allocate HP (${remain} available)`,
          equipment: '🛡️ Equipment',
          pointHint: (hp, remain) => `+${hp} HP / point | ${remain} points available`,
          damageInstantLabel: 'Hit',
          damageTotalLabel: 'Total',
          speedLabel: 'Speed',
          damageInstantShort: 'Hit',
          damageTotalShort: 'Total',
          unknownElement: 'Unknown',
          elementBalanceSuffix: (scale) => ` | element balance x${scale}`
        },
        inventory: {
          notFoundPlayer: '❌ Character not found!',
          bagTitle: (name) => `🎒 ${name}'s Bag`,
          pageLabel: (view, page, total) => `Current Tab: ${view} (Page ${page}/${total})`,
          carrying: 'Items currently carried',
          fusionReady: (count) => `Fusion: ${count} eligible collectibles (need 3)`,
          tabItems: '📦 Items',
          tabGoods: '🧰 Collectibles',
          tabEquipment: '🛡️ Equipment',
          goodsField: (p, t) => `🧰 Collectibles (Page ${p}/${t})`,
          equipWorn: (count) => `🛡️ Equipped (Bag ${count})`,
          equipBonus: '📈 Equipment Bonus',
          equipBag: (p, t) => `🎒 Equipment Bag (Page ${p}/${t})`,
          itemField: (p, t) => `📦 Items (Page ${p}/${t})`,
          herbField: (p, t) => `🌿 Herbs (Page ${p}/${t})`,
          prevPage: '⬅️ Prev',
          nextPage: '➡️ Next',
          fusionButton: '🧪 Fuse Collectibles',
          empty: '(Empty)',
          tokenUnit: 'Rns',
          sourceLabelInventory: 'Bag',
          sourceLabelGoods: 'Collectible'
        },
        equipment: {
          notEquipped: 'Not equipped',
          unnamedGear: 'Unnamed Gear',
          estimateLabel: 'Est.',
          totalBonus: 'Total bonus',
          noPetEquipmentData: '(No pet equipment data yet)',
          noPetEquipped: '(No pet has equipment equipped yet)',
          petLabel: 'Pet',
          notFoundPlayer: '❌ Character not found!',
          title: '🛡️ Pet Equipment',
          currentPet: 'Current pet',
          intro: 'Each pet has independent helmet/armor/belt/shoes slots.',
          slotsTitle: '🎯 Slots',
          loreTitle: '📜 Lore',
          loreEmpty: '(No lore yet)',
          ownershipTitle: '🐾 Ownership',
          equipPlaceholder: 'Equip from bag to current pet',
          unequipPlaceholder: 'Unequip current pet slot',
          backPetPanel: '🐾 Back to Pet Panel',
          profile: '💳 Profile',
          bagNo: 'Bag',
          unequipHint: 'Returns to equipment bag after unequip',
          petDataExpired: '⚠️ Pet data expired. Please reopen the equipment page.',
          equipFailed: '⚠️ Unable to equip. Please choose again.',
          unequipFailed: '⚠️ Unequip failed. Please try again.',
          gearWord: 'Gear',
          equipSuccess: (petName, equippedName) => `✅ Equipped on ${petName}: ${equippedName}`,
          unequipSuccess: (unequippedName) => `↩️ Unequipped: ${unequippedName}`
        }
      }
    },

    // Used by: modules/systems/gacha/gacha-slot-utils.js
    gachaSlotText: {
      'zh-TW': { revealPending: '🎁 技能揭曉中...' },
      'zh-CN': { revealPending: '🎁 技能揭晓中...' },
      en: { revealPending: '🎁 Revealing skill...' }
    },

    // Used by: modules/content/storyteller.js & modules/systems/market/economy-system.js
    aiLanguageDirectives: {
      'zh-TW': {
        output: '請用繁體中文輸出',
        outputFullstop: '請用繁體中文輸出。',
        plain: '請用繁體中文',
        narrate: '請用繁體中文講述'
      },
      'zh-CN': {
        output: '请用简体中文输出',
        outputFullstop: '请使用简体中文输出。',
        plain: '请用简体中文',
        narrate: '请用简体中文讲述'
      },
      ko: {
        output: '모든 출력을 한국어로 작성해 주세요',
        outputFullstop: '모든 출력을 한국어로 작성해 주세요.',
        plain: '한국어로 작성해 주세요',
        narrate: '한국어로 이야기해 주세요'
      },
      en: {
        output: 'Please output in English',
        outputFullstop: 'Please output in English.',
        plain: 'Please output in English',
        narrate: 'Please narrate in English'
      }
    },

    // Used by: modules/systems/map/map-text-utils.js
    // NOTE: Resolved dynamically in getSection('mapText', ...).
    mapText: {},

    // Used by: modules/systems/market/economy-system.js
    economyText: {
      'zh-TW': {
        noSellable: '你現在沒有可出售物品，整理背包後再來。',
        digitalMasked: ({ soldCount, total }) => `這批 ${soldCount} 件我先按 ${total} Rns 代幣幫你快速成交；想更穩，下一筆再去別家比價。`,
        digitalNormal: ({ soldCount, total }) => `這批 ${soldCount} 件我給你 ${total} Rns 代幣，成交很快；不過你也知道，這種報價會偏向櫃台。`,
        renaissEstimate: ({ soldCount, avgRatePct, total }) => `這批 ${soldCount} 件估值 ${total} Rns 代幣，約為基準價的 ${avgRatePct}%。`,
        scratchInsufficient: ({ cost, currentGold }) => `🎟️ 小賣部老闆搖頭：刮刮樂要 ${cost} Rns 代幣，你目前只有 ${currentGold} Rns 代幣。`,
        scratchWin: ({ cost, reward, net }) => `🎟️ 你刮中了！本次投入 ${cost} Rns 代幣，回收 ${reward} Rns 代幣（淨 ${net >= 0 ? '+' : ''}${net}）。`,
        scratchLoseDigital: ({ cost }) => `🎟️ 你在神秘鑑價站買的刮刮樂沒有中獎，本次投入 ${cost} Rns 代幣已投入獎池。`,
        scratchLoseRenaiss: ({ cost }) => `🎟️ 未中獎。本次投入 ${cost} Rns 代幣已投入獎池。`
      },
      'zh-CN': {
        noSellable: '你现在没有可出售物品，整理背包后再来。',
        digitalMasked: ({ soldCount, total }) => `这批 ${soldCount} 件我先按 ${total} Rns 代币帮你快速成交；想更稳，下一笔再去另一家比价。`,
        digitalNormal: ({ soldCount, total }) => `这批 ${soldCount} 件我给你 ${total} Rns 代币，成交很快；不过你也知道，这种报价会偏向柜台。`,
        renaissEstimate: ({ soldCount, avgRatePct, total }) => `这批 ${soldCount} 件估值 ${total} Rns 代币，约为基准价的 ${avgRatePct}%。`,
        scratchInsufficient: ({ cost, currentGold }) => `🎟️ 小卖部老板摇头：刮刮乐要 ${cost} Rns 代币，你目前只有 ${currentGold} Rns 代币。`,
        scratchWin: ({ cost, reward, net }) => `🎟️ 你刮中了！本次投入 ${cost} Rns 代币，回收 ${reward} Rns 代币（净 ${net >= 0 ? '+' : ''}${net}）。`,
        scratchLoseDigital: ({ cost }) => `🎟️ 你在神秘鉴价站买的刮刮乐没有中奖，本次投入 ${cost} Rns 代币已投入奖池。`,
        scratchLoseRenaiss: ({ cost }) => `🎟️ 未中奖。本次投入 ${cost} Rns 代币已投入奖池。`
      },
      en: {
        noSellable: 'No sellable items right now. Come back after collecting more materials.',
        digitalMasked: ({ soldCount, total }) => `You moved ${soldCount} items for ${total} Rns. Quick lane complete, but compare a second quote before your next sale.`,
        digitalNormal: ({ soldCount, total }) => `I can close ${soldCount} items at ${total} Rns now. It looks efficient, but this quote favors the desk.`,
        renaissEstimate: ({ soldCount, avgRatePct, total }) => `Appraised ${soldCount} items at ${total} Rns (about ${avgRatePct}% of baseline).`,
        scratchInsufficient: ({ cost, currentGold }) => `🎟️ The counter clerk shakes their head: a scratch card costs ${cost} Rns, and you only have ${currentGold} Rns.`,
        scratchWin: ({ cost, reward, net }) => `🎟️ You won the scratch card! You spent ${cost} Rns and recovered ${reward} Rns (net ${net >= 0 ? '+' : ''}${net}).`,
        scratchLoseDigital: ({ cost }) => `🎟️ Your scratch card from the mysterious appraisal counter did not win. The ${cost} Rns entry fee was added to the jackpot pool.`,
        scratchLoseRenaiss: ({ cost }) => `🎟️ No win this time. The ${cost} Rns entry fee was added to the jackpot pool.`
      },
      ko: {
        noSellable: '지금은 판매할 수 있는 아이템이 없습니다. 인벤토리를 정리한 뒤 다시 오세요.',
        digitalMasked: ({ soldCount, total }) => `${soldCount}개를 ${total} Rns 토큰에 빠르게 처리해 줄게. 더 안정적으로 가려면 다음엔 다른 곳 견적도 비교해 봐.`,
        digitalNormal: ({ soldCount, total }) => `${soldCount}개를 ${total} Rns 토큰에 처리해 줄 수 있어. 빠르긴 하지만, 이런 가격은 카운터 쪽에 유리하다는 건 알지?`,
        renaissEstimate: ({ soldCount, avgRatePct, total }) => `${soldCount}개를 ${total} Rns 토큰으로 감정했어. 기준가의 약 ${avgRatePct}% 수준이야.`,
        scratchInsufficient: ({ cost, currentGold }) => `🎟️ 가게 주인이 고개를 젓습니다: 스크래치는 ${cost} Rns 토큰이 필요하지만, 지금 당신은 ${currentGold} Rns 토큰만 가지고 있습니다.`,
        scratchWin: ({ cost, reward, net }) => `🎟️ 스크래치에 당첨됐습니다! 이번에 ${cost} Rns 토큰을 넣고 ${reward} Rns 토큰을 회수했습니다 (순익 ${net >= 0 ? '+' : ''}${net}).`,
        scratchLoseDigital: ({ cost }) => `🎟️ 신비 감정소에서 산 스크래치는 꽝이었습니다. 이번에 넣은 ${cost} Rns 토큰은 잭팟 풀로 들어갔습니다.`,
        scratchLoseRenaiss: ({ cost }) => `🎟️ 이번에는 꽝입니다. 이번에 넣은 ${cost} Rns 토큰은 잭팟 풀로 들어갔습니다.`
      }
    },

    // Used by: battle story/postflow/status surfaces
    battleText: {
      'zh-TW': {
        reviveCountdown: (remain) => `復活倒數 ${remain}回合`,
        hpRecoverySuffix: (remain) => `（復活倒數 ${remain}回合）`,
        petDownEvent: (petName, remain) => `${petName}復活倒數 ${remain}回合`,
        titleRoundDefeat: '⚠️ 本場敗退',
        titleTotalDefeat: '💀 全隊覆滅',
        titlePetDown: '🐾 寵物陣亡',
        continueButton: '📖 繼續',
        continueRetreatButton: '📖 繼續（先撤退）',
        humanTakeoverButton: '🧍 我親自上場',
        roundDefeatUsablePets: '你還有可用寵物，未觸發全滅懲罰。\n請回主選單改派寵物再戰。',
        roundDefeatNoUsablePets: '目前沒有可上場寵物，但未達全寵死亡判定。',
        totalDefeatHint: '你還活著，請重新整隊後繼續冒險。',
        petDownDesc: ({ petName, remain, enemyName, playerName, battleDetail }) =>
          `${petName} 在戰鬥中倒下了，將於 **${remain}** 後復活。\n\n` +
          `🏁 本局勝者：${enemyName}\n` +
          `你若還要硬戰，可以改由 **${playerName}** 親自上場（ATK 固定 10）。` +
          `${battleDetail ? `\n\n📜 戰況回放：\n${battleDetail}` : ''}`,
        humanTakeoverNotice: (petName, estimateRank, estimateWinRate) =>
          `⚠️ ${petName} 尚未復活，由你本人接戰。\n勝率預估：${estimateRank}（約 ${estimateWinRate}%）`
      },
      'zh-CN': {
        reviveCountdown: (remain) => `复活倒数 ${remain}回合`,
        hpRecoverySuffix: (remain) => `（复活倒数 ${remain}回合）`,
        petDownEvent: (petName, remain) => `${petName}复活倒数 ${remain}回合`,
        titleRoundDefeat: '⚠️ 本场败退',
        titleTotalDefeat: '💀 全队覆灭',
        titlePetDown: '🐾 宠物阵亡',
        continueButton: '📖 继续',
        continueRetreatButton: '📖 继续（先撤退）',
        humanTakeoverButton: '🧍 我亲自上场',
        roundDefeatUsablePets: '你还有可用宠物，未触发全灭惩罚。\n请回主选单改派宠物再战。',
        roundDefeatNoUsablePets: '目前没有可上场宠物，但未达到全宠死亡判定。',
        totalDefeatHint: '你还活着，请重新整队后继续冒险。',
        petDownDesc: ({ petName, remain, enemyName, playerName, battleDetail }) =>
          `${petName} 在战斗中倒下了，将于 **${remain}** 后复活。\n\n` +
          `🏁 本局胜者：${enemyName}\n` +
          `你若还要硬战，可以改由 **${playerName}** 亲自上场（ATK 固定 10）。` +
          `${battleDetail ? `\n\n📜 战况回放：\n${battleDetail}` : ''}`,
        humanTakeoverNotice: (petName, estimateRank, estimateWinRate) =>
          `⚠️ ${petName} 尚未复活，由你本人接战。\n胜率预估：${estimateRank}（约 ${estimateWinRate}%）`
      },
      en: {
        reviveCountdown: (remain) => `revives in ${remain} turns`,
        hpRecoverySuffix: (remain) => ` (revives in ${remain} turns)`,
        petDownEvent: (petName, remain) => `${petName} revives in ${remain} turns`,
        titleRoundDefeat: '⚠️ Round Lost',
        titleTotalDefeat: '💀 Team Wiped',
        titlePetDown: '🐾 Pet Down',
        continueButton: '📖 Continue',
        continueRetreatButton: '📖 Continue (Retreat)',
        humanTakeoverButton: '🧍 Fight as Me',
        roundDefeatUsablePets: 'You still have usable pets, so the full-wipe penalty was not triggered.\nReturn to the main menu and swap pets before fighting again.',
        roundDefeatNoUsablePets: 'You currently have no pet that can enter battle, but this still did not count as a full team wipe.',
        totalDefeatHint: 'You are still alive. Rebuild your lineup before continuing the adventure.',
        petDownDesc: ({ petName, remain, enemyName, playerName, battleDetail }) =>
          `${petName} was knocked out and will revive in **${remain}**.\n\n` +
          `🏁 Winner: ${enemyName}\n` +
          `If you want to force the fight, **${playerName}** can enter personally (fixed ATK 10).` +
          `${battleDetail ? `\n\n📜 Battle recap:\n${battleDetail}` : ''}`,
        humanTakeoverNotice: (petName, estimateRank, estimateWinRate) =>
          `⚠️ ${petName} has not revived yet. You are fighting in person.\nWin estimate: ${estimateRank} (about ${estimateWinRate}%)`
      },
      ko: {
        reviveCountdown: (remain) => `${remain}턴 뒤 부활`,
        hpRecoverySuffix: (remain) => `（${remain}턴 뒤 부활）`,
        petDownEvent: (petName, remain) => `${petName} ${remain}턴 뒤 부활`,
        titleRoundDefeat: '⚠️ 이번 전투 패배',
        titleTotalDefeat: '💀 전원 전멸',
        titlePetDown: '🐾 펫 전투불능',
        continueButton: '📖 계속',
        continueRetreatButton: '📖 계속 (우선 후퇴)',
        humanTakeoverButton: '🧍 내가 직접 싸우기',
        roundDefeatUsablePets: '아직 출전 가능한 펫이 있어 전멸 패널티는 발동하지 않았습니다.\n메인 메뉴로 돌아가 펫을 다시 편성한 뒤 재도전하세요.',
        roundDefeatNoUsablePets: '현재 출전 가능한 펫은 없지만, 아직 전체 펫 전멸 판정은 아닙니다.',
        totalDefeatHint: '당신은 아직 살아 있습니다. 편성을 다시 정비한 뒤 모험을 계속하세요.',
        petDownDesc: ({ petName, remain, enemyName, playerName, battleDetail }) =>
          `${petName}이(가) 쓰러졌고 **${remain}** 후 부활합니다.\n\n` +
          `🏁 이번 승자: ${enemyName}\n` +
          `계속 밀어붙이려면 **${playerName}** 가 직접 출전할 수 있습니다 (고정 ATK 10).` +
          `${battleDetail ? `\n\n📜 전투 회고:\n${battleDetail}` : ''}`,
        humanTakeoverNotice: (petName, estimateRank, estimateWinRate) =>
          `⚠️ ${petName}이(가) 아직 부활하지 않아 플레이어 본인이 직접 전투에 들어갑니다.\n승률 예상: ${estimateRank} (약 ${estimateWinRate}%)`
      }
    },

    // Used by: modules/systems/battle/friend-online-utils.js
    friendOnlineText: {
      'zh-TW': {
        title: '🌐 **好友手動對戰（線上模式）**',
        waitingSubmittedSelf: '⏳ 你已提交，正在等待對手按下按鈕...',
        waitingSubmittedRival: '⏳ 對手已提交，請你按下招式按鈕...',
        waitingJoin: '🕒 正在等待對手加入本場即時戰鬥...',
        waitingReady: (hostName, rivalName) => `就緒狀態：${hostName} ✅ ｜ ${rivalName} ⌛`,
        waitingPrompt: '請對手按下「✅ 加入即時戰鬥」後開打。\n（若對手未加入，你也可以改用其他模式）',
        joinButton: '✅ 加入即時戰鬥',
        manualAiButton: '⚔️ 改用手動（對手AI）',
        aiButton: '🤖 改用AI戰鬥',
        backButton: '↩️ 返回',
        desktopButton: '🖥️ 電腦版',
        mobileButton: '📱 手機版',
        switchedDesktopNotice: '🖥️ 已切換為電腦版戰鬥排版。',
        switchedMobileNotice: '📱 已切換為手機版戰鬥排版。',
        countdown: (remain, turnSeconds) => `⏳ 本回合倒數：${remain} 秒（每回合 ${turnSeconds} 秒）`,
        energyLine: (hostName, hostEnergy, rivalName, rivalEnergy) => `⚡ 能量：${hostName} ${hostEnergy} ｜ ${rivalName} ${rivalEnergy}`,
        readyText: (hostName, hostChoice, rivalName, rivalChoice) => `提交狀態：${hostName} ${hostChoice} ｜ ${rivalName} ${rivalChoice}`,
        moveHeader: '**招式：**',
        reselectionHint: '在倒數內可改選；雙方都提交後會立即結算。',
        invalidStart: '❌ 目前不是可啟用線上模式的好友友誼戰。',
        noTarget: '❌ 找不到好友對戰對象。',
        joinedNotice: (name, turnSeconds) => `✅ ${name} 已加入即時戰鬥，回合開始（每回合 ${turnSeconds} 秒）。`,
        roomCreated: '📡 已建立即時友誼戰房間，等待對手加入。',
        roomJoinSuccess: (name) => `✅ 已自動加入 ${name} 的即時戰鬥房。`,
        roomJoinFallback: '✅ 已自動加入好友的即時戰鬥房。',
        startFailed: '❌ 線上模式啟動失敗，請重試。',
        invalidAction: '⚠️ 線上對戰按鈕格式錯誤。',
        roomExpired: '⚠️ 這個線上對戰房間已失效。',
        notParticipant: '⚠️ 你不是這場線上友誼戰的參戰者。',
        noState: '⚠️ 線上友誼戰狀態不存在。',
        onlyRivalCanJoin: '⚠️ 只有對手可以按「加入即時戰鬥」。',
        battleDataMissing: '❌ 戰鬥資料缺失，請重新發起友誼戰。'
      },
      'zh-CN': {
        title: '🌐 **好友手动对战（线上模式）**',
        waitingSubmittedSelf: '⏳ 你已提交，正在等待对手按下按钮...',
        waitingSubmittedRival: '⏳ 对手已提交，请你按下招式按钮...',
        waitingJoin: '🕒 正在等待对手加入本场即时战斗...',
        waitingReady: (hostName, rivalName) => `就绪状态：${hostName} ✅ ｜ ${rivalName} ⌛`,
        waitingPrompt: '请对手按下「✅ 加入即时战斗」后开打。\n（若对手未加入，你也可以改用其他模式）',
        joinButton: '✅ 加入即时战斗',
        manualAiButton: '⚔️ 改用手动（对手AI）',
        aiButton: '🤖 改用AI战斗',
        backButton: '↩️ 返回',
        desktopButton: '🖥️ 电脑版',
        mobileButton: '📱 手机版',
        switchedDesktopNotice: '🖥️ 已切换为电脑版战斗排版。',
        switchedMobileNotice: '📱 已切换为手机版战斗排版。',
        countdown: (remain, turnSeconds) => `⏳ 本回合倒数：${remain} 秒（每回合 ${turnSeconds} 秒）`,
        energyLine: (hostName, hostEnergy, rivalName, rivalEnergy) => `⚡ 能量：${hostName} ${hostEnergy} ｜ ${rivalName} ${rivalEnergy}`,
        readyText: (hostName, hostChoice, rivalName, rivalChoice) => `提交状态：${hostName} ${hostChoice} ｜ ${rivalName} ${rivalChoice}`,
        moveHeader: '**招式：**',
        reselectionHint: '在倒数内可改选；双方都提交后会立即结算。',
        invalidStart: '❌ 目前不是可启用线上模式的好友友谊战。',
        noTarget: '❌ 找不到好友对战对象。',
        joinedNotice: (name, turnSeconds) => `✅ ${name} 已加入即时战斗，回合开始（每回合 ${turnSeconds} 秒）。`,
        roomCreated: '📡 已建立即时友谊战房间，等待对手加入。',
        roomJoinSuccess: (name) => `✅ 已自动加入 ${name} 的即时战斗房。`,
        roomJoinFallback: '✅ 已自动加入好友的即时战斗房。',
        startFailed: '❌ 线上模式启动失败，请重试。',
        invalidAction: '⚠️ 线上对战按钮格式错误。',
        roomExpired: '⚠️ 这个线上对战房间已失效。',
        notParticipant: '⚠️ 你不是这场线上友谊战的参战者。',
        noState: '⚠️ 线上友谊战状态不存在。',
        onlyRivalCanJoin: '⚠️ 只有对手可以按「加入即时战斗」。',
        battleDataMissing: '❌ 战斗资料缺失，请重新发起友谊战。'
      },
      en: {
        title: '🌐 **Friend Manual Duel (Online Mode)**',
        waitingSubmittedSelf: '⏳ You already locked in your choice. Waiting for your rival...',
        waitingSubmittedRival: '⏳ Your rival already locked in. Choose your move now...',
        waitingJoin: '🕒 Waiting for your rival to join this live duel...',
        waitingReady: (hostName, rivalName) => `Ready: ${hostName} ✅ | ${rivalName} ⌛`,
        waitingPrompt: 'Ask your rival to press "✅ Join Live Duel" to begin.\n(If they do not join, you can switch to another mode.)',
        joinButton: '✅ Join Live Duel',
        manualAiButton: '⚔️ Switch to Manual (Rival AI)',
        aiButton: '🤖 Switch to AI Battle',
        backButton: '↩️ Back',
        desktopButton: '🖥️ Desktop',
        mobileButton: '📱 Mobile',
        switchedDesktopNotice: '🖥️ Switched to the desktop battle layout.',
        switchedMobileNotice: '📱 Switched to the mobile battle layout.',
        countdown: (remain, turnSeconds) => `⏳ Turn timer: ${remain}s (${turnSeconds}s each turn)`,
        energyLine: (hostName, hostEnergy, rivalName, rivalEnergy) => `⚡ Energy: ${hostName} ${hostEnergy} | ${rivalName} ${rivalEnergy}`,
        readyText: (hostName, hostChoice, rivalName, rivalChoice) => `Submitted: ${hostName} ${hostChoice} | ${rivalName} ${rivalChoice}`,
        moveHeader: '**Moves:**',
        reselectionHint: 'You can change your choice before the timer ends. The turn resolves as soon as both players submit.',
        invalidStart: '❌ This is not a friend duel that can enter online mode right now.',
        noTarget: '❌ Could not find the rival player.',
        joinedNotice: (name, turnSeconds) => `✅ ${name} joined the live duel. The turn started (${turnSeconds}s per turn).`,
        roomCreated: '📡 Live duel room created. Waiting for your rival to join.',
        roomJoinSuccess: (name) => `✅ Joined ${name}'s live duel room automatically.`,
        roomJoinFallback: '✅ Joined your friend’s live duel room automatically.',
        startFailed: '❌ Failed to start online mode. Please try again.',
        invalidAction: '⚠️ Invalid online duel button format.',
        roomExpired: '⚠️ This online duel room has expired.',
        notParticipant: '⚠️ You are not a participant in this online friend duel.',
        noState: '⚠️ The online duel state does not exist.',
        onlyRivalCanJoin: '⚠️ Only the invited rival can press "Join Live Duel".',
        battleDataMissing: '❌ Battle data is missing. Please start the friend duel again.'
      },
      ko: {
        title: '🌐 **친구 수동 대전 (온라인 모드)**',
        waitingSubmittedSelf: '⏳ 이미 제출했습니다. 상대가 버튼을 누르기를 기다리는 중...',
        waitingSubmittedRival: '⏳ 상대가 이미 제출했습니다. 이제 당신이 기술을 선택하세요...',
        waitingJoin: '🕒 상대가 이번 실시간 대전에 참가하기를 기다리는 중...',
        waitingReady: (hostName, rivalName) => `준비 상태: ${hostName} ✅ ｜ ${rivalName} ⌛`,
        waitingPrompt: '상대가 "✅ 실시간 대전 참가"를 눌러야 시작됩니다.\n(상대가 들어오지 않으면 다른 모드로 바꿀 수도 있습니다.)',
        joinButton: '✅ 실시간 대전 참가',
        manualAiButton: '⚔️ 수동 전투로 변경 (상대 AI)',
        aiButton: '🤖 AI 전투로 변경',
        backButton: '↩️ 돌아가기',
        desktopButton: '🖥️ 데스크톱',
        mobileButton: '📱 모바일',
        switchedDesktopNotice: '🖥️ 데스크톱 전투 레이아웃으로 전환했습니다.',
        switchedMobileNotice: '📱 모바일 전투 레이아웃으로 전환했습니다.',
        countdown: (remain, turnSeconds) => `⏳ 이번 턴 제한: ${remain}초 (턴당 ${turnSeconds}초)`,
        energyLine: (hostName, hostEnergy, rivalName, rivalEnergy) => `⚡ 에너지: ${hostName} ${hostEnergy} ｜ ${rivalName} ${rivalEnergy}`,
        readyText: (hostName, hostChoice, rivalName, rivalChoice) => `제출 상태: ${hostName} ${hostChoice} ｜ ${rivalName} ${rivalChoice}`,
        moveHeader: '**기술:**',
        reselectionHint: '카운트다운 안에서는 다시 고를 수 있으며, 양쪽이 모두 제출하면 즉시 정산됩니다.',
        invalidStart: '❌ 지금은 온라인 모드로 전환할 수 있는 친구 우정전이 아닙니다.',
        noTarget: '❌ 친구 대전 상대를 찾을 수 없습니다.',
        joinedNotice: (name, turnSeconds) => `✅ ${name}이(가) 실시간 대전에 참가했습니다. 턴이 시작됩니다 (턴당 ${turnSeconds}초).`,
        roomCreated: '📡 실시간 우정전 방을 만들었고 상대 참가를 기다리고 있습니다.',
        roomJoinSuccess: (name) => `✅ ${name}의 실시간 대전 방에 자동으로 참가했습니다.`,
        roomJoinFallback: '✅ 친구의 실시간 대전 방에 자동으로 참가했습니다.',
        startFailed: '❌ 온라인 모드 시작에 실패했습니다. 다시 시도해 주세요.',
        invalidAction: '⚠️ 온라인 대전 버튼 형식이 잘못되었습니다.',
        roomExpired: '⚠️ 이 온라인 대전 방은 이미 만료되었습니다.',
        notParticipant: '⚠️ 당신은 이 온라인 우정전의 참가자가 아닙니다.',
        noState: '⚠️ 온라인 우정전 상태가 없습니다.',
        onlyRivalCanJoin: '⚠️ 초대된 상대만 "실시간 대전 참가"를 누를 수 있습니다.',
        battleDataMissing: '❌ 전투 데이터가 없어 친구 우정전을 다시 시작해야 합니다.'
      }
    },

    // Used by: modules/systems/ui/profile-settings-gacha-utils.js
    profileGachaText: {
      'zh-TW': {
        notFoundPlayer: '❌ 找不到角色！',
        profileTitle: (name) => `💳 ${name} 的檔案`,
        profileDesc: 'Renaiss星球冒險者檔案',
        fieldCash: '💰 現金 Rns 代幣',
        fieldTotalAssets: '📊 總資產',
        fieldUpgradePoints: (hpPerPoint) => `⭐ 升級點數（每點+${hpPerPoint}HP）`,
        fieldDrawCount: '📦 已開包數',
        fieldCardFmv: '📦 卡片 FMV',
        fieldClaimable: '🆕 可領取',
        fieldCapacityRule: '📏 額度規則',
        capacityRuleValue: '>100U 可 2 隻｜>1000U 可 3 隻',
        fieldWallet: '💳 錢包',
        walletBound: (addr) => `已綁定：\`${addr || 'unknown'}\``,
        walletUnbound: '未綁定（可立即補綁並同步資產）',
        btnFriends: '🤝 好友',
        btnOpenGacha: '🎰 去開包',
        btnBack: '返回',
        btnClaimPet: (remaining) => `🆕 領取新寵物（剩${remaining}）`,
        btnMemoryRecap: '🧠 記憶回顧',
        gachaTitle: '🎰 招式扭蛋機',
        gachaDesc: (notice, currentRns) => `${notice ? `⚠️ ${notice}\n\n` : ''}花費 Rns 代幣 抽招式！\n目前持有：**${currentRns} Rns**`,
        fieldSingle: '💰 單抽',
        fieldTen: '💰 十連',
        fieldCurrentHold: '💳 目前持有',
        fieldEachPoint: '💡 每點可換',
        fieldHelp: '💡 說明',
        helpValue: '每開1包 = 1升級點數\n每點 = 1 HP（可分配給不同寵物）\n可分配給任何寵物，用完就沒了',
        btnSingle: (cost, currentRns) => `單抽 ${cost}｜餘額 ${currentRns}`,
        btnTen: (cost, currentRns) => `十連 ${cost}｜餘額 ${currentRns}`,
        openingTitle: (count) => `🎰 開包中 x${count}`,
        resultTitle: (count) => `🎰 開包結果 x${count}`,
        openingCost: (cost) => `💰 花費 ${cost} Rns 代幣`,
        slotRule: '💡 拉霸規則：三格相同 = 5% 大獎（不改原本機率）',
        openingPhaseStart: '機台啟動中...',
        openingPhaseFirst: '第一格揭曉...',
        openingPhaseSecond: '第二格揭曉...',
        openingPhaseThird: '第三格揭曉...',
        openedMoves: '**開到以下招式：**',
        totalValue: (value) => `**總價值：${value} Rns 代幣**`,
        earnedPoints: (points) => `**⭐ 獲得升級點數：+${points} 點**`,
        totalDraws: (draws) => `**📊 已開包數：${draws} 包**`,
        btnContinueDraw: '繼續抽',
        btnGoPet: '🐾 前往寵物',
        btnBackMain: '返回主選單'
      },
      'zh-CN': {
        notFoundPlayer: '❌ 找不到角色！',
        profileTitle: (name) => `💳 ${name} 的档案`,
        profileDesc: 'Renaiss星球冒险者档案',
        fieldCash: '💰 现金 Rns 代币',
        fieldTotalAssets: '📊 总资产',
        fieldUpgradePoints: (hpPerPoint) => `⭐ 升级点数（每点+${hpPerPoint}HP）`,
        fieldDrawCount: '📦 已开包数',
        fieldCardFmv: '📦 卡片 FMV',
        fieldClaimable: '🆕 可领取',
        fieldCapacityRule: '📏 额度规则',
        capacityRuleValue: '>100U 可 2 只｜>1000U 可 3 只',
        fieldWallet: '💳 钱包',
        walletBound: (addr) => `已绑定：\`${addr || 'unknown'}\``,
        walletUnbound: '未绑定（可立即补绑并同步资产）',
        btnFriends: '🤝 好友',
        btnOpenGacha: '🎰 去开包',
        btnBack: '返回',
        btnClaimPet: (remaining) => `🆕 领取新宠物（剩${remaining}）`,
        btnMemoryRecap: '🧠 记忆回顾',
        gachaTitle: '🎰 招式扭蛋机',
        gachaDesc: (notice, currentRns) => `${notice ? `⚠️ ${notice}\n\n` : ''}花费 Rns 代币 抽招式！\n目前持有：**${currentRns} Rns**`,
        fieldSingle: '💰 单抽',
        fieldTen: '💰 十连',
        fieldCurrentHold: '💳 当前持有',
        fieldEachPoint: '💡 每点可换',
        fieldHelp: '💡 说明',
        helpValue: '每开1包 = 1升级点数\n每点 = 1 HP（可分配给不同宠物）\n可分配给任何宠物，用完就没了',
        btnSingle: (cost, currentRns) => `单抽 ${cost}｜余额 ${currentRns}`,
        btnTen: (cost, currentRns) => `十连 ${cost}｜余额 ${currentRns}`,
        openingTitle: (count) => `🎰 开包中 x${count}`,
        resultTitle: (count) => `🎰 开包结果 x${count}`,
        openingCost: (cost) => `💰 花费 ${cost} Rns 代币`,
        slotRule: '💡 拉霸规则：三格相同 = 5% 大奖（不改原本机率）',
        openingPhaseStart: '机器启动中...',
        openingPhaseFirst: '第一格揭晓...',
        openingPhaseSecond: '第二格揭晓...',
        openingPhaseThird: '第三格揭晓...',
        openedMoves: '**开到以下招式：**',
        totalValue: (value) => `**总价值：${value} Rns 代币**`,
        earnedPoints: (points) => `**⭐ 获得升级点数：+${points} 点**`,
        totalDraws: (draws) => `**📊 已开包数：${draws} 包**`,
        btnContinueDraw: '继续抽',
        btnGoPet: '🐾 前往宠物',
        btnBackMain: '返回主选单'
      },
      en: {
        notFoundPlayer: '❌ Player not found!',
        profileTitle: (name) => `💳 ${name}'s Profile`,
        profileDesc: 'Renaiss adventurer profile',
        fieldCash: '💰 Rns on Hand',
        fieldTotalAssets: '📊 Total Assets',
        fieldUpgradePoints: (hpPerPoint) => `⭐ Upgrade Points (+${hpPerPoint} HP each)`,
        fieldDrawCount: '📦 Total Packs Opened',
        fieldCardFmv: '📦 Card FMV',
        fieldClaimable: '🆕 Claimable',
        fieldCapacityRule: '📏 Capacity Rules',
        capacityRuleValue: '>100U for 2 pets | >1000U for 3 pets',
        fieldWallet: '💳 Wallet',
        walletBound: (addr) => `Bound: \`${addr || 'unknown'}\``,
        walletUnbound: 'Not bound yet (you can bind now and sync assets immediately)',
        btnFriends: '🤝 Friends',
        btnOpenGacha: '🎰 Open Packs',
        btnBack: 'Back',
        btnClaimPet: (remaining) => `🆕 Claim New Pet (${remaining} left)`,
        btnMemoryRecap: '🧠 Memory Recap',
        gachaTitle: '🎰 Skill Gacha Machine',
        gachaDesc: (notice, currentRns) => `${notice ? `⚠️ ${notice}\n\n` : ''}Spend Rns to draw skill chips!\nCurrent balance: **${currentRns} Rns**`,
        fieldSingle: '💰 Single Pull',
        fieldTen: '💰 Ten Pull',
        fieldCurrentHold: '💳 Current Balance',
        fieldEachPoint: '💡 Each Point',
        fieldHelp: '💡 Rules',
        helpValue: 'Each pack = 1 upgrade point\nEach point = 1 HP (can be distributed to different pets)\nYou can spend points on any pet until they run out',
        btnSingle: (cost, currentRns) => `Single ${cost} | Balance ${currentRns}`,
        btnTen: (cost, currentRns) => `Ten Pull ${cost} | Balance ${currentRns}`,
        openingTitle: (count) => `🎰 Opening x${count}`,
        resultTitle: (count) => `🎰 Results x${count}`,
        openingCost: (cost) => `💰 Cost ${cost} Rns`,
        slotRule: '💡 Slot rule: three matching reels = 5% jackpot (base rates unchanged)',
        openingPhaseStart: 'Machine starting...',
        openingPhaseFirst: 'Revealing slot one...',
        openingPhaseSecond: 'Revealing slot two...',
        openingPhaseThird: 'Revealing slot three...',
        openedMoves: '**You opened:**',
        totalValue: (value) => `**Total value: ${value} Rns**`,
        earnedPoints: (points) => `**⭐ Upgrade points gained: +${points}**`,
        totalDraws: (draws) => `**📊 Total packs opened: ${draws}**`,
        btnContinueDraw: 'Draw Again',
        btnGoPet: '🐾 Go to Pets',
        btnBackMain: 'Back to Main Menu'
      },
      ko: {
        notFoundPlayer: '❌ 캐릭터를 찾을 수 없습니다!',
        profileTitle: (name) => `💳 ${name}의 프로필`,
        profileDesc: 'Renaiss 행성 모험가 프로필',
        fieldCash: '💰 보유 Rns 토큰',
        fieldTotalAssets: '📊 총 자산',
        fieldUpgradePoints: (hpPerPoint) => `⭐ 강화 포인트 (포인트당 +${hpPerPoint}HP)`,
        fieldDrawCount: '📦 누적 개봉 수',
        fieldCardFmv: '📦 카드 FMV',
        fieldClaimable: '🆕 수령 가능',
        fieldCapacityRule: '📏 한도 규칙',
        capacityRuleValue: '>100U면 2마리 | >1000U면 3마리',
        fieldWallet: '💳 지갑',
        walletBound: (addr) => `연동됨: \`${addr || 'unknown'}\``,
        walletUnbound: '아직 연동되지 않음 (지금 연동하고 자산을 바로 동기화할 수 있음)',
        btnFriends: '🤝 친구',
        btnOpenGacha: '🎰 팩 열기',
        btnBack: '돌아가기',
        btnClaimPet: (remaining) => `🆕 새 펫 받기 (${remaining}마리 남음)`,
        btnMemoryRecap: '🧠 메모리 회고',
        gachaTitle: '🎰 기술 가챠 머신',
        gachaDesc: (notice, currentRns) => `${notice ? `⚠️ ${notice}\n\n` : ''}Rns 토큰을 써서 기술을 뽑으세요!\n현재 보유: **${currentRns} Rns**`,
        fieldSingle: '💰 단뽑',
        fieldTen: '💰 10연',
        fieldCurrentHold: '💳 현재 보유',
        fieldEachPoint: '💡 포인트당',
        fieldHelp: '💡 설명',
        helpValue: '팩 1개를 열 때마다 강화 포인트 1점\n포인트 1점 = HP 1 (서로 다른 펫에게 분배 가능)\n원하는 펫에게 자유롭게 배분할 수 있으며 다 쓰면 사라집니다',
        btnSingle: (cost, currentRns) => `단뽑 ${cost}｜잔액 ${currentRns}`,
        btnTen: (cost, currentRns) => `10연 ${cost}｜잔액 ${currentRns}`,
        openingTitle: (count) => `🎰 개봉 중 x${count}`,
        resultTitle: (count) => `🎰 개봉 결과 x${count}`,
        openingCost: (cost) => `💰 사용 ${cost} Rns 토큰`,
        slotRule: '💡 슬롯 규칙: 세 칸이 모두 같으면 5% 잭팟 (기존 확률은 유지)',
        openingPhaseStart: '기계 가동 중...',
        openingPhaseFirst: '첫 번째 칸 공개...',
        openingPhaseSecond: '두 번째 칸 공개...',
        openingPhaseThird: '세 번째 칸 공개...',
        openedMoves: '**다음 기술을 획득:**',
        totalValue: (value) => `**총 가치: ${value} Rns 토큰**`,
        earnedPoints: (points) => `**⭐ 획득 강화 포인트: +${points}점**`,
        totalDraws: (draws) => `**📊 누적 개봉 수: ${draws}팩**`,
        btnContinueDraw: '계속 뽑기',
        btnGoPet: '🐾 펫으로 이동',
        btnBackMain: '메인 메뉴로'
      }
    },

    // Used by: modules/systems/ui/player-panel-utils.js and scratch/shop surfaces
    shopText: {
      'zh-TW': {
        notFoundPlayer: '❌ 找不到角色！',
        needShopHaggle: '⚠️ 請先在商店內操作議價。',
        needShopSell: '⚠️ 只能在商店場景掛賣。請先由劇情進入商店。',
        fieldYourRns: '💰 你的 Rns',
        tokenUnit: 'Rns 代幣',
        bulkNeedSelect: '請先從清單勾選要批次賣出的商品。',
        bulkScope: (count) => `範圍：已選 ${count} 項商品`,
        itemLabel: (summary) => `項目：${summary}`,
        soldCount: (count) => `件數：${count} 件`,
        rawEstimate: (total) => `原始估價：${total} Rns 代幣`,
        bulkQuote: (total) => `批次賣出（七折）：**${total} Rns 代幣**`,
        bulkLoss: (loss) => `折讓差額：-${loss} Rns 代幣`,
        appraiser: (name) => `鑑價員：${name}`,
        bulkChoosePrompt: '請選擇是否同意本次批次賣出（七折）提案。',
        acceptDeal: '✅ 同意成交',
        exitHaggle: '↩️ 退出議價',
        bulkTitle: (market) => `🤝 批次議價提案｜${market}`,
        bulkPickerTitle: (market) => `📦 批次賣出（七折）｜${market}`,
        bulkPickerLine1: '請從下拉選單勾選要「批次賣出（七折）」的商品。',
        bulkPickerLine2: '勾選完成後會即時顯示本次批次報價，再由你決定是否成交。',
        hagglePickerTitle: (market) => `🤝 老闆議價｜${market}`,
        hagglePickerLine1: '請先選擇 1 件要交給老闆估價的商品。',
        hagglePickerLine2: '下一步會顯示 AI 鑑價員報價，你可選「同意成交」或「退出議價」。',
        bulkButton: '📦 批次賣出(七折)',
        selectBulkDesc: '選擇此商品加入批次賣出',
        selectBulkPlaceholder: '可複選：勾選要批次賣出的商品',
        selectHaggleDesc: '選擇此商品進行估價',
        selectHagglePlaceholder: '選擇要交給老闆估價的商品',
        haggleItem: (name) => `商品：${name}`,
        haggleQuote: (total) => `報價：**${total} Rns 代幣**`,
        hagglePrompt: '請選擇是否同意本次 AI 議價。',
        haggleTitle: (market) => `🤝 議價提案｜${market}`,
        scratchButton: '🎟️ 刮刮樂(100)',
        healCrystalButton: (cost) => `🩸 回血水晶(${cost})`,
        energyCrystalButton: (cost) => `⚡ 回能水晶(${cost})`,
        bonusPointButton: '🧩 買加成點數(200)',
        teleportButton: (cost) => `🧭 傳送裝置(${cost})`,
        prevPage: '⬅️ 上一頁',
        nextPage: '➡️ 下一頁',
        returnShop: '🏪 返回商店',
        buyTitle: (market) => `🛒 商店可購買商品｜${market}`,
        buySelectPlaceholder: '下拉選擇要購買的商品',
        buyLoadFailed: '⚠️ 賣單清單載入失敗，請稍後再試。',
        buyLoadFailedHint: '你仍可使用下方按鈕購買水晶、點數與傳送裝置。',
        noBuyListings: '（目前沒有可購買商品）',
        buyCurrentButton: '🛒 購買這件商品',
        buyListingButton: (index) => `🛒 購買 #${index}`,
        marketListingsOnly: '以下僅顯示玩家掛賣商品；常駐補給請直接使用下方按鈕。',
        currentListingTitle: (index, total, name) => `📦 商品 ${index}/${total}｜${name}`,
        listingQuantity: (qty) => `數量：x${qty}`,
        listingUnitPrice: (price) => `單價：${price} Rns`,
        listingTotalPrice: (price) => `總價：${price} Rns`,
        listingSeller: (name) => `賣家：${name}`,
        listingNote: (text) => `備註：${text}`,
        listingTypeChip: '類型：技能晶片',
        listingTypeEquipment: '類型：裝備',
        listingTypeCollectible: '類型：收藏品',
        listingTypeItem: '類型：一般商品',
        listingPriceBlockTitle: '價格資訊',
        listingMetaBlockTitle: '商品資訊',
        itemDescriptionTitle: '說明',
        itemDescription: (text) => `說明：${text}`,
        chipStatsTitle: '🧬 技能晶片詳情',
        chipAffinityLine: (element, tier) => `屬性：${element}｜稀有度：${tier}`,
        chipDamageLine: (base, instant, total) => `傷害：基礎 ${base}｜命中 ${instant}｜總計 ${total}`,
        chipCostSpeedLine: (energy, speed) => `消耗：⚡${energy}｜速度：🚀${speed}`,
        chipEffectLine: (text) => `特性：${text}`,
        chipFunctionLine: (text) => `功能：${text}`,
        chipFunctionLearn: (name) => `購買後會優先嘗試讓主力寵物學會「${name}」，若當下無法學習則改為技能晶片入包。`,
        pageSummary: (page, totalPages, total) => `頁數：${page}/${totalPages}｜總筆數：${total}`,
        droppedInvalidListings: (count) => `⚠️ 已略過 ${count} 筆異常賣單資料（請賣家重新掛單）。`,
        healCrystalLine: (cost) => `回血水晶：${cost} Rns（恢復氣血）`,
        energyCrystalLine: (cost) => `回能水晶：${cost} Rns（恢復能量）`,
        bonusPointLine: '加成點數：花費 200 Rns 可獲得 +1 點。',
        teleportLine: (cost, hours) => `傳送裝置：${cost} Rns（同島瞬移，單顆效期 ${hours}h，每次消耗 1 顆）`,
        deviceAvailable: (count, remainText) => `目前可用：${count} 顆${remainText ? `（最早到期：${remainText}）` : ''}`,
        marketRuleDigital: '⚠️ 神秘鑑價站規則：賣出牌價可能顯示九折，但實際入帳可能僅六折；成交品也可能只收到延後配送承諾。',
        marketRuleRenaiss: '✅ 公道鑑價站規則：賣出固定八折，牌價與入帳一致，成交品即時交付。',
        shopTitle: (market) => `🏪 進入商店｜${market}`,
        shopIntro: (market, boss) => `你走進了${market}，櫃台後方的 **${boss}** 正看著你。`,
        shopListingLine: (listingCount, myCount) => `市面賣單：${listingCount} 筆｜你掛單：${myCount} 筆`,
        shopChoosePrompt: '請選擇：要掛賣、直接跟老闆議價、買商品、刮刮樂，或離開商店。\n掛賣會先出現下拉選單；技能需先從上陣招式卸下才可掛賣。',
        jackpotLine: (amount) => `💰 目前獎池：${amount} Rns 代幣`,
        digitalBossTone: '老闆眼神很熱情，但每句話都像在試探你的底線。',
        renaissBossTone: '老闆把估值表攤在你面前，強調透明與長期信任。',
        sellButton: '📤 掛賣商品',
        npcHaggleButton: '🤝 跟老闆議價',
        buyButton: '🛒 買商品',
        leaveButton: '🚪 離開商店'
      },
      'zh-CN': {
        notFoundPlayer: '❌ 找不到角色！',
        needShopHaggle: '⚠️ 请先在商店内操作议价。',
        needShopSell: '⚠️ 只能在商店场景挂卖。请先由剧情进入商店。',
        fieldYourRns: '💰 你的 Rns',
        tokenUnit: 'Rns 代币',
        bulkNeedSelect: '请先从清单勾选要批次卖出的商品。',
        bulkScope: (count) => `范围：已选 ${count} 项商品`,
        itemLabel: (summary) => `项目：${summary}`,
        soldCount: (count) => `件数：${count} 件`,
        rawEstimate: (total) => `原始估价：${total} Rns 代币`,
        bulkQuote: (total) => `批次卖出（七折）：**${total} Rns 代币**`,
        bulkLoss: (loss) => `折让差额：-${loss} Rns 代币`,
        appraiser: (name) => `鉴价员：${name}`,
        bulkChoosePrompt: '请选择是否同意本次批次卖出（七折）提案。',
        acceptDeal: '✅ 同意成交',
        exitHaggle: '↩️ 退出议价',
        bulkTitle: (market) => `🤝 批次议价提案｜${market}`,
        bulkPickerTitle: (market) => `📦 批次卖出（七折）｜${market}`,
        bulkPickerLine1: '请从下拉选单勾选要「批次卖出（七折）」的商品。',
        bulkPickerLine2: '勾选完成后会即时显示本次批次报价，再由你决定是否成交。',
        hagglePickerTitle: (market) => `🤝 老板议价｜${market}`,
        hagglePickerLine1: '请先选择 1 件要交给老板估价的商品。',
        hagglePickerLine2: '下一步会显示 AI 鉴价员报价，你可选「同意成交」或「退出议价」。',
        bulkButton: '📦 批次卖出(七折)',
        selectBulkDesc: '选择此商品加入批次卖出',
        selectBulkPlaceholder: '可复选：勾选要批次卖出的商品',
        selectHaggleDesc: '选择此商品进行估价',
        selectHagglePlaceholder: '选择要交给老板估价的商品',
        haggleItem: (name) => `商品：${name}`,
        haggleQuote: (total) => `报价：**${total} Rns 代币**`,
        hagglePrompt: '请选择是否同意本次 AI 议价。',
        haggleTitle: (market) => `🤝 议价提案｜${market}`,
        scratchButton: '🎟️ 刮刮乐(100)',
        healCrystalButton: (cost) => `🩸 回血水晶(${cost})`,
        energyCrystalButton: (cost) => `⚡ 回能水晶(${cost})`,
        bonusPointButton: '🧩 买加成点数(200)',
        teleportButton: (cost) => `🧭 传送装置(${cost})`,
        prevPage: '⬅️ 上一页',
        nextPage: '➡️ 下一页',
        returnShop: '🏪 返回商店',
        buyTitle: (market) => `🛒 商店可购买商品｜${market}`,
        buySelectPlaceholder: '下拉选择要购买的商品',
        buyLoadFailed: '⚠️ 卖单清单载入失败，请稍后再试。',
        buyLoadFailedHint: '你仍可使用下方按钮购买水晶、点数与传送装置。',
        noBuyListings: '（目前没有可购买商品）',
        buyCurrentButton: '🛒 购买这件商品',
        buyListingButton: (index) => `🛒 购买 #${index}`,
        marketListingsOnly: '这里仅显示玩家挂卖商品；常驻补给请直接使用下方按钮。',
        currentListingTitle: (index, total, name) => `📦 商品 ${index}/${total}｜${name}`,
        listingQuantity: (qty) => `数量：x${qty}`,
        listingUnitPrice: (price) => `单价：${price} Rns`,
        listingTotalPrice: (price) => `总价：${price} Rns`,
        listingSeller: (name) => `卖家：${name}`,
        listingNote: (text) => `备注：${text}`,
        listingTypeChip: '类型：技能晶片',
        listingTypeEquipment: '类型：装备',
        listingTypeCollectible: '类型：收藏品',
        listingTypeItem: '类型：一般商品',
        listingPriceBlockTitle: '价格信息',
        listingMetaBlockTitle: '商品信息',
        itemDescriptionTitle: '说明',
        itemDescription: (text) => `说明：${text}`,
        chipStatsTitle: '🧬 技能晶片详情',
        chipAffinityLine: (element, tier) => `属性：${element}｜稀有度：${tier}`,
        chipDamageLine: (base, instant, total) => `伤害：基础 ${base}｜命中 ${instant}｜总计 ${total}`,
        chipCostSpeedLine: (energy, speed) => `消耗：⚡${energy}｜速度：🚀${speed}`,
        chipEffectLine: (text) => `特性：${text}`,
        chipFunctionLine: (text) => `功能：${text}`,
        chipFunctionLearn: (name) => `购买后会优先尝试让主力宠物学会「${name}」，若当下无法学习则改为技能晶片入包。`,
        pageSummary: (page, totalPages, total) => `页数：${page}/${totalPages}｜总笔数：${total}`,
        droppedInvalidListings: (count) => `⚠️ 已略过 ${count} 笔异常卖单资料（请卖家重新挂单）。`,
        healCrystalLine: (cost) => `回血水晶：${cost} Rns（恢复气血）`,
        energyCrystalLine: (cost) => `回能水晶：${cost} Rns（恢复能量）`,
        bonusPointLine: '加成点数：花费 200 Rns 可获得 +1 点。',
        teleportLine: (cost, hours) => `传送装置：${cost} Rns（同岛瞬移，单颗效期 ${hours}h，每次消耗 1 颗）`,
        deviceAvailable: (count, remainText) => `目前可用：${count} 颗${remainText ? `（最早到期：${remainText}）` : ''}`,
        marketRuleDigital: '⚠️ 神秘鉴价站规则：卖出牌价可能显示九折，但实际入账可能仅六折；成交品也可能只收到延后配送承诺。',
        marketRuleRenaiss: '✅ 公道鉴价站规则：卖出固定八折，牌价与入账一致，成交品即时交付。',
        shopTitle: (market) => `🏪 进入商店｜${market}`,
        shopIntro: (market, boss) => `你走进了${market}，柜台后方的 **${boss}** 正看着你。`,
        shopListingLine: (listingCount, myCount) => `市面卖单：${listingCount} 笔｜你挂单：${myCount} 笔`,
        shopChoosePrompt: '请选择：要挂卖、直接跟老板议价、买商品、刮刮乐，或离开商店。\n挂卖会先出现下拉选单；技能需先从上阵招式卸下才可挂卖。',
        jackpotLine: (amount) => `💰 当前奖池：${amount} Rns 代币`,
        digitalBossTone: '老板的眼神看似热情，但每一句话都像在试探你的底线。',
        renaissBossTone: '老板把估值表摊在你面前，强调透明与长期信任。',
        sellButton: '📤 挂卖商品',
        npcHaggleButton: '🤝 跟老板议价',
        buyButton: '🛒 买商品',
        leaveButton: '🚪 离开商店'
      },
      en: {
        notFoundPlayer: '❌ Player not found!',
        needShopHaggle: '⚠️ Open the shop first before starting a haggle.',
        needShopSell: '⚠️ You can only list items while inside the shop scene. Enter through the story first.',
        fieldYourRns: '💰 Your Rns',
        tokenUnit: 'Rns',
        bulkNeedSelect: 'Pick the items you want to sell in bulk first.',
        bulkScope: (count) => `Scope: ${count} selected items`,
        itemLabel: (summary) => `Items: ${summary}`,
        soldCount: (count) => `Pieces: ${count}`,
        rawEstimate: (total) => `Raw appraisal: ${total} Rns`,
        bulkQuote: (total) => `Bulk sale (70%): **${total} Rns**`,
        bulkLoss: (loss) => `Discount gap: -${loss} Rns`,
        appraiser: (name) => `Appraiser: ${name}`,
        bulkChoosePrompt: 'Choose whether to accept this 70% bulk-sale proposal.',
        acceptDeal: '✅ Accept Deal',
        exitHaggle: '↩️ Leave Haggle',
        bulkTitle: (market) => `🤝 Bulk Haggle Offer | ${market}`,
        bulkPickerTitle: (market) => `📦 Bulk Sale (70%) | ${market}`,
        bulkPickerLine1: 'Use the dropdown to select the items you want to bulk-sell at 70%.',
        bulkPickerLine2: 'The bulk quote updates right away. You can decide whether to accept it after that.',
        hagglePickerTitle: (market) => `🤝 Shop Haggle | ${market}`,
        hagglePickerLine1: 'Choose one item to hand over for appraisal first.',
        hagglePickerLine2: 'The next step shows the AI appraiser quote, and you can accept or back out.',
        bulkButton: '📦 Bulk Sell (70%)',
        selectBulkDesc: 'Add this item to the bulk-sale bundle',
        selectBulkPlaceholder: 'Multi-select items for bulk sale',
        selectHaggleDesc: 'Choose this item for appraisal',
        selectHagglePlaceholder: 'Choose an item for appraisal',
        haggleItem: (name) => `Item: ${name}`,
        haggleQuote: (total) => `Quote: **${total} Rns**`,
        hagglePrompt: 'Choose whether to accept this AI haggle offer.',
        haggleTitle: (market) => `🤝 Haggle Offer | ${market}`,
        scratchButton: '🎟️ Scratch (100)',
        healCrystalButton: (cost) => `🩸 Heal Crystal (${cost})`,
        energyCrystalButton: (cost) => `⚡ Energy Crystal (${cost})`,
        bonusPointButton: '🧩 Buy Boost Point (200)',
        teleportButton: (cost) => `🧭 Teleporter (${cost})`,
        prevPage: '⬅️ Prev',
        nextPage: '➡️ Next',
        returnShop: '🏪 Back to Shop',
        buyTitle: (market) => `🛒 Shop Goods | ${market}`,
        buySelectPlaceholder: 'Choose a product from the dropdown',
        buyLoadFailed: '⚠️ Failed to load sell listings. Please try again later.',
        buyLoadFailedHint: 'You can still use the buttons below to buy crystals, points, and teleport devices.',
        noBuyListings: '(No goods available right now)',
        buyCurrentButton: '🛒 Buy This Item',
        buyListingButton: (index) => `🛒 Buy #${index}`,
        marketListingsOnly: 'Only player listings are shown here. Use the buttons below for the permanent shop supplies.',
        currentListingTitle: (index, total, name) => `📦 Listing ${index}/${total} | ${name}`,
        listingQuantity: (qty) => `Quantity: x${qty}`,
        listingUnitPrice: (price) => `Unit Price: ${price} Rns`,
        listingTotalPrice: (price) => `Total Price: ${price} Rns`,
        listingSeller: (name) => `Seller: ${name}`,
        listingNote: (text) => `Note: ${text}`,
        listingTypeChip: 'Type: Skill Chip',
        listingTypeEquipment: 'Type: Equipment',
        listingTypeCollectible: 'Type: Collectible',
        listingTypeItem: 'Type: Item',
        listingPriceBlockTitle: 'Pricing',
        listingMetaBlockTitle: 'Listing Info',
        itemDescriptionTitle: 'Description',
        itemDescription: (text) => `Description: ${text}`,
        chipStatsTitle: '🧬 Skill Chip Details',
        chipAffinityLine: (element, tier) => `Element: ${element} | Tier: ${tier}`,
        chipDamageLine: (base, instant, total) => `Damage: base ${base} | hit ${instant} | total ${total}`,
        chipCostSpeedLine: (energy, speed) => `Cost: ⚡${energy} | Speed: 🚀${speed}`,
        chipEffectLine: (text) => `Effect: ${text}`,
        chipFunctionLine: (text) => `Function: ${text}`,
        chipFunctionLearn: (name) => `On purchase, the system first tries to teach "${name}" to the buyer's main pet. If it cannot be learned right away, it is delivered as a skill chip instead.`,
        pageSummary: (page, totalPages, total) => `Page ${page}/${totalPages} | Total listings ${total}`,
        droppedInvalidListings: (count) => `⚠️ Skipped ${count} corrupted listings. Ask the seller to post them again.`,
        healCrystalLine: (cost) => `Heal Crystal: ${cost} Rns (restores HP)`,
        energyCrystalLine: (cost) => `Energy Crystal: ${cost} Rns (restores energy)`,
        bonusPointLine: 'Boost Point: spend 200 Rns to gain +1 point.',
        teleportLine: (cost, hours) => `Teleporter: ${cost} Rns (same-island warp, each device lasts ${hours}h and is consumed per use)`,
        deviceAvailable: (count, remainText) => `Available now: ${count}${remainText ? ` (earliest expiry: ${remainText})` : ''}`,
        marketRuleDigital: '⚠️ Mysterious appraisal counter rule: the displayed sell price may look like 90%, but the actual payout may be closer to 60%, and delivery can be delayed.',
        marketRuleRenaiss: '✅ Fair appraisal counter rule: sales are fixed at 80%, and the displayed price matches the payout with immediate delivery.',
        shopTitle: (market) => `🏪 Enter Shop | ${market}`,
        shopIntro: (market, boss) => `You step into ${market}. **${boss}** is watching from behind the counter.`,
        shopListingLine: (listingCount, myCount) => `Open listings: ${listingCount} | Yours: ${myCount}`,
        shopChoosePrompt: 'Choose what to do next: list an item, haggle with the owner, buy goods, try the scratch card, or leave the shop.\nListing starts from a dropdown; skill chips must be unequipped before they can be listed.',
        jackpotLine: (amount) => `💰 Current jackpot: ${amount} Rns`,
        digitalBossTone: 'The owner looks warm, but every line sounds like a test of your limits.',
        renaissBossTone: 'The owner spreads the appraisal sheet across the counter and stresses transparency and long-term trust.',
        sellButton: '📤 List Item',
        npcHaggleButton: '🤝 Haggle with Owner',
        buyButton: '🛒 Buy Goods',
        leaveButton: '🚪 Leave Shop'
      },
      ko: {
        notFoundPlayer: '❌ 캐릭터를 찾을 수 없습니다!',
        needShopHaggle: '⚠️ 상점 안에서 먼저 흥정을 시작해야 합니다.',
        needShopSell: '⚠️ 상점 장면 안에서만 판매 등록이 가능합니다. 먼저 스토리로 상점에 들어가세요.',
        fieldYourRns: '💰 내 Rns',
        tokenUnit: 'Rns',
        bulkNeedSelect: '먼저 일괄 판매할 상품을 목록에서 골라 주세요.',
        bulkScope: (count) => `범위: 선택한 상품 ${count}종`,
        itemLabel: (summary) => `항목: ${summary}`,
        soldCount: (count) => `수량: ${count}개`,
        rawEstimate: (total) => `원래 감정가: ${total} Rns 토큰`,
        bulkQuote: (total) => `일괄 판매 (70%): **${total} Rns 토큰**`,
        bulkLoss: (loss) => `할인 차액: -${loss} Rns 토큰`,
        appraiser: (name) => `감정사: ${name}`,
        bulkChoosePrompt: '이번 일괄 판매(70%) 제안을 수락할지 선택하세요.',
        acceptDeal: '✅ 거래 수락',
        exitHaggle: '↩️ 흥정 종료',
        bulkTitle: (market) => `🤝 일괄 흥정 제안｜${market}`,
        bulkPickerTitle: (market) => `📦 일괄 판매 (70%)｜${market}`,
        bulkPickerLine1: '드롭다운에서 "일괄 판매 (70%)" 할 상품을 선택하세요.',
        bulkPickerLine2: '선택이 끝나면 이번 일괄 견적이 바로 표시되고, 그 뒤에 체결 여부를 결정할 수 있습니다.',
        hagglePickerTitle: (market) => `🤝 상점 주인 흥정｜${market}`,
        hagglePickerLine1: '먼저 감정할 상품 1개를 선택하세요.',
        hagglePickerLine2: '다음 단계에서 AI 감정사의 제안가가 나오며, 수락하거나 나갈 수 있습니다.',
        bulkButton: '📦 일괄 판매 (70%)',
        selectBulkDesc: '이 상품을 일괄 판매 묶음에 추가',
        selectBulkPlaceholder: '일괄 판매할 상품 복수 선택',
        selectHaggleDesc: '이 상품으로 감정 진행',
        selectHagglePlaceholder: '감정할 상품 선택',
        haggleItem: (name) => `상품: ${name}`,
        haggleQuote: (total) => `제안가: **${total} Rns 토큰**`,
        hagglePrompt: '이번 AI 흥정 제안을 수락할지 선택하세요.',
        haggleTitle: (market) => `🤝 흥정 제안｜${market}`,
        scratchButton: '🎟️ 스크래치 (100)',
        healCrystalButton: (cost) => `🩸 회복 크리스탈(${cost})`,
        energyCrystalButton: (cost) => `⚡ 에너지 크리스탈(${cost})`,
        bonusPointButton: '🧩 보너스 포인트 구매(200)',
        teleportButton: (cost) => `🧭 순간이동 장치(${cost})`,
        prevPage: '⬅️ 이전 페이지',
        nextPage: '➡️ 다음 페이지',
        returnShop: '🏪 상점으로 돌아가기',
        buyTitle: (market) => `🛒 상점 구매 목록｜${market}`,
        buySelectPlaceholder: '드롭다운에서 구매할 상품 선택',
        buyLoadFailed: '⚠️ 판매 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        buyLoadFailedHint: '아래 버튼으로는 여전히 크리스탈, 포인트, 순간이동 장치를 구매할 수 있습니다.',
        noBuyListings: '(현재 구매 가능한 상품이 없습니다)',
        buyCurrentButton: '🛒 이 상품 구매',
        buyListingButton: (index) => `🛒 구매 #${index}`,
        marketListingsOnly: '여기에는 플레이어 판매글만 표시됩니다. 상시 보급품은 아래 버튼을 사용하세요.',
        currentListingTitle: (index, total, name) => `📦 상품 ${index}/${total}｜${name}`,
        listingQuantity: (qty) => `수량: x${qty}`,
        listingUnitPrice: (price) => `개당 가격: ${price} Rns`,
        listingTotalPrice: (price) => `총 가격: ${price} Rns`,
        listingSeller: (name) => `판매자: ${name}`,
        listingNote: (text) => `메모: ${text}`,
        listingTypeChip: '종류: 스킬 칩',
        listingTypeEquipment: '종류: 장비',
        listingTypeCollectible: '종류: 수집품',
        listingTypeItem: '종류: 일반 상품',
        listingPriceBlockTitle: '가격 정보',
        listingMetaBlockTitle: '상품 정보',
        itemDescriptionTitle: '설명',
        itemDescription: (text) => `설명: ${text}`,
        chipStatsTitle: '🧬 스킬 칩 상세',
        chipAffinityLine: (element, tier) => `속성: ${element}｜등급: ${tier}`,
        chipDamageLine: (base, instant, total) => `피해: 기본 ${base}｜즉시 ${instant}｜총합 ${total}`,
        chipCostSpeedLine: (energy, speed) => `소모: ⚡${energy}｜속도: 🚀${speed}`,
        chipEffectLine: (text) => `특성: ${text}`,
        chipFunctionLine: (text) => `기능: ${text}`,
        chipFunctionLearn: (name) => `구매 후 먼저 주력 펫에게 "${name}"을(를) 익히게 시도하고, 바로 배울 수 없으면 스킬 칩 형태로 가방에 들어갑니다.`,
        pageSummary: (page, totalPages, total) => `페이지: ${page}/${totalPages}｜총 판매글 ${total}건`,
        droppedInvalidListings: (count) => `⚠️ 이상한 판매글 ${count}건을 건너뛰었습니다. 판매자에게 다시 등록해 달라고 안내해 주세요.`,
        healCrystalLine: (cost) => `회복 크리스탈: ${cost} Rns (HP 회복)`,
        energyCrystalLine: (cost) => `에너지 크리스탈: ${cost} Rns (에너지 회복)`,
        bonusPointLine: '보너스 포인트: 200 Rns를 써서 +1 포인트 획득.',
        teleportLine: (cost, hours) => `순간이동 장치: ${cost} Rns (같은 섬 순간이동, 장치당 ${hours}시간 유지, 사용할 때마다 1개 소모)`,
        deviceAvailable: (count, remainText) => `현재 사용 가능: ${count}개${remainText ? ` (가장 빠른 만료: ${remainText})` : ''}`,
        marketRuleDigital: '⚠️ 신비 감정소 규칙: 판매 표시가는 90%처럼 보여도 실제 정산은 60% 수준일 수 있고, 배송도 지연될 수 있습니다.',
        marketRuleRenaiss: '✅ 공정 감정소 규칙: 판매가는 고정 80%이며, 표시가와 실제 입금액이 같고 즉시 전달됩니다.',
        shopTitle: (market) => `🏪 상점 입장｜${market}`,
        shopIntro: (market, boss) => `${market}에 들어서자 카운터 뒤에서 **${boss}** 이(가) 당신을 바라보고 있습니다.`,
        shopListingLine: (listingCount, myCount) => `시장 판매글: ${listingCount}건｜내 등록: ${myCount}건`,
        shopChoosePrompt: '판매 등록, 상점 주인과 흥정, 상품 구매, 스크래치, 상점 떠나기 중 하나를 고르세요.\n판매 등록은 먼저 드롭다운이 열리며, 기술은 장착 해제 후에만 등록할 수 있습니다.',
        jackpotLine: (amount) => `💰 현재 잭팟 풀: ${amount} Rns 토큰`,
        digitalBossTone: '주인은 무척 친절해 보이지만, 모든 말이 당신의 한계를 떠보는 듯합니다.',
        renaissBossTone: '주인은 감정표를 카운터 위에 펼쳐 놓고 투명성과 장기 신뢰를 강조합니다.',
        sellButton: '📤 상품 등록',
        npcHaggleButton: '🤝 주인과 흥정',
        buyButton: '🛒 상품 구매',
        leaveButton: '🚪 상점 나가기'
      }
    }
  };

  function getSection(section = '', lang = 'zh-TW', context = null) {
    const code = normalizeLang(lang);
    if (String(section || '') === 'mapText') {
      const rows = resolveMapText(code, context || {});
      return rows;
    }
    const rows = RESOURCES[String(section || '')] || null;
    if (!rows || typeof rows !== 'object') return {};
    if (code === 'ko') return getKoreanSection(section, rows);
    return rows[code] || rows['zh-TW'] || {};
  }

  function getSectionAll(section = '') {
    const rows = RESOURCES[String(section || '')] || null;
    return rows && typeof rows === 'object' ? rows : {};
  }

  function getRegionName(regionName = '', lang = 'zh-TW') {
    const source = String(regionName || '').trim();
    if (!source) return source;
    const row = RESOURCES.mapRegionNames[source];
    if (!row) return source;
    const code = normalizeLang(lang);
    if (code === 'ko') {
      return row.ko || translateTextToKo(row.en || row['zh-TW'] || source);
    }
    return row[code] || row['zh-TW'] || source;
  }

  function getLocalizedNamedValue(section = '', source = '', lang = 'zh-TW') {
    const key = String(source || '').trim();
    if (!key) return '';
    const rows = RESOURCES[String(section || '')];
    const row = rows && typeof rows === 'object' ? rows[key] : null;
    const code = normalizeLang(lang);
    if (!row || typeof row !== 'object') {
      if (code === 'ko') return translateTextToKo(key) || key;
      if (code === 'zh-CN') return CONTENT_LOCALIZATION.localizeScriptOnly(key, 'zh-CN');
      if (code === 'zh-TW') return CONTENT_LOCALIZATION.localizeScriptOnly(key, 'zh-TW');
      return key;
    }
    if (code === 'ko') return row.ko || translateTextToKo(row.en || row['zh-TW'] || key) || key;
    if (code === 'zh-CN') return row['zh-CN'] || CONTENT_LOCALIZATION.localizeScriptOnly(row['zh-TW'] || key, 'zh-CN');
    if (code === 'zh-TW') return row['zh-TW'] || CONTENT_LOCALIZATION.localizeScriptOnly(row['zh-CN'] || key, 'zh-TW');
    return row[code] || row['zh-TW'] || key;
  }

  function getLocationName(location = '', lang = 'zh-TW') {
    return getLocalizedNamedValue('locationDisplayNames', location, lang);
  }

  function getNpcName(name = '', lang = 'zh-TW') {
    return getLocalizedNamedValue('npcDisplayNames', name, lang);
  }

  function getEnemyName(name = '', lang = 'zh-TW') {
    return getLocalizedNamedValue('enemyDisplayNames', name, lang);
  }

  function buildKnownTextReplacementRows(lang = 'zh-TW') {
    const rows = [];
    const sections = ['locationDisplayNames', 'npcDisplayNames', 'enemyDisplayNames', 'termDisplayNames', 'mapRegionNames'];
    for (const section of sections) {
      const table = RESOURCES[section];
      if (!table || typeof table !== 'object') continue;
      for (const [canonical, row] of Object.entries(table)) {
        const localized = section === 'mapRegionNames'
          ? getRegionName(canonical, lang)
          : getLocalizedNamedValue(section, canonical, lang);
        if (!localized || localized === canonical) continue;
        rows.push([canonical, localized]);
        if (row && typeof row === 'object') {
          const zhCn = String(row['zh-CN'] || '').trim();
          const en = String(row.en || '').trim();
          if (zhCn && zhCn !== canonical && zhCn !== localized) rows.push([zhCn, localized]);
          if (en && en !== canonical && en !== localized) rows.push([en, localized]);
        }
      }
    }
    return rows.sort((a, b) => String(b[0] || '').length - String(a[0] || '').length);
  }

  function replaceKnownDisplayTokens(text = '', lang = 'zh-TW') {
    let output = String(text || '');
    if (!output) return '';
    const rows = buildKnownTextReplacementRows(lang);
    for (const [source, localized] of rows) {
      if (!source || !localized || source === localized) continue;
      output = output.split(source).join(localized);
    }
    return output;
  }

  function localizeDisplayText(text = '', lang = 'zh-TW') {
    const source = String(text || '');
    if (!source) return '';
    const code = normalizeLang(lang);
    const normalizedCjkSource = CONTENT_LOCALIZATION.localizeScriptOnly(source, 'zh-TW');
    let output = source;
    if (code === 'ko') {
      output = /[가-힣]/u.test(source) ? source : (translateTextToKo(source) || source);
    } else if (code === 'zh-CN' || code === 'zh-TW') {
      output = CONTENT_LOCALIZATION.localizeScriptOnly(source, code);
    } else {
      output = normalizedCjkSource || source;
    }
    return replaceKnownDisplayTokens(
      code === 'ko'
        ? CONTENT_LOCALIZATION.localizeScriptOnly(output, 'zh-TW')
        : output,
      code
    );
  }

  function formatWorldEvent(entry = null, lang = 'zh-TW') {
    if (!entry) return '';
    const code = normalizeLang(lang);
    const type = String(entry?.type || '').trim();
    const templates = RESOURCES.worldEventTemplates?.[code] || RESOURCES.worldEventTemplates?.['zh-TW'] || {};
    const actor = localizeDisplayText(String(entry?.actor || '').trim(), code) || localizeDisplayText('冒險者', code);
    const location = getLocationName(String(entry?.location || '').trim(), code) || localizeDisplayText(String(entry?.location || '').trim(), code);
    const rawTarget = String(entry?.target || '').trim();
    const target = getEnemyName(rawTarget, code) || getNpcName(rawTarget, code) || getLocationName(rawTarget, code) || localizeDisplayText(rawTarget, code);
    const impact = localizeDisplayText(String(entry?.impact || '').trim(), code).slice(0, 80);
    if (type && typeof templates[type] === 'function' && (actor || target || location)) {
      return String(templates[type]({ actor, location, target, impact }) || '').trim();
    }
    const rawMessage = String(entry?.message || entry?.rawMessage || '').trim();
    return localizeDisplayText(rawMessage, code);
  }

  return {
    RESOURCES,
    normalizeLang,
    getSection,
    getSectionAll,
    getRegionName,
    getLocationName,
    getNpcName,
    getEnemyName,
    replaceKnownDisplayTokens,
    localizeDisplayText,
    formatWorldEvent
  };
}

module.exports = {
  createGlobalLanguageResources,
  ...CONTENT_LOCALIZATION
};
