// Internal helper module for dynamic localization logic.
// Public callers should import from global-language-resources.js instead.

let convertCNToTW = (text) => String(text || '');
let convertTWToCN = (text) => String(text || '');
try {
  const OpenCC = require('opencc-js');
  convertCNToTW = OpenCC.Converter({ from: 'cn', to: 'tw' });
  convertTWToCN = OpenCC.Converter({ from: 'tw', to: 'cn' });
} catch {
  // OpenCC is optional. Fallback keeps original text.
}

const SKILL_CHIP_PREFIX = Object.freeze({
  'zh-TW': '技能晶片：',
  'zh-CN': '技能晶片：',
  en: 'Skill Chip: '
});

const COMMON_ITEM_TRANSLATIONS = Object.freeze({
  '乾糧一包': { 'zh-TW': '乾糧一包', 'zh-CN': '干粮一包', en: 'Ration Pack' },
  '水囊': { 'zh-TW': '水囊', 'zh-CN': '水囊', en: 'Water Flask' }
});

const CHOICE_TAGS = Object.freeze({
  high_risk: {
    emoji: '🔥',
    labels: { 'zh-TW': '高風險', 'zh-CN': '高风险', en: 'High Risk' },
    desc: {
      'zh-TW': '可能會受傷或失敗',
      'zh-CN': '可能会受伤或失败',
      en: 'May cause injury or failure'
    }
  },
  spend: {
    emoji: '💰',
    labels: { 'zh-TW': '需花錢', 'zh-CN': '需花钱', en: 'Costs Money' },
    desc: {
      'zh-TW': '需要花費金錢',
      'zh-CN': '需要花费金钱',
      en: 'Requires spending currency'
    }
  },
  social: {
    emoji: '🤝',
    labels: { 'zh-TW': '需社交', 'zh-CN': '需社交', en: 'Social' },
    desc: {
      'zh-TW': '需要與人交談',
      'zh-CN': '需要与人交谈',
      en: 'Requires talking to people'
    }
  },
  explore: {
    emoji: '🔍',
    labels: { 'zh-TW': '需探索', 'zh-CN': '需探索', en: 'Explore' },
    desc: {
      'zh-TW': '需要探索或搜尋',
      'zh-CN': '需要探索或搜寻',
      en: 'Requires exploration or searching'
    }
  },
  combat: {
    emoji: '⚔️',
    labels: { 'zh-TW': '會戰鬥', 'zh-CN': '会战斗', en: 'Combat Tension' },
    desc: {
      'zh-TW': '戰鬥張力升高（不一定立刻開打）',
      'zh-CN': '战斗张力升高（不一定立刻开打）',
      en: 'Conflict rises, but not always an immediate fight'
    }
  },
  reward: {
    emoji: '🎁',
    labels: { 'zh-TW': '高回報', 'zh-CN': '高回报', en: 'High Reward' },
    desc: {
      'zh-TW': '成功後收獲豐厚',
      'zh-CN': '成功后收获丰厚',
      en: 'Strong rewards if successful'
    }
  },
  surprise: {
    emoji: '❓',
    labels: { 'zh-TW': '有驚喜', 'zh-CN': '有惊喜', en: 'Uncertain' },
    desc: {
      'zh-TW': '結果未知',
      'zh-CN': '结果未知',
      en: 'Outcome is uncertain'
    }
  },
  appraisal: {
    emoji: '🏪',
    labels: { 'zh-TW': '鑑價站', 'zh-CN': '鉴价站', en: 'Appraisal' },
    desc: {
      'zh-TW': '可進入公信鑑價站',
      'zh-CN': '可进入公信鉴价站',
      en: 'Leads to the appraisal station'
    }
  },
  mystery_appraisal: {
    emoji: '🕳️',
    labels: { 'zh-TW': '神秘鑑價', 'zh-CN': '神秘鉴价', en: 'Mystery Appraisal' },
    desc: {
      'zh-TW': '可進入神秘鑑價站',
      'zh-CN': '可进入神秘鉴价站',
      en: 'Leads to the mysterious appraisal station'
    }
  },
  friendly_appraisal: {
    emoji: '🧩',
    labels: { 'zh-TW': '友善鑑價', 'zh-CN': '友善鉴价', en: 'Friendly Appraisal' },
    desc: {
      'zh-TW': '表面條件看似更友善',
      'zh-CN': '表面条件看似更友善',
      en: 'Looks newcomer-friendly on the surface'
    }
  },
  friendly_spar: {
    emoji: '🤝',
    labels: { 'zh-TW': '友誼賽', 'zh-CN': '友谊赛', en: 'Friendly Spar' },
    desc: {
      'zh-TW': '可進入友好切磋',
      'zh-CN': '可进入友好切磋',
      en: 'Starts a friendly spar'
    }
  }
});

