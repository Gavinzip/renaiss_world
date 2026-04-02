/**
 * 🌍 Renaiss World - 世界系統
 * Renaiss星球 - 以現實時間為一天的系統
 */

const fs = require('fs');
const path = require('path');

// ============== 地點與區域 ==============
const LOCATIONS = {
  // ===== 蕃薯國（台灣）=====
  "蕃薯國皇城": {
    name: "蕃薯國皇城",
    region: "蕃薯國",
    desc: "蕃薯國的首都，戒備森嚴，皇家武士團守護著這裡",
    danger: 2,
    resources: { herbs: ["蕃薯草", "高山雪蓮"], wood: ["櫸木", "竹林"], minerals: [] },
    npcs: ["皇家侍衛長", "御醫"]
  },
  "阿里山": {
    name: "阿里山",
    region: "蕃薯國",
    desc: "傳說中的神木所在，雲霧繚繞，宛如仙境",
    danger: 3,
    resources: { herbs: ["靈芝", "人參"], wood: ["神木"], minerals: ["山礦石"] },
    npcs: ["守山老人"]
  },
  "墾丁海灘": {
    name: "墾丁海灘",
    region: "蕃薯國",
    desc: "碧海藍天，沙灘潔白，是休閒的好去處",
    danger: 1,
    resources: { herbs: ["海藻", "珊瑚草"], wood: [], minerals: ["貝殼"] },
    npcs: ["海邊獵人"]
  },
  
  // ===== 高句麗（韓國）=====
  "靑瓦宮": {
    name: "靑瓦宮",
    region: "高句麗",
    desc: "高句麗皇宮，融合東西方建築之美",
    danger: 3,
    resources: { herbs: ["高麗人參", "冬蟲夏草"], wood: ["松木"], minerals: [] },
    npcs: ["皇族侍衛", "御用煉丹師"]
  },
  "雪嶽山": {
    name: "雪嶽山",
    region: "高句麗",
    desc: "白雪皚皚的山峰，隱藏著戰圈秘笈",
    danger: 4,
    resources: { herbs: ["雪蓮", "冰晶草"], wood: ["寒松"], minerals: ["寒鐵"] },
    npcs: ["隱世高人"]
  },
  "明洞街": {
    name: "明洞街",
    region: "高句麗",
    desc: "繁華的商業街，各國商人匯聚",
    danger: 1,
    resources: { herbs: [], wood: [], minerals: [] },
    npcs: ["商人", "賞金獵人"]
  },
  
  // ===== 忍者國（日本）=====
  "幕府城": {
    name: "幕府城",
    region: "忍者國",
    desc: "幕府將軍的居所，戒備最為森嚴",
    danger: 4,
    resources: { herbs: ["櫻花精華", "抹茶"], wood: ["櫻木", "檜木"], minerals: [] },
    npcs: ["幕府將軍", "忍者首領"]
  },
  "富士山": {
    name: "富士山",
    region: "忍者國",
    desc: "聖山之一，火山口隱藏著古老的力量",
    danger: 5,
    resources: { herbs: ["火山口草"], wood: [], minerals: ["火山石", "熔巖晶"] },
    npcs: ["富士山修驗者"]
  },
  "忍者村": {
    name: "忍者村",
    region: "忍者國",
    desc: "傳說中的忍者根據地，普通人找不到",
    danger: 3,
    resources: { herbs: ["暗黑草"], wood: ["黑檀木"], minerals: [] },
    npcs: ["上忍", "傀儡師"]
  },
  
  // ===== 中原王朝（中國）=====
  "北京皇城": {
    name: "北京皇城",
    region: "中原王朝",
    desc: "中原王朝的心臟，最大最繁華的城市",
    danger: 2,
    resources: { herbs: ["靈芝", "何首烏"], wood: ["紫檀木"], minerals: ["和田玉"] },
    npcs: ["大內侍衛", "太醫"]
  },
  "少林寺": {
    name: "少林寺",
    region: "中原王朝",
    desc: "戰圈至尊，少林七十二絕技名震天下",
    danger: 2,
    resources: { herbs: ["少林草藥"], wood: ["松木"], minerals: [] },
    npcs: ["方丈大師", "羅漢堂首座"]
  },
  "武當山": {
    name: "武當山",
    region: "中原王朝",
    desc: "武當派根據地，太極拳陰陽合一",
    danger: 2,
    resources: { herbs: ["武當靈芝"], wood: ["雲杉"], minerals: ["武當石"] },
    npcs: ["張三丰傳人", "武當弟子"]
  },
  "峨眉山": {
    name: "峨眉山",
    region: "中原王朝",
    desc: "佛道雙修之地，女性試煉者聖地",
    danger: 2,
    resources: { herbs: ["峨眉草", "雪蓮"], wood: [], minerals: [] },
    npcs: ["峨眉主理人", "師太"]
  },
  "華山": {
    name: "華山",
    region: "中原王朝",
    desc: "天下奇險之一，華山論劍之地",
    danger: 3,
    resources: { herbs: ["華山人參"], wood: [], minerals: ["華山石"] },
    npcs: ["高山訓練站主理人", "獨孤九劍傳人"]
  },
  
  // ===== 金元帝國（美國）=====
  "自由神像": {
    name: "自由神像",
    region: "金元帝國",
    desc: "自由女神手中高舉火炬，俯瞰眾生",
    danger: 2,
    resources: { herbs: [], wood: [], minerals: ["自由之銅"] },
    npcs: ["自由守護者"]
  },
  "華爾街": {
    name: "華爾街",
    region: "金元帝國",
    desc: "金錢與權力的中心，商人與銀行家匯聚",
    danger: 1,
    resources: { herbs: [], wood: [], minerals: [] },
    npcs: ["金融大亨", "商業間諜"]
  },
  "西部荒野": {
    name: "西部荒野",
    region: "金元帝國",
    desc: "一望無際的大草原，賞金獵人的天堂",
    danger: 4,
    resources: { herbs: ["仙人掌汁"], wood: ["枯木"], minerals: ["金礦"] },
    npcs: ["賞金獵人", "西部探索者"]
  },
  
  // ===== 十字教廷（歐洲）=====
  "聖彼得大教堂": {
    name: "聖彼得大教堂",
    region: "十字教廷",
    desc: "教廷的核心，神聖不可侵犯",
    danger: 3,
    resources: { herbs: ["聖草"], wood: ["聖木"], minerals: ["聖銀"] },
    npcs: ["教皇", "聖殿騎士長"]
  },
  "阿爾卑斯山": {
    name: "阿爾卑斯山",
    region: "十字教廷",
    desc: "歐洲屋脊，隱藏著古老的修道院",
    danger: 3,
    resources: { herbs: ["雪蓮", "高山草藥"], wood: ["冷杉"], minerals: ["冰晶"] },
    npcs: ["修道士", "隱修士"]
  },
  "威尼斯運河": {
    name: "威尼斯運河",
    region: "十字教廷",
    desc: "水都威尼斯，商人與刺客的天堂",
    danger: 2,
    resources: { herbs: [], wood: ["水上木"], minerals: [] },
    npcs: ["商人總管", "運河刺客"]
  },
  
  // ===== 潮汐試煉島（秘境）=====
  "潮汐試煉島": {
    name: "潮汐試煉島",
    region: "秘境",
    desc: "傳說中的潮汐試煉島，古代核心檔案所在",
    danger: 5,
    isSecretRealm: true,
    required: { reputation: 500 },
    rewards: ["古代核心檔案", "潮汐試煉島秘寶"],
    resources: { herbs: [], wood: [], minerals: [] },
    npcs: ["潮汐試煉島島主"]
  },
  
  // ===== 野狼谷（危險區）=====
  "野狼谷": {
    name: "野狼谷",
    region: "中原王朝",
    desc: "殺人狂魔野狼王的巢穴，危險至極",
    danger: 5,
    isManiacLair: true,
    isBanditLair: false,
    resources: { herbs: ["野狼草"], wood: [], minerals: [] },
    npcs: ["野狼王"]
  },
  
  // ===== 黑風寨（盜賊區）=====
  "黑風寨": {
    name: "黑風寨",
    region: "中原王朝",
    desc: "山匪的大本營，財寶堆積如山",
    danger: 4,
    isBanditLair: true,
    resources: { herbs: [], wood: [], minerals: ["黑鐵"] },
    npcs: ["黑風寨主", "山匪嘍囉"]
  },
  
  // ===== 活死人墓（秘境）=====
  "活死人墓": {
    name: "活死人墓",
    region: "中原王朝",
    desc: "地底研究站聖地，玉女演算心法所在",
    danger: 4,
    isSecretRealm: true,
    required: { sect: "地底研究站" },
    rewards: ["玉女演算心法", "玉蜂漿"],
    resources: { herbs: ["玉蜂草"], wood: [], minerals: [] },
    npcs: ["古墓傳人"]
  }
};

