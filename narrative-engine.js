/**
 * 🌟 Renaiss World - 深度敘事引擎 v2
 */

const fs = require('fs');
const path = require('path');

const WORLD_FILE = path.join(__dirname, 'data', 'world.json');

// ============== 世界狀態 ==============
let world = { day: 1, season: "春天", weather: "晴" };
let agents = [];
let agentMemories = {};

// ============== 工具函數 ==============
function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  return items[items.length - 1];
}

function getMemory(agentId) {
  if (!agentMemories[agentId]) agentMemories[agentId] = [];
  return agentMemories[agentId];
}

function addMemory(agentId, event) {
  const mem = getMemory(agentId);
  mem.unshift({ day: world.day, event, timestamp: Date.now() });
  if (mem.length > 30) mem.pop();
}

// ============== 詳細劇情模板 ==============
const ACTIVITIES = [
  {
    type: "采集",
    templates: [
      "{name}揹著竹簍上山采摘野果，在林間發現了一片野莓叢，摘了滿滿一簍。",
      "{name}在小溪邊看到了幾株珍稀草藥，小心採集了起來。",
      "{name}爬上半山腰，采集了珍貴的靈芝和人參，運氣真好！"
    ],
    interactable: true
  },
  {
    type: "做飯",
    templates: [
      "{name}肚子餓了，用剛采的野果榨了杯清香四溢的果汁，真是美味！",
      "{name}生火烤了幾個紅薯，香味四溢，吃得津津有味。",
      "{name}用野菜煮了碗熱湯，暖胃又暖心。"
    ],
    interactable: false
  },
  {
    type: "修煉",
    templates: [
      "{name}找了個清靜的山洞，閉關修煉內功，感覺對武功有了新的領悟。",
      "{name}對著瀑布練習掌力，水花飛濺中招式越來越純熟。",
      "{name}在樹林中演練拳法招式，一招一式越來越嫻熟。"
    ],
    interactable: true
  },
  {
    type: "休息",
    templates: [
      "{name}找了個山洞休息，生起火堆取暖，烤得暖洋洋的。",
      "{name}在客棧要了間房間，好好睡了一覺，精神煥發。",
      "{name}靠著大樹休息了一會兒，做了個很美的夢。"
    ],
    interactable: true
  },
  {
    type: "社交",
    templates: [
      "{name}在酒樓認識了幾位俠客，相談甚歡，相談武道。",
      "{name}幫助了一個困難的旅人，對方感激不盡。",
      "{name}與當地村民聊得投機，得到了不少江湖情報。"
    ],
    interactable: true
  },
  {
    type: "遭遇敵人",
    templates: [
      "{name}走在路上突然被三個山賊包圍！敵人喝道：「此路是我開，留下買路財！」",
      "{name}不小心誤入了山賊的地盤，被幾個黑衣人包圍了！",
      "{name}遭遇了仇家派來的殺手，二話不說就動手！"
    ],
    interactable: false,
    setsDanger: true
  },
  {
    type: "戰鬥",
    templates: [
      "{name}施展出看家本領，與敵人激烈交戰！掌風呼嘯，雙方打得難分難解！",
      "{name}抽出兵器迎敵，過了數十招後終於擊退了敵人！"
    ],
    interactable: false,
    causesDamage: true
  },
  {
    type: "逃跑",
    templates: [
      "{name}眼看形勢不利，轉身就跑！敵人在後面窮追不捨！",
      "{name}慌不擇路狂奔，穿過樹林跳過溪流，拼命逃脫！"
    ],
    interactable: false
  },
  {
    type: "躲藏",
    templates: [
      "{name}躲進了一座破舊的山神廟，屏住呼吸不敢出聲！",
      "{name}藏在一堆灌木叢中，心跳加速祈禱敵人不要發現！",
      "{name}溜進了村莊，趁著人多混入人群中，總算安全了。"
    ],
    interactable: false
  },
  {
    type: "脫困",
    templates: [
      "{name}躲在暗處觀察，確認安全後，趁著夜色悄悄離開，終於擺脫了追兵！",
      "{name}找到一條小路，繞過敵人的封鎖線，成功逃出生天！",
      "{name}等到敵人放棄追尋，才小心翼翼地從藏身處出來。"
    ],
    interactable: false
  },
  {
    type: "被救命",
    templates: [
      "{name}被俠客路過出手相救，擊退了追兵！這位恩人真是俠義心腸！",
      "{name}被村裡的獵戶藏起來，躲過了一劫，獵戶还送了食物。",
      "{name}重傷倒在路邊，一位老醫師用草藥幫包紮傷口，總算撿回一命。"
    ],
    interactable: false,
    heals: true
  },
  {
    type: "做夢",
    templates: [
      "{name}睡夢中彷彿見到了故人，醒來時眼角有些濕潤。",
      "{name}夢到自己武功大進天下無敵，醒來卻發現只是南柯一夢。",
      "{name}夢到了一片雲海，仙人撫頂傳授功法，醒來若有所悟。"
    ],
    interactable: false
  }
];

