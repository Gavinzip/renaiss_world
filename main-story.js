/**
 * 📖 Renaiss 主線（被動觸發版）
 * 不提供固定主線按鈕，隨玩家遊玩行為自然推進。
 */

const { sanitizeWorldObject } = require('./style-sanitizer');

const STORY_ACTS = {
  1: 'Act 1 誘惑（The Cheap Choice）',
  2: 'Act 2 流言（Whispers）',
  3: 'Act 3 狩獵（Marked）',
  4: 'Act 4 市場戰爭（War）',
  5: 'Act 5 四巨頭（Endgame）',
  6: 'Act 6 Winchman 抉擇'
};

const DIGITAL_KINGS = ['Nemo', 'Wolf', 'Adaloc', 'Hom'];

const ENDING_RULES = {
  order: { fakeRate: 0.12, ambushRate: 0.15, volatility: 0.08, rewardVariance: 0.2 },
  chaos: { fakeRate: 0.48, ambushRate: 0.42, volatility: 0.35, rewardVariance: 0.65 },
  controller: { fakeRate: 0.28, ambushRate: 0.24, volatility: 0.18, rewardVariance: 0.4 }
};

function ensureMainStoryState(player) {
  if (!player) return null;
  if (!player.mainStory || typeof player.mainStory !== 'object') {
    player.mainStory = {
      act: 1,
      node: 'act1_market',
      side: null,
      completed: false,
      ending: null,
      history: [],
      pressure: 0,
      eventCount: 0,
      signals: {
        order: 0,
        chaos: 0,
        control: 0
      }
    };
  }
  if (!player.mainStory.signals) {
    player.mainStory.signals = { order: 0, chaos: 0, control: 0 };
  }
  if (typeof player.mainStory.eventCount !== 'number') {
    player.mainStory.eventCount = 0;
  }
  return player.mainStory;
}

function getMainStoryBrief(player) {
  const state = ensureMainStoryState(player);
  if (!state) return '主線未初始化';
  const endingText = state.ending ? `｜結局：${state.ending}` : '';
  return `${STORY_ACTS[state.act] || '未知章節'}｜節點：${state.node}${endingText}`;
}

function pushHistory(state, text) {
  state.history.unshift({ text, at: Date.now() });
  if (state.history.length > 24) state.history.pop();
}

function markNode(state, act, node, note) {
  state.act = act;
  state.node = node;
  if (note) pushHistory(state, note);
}

function addSignal(state, key, amount) {
  state.signals[key] = (state.signals[key] || 0) + amount;
}

function absorbPlayerBehavior(state, event, result) {
  const action = String(event?.action || '');
  const type = String(result?.type || '');

  state.eventCount += 1;

  if (['gossip', 'social', 'quest', 'help', 'rest', 'meditate', 'forage', 'hunt'].includes(action)) {
    addSignal(state, 'order', 2);
  }
  if (['fight', 'rob', 'assassinate', 'extort', 'wish_pool'].includes(action)) {
    addSignal(state, 'chaos', 2);
  }
  if (['explore', 'teleport', 'treasure', 'wish_pool', 'shop'].includes(action)) {
    addSignal(state, 'control', 1);
  }

  if (type === 'combat') addSignal(state, 'chaos', 1);
  if (type === 'wish_pool') addSignal(state, 'control', 2);
}

function chooseEnding(state) {
  const order = state.signals.order || 0;
  const chaos = state.signals.chaos || 0;
  const control = state.signals.control || 0;

  if (control >= Math.max(order, chaos) + 2) return '控制者';
  if (order >= chaos) return '秩序';
  return '混亂';
}

function finalizeEnding(state, player) {
  const ending = chooseEnding(state);
  state.ending = ending;
  state.completed = true;
  state.node = 'epilogue';

  if (ending === '秩序') {
    state.worldRule = { mode: 'order', ...ENDING_RULES.order };
  } else if (ending === '混亂') {
    state.worldRule = { mode: 'chaos', ...ENDING_RULES.chaos };
  } else {
    state.worldRule = { mode: 'controller', ...ENDING_RULES.controller, controllerId: player?.id || '' };
  }

  pushHistory(state, `Act 6 結局：${ending}`);
  return ending;
}

function buildMaskedAssassinEncounter() {
  return sanitizeWorldObject({
    type: 'combat',
    message: '💀 你被 Digital 注意到了。覆面獵手夜襲而來，先試你深淺。',
    enemy: {
      name: '覆面獵手',
      hp: 130,
      attack: 32,
      moves: ['突襲', '奪包', '煙霧'],
      reward: { gold: [70, 130] },
      isMonster: true
    },
    canFlee: true,
    fleeRate: 0.7,
    fleeAttempts: 2
  });
}