const GENERATION_STATUS_TEXT = Object.freeze({
  'zh-TW': {
    loading: 'AI 說書人正在構思故事...',
    memory_context: 'AI 說書人正在整理記憶脈絡...',
    generating_story: 'AI 說書人正在撰寫故事...',
    story_ready: '故事已送達，正在生成選項...',
    generating_choices: '故事已送達，正在生成選項...',
    choices_ready: '選項已完成，正在排版回傳...',
    recovered_snapshot: '已恢復上次快照，正在整理畫面...',
    resume_cached: '已恢復上次故事與選項，正在同步畫面...',
    thinking_new_story: 'AI 說書人正在構思新故事...',
    writing_new_story: 'AI 說書人正在撰寫新故事...',
    story_generating_choices: '故事已送達，正在生成選項...',
    recovering_choices: 'AI 說書人正在補齊上次中斷的選項...',
    battle_fresh_story: 'AI 說書人正在承接戰鬥結果重塑新篇章...'
  },
  'zh-CN': {
    loading: 'AI 说书人正在构思故事...',
    memory_context: 'AI 说书人正在整理记忆脉络...',
    generating_story: 'AI 说书人正在撰写故事...',
    story_ready: '故事已送达，正在生成选项...',
    generating_choices: '故事已送达，正在生成选项...',
    choices_ready: '选项已完成，正在排版回传...',
    recovered_snapshot: '已恢复上次快照，正在整理画面...',
    resume_cached: '已恢复上次故事与选项，正在同步画面...',
    thinking_new_story: 'AI 说书人正在构思新故事...',
    writing_new_story: 'AI 说书人正在撰写新故事...',
    story_generating_choices: '故事已送达，正在生成选项...',
    recovering_choices: 'AI 说书人正在补齐上次中断的选项...',
    battle_fresh_story: 'AI 说书人正在承接战斗结果重塑新篇章...'
  },
  en: {
    loading: 'The AI storyteller is outlining the story...',
    memory_context: 'The AI storyteller is organizing memory context...',
    generating_story: 'The AI storyteller is writing the story...',
    story_ready: 'Story delivered. Generating choices...',
    generating_choices: 'Story delivered. Generating choices...',
    choices_ready: 'Choices are ready. Formatting response...',
    recovered_snapshot: 'Recovered the previous snapshot. Refreshing the scene...',
    resume_cached: 'Recovered the last story and choices. Syncing the scene...',
    thinking_new_story: 'The AI storyteller is planning the next scene...',
    writing_new_story: 'The AI storyteller is writing the next scene...',
    story_generating_choices: 'Story delivered. Generating choices...',
    recovering_choices: 'The AI storyteller is restoring the interrupted choices...',
    battle_fresh_story: 'The AI storyteller is reshaping the next scene after battle...'
  }
});

const LOADING_ANIMATION_TEXT = Object.freeze({
  'zh-TW': {
    defaultLabel: 'AI 說書人正在構思故事',
    phases: ['鋪陳場景', '安排角色互動', '生成分支選項', '補完世界細節']
  },
  'zh-CN': {
    defaultLabel: 'AI 说书人正在构思故事',
    phases: ['铺陈场景', '安排角色互动', '生成分支选项', '补完世界细节']
  },
  en: {
    defaultLabel: 'The AI storyteller is outlining the story',
    phases: ['Framing the scene', 'Placing character beats', 'Generating branches', 'Filling world detail']
  }
});