// ============== 生成劇情 ==============
function generateNarrative(agent) {
  const nearby = agents.filter(a => a.id !== agent.id && a.loc === agent.loc && a.alive);
  const lastMem = getMemory(agent.id)[0];
  
  // 根據上次記憶決定行動
  let action;
  
  if (lastMem?.event.includes("追") && Math.random() < 0.6) {
    action = "躲藏";
  } else if (lastMem?.event.includes("戰") && Math.random() < 0.5) {
    action = "休息";
  } else if (agent.stats?.生命 < 50) {
    action = "休息";
  } else {
    // 隨機選擇活動
    const weights = [15, 10, 20, 15, 15, 10, 5, 5, 5, 5, 5, 5];
    action = ACTIVITIES[weightedRandom(ACTIVITIES.map((_, i) => i), weights)].type;
  }
  
  // 找到對應模板
  const activity = ACTIVITIES.find(a => a.type === action);
  if (!activity) return `${agent.name}在江湖中漫無目的地遊走。`;
  
  // 選擇模板
  let narrative = activity.templates[Math.floor(Math.random() * activity.templates.length)].replace("{name}", agent.name);
  
  // 添加互動
  if (activity.interactable && nearby.length > 0 && Math.random() < 0.4) {
    const other = nearby[Math.floor(Math.random() * nearby.length)];
    const interactions = [
      `巧遇${other.name}也在這裡，${other.name}對我微笑點頭。`,
      `遇到${other.name}，${other.name}提醒我最近附近不太平。`,
      `${other.name}正好路過，說前面有山賊要小心。`
    ];
    narrative += " " + interactions[Math.floor(Math.random() * interactions.length)];
  }
  
  // 狀態更新
  if (activity.causesDamage) {
    agent.stats.生命 = Math.max(20, (agent.stats.生命 || 100) - 15);
  }
  if (activity.heals) {
    agent.stats.生命 = Math.min(100, (agent.stats.生命 || 50) + 30);
  }
  if (action === "修煉") {
    agent.stats.內力 = Math.min(100, (agent.stats.內力 || 50) + 5);
  }
  
  // 記錄記憶
  addMemory(agent.id, narrative);
  
  return narrative;
}

// ============== 世界結算 ==============
async function worldTick() {
  world.day++;
  
  // 天氣變化
  if (Math.random() < 0.25) {
    const weathers = ["晴", "晴", "雨", "霧", "陰"];
    world.weather = weathers[Math.floor(Math.random() * weathers.length)];
  }
  
  // 季節變化
  if (world.day % 30 === 0) {
    const seasons = ["春天", "夏天", "秋天", "冬天"];
    world.season = seasons[Math.floor((world.day / 30) % 4)];
  }
  
  const results = [];
  
  for (const agent of agents) {
    if (!agent.alive) {
      continue; // 不顯示死亡的NPC
    }
    
    const narrative = generateNarrative(agent);
    
    // 自動恢復（非戰鬥日）
    if (!narrative.includes("戰") && !narrative.includes("追")) {
      agent.stats.生命 = Math.min(100, (agent.stats.生命 || 100) + 2);
    }
    
    // 只標記重要事件
    const isImportant = 
      narrative.includes("追") || 
      narrative.includes("戰") || 
      narrative.includes("殺") ||
      narrative.includes("救") ||
      narrative.includes("寶") ||
      narrative.includes("秘籍") ||
      narrative.includes("秘") ||
      narrative.includes("遇");
    
    results.push({ agent: agent.name, narrative, location: agent.loc, important: isImportant });
  }
  
  saveWorld();
  return { world, results };
}

// ============== 存讀檔 ==============
function saveWorld() {
  fs.writeFileSync(WORLD_FILE, JSON.stringify({ world, agents, agentMemories }, null, 2));
}

function loadWorld() {
  if (fs.existsSync(WORLD_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'));
      world = data.world || world;
      agents = data.agents || [];
      agentMemories = data.agentMemories || {};
      return true;
    } catch (e) {}
  }
  return false;
}

function initWorld() {
  if (!loadWorld()) {
    world = { day: 1, season: "春天", weather: "晴" };
    agents = [];
    agentMemories = {};
  }
}

function setAgents(newAgents) {
  agents = newAgents;
}

module.exports = {
  worldTick,
  saveWorld,
  loadWorld,
  initWorld,
  setAgents,
  getWorld: () => world,
  getAgents: () => agents,
  getMemory,
  addMemory
};