// ============== 敵人系統 ==============
const ENEMIES = {
  "山匪嘍囉": {
    name: "山匪嘍囉",
    type: "bandit",
    stats: { 戰力: 25, 生命: 80, 能量: 10 },
    loot: ["Rns10-30", "乾糧"],
    dropRate: 0.3
  },
  "山匪首領": {
    name: "山匪首領",
    type: "bandit",
    stats: { 戰力: 65, 生命: 200, 能量: 40 },
    loot: ["Rns50-100", "黑風刀法技術檔案", "山寨地契"],
    dropRate: 0.15
  },
  "野狼王": {
    name: "野狼王",
    type: "maniac",
    forced: true, // 強制戰鬥
    stats: { 戰力: 88, 生命: 300, 能量: 50 },
    loot: ["Rns100-200", "血刃協議", "狼牙項鍊"],
    dropRate: 0.05
  },
  "血刀門徒": {
    name: "血刀門徒",
    type: "sect",
    stats: { 戰力: 55, 生命: 150, 能量: 35 },
    loot: ["Rns30-60", "血刀技術檔案"],
    dropRate: 0.2
  },
  "守閣羅漢": {
    name: "守閣羅漢",
    type: "guardian",
    stats: { 戰力: 70, 生命: 250, 能量: 60 },
    loot: ["Rns40-80", "強化模組片段"],
    dropRate: 0.1
  },
  "島上守護": {
    name: "島上守護",
    type: "guardian",
    stats: { 戰力: 75, 生命: 280, 能量: 70 },
    loot: ["Rns50-100", "古代核心檔案片段"],
    dropRate: 0.08
  }
};