const SKILL_CHIP_UI_TEXT = Object.freeze({
  'zh-TW': {
    invalidChipData: '⚠️ 技能晶片資料錯誤，請重新選擇。',
    invalidUnlearnData: '⚠️ 取消學習資料錯誤，請重新選擇。',
    missingActor: '⚠️ 找不到要操作的寵物或角色。',
    missingMoveTemplate: '⚠️ 找不到該技能模板，可能與寵物類型不符。',
    wrongElement: '⚠️ 這個技能不適用於目前寵物屬性，請改選同屬性技能晶片。',
    alreadyLearned: (moveName) => `ℹ️ ${moveName} 已經學會，請直接在上陣欄配置。`,
    duplicateLearn: (moveName) => `ℹ️ ${moveName} 已經學會，無需重複學習。`,
    loadoutFull: (limit) => `⚠️ 上陣招式已滿 ${limit} 招，請先取消學習一招再學新技能。`,
    inventoryMissing: (chipName) => `⚠️ 背包內找不到「${chipName}」。`,
    learnFailed: (reason) => `⚠️ ${reason || '學習失敗'}（已退回晶片）`,
    replaceNote: (moveName) => `（上陣名額已滿，已替換「${moveName}」）`,
    learnSuccess: (moveName, note = '') => `已學習並上陣：${moveName}${note ? ` ${note}` : ''}`.trim(),
    moveMissing: '⚠️ 這招不存在或已被移除。',
    protectedMove: '⚠️ 基礎招式不能取消學習。',
    unlearnFailed: (reason) => `❌ ${reason || '取消學習失敗'}`,
    unlearnSuccess: (moveName) => `已取消學習：${moveName}（已退回技能晶片）`,
    missingPet: '⚠️ 找不到要設定的寵物。',
    autoAssignEnabled: 'ℹ️ 已改為自動上陣模式：已學會攻擊招式會自動攜帶；不想用請取消學習。',
    listingIncomplete: '技能晶片掛賣資料不完整。',
    listingSourceMissing: '找不到可掛賣的技能晶片來源。',
    listingMoveMissing: (moveName) => `技能「${moveName}」不存在或已被移除。`,
    cannotSellFlee: '逃跑技能不可掛賣。',
    unequipBeforeSell: (moveName) => `請先把「${moveName}」從上陣招式卸下，再掛賣。`,
    notEquippedYet: (price) => `參考價 ${price} Rns｜未上陣`,
    learnedSkill: (moveName) => `已學會技能：${moveName}`,
    gainedSkillChip: (moveName) => `獲得技能晶片：${moveName}`,
    starterGiftTitle: '🎁 開局贈禮：免費五連抽',
    starterGiftEmpty: '本次技能晶片發放失敗，請稍後重試。',
    starterGiftValue: (count, chipLine) => `已發放為技能晶片（已進背包，可販售；想學再到寵物招式頁學習）。\n本次新增：${count} 張\n${chipLine}`,
    gachaFieldChips: '📚 本次獲取技能晶片',
    gachaLearnRuleTitle: '📌 學習規則',
    gachaLearnRuleValue: '抽到的是技能晶片；請到「🐾 寵物」頁面用下拉選單學習/取消學習。',
    gachaSellRuleTitle: '📦 販賣規則',
    gachaSellRuleValue: '商店掛賣時，會以「技能晶片」名稱販賣。',
    gachaNoNew: '（本次無新增）'
  },
  'zh-CN': {
    invalidChipData: '⚠️ 技能晶片资料错误，请重新选择。',
    invalidUnlearnData: '⚠️ 取消学习资料错误，请重新选择。',
    missingActor: '⚠️ 找不到要操作的宠物或角色。',
    missingMoveTemplate: '⚠️ 找不到该技能模板，可能与宠物类型不符。',
    wrongElement: '⚠️ 这个技能不适用于当前宠物属性，请改选同属性技能晶片。',
    alreadyLearned: (moveName) => `ℹ️ ${moveName} 已经学会，请直接在上阵栏配置。`,
    duplicateLearn: (moveName) => `ℹ️ ${moveName} 已经学会，无需重复学习。`,
    loadoutFull: (limit) => `⚠️ 上阵招式已满 ${limit} 招，请先取消学习一招再学新技能。`,
    inventoryMissing: (chipName) => `⚠️ 背包内找不到「${chipName}」。`,
    learnFailed: (reason) => `⚠️ ${reason || '学习失败'}（已退回晶片）`,
    replaceNote: (moveName) => `（上阵名额已满，已替换「${moveName}」）`,
    learnSuccess: (moveName, note = '') => `已学习并上阵：${moveName}${note ? ` ${note}` : ''}`.trim(),
    moveMissing: '⚠️ 这招不存在或已被移除。',
    protectedMove: '⚠️ 基础招式不能取消学习。',
    unlearnFailed: (reason) => `❌ ${reason || '取消学习失败'}`,
    unlearnSuccess: (moveName) => `已取消学习：${moveName}（已退回技能晶片）`,
    missingPet: '⚠️ 找不到要设定的宠物。',
    autoAssignEnabled: 'ℹ️ 已改为自动上阵模式：已学会攻击招式会自动携带；不想用请取消学习。',
    listingIncomplete: '技能晶片挂卖资料不完整。',
    listingSourceMissing: '找不到可挂卖的技能晶片来源。',
    listingMoveMissing: (moveName) => `技能「${moveName}」不存在或已被移除。`,
    cannotSellFlee: '逃跑技能不可挂卖。',
    unequipBeforeSell: (moveName) => `请先把「${moveName}」从上阵招式卸下，再挂卖。`,
    notEquippedYet: (price) => `参考价 ${price} Rns｜未上阵`,
    learnedSkill: (moveName) => `已学会技能：${moveName}`,
    gainedSkillChip: (moveName) => `获得技能晶片：${moveName}`,
    starterGiftTitle: '🎁 开局赠礼：免费五连抽',
    starterGiftEmpty: '本次技能晶片发放失败，请稍后重试。',
    starterGiftValue: (count, chipLine) => `已发放为技能晶片（已进背包，可贩售；想学再到宠物招式页学习）。\n本次新增：${count} 张\n${chipLine}`,
    gachaFieldChips: '📚 本次获取技能晶片',
    gachaLearnRuleTitle: '📌 学习规则',
    gachaLearnRuleValue: '抽到的是技能晶片；请到「🐾 宠物」页面用下拉选单学习/取消学习。',
    gachaSellRuleTitle: '📦 贩卖规则',
    gachaSellRuleValue: '商店挂卖时，会以「技能晶片」名称贩卖。',
    gachaNoNew: '（本次无新增）'
  },
  en: {
    invalidChipData: '⚠️ Invalid skill chip data. Please choose again.',
    invalidUnlearnData: '⚠️ Invalid unlearn data. Please choose again.',
    missingActor: '⚠️ Could not find the target pet or character.',
    missingMoveTemplate: '⚠️ Move template not found. It may not match this pet type.',
    wrongElement: '⚠️ This move does not match the current pet element. Choose a compatible skill chip.',
    alreadyLearned: (moveName) => `ℹ️ ${moveName} is already learned. Adjust it from the loadout instead.`,
    duplicateLearn: (moveName) => `ℹ️ ${moveName} is already learned. No need to learn it again.`,
    loadoutFull: (limit) => `⚠️ Battle loadout is full at ${limit} moves. Unlearn one move first.`,
    inventoryMissing: (chipName) => `⚠️ ${chipName} was not found in your bag.`,
    learnFailed: (reason) => `⚠️ ${reason || 'Learning failed'} (chip returned)`,
    replaceNote: (moveName) => `(loadout was full, replaced "${moveName}")`,
    learnSuccess: (moveName, note = '') => `Learned and equipped: ${moveName}${note ? ` ${note}` : ''}`.trim(),
    moveMissing: '⚠️ This move no longer exists or was removed.',
    protectedMove: '⚠️ Base moves cannot be unlearned.',
    unlearnFailed: (reason) => `❌ ${reason || 'Unlearn failed'}`,
    unlearnSuccess: (moveName) => `Unlearned: ${moveName} (skill chip returned)`,
    missingPet: '⚠️ Could not find the pet to configure.',
    autoAssignEnabled: 'ℹ️ Auto-loadout enabled: learned attack moves will be carried automatically. Unlearn a move if you do not want it.',
    listingIncomplete: 'Skill chip listing data is incomplete.',
    listingSourceMissing: 'Could not find the source skill chip for listing.',
    listingMoveMissing: (moveName) => `Move "${moveName}" does not exist or was removed.`,
    cannotSellFlee: 'Flee-type moves cannot be listed for sale.',
    unequipBeforeSell: (moveName) => `Remove "${moveName}" from the active loadout before listing it.`,
    notEquippedYet: (price) => `Ref ${price} Rns | Not equipped`,
    learnedSkill: (moveName) => `Learned move: ${moveName}`,
    gainedSkillChip: (moveName) => `Received skill chip: ${moveName}`,
    starterGiftTitle: '🎁 Starter Gift: Free 5-Pack',
    starterGiftEmpty: 'Skill chip grant failed this time. Please try again later.',
    starterGiftValue: (count, chipLine) => `Granted as skill chips and placed in your bag. You can sell them now or learn them later from the pet move page.\nNew this time: ${count}\n${chipLine}`,
    gachaFieldChips: '📚 Skill Chips Obtained',
    gachaLearnRuleTitle: '📌 Learn Rule',
    gachaLearnRuleValue: 'Draw results become skill chips. Learn or unlearn them from the "🐾 Pet" page.',
    gachaSellRuleTitle: '📦 Sell Rule',
    gachaSellRuleValue: 'When listed in the shop, they are sold as skill chips.',
    gachaNoNew: '(No new chips this time)'
  }
});

