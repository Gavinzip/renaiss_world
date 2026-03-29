/**
 * 🗡️ 刀鋒 BLADE - 互動按鈕系統
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// ============== 按鈕定義 ==============
const BUTTON_IDS = {
  // 主選單
  MAIN_MENU: 'main_menu',
  EXPLORE: 'explore',
  FIGHT: 'fight',
  REST: 'rest',
  TRADE: 'trade',
  SKILLS: 'skills',
  INVENTORY: 'inventory',
  MAP: 'map',
  
  // 子選單
  BACK: 'back',
  GOTO_XIANGYANG: 'goto_襄陽城',
  GOTO_ZHONGNAN: 'goto_終南山',
  GOTO_WUDANG: 'goto_武當山',
  GOTO_DALI: 'goto_大理',
  GOTO_BEIJING: 'goto_北京',
  GOTO_LIANSHAN: 'goto_靈鷲宮',
  GOTO_HEIFENG: 'goto_黑風寨',
  GOTO_YELANG: 'goto_野狼谷',
  GOTO_HUAXIA: 'goto_華山',
  
  // 動作
  HARVEST: 'harvest',
  SEARCH_SECRET: 'search_secret',
  CHALLENGE_BOSS: 'challenge_boss',
  RECRUIT_NPC: 'recruit_npc',
  
  // 戰鬥
  ATTACK: 'attack',
  DEFEND: 'defend',
  FLEE: 'flee',
  USE_ITEM: 'use_item',
  
  // 武學
  PRACTICE: 'practice',
  LEARN_NEW: 'learn_new',
  VIEW_MANUALS: 'view_manuals'
};

// ============== 主選單按鈕 ==============
function getMainMenuButtons(player) {
  // 根據玩家狀態給予建議
  const hp = player.stats?.生命 || 100;
  const maxHp = player.maxStats?.生命 || 100;
  const hpLow = hp < maxHp * 0.5;
  const wealth = player.stats?.財富 || 50;
  
  // 緊急提示
  let urgentLabel = '';
  if (hpLow) {
    urgentLabel = '⚠️ 生命低！';
  } else if (wealth < 20) {
    urgentLabel = '💰 銀兩不足！';
  } else {
    urgentLabel = '🎮 選擇行動';
  }
  
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.EXPLORE)
      .setLabel('🔍 探索城市')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🔍'),
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.FIGHT)
      .setLabel('⚔️ 戰鬥')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⚔️'),
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.REST)
      .setLabel('😴 休息')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('😴'),
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.TRADE)
      .setLabel('💰 交易')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('💰')
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.SKILLS)
      .setLabel('🗡️ 武學')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🗡️'),
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.INVENTORY)
      .setLabel('🎒 背包')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🎒'),
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.MAP)
      .setLabel('🗺️ 移動')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🗺️'),
    new ButtonBuilder()
      .setCustomId('btn_advice')
      .setLabel('💡 幫我')
      .setStyle(ButtonStyle.Success)
      .setEmoji('💡')
  );
  
  return [row1, row2];
}

// ============== 結果展示（包含下一步指引）==============
function getActionResultButtons(action, result, player) {
  const rows = [];
  
  // 根據行動類型給予不同按鈕
  if (action === 'explore') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(BUTTON_IDS.HARVEST).setLabel('🌿 采集資源').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('choice_tavern').setLabel('🍺 去酒樓').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('choice_dojo').setLabel('🗡️ 去武館').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(BUTTON_IDS.MAP).setLabel('🗺️ 換地方').setStyle(ButtonStyle.Secondary)
      )
    );
  } else if (action === 'adventure') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(BUTTON_IDS.EXPLORE).setLabel('🔍 繼續探索').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('choice_quest').setLabel('📜 接任務').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(BUTTON_IDS.MAP).setLabel('🗺️ 去別處').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_advice').setLabel('💡 不知道').setStyle(ButtonStyle.Secondary)
      )
    );
  } else {
    // 通用
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(BUTTON_IDS.EXPLORE).setLabel('🔍 探索').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(BUTTON_IDS.FIGHT).setLabel('⚔️ 戰鬥').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(BUTTON_IDS.REST).setLabel('😴 休息').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_advice').setLabel('💡 下一步？').setStyle(ButtonStyle.Secondary)
      )
    );
  }
  
  return rows;
}

// ============== 地圖按鈕 ==============
function getMapButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BUTTON_IDS.GOTO_XIANGYANG).setLabel('襄陽城').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(BUTTON_IDS.GOTO_ZHONGNAN).setLabel('終南山').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(BUTTON_IDS.GOTO_WUDANG).setLabel('武當山').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BUTTON_IDS.GOTO_DALI).setLabel('大理').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(BUTTON_IDS.GOTO_BEIJING).setLabel('北京').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(BUTTON_IDS.GOTO_LIANSHAN).setLabel('靈鷲宮').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BUTTON_IDS.GOTO_HEIFENG).setLabel('黑風寨').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(BUTTON_IDS.GOTO_YELANG).setLabel('野狼谷').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(BUTTON_IDS.GOTO_HUAXIA).setLabel('華山').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(BUTTON_IDS.BACK).setLabel('返回').setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ============== 戰鬥按鈕 ==============
function getFightButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BUTTON_IDS.ATTACK).setLabel('⚔️ 攻擊').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(BUTTON_IDS.DEFEND).setLabel('🛡️ 防禦').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(BUTTON_IDS.USE_ITEM).setLabel('💊 使用道具').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(BUTTON_IDS.FLEE).setLabel('🏃 逃跑').setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ============== 武學按鈕 ==============
function getSkillsButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BUTTON_IDS.PRACTICE).setLabel('🧘 修煉').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(BUTTON_IDS.LEARN_NEW).setLabel('📖 學新武功').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(BUTTON_IDS.VIEW_MANUALS).setLabel('📚 秘籍').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(BUTTON_IDS.BACK).setLabel('返回').setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ============== 探索按鈕 ==============
function getExploreButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BUTTON_IDS.HARVEST).setLabel('🌿 采集').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('choice_tavern').setLabel('🍺 酒樓').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('choice_dojo').setLabel('🗡️ 武館').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('choice_market').setLabel('💰 集市').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adventure_gossip').setLabel('🍺 聽傳言').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('adventure_spar').setLabel('⚔️ 切磋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('choice_quest').setLabel('📜 委託').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(BUTTON_IDS.BACK).setLabel('🏠 返回').setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ============== 江湖互動選項 ==============
function getAdventureChoices() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('choice_tavern').setLabel('🍺 去酒樓喝酒').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('choice_dojo').setLabel('🗡️ 去武館拜師').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('choice_market').setLabel('💰 去集市經商').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('choice_heal').setLabel('🏥 找郎中治傷').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('choice_temple').setLabel('🏯 寺廟參拜').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('choice_gamble').setLabel('🎲 賭坊試手氣').setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('choice_gang').setLabel('👥 加入幫派').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('choice_quest').setLabel('📜 接受委託').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(BUTTON_IDS.BACK).setLabel('🏠 返回').setStyle(ButtonStyle.Secondary)
    )
  ];
}

// 江湖風格冒險敘述
const ADVENTURE_NARRATIVES = {
  'choice_tavern': [
    '你走進酒樓，找了個角落的位置坐下...',
    '酒樓裡人聲鼎沸，各路江湖人士匯聚於此...',
    '你聞到酒香四溢，只見一位俠客正在獨酌...'
  ],
  'choice_dojo': [
    '你來到當地武館，只見學徒們正在操練...',
    '武館師父看了你一眼，似乎在評估你的資質...',
    '牆上掛滿了各種兵器，你心中一陣激動...'
  ],
  'choice_market': [
    '集市熱鬧非凡，各種商品琳琅滿目...',
    '你看到有人在叫賣稀有草藥，價格不菲...',
    '商人們正在激烈議價，場面十分有趣...'
  ],
  'choice_heal': [
    '你來到郎中處，郎中為你把脈診治...',
    '老郎中說你的傷需要靜養幾日...',
    '郎中給你開了幾副草藥，囑咐你要按時服用...'
  ],
  'choice_temple': [
    '寺廟裡香火鼎盛，佛像莊嚴...',
    '你虔誠地跪拜，心中默默祈禱...',
    '一位老和尚路過，說你面帶祥瑞之氣...'
  ],
  'choice_gamble': [
    '你走進賭坊，只見裡面燈紅酒綠...',
    '骰子聲不絕於耳，賭徒們神情亢奮...',
    '莊家笑瞇瞇地看著你，問你想玩什麼...'
  ],
  'choice_gang': [
    '你來到幫派總舵，只見戒備森嚴...',
    '幫主看了你一眼，問你為何想加入...',
    '幫眾們個個身手不凡，你暗自心驚...'
  ],
  'choice_quest': [
    '告示欄上貼滿了各種委託...',
    '你看到一張尋人啟事，賞金頗為可觀...',
    '有人正在尋找能護送的鏢車...'
  ],
  'adventure_gossip': [
    '你找了個茶攤坐下，豎起耳朵聽四周的談話...',
    '兩個江湖客正在低声谈论著什麼秘密...',
    '你聽到有人提起最近江湖上的大事...'
  ],
  'adventure_spar': [
    '你看到幾個俠客正在樹下切磋武藝...',
    '一位年輕劍客正在練習招式，動作行雲流水...',
    '你想找個人試試自己的身手...'
  ],
  'adventure_help': [
    '你看到一位老人家揹著沈重的包袱...',
    '有個小孩迷路了，正在路邊哭泣...',
    '一位商人似乎遇到了什麼困難...'
  ]
};

function getAdventureNarrative(choice) {
  const narratives = ADVENTURE_NARRATIVES[choice];
  if (!narratives) return '你開始行動...';
  return narratives[Math.floor(Math.random() * narratives.length)];
}

// ============== 創建 Embed ==============
function createPlayerEmbed(player, title = '🗡️ 刀鋒 RPG') {
  const hpPercent = (player.stats?.生命 || 100) / (player.maxStats?.生命 || 100);
  const hpBar = '█'.repeat(Math.floor(hpPercent * 10)) + '░'.repeat(10 - Math.floor(hpPercent * 10));
  
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x00ff00)
    .setDescription(`**${player.name}**（${player.title || '江湖新人'}）`)
    .addFields(
      { name: '📍 位置', value: player.location || '未知', inline: true },
      { name: '⚔️ 戰力', value: String(player.stats?.戰力 || 30), inline: true },
      { name: '🏅 境界', value: String(player.level || 1), inline: true },
      { name: '🩸 生命', value: `${hpBar} ${player.stats?.生命 || 100}/${player.maxStats?.生命 || 100}`, inline: false }
    );
  
  return embed;
}

function createStatusEmbed(world, agents) {
  const alive = agents.filter(a => a.alive).length;
  const embed = new EmbedBuilder()
    .setTitle('🌍 江湖狀態')
    .setColor(0x0099ff)
    .setDescription(`📅 Day ${world.day} | ${world.season} | 天氣：${world.weather}`)
    .addFields(
      { name: '👥 俠客', value: `${alive}/${agents.length}人存活`, inline: true },
      { name: '📰 最新事件', value: world.events?.[0] || '尚無', inline: false }
    );
  
  return embed;
}

function createLocationEmbed(locName, locData) {
  const dangerLevel = '⭐'.repeat(locData.danger || 1);
  let resources = [];
  if (locData.resources?.herbs?.length) resources.push('草藥');
  if (locData.resources?.wood?.length) resources.push('木材');
  if (locData.resources?.minerals?.length) resources.push('礦物');
  
  const embed = new EmbedBuilder()
    .setTitle(`📍 ${locName}`)
    .setColor(0xffaa00)
    .setDescription(locData.desc)
    .addFields(
      { name: '⚠️ 危險度', value: dangerLevel, inline: true },
      { name: '📦 資源', value: resources.join(', ') || '無', inline: true },
      { name: '🔥 秘境', value: locData.isSecretRealm ? '是' : '否', inline: true }
    );
  
  return embed;
}

module.exports = {
  BUTTON_IDS,
  getMainMenuButtons,
  getMapButtons,
  getFightButtons,
  getSkillsButtons,
  getExploreButtons,
  getAdventureChoices,
  getAdventureNarrative,
  getActionResultButtons,
  createPlayerEmbed,
  createStatusEmbed,
  createLocationEmbed
};
