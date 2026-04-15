function createGlobalLanguageResources(deps = {}) {
  const {
    normalizeLangCode = (lang = 'zh-TW') => String(lang || 'zh-TW')
  } = deps;
  let mapTextUtilsFactory = null;

  function normalizeLang(lang = 'zh-TW') {
    const raw = String(normalizeLangCode(lang) || '').trim();
    if (raw === 'zh-CN' || raw === 'en') return raw;
    return 'zh-TW';
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
        sectionUpcomingChoices: '🆕 即將更新選項'
      },
      'zh-CN': {
        statusLabel: '状态',
        statusHp: '气血',
        statusEnergy: '能量',
        statusCurrency: 'Rns 代币',
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
        sectionUpcomingChoices: '🆕 即将更新选项'
      },
      en: {
        statusLabel: 'Status',
        statusHp: 'HP',
        statusEnergy: 'Energy',
        statusCurrency: 'Rns Tokens',
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
        sectionUpcomingChoices: '🆕 Incoming Choices'
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
      ].join('\n')
    },

    // Used by: modules/systems/map/map-render-utils.js
    mapRenderLegendLabels: {
      'zh-TW': { you: '目前位置', portal: '主傳送門', city: '城市', forest: '森林' },
      'zh-CN': { you: '目前位置', portal: '主传送门', city: '城市', forest: '森林' },
      en: { you: 'You', portal: 'Portal Hub', city: 'City', forest: 'Forest' }
    },

    // Used by: modules/systems/map/map-render-utils.js
    mapRegionNames: {
      '北境高原': { 'zh-TW': '北境高原', 'zh-CN': '北境高原', en: 'Northern Highlands' },
      '中原核心': { 'zh-TW': '中原核心', 'zh-CN': '中原核心', en: 'Central Core' },
      '西域沙海': { 'zh-TW': '西域沙海', 'zh-CN': '西域沙海', en: 'Western Sandsea' },
      '南疆水網': { 'zh-TW': '南疆水網', 'zh-CN': '南疆水网', en: 'Southern Waterways' },
      '群島航線': { 'zh-TW': '群島航線', 'zh-CN': '群岛航线', en: 'Archipelago Routes' },
      '隱秘深域': { 'zh-TW': '隱秘深域', 'zh-CN': '隐秘深域', en: 'Hidden Deep Zone' }
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
          backInventory: '🎒 返回背包',
          backMenu: '返回主選單'
        },
        memoryAudit: {
          noRecords: '暫無記錄',
          title: '🧠 記憶檢查',
          desc: '查看每回合寫入記憶的內容，以及為何被判定需要保留。',
          streamTitle: '最近24筆流水',
          categorySummary: '📊 類別分佈',
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
          backInventory: '🎒 返回背包',
          backMenu: '返回主选单'
        },
        memoryAudit: {
          noRecords: '暂无记录',
          title: '🧠 记忆检查',
          desc: '查看每回合写入记忆的内容，以及为何被判定需要保留。',
          streamTitle: '最近24笔流水',
          categorySummary: '📊 類別分佈',
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
          backInventory: '🎒 Back to Inventory',
          backMenu: 'Back to Menu'
        },
        memoryAudit: {
          noRecords: 'No records',
          title: '🧠 Memory Audit',
          desc: 'Detailed log of what was written into memory each turn and why.',
          streamTitle: 'Recent 24 Records',
          categorySummary: '📊 Category Summary',
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
        renaissEstimate: ({ soldCount, avgRatePct, total }) => `這批 ${soldCount} 件估值 ${total} Rns 代幣，約為基準價的 ${avgRatePct}%。`
      },
      'zh-CN': {
        noSellable: '你现在没有可出售物品，整理背包后再来。',
        digitalMasked: ({ soldCount, total }) => `这批 ${soldCount} 件我先按 ${total} Rns 代币帮你快速成交；想更稳，下一笔再去另一家比价。`,
        digitalNormal: ({ soldCount, total }) => `这批 ${soldCount} 件我给你 ${total} Rns 代币，成交很快；不过你也知道，这种报价会偏向柜台。`,
        renaissEstimate: ({ soldCount, avgRatePct, total }) => `这批 ${soldCount} 件估值 ${total} Rns 代币，约为基准价的 ${avgRatePct}%。`
      },
      en: {
        noSellable: 'No sellable items right now. Come back after collecting more materials.',
        digitalMasked: ({ soldCount, total }) => `You moved ${soldCount} items for ${total} Rns. Quick lane complete, but compare a second quote before your next sale.`,
        digitalNormal: ({ soldCount, total }) => `I can close ${soldCount} items at ${total} Rns now. It looks efficient, but this quote favors the desk.`,
        renaissEstimate: ({ soldCount, avgRatePct, total }) => `Appraised ${soldCount} items at ${total} Rns (about ${avgRatePct}% of baseline).`
      }
    }
  };

  function getSection(section = '', lang = 'zh-TW', context = null) {
    const code = normalizeLang(lang);
    if (String(section || '') === 'mapText') {
      return resolveMapText(code, context || {});
    }
    const rows = RESOURCES[String(section || '')] || null;
    if (!rows || typeof rows !== 'object') return {};
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
    return row[code] || row['zh-TW'] || source;
  }

  return {
    RESOURCES,
    normalizeLang,
    getSection,
    getSectionAll,
    getRegionName
  };
}

module.exports = {
  createGlobalLanguageResources
};