const MOVE_LOCALIZATION = Object.freeze([
  ['golden_needle', '脈衝標定', 'Pulse Calibration'],
  ['iron_palm', '合金撞擊', 'Alloy Ram'],
  ['shield_stance', '稜鏡護層', 'Prism Sheath'],
  ['spider_net', '纖維束縛', 'Fiber Bind'],
  ['grass_cloak', '生物修補', 'Biorepair'],
  ['root_trap', '根網干擾', 'Root Net Interference'],
  ['willow_water', '淨化波', 'Purge Wave'],
  ['water_splash', '水壓脈衝', 'Pressure Pulse'],
  ['mist_step', '霧相位移', 'Mist Phase'],
  ['needle_rain', '碎晶風暴', 'Crystal Storm'],
  ['golden_bell', '堡壘力場', 'Bastion Field'],
  ['heavenly_flowers', '孢子刃雨', 'Spore Blade Rain'],
  ['ice_palm', '低溫衝擊', 'Cryo Impact'],
  ['blaze_sky', '電漿盛放', 'Plasma Bloom'],
  ['flame_armor', '熱盾回路', 'Thermal Shield Circuit'],
  ['rejuvenation', '再生矩陣', 'Regeneration Matrix'],
  ['rock_trap', '隕塊墜落', 'Meteor Drop'],
  ['quicksand', '漂砂陷落', 'Drifting Quicksand'],
  ['tide_barrier', '潮幕護壁', 'Tidal Barrier'],
  ['frost_lance', '霜稜突刺', 'Frost Lance'],
  ['steam_screen', '蒸汽迷障', 'Steam Veil'],
  ['wildfire_chain', '野火連鎖', 'Wildfire Chain'],
  ['cinder_smoke', '燼霧擾流', 'Cinder Haze'],
  ['flare_snare', '焰鎖牽制', 'Flare Snare'],
  ['thorn_bind', '棘藤封步', 'Thorn Bind'],
  ['spore_haze', '孢霧惑心', 'Spore Haze'],
  ['forest_mend', '森息回春', 'Forest Mend'],
  ['vine_bastion', '藤甲堡壘', 'Vine Bastion'],
  ['rip_current', '裂流切線', 'Riptide Cut'],
  ['bubble_guard', '泡沫護甲', 'Bubble Guard'],
  ['echo_wave', '回音水波', 'Echo Wave'],
  ['spring_pulse', '泉心脈衝', 'Spring Pulse'],
  ['foam_dart', '沫刃突刺', 'Foam Dart'],
  ['stream_guard', '流盾護持', 'Stream Guard'],
  ['rain_edge', '驟雨刃', 'Rain Edge'],
  ['mirror_tide', '鏡潮反域', 'Mirror Tide'],
  ['deep_pressure', '深海壓潰', 'Abyssal Crush'],
  ['clear_mind_tide', '清心潮息', 'Clarity Tide'],
  ['current_chain', '流鎖纏潮', 'Current Chain'],
  ['ember_step', '餘燼步', 'Ember Step'],
  ['ash_guard', '灰燼護幕', 'Ash Guard'],
  ['flare_jab', '炫光突刺', 'Flare Jab'],
  ['magma_bite', '熔牙咬擊', 'Magma Bite'],
  ['sunforge', '日鍛迴路', 'Sunforge Circuit'],
  ['spark_claw', '火花爪裂', 'Spark Claw'],
  ['char_pulse', '焦痕脈衝', 'Char Pulse'],
  ['lava_step', '熔步突進', 'Lava Rush'],
  ['firebrand_strike', '炎印重擊', 'Firebrand Strike'],
  ['volcanic_burst', '熔岩爆湧', 'Volcanic Surge'],
  ['smoke_screen', '煙幕火牆', 'Smoke Firewall'],
  ['burning_edge', '灼鋒連斬', 'Burning Edge'],
  ['heat_sink', '熾核護盾', 'Cinder Core Shield'],
  ['seed_shot', '種子速射', 'Seed Volley'],
  ['leaf_step', '葉影步', 'Leafstep'],
  ['bark_skin', '樹皮硬化', 'Barkskin'],
  ['dew_heal', '晨露療息', 'Morning Dew'],
  ['thorn_whip', '荊棘鞭擊', 'Thorn Whip'],
  ['bud_guard', '芽盾護生', 'Bud Guard'],
  ['sap_strike', '樹液擊', 'Sap Strike'],
  ['petal_dance', '花瓣舞步', 'Petal Dance'],
  ['pollen_shock', '花粉震盪', 'Pollen Shock'],
  ['root_spike', '根槍穿刺', 'Root Spike'],
  ['nature_cycle', '循環新生', 'Nature Cycle'],
  ['ancient_canopy', '遠古樹冠', 'Ancient Canopy'],
  ['flood_torrent', '潮汐奇點', 'Tidal Singularity'],
  ['fire_lotus', '日核裂解', 'Solar Fission'],
  ['arhat_kick', '地脈衝撞', 'Leyline Crash'],
  ['wind_fire_blade', '風暴聚變', 'Storm Fusion'],
  ['thunder_crash', '雷矢超載', 'Thunderbolt Overload'],
  ['maelstrom_prison', '渦牢封界', 'Maelstrom Prison'],
  ['ocean_renewal', '海核復甦', 'Ocean Core Renewal'],
  ['inferno_drive', '煉獄推進', 'Inferno Drive'],
  ['phoenix_guard', '鳳燼守輪', 'Phoenix Guardwheel'],
  ['bloom_overgrowth', '繁花覆域', 'Blooming Overgrowth'],
  ['shadow_slash', '影域切割', 'Shadow Slash'],
  ['shadow_lock', '故障鎖定', 'Glitch Lock'],
  ['fear_presence', '恐懼脈衝', 'Fear Pulse'],
  ['spider_silk', '黏網拘束', 'Web Snare'],
  ['minor_poison', '毒霧火花', 'Toxic Spark'],
  ['curse_word', '靜電咒訊', 'Static Hex'],
  ['soul_drain', '核心抽離', 'Core Drain'],
  ['soul_scatter', '神經霧化', 'Neural Mist'],
  ['seven_step_poison', '腐蝕鏈劑', 'Corrosion Chain'],
  ['bone_dissolver', '熔蝕酸流', 'Melting Acidflow'],
  ['hot_sand_hell', '炙砂域', 'Scorchsand Field'],
  ['plague_cloud', '疫霧群', 'Plague Cloud'],
  ['iron_thorn', '棘甲反刺', 'Iron Thorn'],
  ['hell_fire', '煉域協議', 'Infernal Protocol'],
  ['explosive_pill', '連鎖爆訊', 'Chain Detonation'],
  ['ghost_fire', '幽格炙流', 'Spectral Scorch'],
  ['silver_snake', '銀鏈束陣', 'Silver Chain Array'],
  ['ice_toxin', '冰毒脈衝', 'Cryotoxin Pulse'],
  ['mud_fire_lotus', '泥焰遮幕', 'Mudflame Veil'],
  ['ultimate_dark', '零界崩解', 'Null Boundary Collapse'],
  ['head_butt', '頭槌', 'Headbutt'],
  ['flee', '逃跑', 'Flee']
]);

