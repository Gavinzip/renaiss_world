/**
 * 🗡️ 刀鋒 BLADE - AI 開放世界武俠 RPG
 * 
 * 核心遊戲引擎
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ============== 武學系統 ==============
const martial = require('./martial-arts');

// ============== 設定 ==============
const DATA_DIR = path.join(__dirname, 'data');
const PLAYERS_DIR = path.join(DATA_DIR, 'players');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const WORLD_FILE = path.join(DATA_DIR, 'world.json');
const CRAFTING_FILE = path.join(DATA_DIR, 'crafting.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PLAYERS_DIR)) fs.mkdirSync(PLAYERS_DIR, { recursive: true });

// ============== Renaiss星球地圖 ==============
const WORLD_MAP = {
  regions: [
    {
      name: "中原地區",
      cities: [
        { name: "襄陽城", desc: "兵家必爭之地，繁華熱鬧", resources: ["鐵礦", "藥草"], difficulty: 1 },
        { name: "大都", desc: "繁華都市，各路商賈雲集", resources: ["�綢", "珠寶"], difficulty: 2 },
        { name: "洛陽城", desc: "千年古都，文化薈萃", resources: ["古籍", "書法"], difficulty: 1 }
      ]
    },
    {
      name: "西域地區",
      cities: [
        { name: "敦煌", desc: "絲路重鎮，莫高窟神秘莫測", resources: ["香料", "寶石"], difficulty: 3 },
        { name: "喀什爾", desc: "沙漠綠洲，商人聚集", resources: ["棉花", "乾果"], difficulty: 2 }
      ]
    },
    {
      name: "南方地區",
      cities: [
        { name: "廣州", desc: "海港城市，對外貿易發達", resources: ["茶葉", "瓷器"], difficulty: 2 },
        { name: "大理", desc: "山城風光，少數民族文化", resources: ["茶葉", "藥材"], difficulty: 1 }
      ]
    },
    {
      name: "海外島嶼",
      cities: [
        { name: "桃花島", desc: "世外桃源，機關重重", resources: ["靈芝", "奇花"], difficulty: 4 },
        { name: "俠客島", desc: "傳說中的武林聖地", resources: ["秘笈", "寶藏"], difficulty: 5 }
      ]
    },
    {
      name: "北疆地區",
      cities: [
        { name: "雪白山莊", desc: "終年積雪，適合閉關修煉", resources: ["冰蓮", "雪參"], difficulty: 3 },
        { name: "草原部落", desc: "遊牧民族，騎術精湛", resources: ["馬匹", "皮革"], difficulty: 2 }
      ]
    },
    {
      name: "隱秘地區",
      cities: [
        { name: "光明頂", desc: "明教總壇，氣勢恢宏", resources: ["聖火", "經書"], difficulty: 4 },
        { name: "黑木崖", desc: "日月神教根據地，深淵中的浮空城市", resources: ["暗能量", "情報"], difficulty: 4 }
      ]
    }
  ],
  getAllCities: function() {
    const cities = [];
    this.regions.forEach(r => r.cities.forEach(c => cities.push({ ...c, region: r.name })));
    return cities;
  },
  getRandomCity: function() {
    const cities = this.getAllCities();
    return cities[Math.floor(Math.random() * cities.length)];
  },
  getCityByName: function(name) {
    const cities = this.getAllCities();
    return cities.find(c => c.name === name);
  }
};

// ============== 世界狀態 ==============
let world = {
  day: 1,
  season: "春天",
  weather: "晴",
  weatherEffects: {
    "雨": { 火系傷害: -30, 移動速度: -20, 視距: -30 },
    "雪": { 內功消耗: +20, 移動速度: -30, 視距: -50 },
    "霧": { 視距: -60, 偷襲成功率: +20 },
    "晴": { 無影響: 0 }
  },
  events: [],      // 世界事件（如 NPC 死亡）
  rumors: [],       // 謠言
  npcStatus: {}    // NPC 生死狀態 { npcId: { alive: true, killedBy: null, killedAt: null } }
};

// ============== 玩家記憶系統 ==============
function addPlayerMemory(playerId, memory) {
  const player = loadPlayer(playerId);
  if (!player) return;
  
  if (!player.memories) player.memories = [];
  
  // 加入新記憶（格式：類型:內容）
  player.memories.unshift({
    type: memory.type || 'action',
    content: memory.content,
    timestamp: Date.now()
  });
  
  // 只保留最近 10 條
  if (player.memories.length > 10) {
    player.memories.pop();
  }
  
  savePlayer(player);
}

function getPlayerMemoryContext(playerId) {
  const player = loadPlayer(playerId);
  if (!player || !player.memories || player.memories.length === 0) {
    return '';
  }
  
  const memories = player.memories.slice(0, 5); // 取最近 5 條
  return memories.map(m => `[${m.type}] ${m.content}`).join('\n');
}

// ============== Agent 擴展數據 ==============
let agentMemories = {}; // agentId -> [{day, event, type}]
let agentInventories = {}; // agentId -> []

function getAgentMemory(agentId) {
  if (!agentMemories[agentId]) agentMemories[agentId] = [];
  return agentMemories[agentId];
}

function addAgentMemory(agentId, event, type = 'other') {
  const mem = getAgentMemory(agentId);
  mem.unshift({ day: world.day, event, type, timestamp: Date.now() });
  // 保持最近50條記憶
  if (mem.length > 50) mem.pop();
}

function getAgentInventory(agentId) {
  if (!agentInventories[agentId]) agentInventories[agentId] = [];
  return agentInventories[agentId];
}

function addAgentItem(agentId, item) {
  const inv = getAgentInventory(agentId);
  inv.push(item);
}

function removeAgentItem(agentId, item) {
  const inv = getAgentInventory(agentId);
  const idx = inv.indexOf(item);
  if (idx >= 0) inv.splice(idx, 1);
  return idx >= 0;
}

function hasAgentItem(agentId, item) {
  return getAgentInventory(agentId).includes(item);
}

// ============== NPC 生死追蹤（24小時重生）==============
const RESPAWN_HOURS = 24; // 24小時重生

function initNPCStatus(npcId) {
  if (!world.npcStatus) world.npcStatus = {};
  if (!world.npcStatus[npcId]) {
    world.npcStatus[npcId] = {
      alive: true,
      killedBy: null,
      killedAt: null,
      respawnAt: null
    };
  }
  return world.npcStatus[npcId];
}

function isNPCAlive(npcId) {
  initNPCStatus(npcId);
  const status = world.npcStatus[npcId];
  
  // 如果已死亡，檢查是否該重生
  if (!status.alive && status.respawnAt) {
    if (Date.now() >= status.respawnAt) {
      // 重生
      status.alive = true;
      status.killedBy = null;
      status.killedAt = null;
      status.respawnAt = null;
      
      // 加入世界事件
      const npc = getNPCById(npcId);
      const npcName = npc ? npc.name : npcId;
      world.events.unshift({
        day: world.day,
        type: 'npc_respawn',
        message: `✨ ${npcName} 康復歸來！`,
        timestamp: Date.now()
      });
      
      saveWorld();
    }
  }
  
  return world.npcStatus[npcId].alive;
}

function killNPC(npcId, killerId, isMonster = false) {
  initNPCStatus(npcId);
  const status = world.npcStatus[npcId];
  
  status.alive = false;
  status.killedBy = killerId;
  status.killedAt = Date.now();
  status.respawnAt = Date.now() + (RESPAWN_HOURS * 60 * 60 * 1000);
  
  // 加入世界事件
  const npc = getNPCById(npcId);
  const npcName = npc ? npc.name : npcId;
  const typeLabel = isMonster ? '怪物' : 'NPC';
  
  world.events.unshift({
    day: world.day,
    type: isMonster ? 'monster_death' : 'npc_death',
    message: `💀 ${typeLabel} ${npcName} 已被玩家 ${killerId} 擊殺！預計 ${RESPAWN_HOURS} 小時後重生。`,
    timestamp: Date.now()
  });
  
  // 玩家被通緝
  addWantedLevel(killerId, isMonster ? 1 : 3); // NPC = 3級, 怪物 = 1級
  
  saveWorld();
  return true;
}

function getNPCDeathInfo(npcId) {
  initNPCStatus(npcId);
  return world.npcStatus[npcId];
}

function getRecentWorldEvents(limit = 10) {
  return world.events.slice(0, limit);
}

function getRespawnTime(npcId) {
  const status = getNPCDeathInfo(npcId);
  if (status.alive) return null;
  if (!status.respawnAt) return null;
  
  const remaining = status.respawnAt - Date.now();
  if (remaining <= 0) return '即將重生';
  
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}小時${minutes}分`;
}

// ============== 通緝系統 ==============
function initWantedList() {
  if (!world.wantedList) world.wantedList = {};
  return world.wantedList;
}

function addWantedLevel(playerId, level) {
  const wanted = initWantedList();
  
  if (!wanted[playerId]) {
    wanted[playerId] = {
      level: 0,
      reason: '',
      kills: [],
      firstKillAt: null
    };
  }
  
  wanted[playerId].level += level;
  wanted[playerId].kills.push({
    npcId: 'unknown',
    at: Date.now()
  });
  
  if (!wanted[playerId].firstKillAt) {
    wanted[playerId].firstKillAt = Date.now();
  }
  
  saveWorld();
  return wanted[playerId].level;
}

function getPlayerWantedLevel(playerId) {
  const wanted = initWantedList();
  return wanted[playerId]?.level || 0;
}

function getWantedList() {
  const wanted = initWantedList();
  return Object.entries(wanted)
    .filter(([id, data]) => data.level > 0)
    .sort((a, b) => b[1].level - a[1].level)
    .slice(0, 10);
}

function reduceAllWantedLevels() {
  // 每天降低一點通緝
  const wanted = initWantedList();
  for (const playerId in wanted) {
    if (wanted[playerId].level > 0) {
      wanted[playerId].level = Math.max(0, wanted[playerId].level - 1);
    }
  }
  saveWorld();
}

// ============== NPC Agent 模板 ==============
// ============== NPC Agent 模板 ==============
// ============== RENAISS 世界觀 NPC ==============
const NPC_AGENTS = [
  // ===== 襄陽城 =====
  { id: "lin_engineer", name: "林工程師", title: "機械師", sect: "中立", loc: "襄陽城", align: "good",
    personality: "創意無限，對機械有狂熱興趣",
    stats: { 戰力: 15, 生命: 80, 內力: 20, 智商: 95, 魅力: 70, 運氣: 65, 財富: 80 },
    skills: { "齒輪操控": { realm: "大師", proficiency: 450 }, "能量轉換": { realm: "精通", proficiency: 300 } },
    inventory: ["能量核心", "微型齒輪"],
    relationships: { "蘇醫生": 80 },
    memory: [] },
  { id: "su_doctor", name: "蘇醫生", title: "細胞治療師", sect: "中立", loc: "襄陽城", align: "good",
    personality: "懸壺濟世，視錢財如糞土",
    stats: { 戰力: 20, 生命: 90, 內力: 40, 智商: 88, 魅力: 85, 運氣: 75, 財富: 60 },
    skills: { "細胞修復": { realm: "宗師", proficiency: 500 }, "解毒術": { realm: "大師", proficiency: 400 } },
    inventory: ["治療針劑", "解毒草藥"],
    relationships: { "林工程師": 80, "黑影商人": 30 },
    memory: [] },
  { id: "shadow_merchant", name: "黑影商人", title: "情報贩子", sect: "中立", loc: "襄陽城", align: "neutral",
    personality: "什麼都賣，什麼都買，只要價格到位",
    stats: { 戰力: 8, 生命: 65, 內力: 15, 智商: 85, 魅力: 72, 運氣: 60, 財富: 95 },
    skills: { "情報收集": { realm: "大師", proficiency: 450 }, "偽裝術": { realm: "精通", proficiency: 300 } },
    inventory: ["加密通訊器", "夜視裝置"],
    relationships: { "蘇醫生": 30, "賞金獵人": 50 },
    memory: [] },
  // ===== 大都 =====
  { id: "crown_prince", name: "皇太子", title: "未來統治者", sect: "皇室", loc: "大都", align: "good",
    personality: "心懷天下，但行事低調",
    stats: { 戰力: 25, 生命: 85, 內力: 30, 智商: 90, 魅力: 88, 運氣: 80, 財富: 100 },
    skills: { "皇室禮儀": { realm: "宗師", proficiency: 500 }, "能量護盾": { realm: "精通", proficiency: 300 } },
    inventory: ["皇室印璽", "護身符"],
    relationships: { "將軍王": 90 },
    memory: [] },
  { id: "general_wang", name: "將軍王", title: "邊境守將", sect: "軍隊", loc: "大都", align: "good",
    personality: "戎馬一生，紀律嚴明",
    stats: { 戰力: 95, 生命: 100, 內力: 50, 智商: 75, 魅力: 82, 運氣: 70, 財富: 70 },
    skills: { "戰甲操控": { realm: "宗師", proficiency: 500 }, "軍事戰略": { realm: "大師", proficiency: 450 } },
    inventory: ["外骨骼裝甲", "軍事地圖"],
    relationships: { "皇太子": 90, "間諜Q": 20 },
    memory: [] },
  { id: "spy_q", name: "間諜Q", title: "情報頭子", sect: "情報機構", loc: "大都", align: "neutral",
    personality: "為錢辦事，職業素養極高",
    stats: { 戰力: 22, 生命: 75, 內力: 35, 智商: 92, 魅力: 78, 運氣: 65, 財富: 88 },
    skills: { "數據破解": { realm: "宗師", proficiency: 500 }, "偽裝術": { realm: "大師", proficiency: 400 } },
    inventory: ["數據晶片", "變聲器"],
    relationships: { "將軍王": 20, "黑影商人": 60 },
    memory: [] },
  // ===== 洛陽城 =====
  { id: "peony_lady", name: "牡丹夫人", title: "牡丹山莊莊主", sect: "牡丹山莊", loc: "洛陽城", align: "good",
    personality: "洛陽城實際掌控者，八面玲瓏",
    stats: { 戰力: 28, 生命: 82, 內力: 55, 智商: 90, 魅力: 95, 運氣: 75, 財富: 98 },
    skills: { "花語操控": { realm: "宗師", proficiency: 500 }, "談判術": { realm: "大師", proficiency: 450 } },
    inventory: ["牡丹山莊令牌", "基因改造花種"],
    relationships: { "說書人老張": 85, "賞金獵人雷": 60 },
    memory: [] },
  { id: "storyteller_zhang", name: "說書人老張", title: "江湖百曉生", sect: "中立", loc: "洛陽城", align: "neutral",
    personality: "什麼都知道，什麼都說，嘴上沒把門",
    stats: { 戰力: 5, 生命: 60, 內力: 10, 智商: 85, 魅力: 80, 運氣: 55, 財富: 40 },
    skills: { "情報收集": { realm: "宗師", proficiency: 500 }, "記憶術": { realm: "大師", proficiency: 400 } },
    inventory: ["記錄晶片", "各地地圖"],
    relationships: { "牡丹夫人": 85, "黑影商人": 70 },
    memory: [] },
  { id: "bounty_hunter_lei", name: "賞金獵人雷", title: "賞金聯盟成員", sect: "賞金聯盟", loc: "洛陽城", align: "neutral",
    personality: "賞金獵人，冷酷務實",
    stats: { 戰力: 60, 生命: 85, 內力: 40, 智商: 78, 魅力: 65, 運氣: 70, 財富: 75 },
    skills: { "追蹤術": { realm: "大師", proficiency: 450 }, "射擊術": { realm: "精通", proficiency: 300 } },
    inventory: ["追蹤器", "能量手槍"],
    relationships: { "牡丹夫人": 60, "黑影商人": 50 },
    memory: [] },
  // ===== 敦煌 =====
  { id: "abu_trader", name: "絲路商人阿布", title: "駝隊首領", sect: "絲路商會", loc: "敦煌", align: "neutral",
    personality: "精明但誠信，沙漠中的老狐狸",
    stats: { 戰力: 12, 生命: 75, 內力: 20, 智商: 85, 魅力: 80, 運氣: 70, 財富: 90 },
    skills: { "商務談判": { realm: "宗師", proficiency: 500 }, "沙漠生存": { realm: "大師", proficiency: 400 } },
    inventory: ["商隊通行證", "沙漠導航儀"],
    relationships: { "敦煌守護者": 40, "沙盜首領": 0 },
    memory: [] },
  { id: "dunhuang_guardian", name: "敦煌守護者", title: "莫高窟長老", sect: "莫高窟", loc: "敦煌", align: "good",
    personality: "據說已活了三百年，對敦煌了如指掌",
    stats: { 戰力: 35, 生命: 95, 內力: 80, 智商: 92, 魅力: 75, 運氣: 60, 財富: 50 },
    skills: { "壁畫解讀": { realm: "宗師", proficiency: 500 }, "遠古知識": { realm: "宗師", proficiency: 500 } },
    inventory: ["洞窟鑰匙", "壁畫複製品"],
    relationships: { "阿布": 40 },
    memory: [] },
  { id: "sand_bandit_leader", name: "沙盜首領", title: "沙漠之王", sect: "沙盜團", loc: "敦煌", align: "evil",
    personality: "心狠手辣，沙漠中最危險的存在",
    stats: { 戰力: 75, 生命: 90, 內力: 45, 智商: 78, 魅力: 60, 運氣: 55, 財富: 85 },
    skills: { "沙漠戰": { realm: "大師", proficiency: 450 }, "埋伏術": { realm: "精通", proficiency: 300 } },
    inventory: ["沙漠載具", "沙漠地圖"],
    relationships: { "阿布": 0, "賞金獵人雷": 80 },
    memory: [] },
  // ===== 海外島嶼 =====
  { id: "island_master", name: "島主東邪", title: "神秘島主", sect: "桃花島", loc: "桃花島", align: "neutral",
    personality: "脾氣古怪的傳說人物，實力深不可測",
    stats: { 戰力: 99, 生命: 100, 內力: 95, 智商: 95, 魅力: 75, 運氣: 70, 財富: 90 },
    skills: { "混沌之力": { realm: "傳說", proficiency: 600 }, "機關術": { realm: "宗師", proficiency: 500 } },
    inventory: ["混沌獸蛋", "島嶼地圖"],
    relationships: {},
    memory: [] },
  // ===== 俠客島 =====
  { id: "dragon_wood_master", name: "龍木島主", title: "武學宗師", sect: "俠客島", loc: "俠客島", align: "good",
    personality: "武功蓋世，低調神秘",
    stats: { 戰力: 100, 生命: 100, 內力: 98, 智商: 90, 魅力: 80, 運氣: 75, 財富: 85 },
    skills: { "頂尖武學": { realm: "傳說", proficiency: 600 }, "能量操控": { realm: "傳說", proficiency: 600 } },
    inventory: ["武學秘籍", "島嶼通行證"],
    relationships: { "木島主": 100 },
    memory: [] },
  // ===== 北疆地區 =====
  { id: "ice_queen", name: "冰雪女王", title: "雪山派掌門", sect: "雪山派", loc: "雪白山莊", align: "good",
    personality: "一生只愛冰雪，對外人冷淡",
    stats: { 戰力: 92, 生命: 95, 內力: 90, 智商: 88, 魅力: 85, 運氣: 65, 財富: 80 },
    skills: { "冰晶操控": { realm: "宗師", proficiency: 500 }, "冰川之力": { realm: "大師", proficiency: 450 } },
    inventory: ["冰晶權杖", "雪山地圖"],
    relationships: { "獵人老陳": 60 },
    memory: [] },
  { id: "hunter_old_chen", name: "獵人老陳", title: "資深雪地獵人", sect: "中立", loc: "雪白山莊", align: "neutral",
    personality: "在雪山生活了五十年，沉默寡言",
    stats: { 戰力: 50, 生命: 85, 內力: 30, 智商: 75, 魅力: 60, 運氣: 70, 財富: 55 },
    skills: { "雪地追蹤": { realm: "宗師", proficiency: 500 }, "陷阱術": { realm: "大師", proficiency: 400 } },
    inventory: ["雪狼標本", "獵具"],
    relationships: { "冰雪女王": 60 },
    memory: [] },
  // ===== 草原部落 =====
  { id: "chief_son", name: "族長之子", title: "草原未來領袖", sect: "草原部落", loc: "草原部落", align: "good",
    personality: "英俊瀟灑，武藝高強，心懷牧民",
    stats: { 戰力: 70, 生命: 90, 內力: 45, 智商: 80, 魅力: 92, 運氣: 75, 財富: 70 },
    skills: { "騎術": { realm: "宗師", proficiency: 500 }, "草原戰": { realm: "大師", proficiency: 450 } },
    inventory: ["赤兔馬", "部落令牌"],
    relationships: { "流浪詩人": 80, "馬賊王": 0 },
    memory: [] },
  { id: "wandering_poet", name: "流浪詩人", title: "草原吟遊者", sect: "中立", loc: "草原部落", align: "neutral",
    personality: "走遍天下的吟遊詩人，見多識廣",
    stats: { 戰力: 8, 生命: 65, 內力: 20, 智商: 88, 魅力: 90, 運氣: 80, 財富: 45 },
    skills: { "情報收集": { realm: "大師", proficiency: 450 }, "演奏術": { realm: "宗師", proficiency: 500 } },
    inventory: ["詩歌手稿", "樂器"],
    relationships: { "族長之子": 80 },
    memory: [] },
  { id: "bandit_king", name: "馬賊王", title: "草原匪首", sect: "馬賊團", loc: "草原部落", align: "evil",
    personality: "草原上令人聞風喪膽的馬賊頭子",
    stats: { 戰力: 85, 生命: 95, 內力: 50, 智商: 80, 魅力: 65, 運氣: 60, 財富: 90 },
    skills: { "騎兵戰": { realm: "大師", proficiency: 450 }, "游擊術": { realm: "精通", proficiency: 300 } },
    inventory: ["馬賊令牌", "掠奪物資"],
    relationships: { "族長之子": 0, "賞金獵人雷": 90 },
    memory: [] },
  // ===== 光明頂 =====
  { id: "ming_emperor", name: "教主明皇", title: "明教教主", sect: "明教", loc: "光明頂", align: "good",
    personality: "光明的守護者，理想主義者",
    stats: { 戰力: 95, 生命: 100, 內力: 90, 智商: 88, 魅力: 85, 運氣: 75, 財富: 80 },
    skills: { "聖火操控": { realm: "宗師", proficiency: 500 }, "光能術": { realm: "大師", proficiency: 450 } },
    inventory: ["聖火令", "教主印璽"],
    relationships: { "火焰使者": 90, "叛教者": 0 },
    memory: [] },
  { id: "flame_ember", name: "火焰使者", title: "五行旗首領", sect: "明教", loc: "光明頂", align: "good",
    personality: "火爆脾氣，正義感強",
    stats: { 戰力: 85, 生命: 90, 內力: 75, 智商: 75, 魅力: 70, 運氣: 65, 財富: 60 },
    skills: { "火焰操控": { realm: "宗師", proficiency: 500 }, "戰鬥術": { realm: "大師", proficiency: 400 } },
    inventory: ["火焰令牌", "五行旗幟"],
    relationships: { "教主明皇": 90, "叛教者": 0 },
    memory: [] },
  { id: "traitor", name: "叛教者", title: "黑暗叛徒", sect: "暗黑組織", loc: "光明頂", align: "evil",
    personality: "逃離明教的叛徒，充滿怨恨",
    stats: { 戰力: 80, 生命: 85, 內力: 70, 智商: 85, 魅力: 60, 運氣: 55, 財富: 75 },
    skills: { "暗能量操控": { realm: "大師", proficiency: 450 }, "背叛術": { realm: "精通", proficiency: 300 } },
    inventory: ["暗黑手冊", "暗能量晶體"],
    relationships: { "教主明皇": 0, "火焰使者": 0, "總管太監": 80 },
    memory: [] },
  // ===== 黑木崖 =====
  { id: "chamberlain", name: "總管太監", title: "日月光基地下首領", sect: "日月神教", loc: "黑木崖", align: "evil",
    personality: "權傾朝野的陰謀家，笑裡藏刀",
    stats: { 戰力: 35, 生命: 70, 內力: 65, 智商: 95, 魅力: 80, 運氣: 60, 財富: 100 },
    skills: { "暗能量操控": { realm: "宗師", proficiency: 500 }, "權謀術": { realm: "宗師", proficiency: 500 } },
    inventory: ["日月神教令牌", "情報網絡圖"],
    relationships: { "叛教者": 80, "暗影殺手": 100 },
    memory: [] },
  { id: "shadow_assassin", name: "暗影殺手", title: "日月神教刺客", sect: "日月神教", loc: "黑木崖", align: "evil",
    personality: "無聲無息的死亡使者",
    stats: { 戰力: 80, 生命: 80, 內力: 60, 智商: 85, 魅力: 55, 運氣: 50, 財富: 70 },
    skills: { "隱身術": { realm: "宗師", proficiency: 500 }, "暗殺術": { realm: "大師", proficiency: 450 } },
    inventory: ["暗殺匕首", "隱身披風"],
    relationships: { "總管太監": 100 },
    memory: [] },
  { id: "double_agent", name: "雙面間諜", title: "多重身份", sect: "未知", loc: "黑木崖", align: "neutral",
    personality: "沒人知道他的真實立場",
    stats: { 戰力: 18, 生命: 70, 內力: 35, 智商: 92, 魅力: 85, 運氣: 75, 財富: 85 },
    skills: { "偽裝術": { realm: "宗師", proficiency: 500 }, "情報收集": { realm: "大師", proficiency: 450 } },
    inventory: ["變色面具", "加密通訊器"],
    relationships: { "總管太監": 50, "賞金獵人雷": 60 },
    memory: [] }
];
let agents = NPC_AGENTS.map(a => ({ ...a, alive: true, exp: 0, party: null, status: "自由" }));
// ============== 世界 Tick ==============
async function worldTick(useAI, apiKey) {
  world.day++;
  
  // 季節變化
  if (world.day % 30 === 0) {
    const seasons = ["春天", "夏天", "秋天", "冬天"];
    world.season = seasons[Math.floor((world.day / 30) % 4)];
    addEvent(`🍂 季節變換：${world.season}`);
  }
  
  // 天氣變化（30%機率）
  if (Math.random() < 0.3) {
    const newWeather = WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)];
    if (newWeather !== world.weather) {
      world.weather = newWeather;
      addEvent(`🌤️ 天氣變化：${world.weather}`);
    }
  }
  
  // 每日隨機事件
  if (Math.random() < 0.2) {
    const rumors = [
      "聽說蒙古大軍在邊境集結",
      "俠客島的太玄經傳聞再現",
      "明教正在秘密集結",
      "華山派又有紛爭",
      "Renaiss星球出現俠盜劫富濟貧"
    ];
    world.rumors.push(rumors[Math.floor(Math.random() * rumors.length)]);
    if (world.rumors.length > 10) world.rumors.pop();
  }
  
  const results = [];
  
  // NPC AI 行動
  if (useAI && apiKey) {
    // 批次並行處理
    const aliveAgents = agents.filter(a => a.alive);
    const batchSize = 10;
    
    for (let i = 0; i < aliveAgents.length; i += batchSize) {
      const batch = aliveAgents.slice(i, i + batchSize);
      const promises = batch.map(agent => agentThink(agent, apiKey));
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }
  } else {
    // 演示模式 - 使用新的劇情生成系統
    for (const agent of agents) {
      if (!agent.alive) continue;
      // 直接調用新的劇情生成（不需要 API）
      const nearby = agents.filter(a => a.id !== agent.id && a.loc === agent.loc && a.alive);
      const rand = Math.random();
      let eventType;
      
      if (agent.stats.生命 < 30) {
        eventType = "休息";
      } else if (rand < 0.15) {
        eventType = "奇遇";
      } else if (rand < 0.30) {
        eventType = "戰鬥";
      } else if (rand < 0.45) {
        eventType = "社交";
      } else if (rand < 0.55) {
        eventType = "任務";
      } else if (rand < 0.65) {
        eventType = "危險";
      } else if (rand < 0.75) {
        eventType = "搞笑";
      } else if (rand < 0.85) {
        eventType = "修煉";
      } else {
        eventType = "休息";
      }
      
      let eventDesc = generateCharacterLog(agent, eventType);
      
      // 添加互動
      if (nearby.length > 0 && Math.random() < 0.3) {
        const other = nearby[Math.floor(Math.random() * nearby.length)];
        const interactions = [
          `，巧遇${other.name}，二人切磋了一番！`,
          `，與${other.name}把酒言歡！`,
          `，遇到${other.name}在修煉，駐足觀看！`,
          `，和${other.name}商討Renaiss星球大事！`
        ];
        const interaction = interactions[Math.floor(Math.random() * interactions.length)];
        if (!eventDesc.includes(other.name)) {
          eventDesc = eventDesc + interaction;
        }
      }
      
      addAgentMemory(agent.id, eventDesc, eventType);
      
      // 更新狀態
      if (eventType === "戰鬥") {
        const damage = Math.floor(Math.random() * 25) + 5;
        agent.stats.生命 = Math.max(10, (agent.stats.生命 || 100) - damage);
      } else if (eventType === "休息") {
        const hpRecover = Math.floor(Math.random() * 15) + 10;
        agent.stats.生命 = Math.min(100, (agent.stats.生命 || 100) + hpRecover);
      } else if (eventType === "危險") {
        const damage = Math.floor(Math.random() * 35) + 15;
        agent.stats.生命 = Math.max(5, (agent.stats.生命 || 100) - damage);
      }
      
      results.push({ npc: agent.name, action: eventType, desc: eventDesc });
    }
  }
  
  // 玩家自然恢復
  for (const player of getAllPlayers()) {
    if (player.alive) {
      player.stats.生命 = Math.min(player.maxStats.生命, player.stats.生命 + 5);
      player.stats.內力 = Math.min(player.maxStats.內力, player.stats.內力 + 2);
      savePlayer(player);
    }
  }
  
  // 降低通緝等级
  reduceAllWantedLevels();
  
  // 儲存世界
  saveWorld();
  
  return { world, results };
}

// ============== 隨機劇情系統 ==============
const PLOT_EVENTS = {
  // 战斗类
  "戰鬥": [
    "在路邊教訓了幾個欺負百姓的地痞",
    "與門派弟子切磋武功，不分上下",
    "遭遇埋伏，奮力突圍",
    "路見不平，拔刀相助",
    "與仇家狹路相逢，爆發激戰",
    "在客棧與人發生衝突",
    "守護商隊抵禦山賊襲擊"
  ],
  // 奇遇类
  "奇遇": [
    "在山洞中發現前人留下的武功秘籍",
    "路邊救了一個重傷的老者，原來是隱世高手",
    "在河邊撿到一個奇怪的玉佩",
    "誤入一片迷霧，發現世外桃源",
    "在古廟中躲避風雨，發現藏寶圖",
    "救了一隻受傷的神鵰",
    "在懸崖邊發現珍稀草藥"
  ],
  // 社交类
  "社交": [
    "在酒樓認識了一位俠客相談甚歡",
    "路過貧困村莊，資助了村民",
    "遇見以前的恩師",
    "被一群粉絲認出來包圍",
    "在集市上看到有人在賣假秘籍",
    "巧遇門派師兄妹",
    "遇見一個奇怪的算命先生"
  ],
  // 任务类
  "任務": [
    "接受了一個送信的任務",
    "幫人尋找失散的家人",
    "押鏢途中遭遇劫匪",
    "被委託保護一位富商",
    "幫官府緝拿江洋大盜",
    "為尋找失落的寶物踏上旅程",
    "保護村莊免受山賊侵擾"
  ],
  // 危险类
  "危險": [
    "不小心得罪了當地幫派",
    "誤入毒蛇窩，被咬傷",
    "遇到山洪暴發",
    "被誤認為是竊賊追殺",
    "在山中迷路，飢寒交迫",
    "遭遇猛獸襲擊",
    "被冤枉入獄"
  ],
  // 搞笑类
  "搞笑": [
    "吃飯忘記帶錢，被迫洗碗抵債",
    "把路邊的草當成稀世草藥燉湯",
    "認錯人，誤打了一個無辜的路人",
    "酒後失言，得罪了一個大人物",
    "被小狗追著跑了三條街",
    "把自己的衣服當成乾糧咬了一口"
  ]
};

const LOCATION_EVENTS = {
  "襄陽城": ["在機械工坊觀摩新發明", "在能量補充站遇到工程師", "在基因改造花園散步"],
  "大都": ["在皇城腳下觀光", "聽聞邊境有新戰事", "在情報機構打探消息"],
  "洛陽城": ["在拍賣行見識珍稀奇珍", "在牡丹山莊作客", "在賞金聯盟接任務"],
  "敦煌": ["在莫高窟研究壁畫", "與沙漠商隊交易", "險遇沙盜團埋伏"],
  "喀什爾": ["在巴扎市場購買特產", "參觀沙漠綠洲", "與絲路商人議價"],
  "廣州": ["在港口觀看飛艇起降", "在基因改造海鮮市場", "與番邦商人交易"],
  "大理": ["遊覽山城風光", "品嚐當地美食", "在基因花園漫步"],
  "桃花島": ["險遇島嶼機關", "在桃花林中迷路", "遠距離觀察島主"],
  "俠客島": ["在島上發現秘籍壁刻", "遇到前來挑戰的武者", "見證島主的實力"],
  "雪白山莊": ["在冰晶洞窟探险", "險遇雪山派弟子", "在冰川前感嘆大自然的壯麗"],
  "草原部落": ["在部落參加篝火晚會", "與牧民一起放牧", "險遇馬賊團襲擊"],
  "光明頂": ["觀摩聖火廣場的儀式", "在能量塔下沉思", "見證明教的聖火傳承"],
  "黑木崖": ["險些被日月神教的人發現", "在深淵邊緣探索", "聽聞組織內部的陰謀"]
};

// 根據性格和地點生成劇情
function generatePlotEvent(agent, eventType) {
  const loc = agent.loc || "襄陽城";
  const locEvents = LOCATION_EVENTS[loc] || [];
  const typeEvents = PLOT_EVENTS[eventType] || PLOT_EVENTS["奇遇"];
  
  const baseEvent = typeEvents[Math.floor(Math.random() * typeEvents.length)];
  const locEvent = locEvents.length > 0 ? locEvents[Math.floor(Math.random() * locEvents.length)] : '';
  
  // 根據性格調整事件
  const personality = agent.personality || "";
  let event = baseEvent;
  
  if (personality.includes("忠厚") || personality.includes("正直")) {
    if (Math.random() < 0.4) event = "幫助了一個需要援手的陌生人";
  }
  if (personality.includes("貪吃") || personality.includes("嗜酒")) {
    if (Math.random() < 0.3) event = "在酒樓大碗喝酒，大塊吃肉，好不快活";
  }
  if (personality.includes("機關算盡") || personality.includes("聰明")) {
    if (Math.random() < 0.3) event = "用計謀解決了一個難題";
  }
  if (personality.includes("嗜血") || personality.includes("殺人")) {
    if (Math.random() < 0.4) event = "殺了一個阻擋去路的人";
  }
  
  return locEvent || event;
}

// 生成完整的角色日誌
function generateCharacterLog(agent, eventType) {
  const skill = Object.keys(agent.skills || {})[0] || "拳腳";
  const loc = agent.loc || "Renaiss星球";
  const plotEvent = generatePlotEvent(agent, eventType);
  
  const logs = {
    "戰鬥": [
      `${agent.name}在${loc}路見不平！施展「${skill}」教訓了惡人，俠名遠播！`,
      `${agent.name}在${loc}遭遇偷襲，展開反擊！一番激戰後，擊退了敵人！`,
      `${agent.name}在${loc}測試新武功，掌風凌厲，周圍的人都看呆了！`
    ],
    "奇遇": [
      `${agent.name}在${loc}探險時，無意間發現了一本珍貴的秘籍！`,
      `${agent.name}在${loc}遇見一位神秘老者，交給他一個重要任務！`,
      `${agent.name}在${loc}的懸崖邊，發現了稀世草藥「${['雪蓮','靈芝','人參'][Math.floor(Math.random()*3)]}」！`
    ],
    "社交": [
      `${agent.name}在${loc}的酒樓認識了幾位俠客相談甚歡！`,
      `${agent.name}在${loc}資助了一個貧困的家庭，積攢了陰德！`,
      `${agent.name}在${loc}巧遇舊友，把酒言歡到天明！`
    ],
    "任務": [
      `${agent.name}在${loc}接下了一個押鏢任務，正在前往目的地！`,
      `${agent.name}受人所托，在${loc}尋找失散的親人！`,
      `${agent.name}幫官府緝拿江洋大盜，賞金豐厚！`
    ],
    "危險": [
      `${agent.name}在${loc}不小心得罪了當地幫派，被追殺中！僥倖逃脫！`,
      `${agent.name}在${loc}誤中陷阱，耗費大量內力才脫困！`,
      `${agent.name}在${loc}遭遇埋伏，受了重傷！`
    ],
    "搞笑": [
      `${agent.name}在${loc}吃飯忘記帶錢，被迫在客棧洗碗抵債！太丟臉了！`,
      `${agent.name}在${loc}誤把野草當成寶貝，結果...算了不說了！`,
      `${agent.name}在${loc}被一隻鵝追著跑了三條街！俠客形象全毀！`
    ],
    "修煉": [
      `${agent.name}在${loc}閉關修煉${skill}，感覺對武功有了新的領悟！`,
      `${agent.name}在${loc}打坐調息，內力修為提升！`,
      `${agent.name}在${loc}演練${skill}，招式越來越純熟！`
    ],
    "休息": [
      `${agent.name}在${loc}找了個舒適的地方休息，精神煥發！`,
      `${agent.name}在${loc}睡了一整天，做了個很奇怪的夢！`,
      `${agent.name}在${loc}品茶聽雨，享受難得的寧靜！`
    ]
  };
  
  const eventLogs = logs[eventType] || logs["奇遇"];
  return eventLogs[Math.floor(Math.random() * eventLogs.length)];
}

async function agentThink(agent, apiKey) {
  const nearby = agents.filter(a => a.id !== agent.id && a.loc === agent.loc && a.alive);
  
  // 決定事件類型（根據隨機性和角色狀態）
  const rand = Math.random();
  let eventType;
  
  // 根據角色特性和位置調整事件機率
  if (agent.stats.生命 < 30) {
    eventType = "休息"; // 重傷時休息
  } else if (rand < 0.15) {
    eventType = "奇遇";
  } else if (rand < 0.30) {
    eventType = "戰鬥";
  } else if (rand < 0.45) {
    eventType = "社交";
  } else if (rand < 0.55) {
    eventType = "任務";
  } else if (rand < 0.65) {
    eventType = "危險";
  } else if (rand < 0.75) {
    eventType = "搞笑";
  } else if (rand < 0.85) {
    eventType = "修煉";
  } else {
    eventType = "休息";
  }
  
  // 生成事件描述
  let eventDesc = generateCharacterLog(agent, eventType);
  
  // 如果附近有其他人，可以有互動事件
  if (nearby.length > 0 && Math.random() < 0.3) {
    const other = nearby[Math.floor(Math.random() * nearby.length)];
    const interactions = [
      `，巧遇${other.name}，二人切磋了一番！`,
      `，與${other.name}把酒言歡！`,
      `，遇到${other.name}在修煉，駐足觀看！`,
      `，和${other.name}商討Renaiss星球大事！`
    ];
    eventDesc += interactions[Math.floor(Math.random() * interactions.length)];
  }
  
  // 添加記憶
  addAgentMemory(agent.id, eventDesc, eventType);
  
  // 根據事件類型更新角色狀態
  if (eventType === "戰鬥") {
    const damage = Math.floor(Math.random() * 25) + 5;
    agent.stats.生命 = Math.max(10, (agent.stats.生命 || 100) - damage);
    if (Math.random() < 0.3) {
      agent.stats.內力 = Math.min(100, (agent.stats.內力 || 50) + 5);
    }
  } else if (eventType === "奇遇") {
    // 奇遇可能獲得好處
    if (Math.random() < 0.5) {
      agent.stats.運氣 = Math.min(100, (agent.stats.運氣 || 50) + 5);
    }
  } else if (eventType === "休息") {
    const hpRecover = Math.floor(Math.random() * 15) + 10;
    agent.stats.生命 = Math.min(100, (agent.stats.生命 || 100) + hpRecover);
  } else if (eventType === "危險") {
    const damage = Math.floor(Math.random() * 35) + 15;
    agent.stats.生命 = Math.max(5, (agent.stats.生命 || 100) - damage);
  } else if (eventType === "搞笑") {
    // 搞笑事件不影響狀態
  }
  
  return { npc: agent.name, action: eventType, desc: eventDesc };
}

function addEvent(msg) {
  world.events.unshift(`[Day ${world.day}] ${msg}`);
  if (world.events.length > 50) world.events.pop();
}

function saveWorld() {
  fs.writeFileSync(WORLD_FILE, JSON.stringify({ 
    world, 
    agents,
    agentMemories,
    agentInventories
  }, null, 2));
}

function loadWorld() {
  if (fs.existsSync(WORLD_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'));
      world = data.world || world;
      agents = data.agents || agents;
      agentMemories = data.agentMemories || {};
      agentInventories = data.agentInventories || {};
    } catch (e) {}
  }
}


// ============== 玩家系統 ==============
function createPlayer(discordId, name, gender, sect) {
  const player = {
    id: discordId,
    name,
    gender: gender || "男",
    sect: sect || "無門無派",
    alignment: null, // '正派' 或 '反派'
    petId: null, // 寵物ID
    title: "Renaiss星球新人",
    level: 1,
    exp: 0,
    reputation: 0,
    
    location: WORLD_MAP.getRandomCity().name, // 隨機出生地點
    status: "自由",
    
    stats: {
      戰力: 30 + Math.floor(Math.random() * 10),
      生命: 100,
      內力: 30,
      智商: 60 + Math.floor(Math.random() * 15),
      魅力: 60 + Math.floor(Math.random() * 15),
      運氣: 60 + Math.floor(Math.random() * 15),
      財富: 50,
      飽腹度: 100,
      賺錢倍率: 1.0
    },
    
    maxStats: {
      生命: 100,
      內力: 100
    },
    
    skills: {},
    inventory: ["乾糧一包", "水囊"],
    herbs: [],
    craftedItems: [],
    
    party: [],
    companions: [],
    
    relationships: {},
    
    memory: [],
    
    // 狀態效果
    statusEffects: [],
    
    alive: true,
    createdAt: Date.now()
  };
  
  savePlayer(player);
  return player;
}

function savePlayer(player) {
  const playerDir = path.join(DATA_DIR, 'players');
  if (!fs.existsSync(playerDir)) fs.mkdirSync(playerDir, { recursive: true });
  fs.writeFileSync(path.join(playerDir, `${player.id}.json`), JSON.stringify(player, null, 2));
}

function loadPlayer(discordId) {
  const playerFile = path.join(DATA_DIR, 'players', `${discordId}.json`);
  if (fs.existsSync(playerFile)) {
    return JSON.parse(fs.readFileSync(playerFile, 'utf8'));
  }
  return null;
}

function getAllPlayers() {
  const playerDir = path.join(DATA_DIR, 'players');
  if (!fs.existsSync(playerDir)) return [];
  const files = fs.readdirSync(playerDir).filter(f => f.endsWith('.json'));
  return files.map(f => JSON.parse(fs.readFileSync(path.join(playerDir, f), 'utf8')));
}

// ============== 天氣系統 ==============
const WEATHER_TYPES = ["晴", "雨", "霧", "雪", "颱風"];
const WEATHER_EFFECTS = {
  "晴": { 火系傷害: 0, 內功消耗: 0, 移動速度: 0, 視距: 0, 偷襲: 0, 戰力: 0 },
  "雨": { 火系傷害: -30, 內功消耗: +10, 移動速度: -20, 視距: -30, 偷襲: +10, 戰力: -5 },
  "霧": { 火系傷害: -10, 內功消耗: +5, 移動速度: -10, 視距: -50, 偷襲: +20, 戰力: 0 },
  "雪": { 火系傷害: -20, 內功消耗: +30, 移動速度: -40, 視距: -40, 偷襲: +15, 戰力: -10 },
  "颱風": { 火系傷害: -50, 內功消耗: +50, 移動速度: -60, 視距: -70, 偷襲: +30, 戰力: -20 }
};

// ============== 藥材/合成系統 ==============
const HERBS = {
  "止血草": { 功效: "止血", 等級: 1, 屬性: { 清熱: 2, 止血: 5 } },
  "金銀花": { 功效: "清熱解毒", 等級: 2, 屬性: { 清熱: 5, 解毒: 3 } },
  "人參": { 功效: "補氣", 等級: 3, 屬性: { 補氣: 8, 溫陽: 3 } },
  "何首烏": { 功效: "補精", 等級: 3, 屬性: { 補精: 7, 養血: 4 } },
  "靈芝": { 功效: "大補元氣", 等級: 5, 屬性: { 補氣: 10, 溫陽: 5, 養血: 5 } },
  "斷腸草": { 功效: "劇毒", 等級: 4, 屬性: { 毒性: 10, 清熱: -5 } },
  "鶴頂紅": { 功效: "致命毒", 等級: 5, 屬性: { 毒性: 15, 清熱: -10 } },
  "雪蓮": { 功效: "療傷", 等級: 4, 屬性: { 止血: 8, 溫陽: 4 } },
  "田七": { 功效: "活血化瘀", 等級: 2, 屬性: { 活血: 5, 止血: 3 } },
  "茯苓": { 功效: "利水滲濕", 等級: 2, 屬性: { 利水: 5, 補氣: 2 } },
  "毒蛇膽": { 功效: "大增內力", 等級: 4, 屬性: { 內力: 15, 毒性: 3 } },
  "蜈蚣": { 功效: "以毒攻毒", 等級: 3, 屬性: { 解毒: 8, 毒性: 5 } },
  "蜂蜜": { 功效: "調和藥性", 等級: 1, 屬性: { 調和: 10, 補氣: 1 } },
  "食鹽": { 功效: "消炎", 等級: 1, 屬性: { 消炎: 3 } }
};

function craftingLogic(ingredients) {
  let totalProps = { 清熱: 0, 止血: 0, 補氣: 0, 解毒: 0, 毒性: 0, 溫陽: 0, 活血: 0, 內力: 0 };
  let itemLevel = 0;
  
  for (const herb of ingredients) {
    const h = HERBS[herb] || HERBS[herb.replace(/\\s/g, "")];
    if (h) {
      itemLevel += h.等級;
      for (const [prop, val] of Object.entries(h.屬性)) {
        totalProps[prop] = (totalProps[prop] || 0) + val;
      }
    }
  }
  
  itemLevel = Math.floor(itemLevel / Math.max(1, ingredients.length));
  const results = [];
  
  if (totalProps.毒性 > 10 && totalProps.解毒 < 5) {
    results.push({ name: "毒藥", desc: "劇毒之物！", effect: "攻擊時附加" + Math.floor(totalProps.毒性) + "毒性傷害", success: true });
  }
  if (totalProps.毒性 > 5 && totalProps.解毒 >= 5) {
    results.push({ name: "以毒攻毒丸", desc: "用解毒之力中和了部分毒性", effect: "毒性" + (totalProps.毒性 - totalProps.解毒) + "，解毒+" + totalProps.解毒, success: true });
  }
  if (totalProps.補氣 >= 5 && totalProps.毒性 < 3) {
    const level = Math.min(5, Math.floor(totalProps.補氣 / 3));
    results.push({ name: "補氣丸Lv" + level, desc: "溫和補氣", effect: "內力+" + totalProps.補氣 * 10, success: true });
  }
  if (totalProps.止血 >= 5 || totalProps.清熱 >= 5) {
    const level = Math.min(5, Math.floor((totalProps.止血 + totalProps.清熱) / 4));
    results.push({ name: "療傷藥Lv" + level, desc: "清熱止血", effect: "生命恢復" + Math.floor((totalProps.止血 + totalProps.清熱) * 8), success: true });
  }
  if (totalProps.補氣 >= 10 && totalProps.溫陽 >= 5 && totalProps.毒性 < 2) {
    results.push({ name: "大還丹", desc: "珍稀丹藥！", effect: "內力+100，生命全滿", legendary: true, success: true });
  }
  
  return results.length > 0 ? results : [{ name: "失敗的丹藥", desc: "配方不對...", success: false }];
}

// ============== 戰鬥系統 ==============
function calculateDamage(attacker, skillName, target, realmMultiplier = 1.0, weather = "晴") {
  const skillData = martial.MARTIAL_ARTS[skillName];
  if (!skillData) return 0;
  
  let damage = (attacker.stats?.戰力 || 50) * skillData.coefficient;
  damage *= realmMultiplier;
  
  // 天氣影響
  if (weather === "雨" && skillData.description?.includes("火")) {
    damage *= 0.7;
  }
  
  // 防禦
  const defense = (target.stats?.戰力 || 50) * 0.4;
  damage = Math.max(5, damage - defense);
  
  // 暴擊
  const luck = (attacker.stats?.運氣 || 50) / 100;
  if (Math.random() < luck * 0.3) damage *= 1.5;
  
  return Math.floor(damage);
}

// ============== 談判系統 ==============
async function negotiationPrompt(npc, player, situation, apiKey) {
  const prompt = "你是武俠世界中的NPC。\n\n【NPC】\n名字：" + npc.name + "\n性格：" + npc.personality + "\n門派：" + npc.sect + "\n\n【玩家】\n名字：" + player.name + "\n實力：" + (player.stats?.戰力 || 50) + "\n財富：" + (player.stats?.財富 || 50) + "\n聲望：" + (player.reputation || 0) + "\n\n【談判情境】\n" + situation + "\n\n請用50-100字描述這個NPC的反應和回覆。";
  
  return callAI(prompt, apiKey);
}

// ============== AI API ==============
async function callAI(prompt, apiKey) {
  if (!apiKey) return "需要API Key";
  
  const data = JSON.stringify({
    model: 'MiniMax-M2.5',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 250,
    temperature: 0.9
  });
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.minimax.io',
      path: '/anthropic/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) { resolve("API Error"); return; }
          let text = '';
          if (parsed.content && Array.isArray(parsed.content)) {
            text = parsed.content.map(c => c.text || '').join('');
          } else if (parsed.content?.[0]?.text) {
            text = parsed.content[0].text;
          }
          resolve(text.trim() || "（無回應）");
        } catch (e) {
          resolve("解析錯誤");
        }
      });
    });
    req.on('error', () => resolve("連線錯誤"));
    req.write(data);
    req.end();
  });
}

// ============== 玩家認輸重置系統 ==============
const SURRENDER_WORDS = [
  '我認輸了', '認輸', '投降', '不是對手', '求饒', '饒命', 
  '我服了', '服了', '認敗', '認栽', '輸了', '罷了',
  '就此作罷', '不再較量', '甘拜下風', '心服口服'
];

function checkSurrender(message) {
  const lowerMsg = message.toLowerCase();
  return SURRENDER_WORDS.some(word => lowerMsg.includes(word));
}

function resetPlayerGame(playerId) {
  const playerDir = path.join(DATA_DIR, 'players');
  const playerFile = path.join(playerDir, `${playerId}.json`);
  
  // 刪除玩家資料
  if (fs.existsSync(playerFile)) {
    fs.unlinkSync(playerFile);
  }
  
  // 刪除寵物資料
  const petSystem = require('./pet-system');
  const pet = petSystem.loadPet(playerId);
  if (pet) {
    petSystem.resetPet(pet);
    petSystem.savePet(pet);
  }
  
  // 刪除記憶
  const memoryFile = path.join(DATA_DIR, 'players', `${playerId}_memory.json`);
  if (fs.existsSync(memoryFile)) {
    fs.unlinkSync(memoryFile);
  }
  
  return {
    success: true,
    message: 'Renaiss星球夢醒，一切歸零。你的俠客之路已經重新開始...'
  };
}

// ============== 寵物是否可戰鬥 ==============
function canPetFight(pet) {
  if (!pet) return false;
  if (pet.status === '休眠') return false;
  if (pet.status === '蛋') return false;
  if (pet.hp <= 0) return false;
  
  // 檢查是否有任何招式
  if (!pet.moves || pet.moves.length === 0) return false;
  
  return true;
}

// ============== WM 傳說觸發 ==============
function triggerWMEncounter() {
  const pet = require('./pet-system');
  return pet.isWMAppearing();
}

function getWMAppearance() {
  const pet = require('./pet-system');
  return pet.getWMInfo();
}

// ============== 導出 ==============
module.exports = {
  // 世界地圖
  WORLD_MAP,
  
  // 核心
  worldTick,
  saveWorld,
  loadWorld,
  
  // 玩家
  createPlayer,
  loadPlayer,
  savePlayer,
  getAllPlayers,
  
  // 藥材/合成
  HERBS,
  craftingLogic,
  
  // 天氣
  WEATHER_TYPES,
  WEATHER_EFFECTS,
  
  // 戰鬥
  calculateDamage,
  
  // 談判
  negotiationPrompt,
  
  // AI
  callAI,
  
  // 數據
  getAgents: () => agents,
  getWorld: () => world,
  
  // Agent 記憶/背包
  getAgentMemory,
  addAgentMemory,
  getAgentInventory,
  addAgentItem,
  removeAgentItem,
  hasAgentItem,
  
  // 獲取 Agent 完整資訊
  getAgentFullInfo,
  
  // 認輸重置系統
  checkSurrender,
  resetPlayerGame,
  canPetFight,
  
  // WM傳說
  triggerWMEncounter,
  getWMAppearance,
  
  // NPC 生死追蹤
  isNPCAlive,
  killNPC,
  getNPCDeathInfo,
  getRecentWorldEvents,
  getRespawnTime,
  
  // 通緝系統
  getPlayerWantedLevel,
  getWantedList,
  addWantedLevel,
  reduceAllWantedLevels,
  
  // 玩家記憶系統
  addPlayerMemory,
  getPlayerMemoryContext
};

function getAgentFullInfo(agentId) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return null;
  
  return {
    ...agent,
    memory: getAgentMemory(agentId),
    inventory: getAgentInventory(agentId)
  };
}