// ============== 世界時間系統（基於現實時間）==============
const TIME_SYSTEM = {
  // 1現實分鐘 = 1遊戲小時
  // 1現實天(24小時) = 1遊戲年(24年?) 
  // 但我們簡化：1現實天 = 1遊戲天
  TICKS_PER_DAY: 1,
  LAST_TICK_FILE: path.join(__dirname, 'data', 'last_tick.json')
};

// 檢查是否需要更新天數（每天只能更新一次）
function shouldAdvanceDay() {
  const fs = require('fs');
  const lastTick = loadLastTick();
  const now = new Date();
  
  // 如果是最後tick的後一天
  if (lastTick.date !== getDateString(now)) {
    return true;
  }
  return false;
}

function getDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function updateLastTick() {
  const fs = require('fs');
  const now = new Date();
  const data = {
    date: getDateString(now),
    timestamp: now.getTime()
  };
  fs.writeFileSync(TIME_SYSTEM.LAST_TICK_FILE, JSON.stringify(data));
}

function loadLastTick() {
  const fs = require('fs');
  if (!fs.existsSync(TIME_SYSTEM.LAST_TICK_FILE)) {
    return { date: '2000-01-01', timestamp: 0 };
  }
  try {
    return JSON.parse(fs.readFileSync(TIME_SYSTEM.LAST_TICK_FILE, 'utf8'));
  } catch (e) {
    return { date: '2000-01-01', timestamp: 0 };
  }
}

// 獲取當前遊戲天數
function getCurrentGameDay() {
  const lastTick = loadLastTick();
  const worldFile = path.join(__dirname, 'data', 'world.json');
  
  if (fs.existsSync(worldFile)) {
    try {
      const world = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
      return world.day || 1;
    } catch (e) {
      return 1;
    }
  }
  return 1;
}

// ===== 地點資源 =====
// 當前地點資源狀態
let locationResources = {};

// ===== 初始化地點資源 =====
function initLocationResources() {
  for (const [name, loc] of Object.entries(LOCATIONS)) {
    if (!locationResources[name]) {
      locationResources[name] = {
        name: name,
        ...loc,
        currentHerbs: [...(loc.resources?.herbs || [])],
        currentWood: [...(loc.resources?.wood || [])],
        currentMinerals: [...(loc.resources?.minerals || [])],
        activeEnemies: [],
        lastRegen: Date.now()
      };
    }
  }
  
  // 隨機敵人
  const banditLocations = Object.keys(LOCATIONS).filter(l => LOCATIONS[l].danger >= 3);
  if (banditLocations.length > 0) {
    const loc = banditLocations[Math.floor(Math.random() * banditLocations.length)];
    if (!locationResources[loc].activeEnemies.length) {
      locationResources[loc].activeEnemies = ['山匪嘍囉'];
    }
  }
}