const MOVE_EN_BY_ID = new Map(MOVE_LOCALIZATION.map(([id, zh, en]) => [String(id), { zh, en }]));
const MOVE_EN_BY_ZH = new Map(MOVE_LOCALIZATION.map(([id, zh, en]) => [String(zh), { id, en }]));

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
    lower === 'en-us' ||
    lower.startsWith('en-')
  ) return 'en';
  return 'zh-TW';
}

function localizeScriptOnly(text = '', lang = 'zh-TW') {
  const source = String(text || '');
  const code = normalizeLangCode(lang);
  if (!source) return '';
  if (code === 'zh-CN') return convertTWToCN(source);
  if (code === 'zh-TW') return convertCNToTW(source);
  return source;
}

function getSkillChipPrefix(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  return SKILL_CHIP_PREFIX[code] || SKILL_CHIP_PREFIX['zh-TW'];
}

function buildSkillChipPrefixAliases() {
  return [
    '技能晶片：',
    '技能晶片:',
    '技能晶片-',
    '技能晶片－',
    '技能芯片：',
    '技能芯片:',
    '技能芯片-',
    '技能芯片－',
    'Skill Chip: ',
    'Skill Chip:',
    'Skill Chip -',
    'Skill Chip－',
    'SkillChip:'
  ];
}