function buildKingEncounter() {
  const king = DIGITAL_KINGS[Math.floor(Math.random() * DIGITAL_KINGS.length)];
  return sanitizeWorldObject({
    king,
    encounter: {
      type: 'combat',
      message: `👑 四巨頭「${king}」現身，變異寵物在你面前失控咆哮。`,
      enemy: {
        name: king,
        hp: 180,
        attack: 46,
        defense: 16,
        moves: ['變異撕裂', '反噬波動', '技能複製'],
        reward: { gold: [120, 220] },
        isMonster: true
      },
      canFlee: true,
      fleeRate: 0.7,
      fleeAttempts: 2
    }
  });
}

function maybeTriggerPassiveStory(player, context = {}) {
  const state = ensureMainStoryState(player);
  if (!state || state.completed) return null;

  const event = context.event || {};
  const result = context.result || {};
  absorbPlayerBehavior(state, event, result);

  const count = state.eventCount;
  const triggered = {
    appendText: '',
    overrideResult: null,
    announcement: '',
    memory: ''
  };

  if (state.node === 'act1_market' && count >= 2) {
    markNode(state, 1, 'act1_anomaly', 'Act1 -> 市場誘惑被看見');
    triggered.appendText = '📖 **主線異動**：你在 Sector 0 看見價格與信任的第一道裂縫。';
    triggered.memory = '你注意到 Renaiss 與 Digital 的價格博弈。';
    return triggered;
  }

  if (state.node === 'act1_anomaly' && count >= 4) {
    markNode(state, 2, 'act2_whispers', 'Act2 -> 流言啟動');
    triggered.appendText = '📖 **主線異動**：市場開始出現「假貨比例被控制」的流言。';
    triggered.announcement = `🗣️ 市場流言升溫：Digital 正在控制假貨比例。`;
    triggered.memory = '你聽見關於 Digital 假貨比例的傳言。';
    return triggered;
  }

  if (state.node === 'act2_whispers' && count >= 6) {
    markNode(state, 3, 'act3_marked', 'Act3 -> 被盯上');
    triggered.appendText = '📖 **主線異動**：你在調查中被標記，Digital 已注意到你。';
    triggered.memory = '你被 Digital 列入觀察名單。';
    return triggered;
  }

  if (state.node === 'act3_marked' && count >= 8) {
    markNode(state, 4, 'act4_war', 'Act4 -> 蒙面狩獵觸發');
    triggered.overrideResult = buildMaskedAssassinEncounter();
    triggered.announcement = `💀 ${player.name}遭遇了 Digital 覆面獵手的狩獵測試。`;
    triggered.memory = '覆面獵手突襲了你。';
    return triggered;
  }

  if (state.node === 'act4_war' && count >= 10) {
    state.side = (state.signals.chaos || 0) > (state.signals.order || 0)
      ? 'Digital（機變策略）'
      : 'Renaiss（秩序）';
    markNode(state, 5, 'act5_kings', `Act5 -> 市場戰爭立場：${state.side}`);
    triggered.appendText = `📖 **主線異動**：市場戰爭升級，你目前傾向立場：${state.side}。`;
    triggered.announcement = `⚔️ 市場戰爭進入白熱化，${player.name}立場傾向 ${state.side}。`;
    triggered.memory = `你在市場戰爭中的傾向為 ${state.side}。`;
    return triggered;
  }

  if (state.node === 'act5_kings' && count >= 13) {
    const kingData = buildKingEncounter();
    markNode(state, 6, 'act6_winchman', `Act6 前置 -> 對決 ${kingData.king}`);
    triggered.overrideResult = kingData.encounter;
    triggered.announcement = `👑 ${player.name}已與四巨頭「${kingData.king}」交鋒。`;
    triggered.memory = `你與四巨頭 ${kingData.king} 交手。`;
    return triggered;
  }

  if (state.node === 'act6_winchman' && count >= 16) {
    const ending = finalizeEnding(state, player);
    triggered.appendText =
      `📖 **主線終局**：Winchman 揭露「必要混亂」真相，你的世界線收束為【${ending}】。`;
    triggered.announcement = `🌍 ${player.name}完成主線終局，世界偏向「${ending}」路徑。`;
    triggered.memory = `你完成主線並走向「${ending}」結局。`;
    return triggered;
  }

  return null;
}

function getWorldRuleProfile(player) {
  const state = ensureMainStoryState(player);
  return state?.worldRule || null;
}

function getMainStoryChoice() {
  // 被動觸發版：不再提供固定主線按鈕
  return null;
}

function resolveMainStoryAction(player) {
  // 舊流程相容：若玩家點到舊版按鈕，只回提示
  ensureMainStoryState(player);
  return {
    result: {
      type: 'main_story',
      message: '📖 主線已改為被動觸發：你在開放世界行動時會自然推進劇情。'
    },
    announcement: null
  };
}

module.exports = {
  STORY_ACTS,
  DIGITAL_KINGS,
  ENDING_RULES,
  ensureMainStoryState,
  getMainStoryBrief,
  getMainStoryChoice,
  resolveMainStoryAction,
  maybeTriggerPassiveStory,
  getWorldRuleProfile
};
