/**
 * 🗡️ 刀鋒 BLADE - 任務系統
 * 每個玩家都有任務指引
 */

const QUESTS = {
  // ===== 新手任務 =====
  新手任務: {
    title: "📜 新手任務",
    tasks: [
      { id: "explore_town", desc: "探索襄陽城", reward: "💰 50兩", target: 1 },
      { id: "learn_skill", desc: "學習一招武功", reward: "⚔️ 戰力+3", target: 1 },
      { id: "make_friend", desc: "認識一位俠客", reward: "🤝 聲望+10", target: 1 },
      { id: "collect_herb", desc: "采集3個草藥", reward: "🌿 草藥x3", target: 3 }
    ],
    completed: {}
  },
  
  // ===== 江湖歷練 =====
  歷練任務: {
    title: "⚔️ 江湖歷練",
    tasks: [
      { id: "defeat_bandit", desc: "擊敗山匪嘍囉", reward: "💰 100兩", target: 1 },
      { id: "visit_sect", desc: "拜訪任一門派", reward: "📍 解鎖門派", target: 1 },
      { id: "trade_item", desc: "完成一筆交易", reward: "💰 80兩", target: 1 },
      { id: "practice_heal", desc: "休息恢復生命", reward: "🩸 滿血", target: 1 }
    ],
    completed: {}
  },
  
  // ===== 俠客之路 =====
  俠客之路: {
    title: "🗡️ 俠客之路",
    tasks: [
      { id: "defeat_boss", desc: "挑戰首領成功", reward: "🔥 秘籍", target: 1 },
      { id: "find_secret", desc: "發現一個秘境", reward: "💎 珍稀物品", target: 1 },
      { id: "recruit_hero", desc: "招募一位同伴", reward: "👥 俠客加入", target: 1 },
      { id: "reach_level5", desc: "境界達到5級", reward: "⭐ 實力認證", target: 5 }
    ],
    completed: {}
  }
};

// 給玩家隨機任務
function givePlayerQuest(player) {
  if (!player.quests) {
    player.quests = {};
  }
  
  // 根據玩家等級給予任務
  const level = player.level || 1;
  let questPool;
  
  if (level <= 2) {
    questPool = QUESTS.新手任務.tasks;
  } else if (level <= 5) {
    questPool = [...QUESTS.新手任務.tasks, ...QUESTS.歷練任務.tasks];
  } else {
    questPool = [...QUESTS.新手任務.tasks, ...QUESTS.歷練任務.tasks, ...QUESTS.俠客之路.tasks];
  }
  
  // 隨機選一個未完成的任務
  const available = questPool.filter(t => {
    const p = player.quests[t.id] || 0;
    return p < t.target;
  });
  
  if (available.length === 0) {
    return null; // 所有任務都完成了
  }
  
  return available[Math.floor(Math.random() * available.length)];
}

// 初始化玩家任務
function initPlayerQuests(player) {
  if (!player.quests) {
    player.quests = {};
  }
  
  // 給予3個當前任務
  const tasks = [];
  for (let i = 0; i < 3; i++) {
    const quest = givePlayerQuest(player);
    if (quest && !tasks.find(t => t.id === quest.id)) {
      tasks.push(quest);
    }
  }
  
  return tasks;
}

// 更新任務進度
function updateQuestProgress(player, taskId) {
  if (!player.quests) player.quests = {};
  player.quests[taskId] = (player.quests[taskId] || 0) + 1;
}

// 檢查任務完成
function checkQuestComplete(player, taskId) {
  const allTasks = [
    ...QUESTS.新手任務.tasks,
    ...QUESTS.歷練任務.tasks,
    ...QUESTS.俠客之路.tasks
  ];
  
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return false;
  
  const progress = player.quests[taskId] || 0;
  return progress >= task.target;
}

// 生成任務面板
function getQuestPanel(player) {
  const tasks = initPlayerQuests(player);
  
  const lines = tasks.map((task, i) => {
    const progress = player.quests[task.id] || 0;
    const done = progress >= task.target;
    const bar = done ? "✅" : `[${progress}/${task.target}]`;
    return `${bar} ${task.desc}\n   獎勵: ${task.reward}`;
  }).join('\n\n');
  
  return `📋 **當前任務**\n\n${lines}\n\n💡 **提示**: 完成任務可以獲得豐厚獎勵！`;
}

// 獲取玩家建議
function getSuggestion(player) {
  const suggestions = [];
  
  // 根據狀態給建議
  if ((player.stats?.生命 || 100) < 50) {
    suggestions.push("🩸 生命低了！快去休息或找郎中");
  }
  
  if ((player.stats?.內力 || 30) < 20) {
    suggestions.push("⚡ 內力不足！建議去酒樓或寺廟");
  }
  
  if ((player.stats?.財富 || 50) < 20) {
    suggestions.push("💰 銀兩不多了！去集市打工或接受委託");
  }
  
  if (!player.quests || Object.keys(player.quests).length === 0) {
    suggestions.push("📜 你還沒有任務！去酒樓打聽消息");
  }
  
  if (player.level <= 2) {
    suggestions.push("⚔️ 等級還低！建議先在襄陽城附近歷練");
  }
  
  // 隨機建議
  const randomSuggestions = [
    "🍺 去酒樓聽聽江湖傳言",
    "🗡️ 找個師父學武功",
    "🌿 去城外采集草藥",
    "👥 招募一位俠客同行",
    "🗺️ 探索地圖上的新地點",
    "🔥 聽說附近有秘境可以探索"
  ];
  
  if (suggestions.length < 2) {
    const rand = randomSuggestions[Math.floor(Math.random() * randomSuggestions.length)];
    suggestions.push(rand);
  }
  
  return suggestions.slice(0, 3);
}

// 每日事件生成器
function generateDailyEvent(player) {
  const events = [];
  
  // 根據地點生成事件
  const loc = player.location || "";
  
  if (loc.includes("襄陽城")) {
    events.push("🏮 襄陽城門口聚集了一群人，似乎有大事發生！");
    events.push("📢 告示欄上貼了新的委託！");
    events.push("🍺 酒樓裡傳來熱鬧的划拳聲...");
  } else if (loc.includes("終南山")) {
    events.push("⛰️ 山路上遇到一位道人，似乎想指點你...");
    events.push("🏔️ 遠處傳來練功的聲音...");
  } else if (loc.includes("華山")) {
    events.push("🗡️ 華山派正在招收新弟子！");
    events.push("⛰️ 山路險峻，有人摔倒了...");
  } else if (loc.includes("少林")) {
    events.push("🔔 寺廟裡傳來悠遠的鐘聲...");
    events.push("🥋 羅漢堂大師在指點弟子武功...");
  }
  
  // 隨機事件
  const rand = Math.random();
  if (rand < 0.2) {
    events.push("⚠️ 遠處似乎有戰鬥的聲音...");
  } else if (rand < 0.4) {
    events.push("👤 一位神秘的俠客路過，多看了你一眼...");
  } else if (rand < 0.6) {
    events.push("📦 路邊似乎有什麼閃光的東西...");
  }
  
  return events[Math.floor(Math.random() * events.length)];
}

module.exports = {
  QUESTS,
  givePlayerQuest,
  initPlayerQuests,
  updateQuestProgress,
  checkQuestComplete,
  getQuestPanel,
  getSuggestion,
  generateDailyEvent
};