const SKILL_CHIP_PREFIX_ALIASES = buildSkillChipPrefixAliases();

function stripSkillChipPrefix(name = '') {
  const text = String(name || '').trim();
  if (!text) return '';
  for (const prefix of SKILL_CHIP_PREFIX_ALIASES) {
    if (text.startsWith(prefix)) return text.slice(prefix.length).trim();
  }
  const regexMatch = text.match(/^(?:技能晶片|技能芯片|skill\s*chip)\s*[:：\-－]?\s*(.+)$/iu);
  if (regexMatch?.[1]) return String(regexMatch[1] || '').trim();
  return '';
}

function getMoveLocalization(moveId = '', moveName = '', lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const safeMoveId = String(moveId || '').trim();
  const fallbackName = String(moveName || '').trim();
  if (code === 'en') {
    const byId = safeMoveId ? MOVE_EN_BY_ID.get(safeMoveId) : null;
    if (byId?.en) return byId.en;
    const byZh = fallbackName ? MOVE_EN_BY_ZH.get(convertCNToTW(fallbackName)) : null;
    return byZh?.en || fallbackName;
  }
  if (code === 'zh-CN') return localizeScriptOnly(fallbackName, 'zh-CN');
  return localizeScriptOnly(fallbackName, 'zh-TW');
}