// ===== 采集資源 =====
function harvestResource(location, type, herbName) {
  initLocationResources();
  const loc = locationResources[location];
  if (!loc) return { success: false };
  
  let arr;
  if (type === 'herb') arr = loc.currentHerbs;
  else if (type === 'wood') arr = loc.currentWood;
  else if (type === 'mineral') arr = loc.currentMinerals;
  
  if (!arr || arr.length === 0) return { success: false };
  
  const idx = arr.indexOf(herbName);
  if (idx === -1) return { success: false };
  
  arr.splice(idx, 1);
  
  // 資源再生（3天後）
  setTimeout(() => {
    if (!locationResources[location]) return;
    const resourceArr = type === 'herb' 
      ? locationResources[location].currentHerbs
      : type === 'wood'
      ? locationResources[location].currentWood
      : locationResources[location].currentMinerals;
    
    if (!resourceArr.includes(herbName)) {
      resourceArr.push(herbName);
    }
  }, 30000); // 30秒測試，生產環境應該是3天
  
  return { success: true, item: herbName };
}

// ===== 檢查敵人遭遇 =====
function checkEnemyEncounter(location, player) {
  initLocationResources();
  const loc = locationResources[location];
  if (!loc || !loc.activeEnemies || loc.activeEnemies.length === 0) {
    // 隨機遭遇
    if (Math.random() < 0.2 && LOCATIONS[location]?.danger >= 2) {
      const enemyList = Object.values(ENEMIES).filter(e => {
        if (e.type === 'bandit') return LOCATIONS[location]?.danger >= 3;
        if (e.type === 'maniac') return LOCATIONS[location]?.isManiacLair;
        return LOCATIONS[location]?.danger >= 4;
      });
      
      if (enemyList.length > 0) {
        const enemy = enemyList[Math.floor(Math.random() * enemyList.length)];
        return { enemy, desc: `在${location}遭遇了${enemy.name}！`, forced: enemy.forced || false };
      }
    }
    return null;
  }
  
  const enemyName = loc.activeEnemies[0];
  const enemy = ENEMIES[enemyName];
  if (!enemy) return null;
  
  return { 
    enemy, 
    desc: `在${location}遇到了${enemy.name}！`, 
    forced: enemy.forced || false 
  };
}

// ===== 秘境界定 =====
// 定義秘境
const SECRET_REALMS = {
  "潮汐試煉島": {
    desc: "潮汐試煉島上刻著古代核心檔案，據說看懂就能無敵天下",
    rewards: ["古代核心檔案", "潮汐試煉島寶藏"],
    required: { reputation: 500, luck: 60 }
  },
  "活死人墓": {
    desc: "地底研究站禁地，玉女演算心法就藏在其中",
    rewards: ["玉女演算心法", "玉蜂漿"],
    required: { sect: "地底研究站", luck: 50 }
  },
  "黑風寨": {
    desc: "黑風寨主收藏了無數寶物，但守護森嚴",
    rewards: ["黑風刀法", "山寨金庫"],
    required: { combat: 60 }
  }
};

function discoverSecretRealm(location, player) {
  if (!SECRET_REALMS[location]) return { discovered: false };
  
  const realm = SECRET_REALMS[location];
  
  // 檢查條件
  if (realm.required.reputation && (player.reputation || 0) < realm.required.reputation) {
    return { discovered: false, reason: `聲望不足，需要${realm.required.reputation}以上` };
  }
  if (realm.required.sect && player.sect !== realm.required.sect) {
    return { discovered: false, reason: `需要是${realm.required.sect}弟子` };
  }
  if (realm.required.combat && (player.stats?.戰力 || 0) < realm.required.combat) {
    return { discovered: false, reason: `戰力不足，需要${realm.required.combat}以上` };
  }
  
  // 幸運判定
  const luck = player.stats?.運氣 || 50;
  const chance = realm.required.luck ? (luck / realm.required.luck) : 0.5;
  
  if (Math.random() < chance) {
    return { 
      discovered: true, 
      reward: realm.rewards[0],
      secrets: realm.rewards
    };
  }
  
  return { discovered: false, reason: '運氣不佳，未能發現秘境' };
}

module.exports = {
  LOCATIONS,
  ENEMIES,
  SECRET_REALMS,
  TIME_SYSTEM,
  initLocationResources,
  harvestResource,
  checkEnemyEncounter,
  discoverSecretRealm,
  shouldAdvanceDay,
  updateLastTick,
  getCurrentGameDay,
  getDateString,
  locationResources: () => locationResources
};