function formatSkillChipDisplay(moveId = '', moveName = '', lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const localizedMoveName = getMoveLocalization(moveId, moveName, code) || String(moveName || '').trim();
  return `${getSkillChipPrefix(code)}${localizedMoveName}`.trim();
}

function buildItemNamePack(raw = null) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const names = raw.names && typeof raw.names === 'object'
      ? raw.names
      : (raw.itemNames && typeof raw.itemNames === 'object' ? raw.itemNames : null);
    if (names) {
      return {
        'zh-TW': String(names['zh-TW'] || raw.name || raw.itemName || '').trim(),
        'zh-CN': String(names['zh-CN'] || localizeScriptOnly(names['zh-TW'] || raw.name || raw.itemName || '', 'zh-CN')).trim(),
        en: String(names.en || raw.name || raw.itemName || '').trim()
      };
    }
  }

  const baseName = typeof raw === 'string'
    ? String(raw).trim()
    : String(raw?.name || raw?.itemName || '').trim();
  if (!baseName) return null;

  const common = COMMON_ITEM_TRANSLATIONS[baseName];
  if (common) {
    return {
      'zh-TW': String(common['zh-TW'] || baseName),
      'zh-CN': String(common['zh-CN'] || localizeScriptOnly(baseName, 'zh-CN')),
      en: String(common.en || baseName)
    };
  }

  const chipMoveName = stripSkillChipPrefix(baseName);
  if (chipMoveName) {
    const zhTwMoveName = localizeScriptOnly(chipMoveName, 'zh-TW');
    return {
      'zh-TW': `${getSkillChipPrefix('zh-TW')}${zhTwMoveName}`,
      'zh-CN': `${getSkillChipPrefix('zh-CN')}${localizeScriptOnly(zhTwMoveName, 'zh-CN')}`,
      en: `${getSkillChipPrefix('en')}${getMoveLocalization('', zhTwMoveName, 'en')}`
    };
  }

  return {
    'zh-TW': localizeScriptOnly(baseName, 'zh-TW'),
    'zh-CN': localizeScriptOnly(baseName, 'zh-CN'),
    en: baseName
  };
}

function getLocalizedItemName(raw = null, lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const pack = buildItemNamePack(raw);
  if (!pack) return '';
  return String(pack[code] || pack['zh-TW'] || '').trim();
}

function getLocalizedItemDesc(raw = null, lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  const descs = raw.descs && typeof raw.descs === 'object' ? raw.descs : null;
  const desc = descs?.[code] || descs?.['zh-TW'] || raw.desc || '';
  return localizeScriptOnly(desc, code);
}

function resolveChoiceTagKey(tag = '') {
  const text = String(tag || '').replace(/[【】\[\]]/g, '').trim();
  if (!text) return '';
  if (/🔥|高風險|高风险|high\s*risk/iu.test(text)) return 'high_risk';
  if (/💰|需花錢|需花钱|costs?\s*money|spend/iu.test(text)) return 'spend';
  if (/🤝|需社交|社交|social|友誼賽|友谊赛|friendly\s*spar/iu.test(text)) return text.includes('友') || /friendly\s*spar/iu.test(text) ? 'friendly_spar' : 'social';
  if (/🔍|需探索|探索|explore/iu.test(text)) return 'explore';
  if (/⚔️|會戰鬥|会战斗|combat/iu.test(text)) return 'combat';
  if (/🎁|高回報|高回报|high\s*reward/iu.test(text)) return 'reward';
  if (/❓|有驚喜|有惊喜|uncertain|surprise/iu.test(text)) return 'surprise';
  if (/🏪|鑑價站|鉴价站|appraisal/iu.test(text)) return 'appraisal';
  if (/🕳️|神秘鑑價|神秘鉴价|mystery\s*appraisal/iu.test(text)) return 'mystery_appraisal';
  if (/🧩|友善鑑價|友善鉴价|friendly\s*appraisal/iu.test(text)) return 'friendly_appraisal';
  return '';
}

function getChoiceTag(key = '', lang = 'zh-TW') {
  const row = CHOICE_TAGS[String(key || '').trim()];
  if (!row) return '';
  const code = normalizeLangCode(lang);
  return `[${row.emoji}${row.labels[code] || row.labels['zh-TW']}]`;
}

function localizeChoiceTag(tag = '', lang = 'zh-TW') {
  const key = resolveChoiceTagKey(tag);
  return key ? getChoiceTag(key, lang) : localizeScriptOnly(tag, lang);
}

function getChoiceTagPromptLines(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const orderedKeys = ['high_risk', 'spend', 'social', 'explore', 'combat', 'reward', 'surprise'];
  return orderedKeys
    .map((key) => {
      const row = CHOICE_TAGS[key];
      return `- ${getChoiceTag(key, code)} - ${row.desc[code] || row.desc['zh-TW']}`;
    })
    .join('\n');
}

function isAggressiveChoiceTag(tag = '') {
  const key = resolveChoiceTagKey(tag);
  return key === 'high_risk' || key === 'combat';
}

function getGenerationStatusText(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  return GENERATION_STATUS_TEXT[code] || GENERATION_STATUS_TEXT['zh-TW'];
}

function getLoadingAnimationText(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  return LOADING_ANIMATION_TEXT[code] || LOADING_ANIMATION_TEXT['zh-TW'];
}

function getSkillChipUiText(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  return SKILL_CHIP_UI_TEXT[code] || SKILL_CHIP_UI_TEXT['zh-TW'];
}

function joinLocalizedList(items = [], lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const list = (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return list.join(code === 'en' ? ', ' : '、');
}

module.exports = {
  normalizeLangCode,
  localizeScriptOnly,
  getSkillChipPrefix,
  stripSkillChipPrefix,
  getMoveLocalization,
  formatSkillChipDisplay,
  buildItemNamePack,
  getLocalizedItemName,
  getLocalizedItemDesc,
  resolveChoiceTagKey,
  getChoiceTag,
  localizeChoiceTag,
  getChoiceTagPromptLines,
  isAggressiveChoiceTag,
  getGenerationStatusText,
  getLoadingAnimationText,
  getSkillChipUiText,
  joinLocalizedList
};
