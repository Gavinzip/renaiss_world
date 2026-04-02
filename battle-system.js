/**
 * ⚔️ Renaiss World - 戰鬥系統 v3
 * 逃跑30%失敗 x2 = 死亡
 */

const fs = require('fs');
const path = require('path');
const CORE = require('./game-core');
const PET = require('./pet-system');

// ============== 逃跑系統 ==============
const FLEE_CONFIG = {
  successRate: 0.7,  // 70% 成功率
  maxAttempts: 2,     // 最多嘗試2次
  deathOnFail: true   // 第2次失敗 = 死亡
};

// 嘗試逃跑
function attemptFlee(player, pet, enemy, attemptNumber = 1, combatant = null) {
  const safeAttempt = Math.max(1, Number(attemptNumber) || 1);
  if (combatant && typeof combatant === 'object') {
    const status = ensureStatusState(combatant);
    if (status.bind > 0) {
      status.bind = Math.max(0, status.bind - 1);
      return {
        success: false,
        blocked: true,
        death: false,
        canRetry: true,
        consumeAttempt: false,
        message: `⛓️ 你被束縛住，無法逃跑！（束縛剩 ${status.bind} 回合）`
      };
    }
  }

  const roll = Math.random();
  const success = roll < FLEE_CONFIG.successRate;
  
  if (success) {
    return {
      success: true,
      consumeAttempt: true,
      message: `🏃 逃跑成功！你脫離了戰鬥！`
    };
  }
  
  // 失敗了
  if (safeAttempt >= FLEE_CONFIG.maxAttempts) {
    // 第2次也失敗 = 死亡
    return {
      success: false,
      death: true,
      consumeAttempt: true,
      message: `💀 逃跑失敗！你已被敵人追上，無法逃脫！`
    };
  }
  
  // 第1次失敗，可以再試
  return {
    success: false,
    death: false,
    canRetry: true,
    consumeAttempt: true,
    message: `⚠️ 逃跑失敗！敵人追了上來，還有一次逃跑機會！`
  };
}

// ============== 敵方怪物（學習玩家的招式）==============
const DIGITAL_KINGS = ['Nemo', 'Wolf', 'Adaloc', 'Hom'];
const KING_MOVE_IDS = Object.freeze({
  Nemo: ['silver_snake', 'ice_toxin', 'seven_step_poison', 'soul_drain', 'ultimate_dark'],
  Wolf: ['hell_fire', 'explosive_pill', 'ghost_fire', 'bone_dissolver', 'thunder_crash'],
  Adaloc: ['mud_fire_lotus', 'soul_scatter', 'hot_sand_hell', 'plague_cloud', 'wind_fire_blade'],
  Hom: ['ultimate_dark', 'silver_snake', 'hell_fire', 'iron_thorn', 'arhat_kick']
});
const KING_STATS = Object.freeze({
  Nemo: { hp: 320, attack: 68, defense: 30, speed: 24, reward: { gold: [260, 420] } },
  Wolf: { hp: 340, attack: 74, defense: 28, speed: 30, reward: { gold: [300, 460] } },
  Adaloc: { hp: 360, attack: 72, defense: 34, speed: 22, reward: { gold: [340, 500] } },
  Hom: { hp: 400, attack: 78, defense: 36, speed: 20, reward: { gold: [380, 560] } }
});
const ENEMY_MOVE_MAX = 6;

const ALL_SKILL_POOL = [
  ...(Array.isArray(PET.POSITIVE_MOVES) ? PET.POSITIVE_MOVES : []),
  ...(Array.isArray(PET.NEGATIVE_MOVES) ? PET.NEGATIVE_MOVES : [])
];
const SKILL_BY_ID = new Map(ALL_SKILL_POOL.map((move) => [String(move?.id || '').trim(), move]).filter(([id]) => id));
const SKILL_BY_NAME = new Map(ALL_SKILL_POOL.map((move) => [String(move?.name || '').trim(), move]).filter(([name]) => name));

function clampInt(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.floor(num);
  return Math.max(min, Math.min(max, rounded));
}

function isDigitalKingName(name = '') {
  return DIGITAL_KINGS.includes(String(name || '').trim());
}

function isVillainEnemyName(name = '') {
  const text = String(name || '').trim();
  if (!text) return false;
  if (isDigitalKingName(text)) return true;
  return /(覆面獵手|蒙面殺手|低價刺客|伏擊者|可疑人物|暗潮|Digital|刺客|獵手|掠奪者|頭目|君主)/iu.test(text);
}

function cloneMoveForEnemy(move = {}, powerScale = 1) {
  const base = Number(move?.baseDamage ?? move?.damage ?? 10);
  const scaled = Math.max(1, Math.round(base * Math.max(0.8, Number(powerScale) || 1)));
  return {
    id: String(move?.id || ''),
    name: String(move?.name || '攻擊'),
    damage: scaled,
    baseDamage: scaled,
    tier: clampInt(move?.tier || 1, 1, 3, 1),
    effect: { ...(move?.effect || {}) }
  };
}

function normalizePresetMove(move, fallbackAttack = 10) {
  if (typeof move === 'string') {
    const byName = SKILL_BY_NAME.get(String(move || '').trim());
    if (byName) return cloneMoveForEnemy(byName, 1);
    return {
      id: '',
      name: String(move || '攻擊'),
      damage: Math.max(1, Number(fallbackAttack) || 10),
      baseDamage: Math.max(1, Number(fallbackAttack) || 10),
      tier: 1,
      effect: {}
    };
  }

  if (!move || typeof move !== 'object') {
    return {
      id: '',
      name: '攻擊',
      damage: Math.max(1, Number(fallbackAttack) || 10),
      baseDamage: Math.max(1, Number(fallbackAttack) || 10),
      tier: 1,
      effect: {}
    };
  }

  const id = String(move.id || '').trim();
  const name = String(move.name || '').trim();
  const template = (id && SKILL_BY_ID.get(id)) || (name && SKILL_BY_NAME.get(name)) || null;
  if (!template) {
    return {
      id,
      name: name || '攻擊',
      damage: Math.max(1, Number(move.damage ?? move.baseDamage ?? fallbackAttack) || 10),
      baseDamage: Math.max(1, Number(move.baseDamage ?? move.damage ?? fallbackAttack) || 10),
      tier: clampInt(move.tier || 1, 1, 3, 1),
      effect: { ...(move.effect || {}) }
    };
  }

  return cloneMoveForEnemy({
    ...template,
    ...move,
    effect: { ...(template.effect || {}), ...(move.effect || {}) }
  }, 1);
}

function pickUniqueSkillTemplates(pool = [], count = 0) {
  const copy = Array.isArray(pool) ? [...pool] : [];
  const out = [];
  const used = new Set();
  while (copy.length > 0 && out.length < count) {
    const idx = Math.floor(Math.random() * copy.length);
    const candidate = copy.splice(idx, 1)[0];
    const id = String(candidate?.id || '').trim();
    if (!id || used.has(id)) continue;
    used.add(id);
    out.push(candidate);
  }
  return out;
}

function buildKingMoveLoadout(kingName = '') {
  const ids = KING_MOVE_IDS[String(kingName || '').trim()] || [];
  const picked = ids
    .map((id) => SKILL_BY_ID.get(id))
    .filter(Boolean);
  if (picked.length >= 4) return picked.slice(0, ENEMY_MOVE_MAX);

  const tier3Negative = ALL_SKILL_POOL.filter((move) => move?.type === 'negative' && Number(move?.tier || 1) >= 3);
  const extra = pickUniqueSkillTemplates(tier3Negative, Math.max(0, 5 - picked.length));
  return [...picked, ...extra].slice(0, ENEMY_MOVE_MAX);
}

function getEnemyMovePlan(enemyName = '', level = 1, options = {}) {
  const safeLevel = Math.max(1, Number(level) || 1);
  const king = isDigitalKingName(enemyName);
  const villain = options.villain === true || isVillainEnemyName(enemyName);

  if (king) {
    return { king: true, villain: true, minTier: 3, targetCount: 5, powerScale: 1.28 };
  }
  if (villain) {
    let minTier = 2;
    let targetCount = 4;
    let powerScale = 1.1;
    if (safeLevel <= 6) {
      minTier = 1;
      targetCount = 3;
      powerScale = 1.03;
    } else if (safeLevel >= 22) {
      minTier = 3;
      targetCount = 5;
      powerScale = 1.18;
    } else if (safeLevel >= 14) {
      minTier = 2;
      targetCount = 5;
      powerScale = 1.14;
    }
    return { king: false, villain: true, minTier, targetCount, powerScale };
  }
  if (safeLevel >= 16) {
    return { king: false, villain: false, minTier: 2, targetCount: 4, powerScale: 1.06 };
  }
  if (safeLevel >= 8) {
    return { king: false, villain: false, minTier: 1, targetCount: 3, powerScale: 1.02 };
  }
  return { king: false, villain: false, minTier: 1, targetCount: 2, powerScale: 1.0 };
}

function buildEnemyMoveLoadout(enemyName = '', level = 1, rawMoves = [], options = {}) {
  const plan = getEnemyMovePlan(enemyName, level, options);
  const fallbackAttack = Math.max(8, Number(options.attack) || 12);

  if (plan.king) {
    const kingMoves = buildKingMoveLoadout(enemyName)
      .map((move) => cloneMoveForEnemy(move, plan.powerScale));
    return kingMoves.slice(0, ENEMY_MOVE_MAX);
  }

  const normalized = (Array.isArray(rawMoves) ? rawMoves : [])
    .map((move) => normalizePresetMove(move, fallbackAttack))
    .filter(Boolean);

  const selected = [];
  const used = new Set();
  for (const move of normalized) {
    const id = String(move?.id || move?.name || '').trim();
    if (!id || used.has(id)) continue;
    const tier = clampInt(move?.tier || 1, 1, 3, 1);
    if (plan.villain && tier < plan.minTier) continue;
    used.add(id);
    selected.push(move);
    if (selected.length >= plan.targetCount) break;
  }

  const pool = ALL_SKILL_POOL.filter((move) => {
    const tier = clampInt(move?.tier || 1, 1, 3, 1);
    if (tier < plan.minTier) return false;
    if (plan.villain && move?.type !== 'negative') return false;
    return true;
  });

  const need = Math.max(0, plan.targetCount - selected.length);
  if (need > 0) {
    const extras = pickUniqueSkillTemplates(pool, need + 2);
    for (const tpl of extras) {
      const id = String(tpl?.id || '').trim();
      if (!id || used.has(id)) continue;
      used.add(id);
      selected.push(cloneMoveForEnemy(tpl, 1));
      if (selected.length >= plan.targetCount) break;
    }
  }

  if (selected.length === 0) {
    selected.push({
      id: '',
      name: '重擊',
      damage: fallbackAttack,
      baseDamage: fallbackAttack,
      tier: plan.minTier,
      effect: {}
    });
  }

  return selected
    .slice(0, ENEMY_MOVE_MAX)
    .map((move) => cloneMoveForEnemy(move, plan.powerScale));
}

function createDigitalKingEnemy(king = '') {
  const name = isDigitalKingName(king) ? String(king) : DIGITAL_KINGS[Math.floor(Math.random() * DIGITAL_KINGS.length)];
  const stats = KING_STATS[name] || KING_STATS.Nemo;
  return {
    id: name,
    name,
    hp: Number(stats.hp || 320),
    maxHp: Number(stats.hp || 320),
    attack: Number(stats.attack || 68),
    defense: Number(stats.defense || 30),
    speed: Number(stats.speed || 24),
    moves: buildEnemyMoveLoadout(name, 30, [], { villain: true, attack: Number(stats.attack || 68) }),
    reward: { ...(stats.reward || { gold: [260, 420] }) },
    isMonster: true,
    ignoreBeginnerBalance: true
  };
}

function createEnemy(type, level = 1) {
  const enemies = {
    '哥布林': {
      name: '哥布林',
      hp: 50 + level * 10,
      maxHp: 50 + level * 10,
      attack: 15 + level * 3,
      defense: 5 + level * 2,
      speed: 12,
      moves: ['抓撓'],
      reward: { gold: [20 + level * 5, 40 + level * 10] }
    },
    '狼人': {
      name: '狼人',
      hp: 80 + level * 15,
      maxHp: 80 + level * 15,
      attack: 25 + level * 5,
      defense: 10 + level * 3,
      speed: 18,
      moves: ['撕咬', '嚎叫'],
      reward: { gold: [40 + level * 10, 80 + level * 20] }
    },
    '巫師學徒': {
      name: '巫師學徒',
      hp: 120 + level * 20,
      maxHp: 120 + level * 20,
      attack: 35 + level * 7,
      defense: 15 + level * 4,
      speed: 14,
      moves: ['火球', '冰霜'],
      reward: { gold: [60 + level * 15, 100 + level * 30] }
    },
    '殭屍': {
      name: '殭屍',
      hp: 150 + level * 25,
      maxHp: 150 + level * 25,
      attack: 40 + level * 8,
      defense: 20 + level * 5,
      speed: 8,
      moves: ['抓傷', '瘟疫'],
      reward: { gold: [80 + level * 20, 120 + level * 40] }
    },
    '飛龍': {
      name: '飛龍',
      hp: 200 + level * 30,
      maxHp: 200 + level * 30,
      attack: 55 + level * 10,
      defense: 25 + level * 6,
      speed: 22,
      moves: ['龍息', '利爪', '飛行'],
      reward: { gold: [200 + level * 50, 400 + level * 100] }
    }
  };

  const base = enemies[type] || enemies['哥布林'];
  const enemy = {
    ...base,
    reward: { ...(base.reward || {}) }
  };
  enemy.moves = buildEnemyMoveLoadout(
    enemy.name || type || '哥布林',
    level,
    base.moves || [],
    {
      attack: enemy.attack,
      isMonster: true
    }
  );
  return enemy;
}

// ============== 史詩魔王（有自己的招式）==============
const EPIC_BOSSES = {
  '日冕巨蜥': {
    name: '🦎 日冕巨蜥',
    hp: 300,
    maxHp: 300,
    attack: 55,
    defense: 30,
    speed: 25,
    moves: [
      { name: '尾脊震盪', damage: 45, effect: { stun: 1 } },
      { name: '灼熱噴流', damage: 50, effect: { burn: 2 } },
      { name: '晶殼護場', damage: 0, effect: { shield: 2 } },
      { name: '高空俯衝', damage: 60, effect: {} }
    ],
    reward: { gold: [500, 700], moveLearnable: true }
  },
  '虛空裂體': {
    name: '👾 虛空裂體',
    hp: 350,
    maxHp: 350,
    attack: 60,
    defense: 25,
    speed: 20,
    moves: [
      { name: '裂界鉤爪', damage: 40, effect: { bind: 2 } },
      { name: '噪頻咆嘯', damage: 55, effect: { confuse: 1 } },
      { name: '能流汲取', damage: 35, effect: { drain: 25 } },
      { name: '暗域壓場', damage: 0, effect: { debuff: 'all' } },
      { name: '裂界崩落', damage: 65, effect: {} }
    ],
    reward: { gold: [700, 900], moveLearnable: true }
  },
  '熾羽風凰': {
    name: '🦅 熾羽風凰',
    hp: 280,
    maxHp: 280,
    attack: 65,
    defense: 20,
    speed: 30,
    moves: [
      { name: '熾羽旋舞', damage: 50, effect: { burn: 3 } },
      { name: '羽刃風牆', damage: 45, effect: { bleed: 2 } },
      { name: '重啟自癒', damage: 0, effect: { heal: 80 } },
      { name: '超壓墜擊', damage: 70, effect: { armorBreak: true } }
    ],
    reward: { gold: [600, 800], moveLearnable: true }
  },
  '白噪君主': {
    name: '💀 白噪君主',
    hp: 400,
    maxHp: 400,
    attack: 70,
    defense: 35,
    speed: 15,
    moves: [
      { name: '骨針噴發', damage: 45, effect: { poison: 3 } },
      { name: '白噪屏障', damage: 0, effect: { shield: 3 } },
      { name: '弱化廣播', damage: 40, effect: { defDown: 2 } },
      { name: '幻像群列', damage: 50, effect: { summon: 2 } },
      { name: '終止脈衝', damage: 80, effect: {} },
      { name: '幽焰侵蝕', damage: 55, effect: { burn: 2, poison: 1 } }
    ],
    reward: { gold: [1000, 1600], moveLearnable: true }
  }
};

// ============== 技能能量消耗（依稀有度/階級）==============
function getMoveEnergyCost(move) {
  if (!move || typeof move !== 'object') return 1;
  if (move?.effect?.flee) return 0;
  const tier = Number(move.tier || 1);
  if (tier >= 3) return 3;
  if (tier === 2) return 2;
  return 1;
}

const DOT_STATUS_KEYS = ['burn', 'poison', 'trap', 'bleed'];
const DECAY_STATUS_KEYS = ['bind', 'slow', 'defenseDown', 'shield', 'reflect', 'dodge', 'thorns', 'fear', 'confuse', 'blind', 'hardCcGuard'];
const NEGATIVE_STATUS_KEYS = ['burn', 'poison', 'trap', 'bleed', 'dot', 'stun', 'freeze', 'bind', 'slow', 'fear', 'confuse', 'blind', 'missNext', 'defenseDown'];
const HARD_CC_KEYS = ['stun', 'freeze'];
const SOFT_CC_KEYS = ['bind', 'slow', 'fear', 'confuse', 'blind', 'missNext'];

function getMoveTier(move = {}) {
  const tier = Math.floor(Number(move?.tier || 1));
  if (!Number.isFinite(tier)) return 1;
  return Math.max(1, Math.min(3, tier));
}

function ensureStatusState(entity) {
  if (!entity || typeof entity !== 'object') return {};
  if (!entity.status || typeof entity.status !== 'object') entity.status = {};
  const defaults = {
    burn: 0,
    burnPower: 0,
    poison: 0,
    poisonPower: 0,
    trap: 0,
    trapPower: 0,
    bleed: 0,
    bleedPower: 0,
    dot: 0,
    dotPower: 0,
    stun: 0,
    freeze: 0,
    bind: 0,
    slow: 0,
    fear: 0,
    confuse: 0,
    blind: 0,
    missNext: 0,
    defenseDown: 0,
    hardCcGuard: 0,
    shield: 0,
    dodge: 0,
    reflect: 0,
    thorns: 0
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!Number.isFinite(Number(entity.status[key]))) entity.status[key] = value;
  }
  return entity.status;
}

function normalizeMove(move = {}, fallbackAttack = 10) {
  if (typeof move === 'string') {
    return { name: move, damage: fallbackAttack, baseDamage: fallbackAttack, tier: 1, effect: {} };
  }
  return {
    ...move,
    name: String(move?.name || '普通攻擊'),
    damage: Number(move?.damage ?? move?.baseDamage ?? fallbackAttack),
    baseDamage: Number(move?.baseDamage ?? move?.damage ?? fallbackAttack),
    tier: clampInt(move?.tier || 1, 1, 3, 1),
    effect: move?.effect || {}
  };
}

function getEffectiveDefense(entity) {
  const status = ensureStatusState(entity);
  let defense = Math.max(0, Number(entity?.defense || 0));
  if (status.defenseDown > 0) defense = Math.floor(defense * 0.7);
  return defense;
}

function applyDotEffectsAtTurnStart(entity, label) {
  const status = ensureStatusState(entity);
  const lines = [];
  let totalDamage = 0;

  const dotEntries = [
    { key: 'burn', powerKey: 'burnPower', icon: '🔥', text: '灼燒' },
    { key: 'poison', powerKey: 'poisonPower', icon: '☠️', text: '中毒' },
    { key: 'trap', powerKey: 'trapPower', icon: '🪤', text: '陷阱' },
    { key: 'bleed', powerKey: 'bleedPower', icon: '🩸', text: '流血' }
  ];

  for (const entry of dotEntries) {
    if (status[entry.key] > 0) {
      const perTurn = Math.max(1, Number(status[entry.powerKey] || 1));
      entity.hp -= perTurn;
      totalDamage += perTurn;
      status[entry.key] -= 1;
      if (status[entry.key] <= 0) status[entry.powerKey] = 0;
      lines.push(`${entry.icon} ${label}受到${entry.text}影響，損失 ${perTurn} HP（剩 ${Math.max(0, status[entry.key])} 回合）`);
    }
  }

  if (status.dot > 0) {
    const perTurn = Math.max(1, Number(status.dotPower || 1));
    entity.hp -= perTurn;
    totalDamage += perTurn;
    status.dot -= 1;
    if (status.dot <= 0) status.dotPower = 0;
    lines.push(`⚡ ${label}受到持續干擾，損失 ${perTurn} HP（剩 ${Math.max(0, status.dot)} 回合）`);
  }

  if (totalDamage > 0) entity.hp = Math.max(0, entity.hp);
  return { lines, totalDamage };
}

function clearNegativeStatuses(entity) {
  const status = ensureStatusState(entity);
  for (const key of NEGATIVE_STATUS_KEYS) {
    status[key] = 0;
  }
  status.burnPower = 0;
  status.poisonPower = 0;
  status.trapPower = 0;
  status.bleedPower = 0;
  status.dotPower = 0;
}

function tryConsumeActionBlocker(entity, label) {
  const status = ensureStatusState(entity);
  if (status.missNext > 0) {
    status.missNext -= 1;
    return `🌀 ${label}行動失誤，這回合攻擊落空！`;
  }
  if (status.stun > 0) {
    status.stun -= 1;
    return `⚡ ${label}陷入暈眩，無法行動！`;
  }
  if (status.freeze > 0) {
    status.freeze -= 1;
    return `🧊 ${label}被凍結，無法行動！`;
  }
  return '';
}

function shouldMissByMentalDebuff(attacker, defender) {
  const status = ensureStatusState(attacker);
  const defenderStatus = ensureStatusState(defender);
  const result = { miss: false, reason: '', selfDamage: 0 };

  if (status.fear > 0 && Math.random() < 0.28) {
    result.miss = true;
    result.reason = '😨 因恐懼而遲疑，這回合未能出手。';
  }

  if (!result.miss && status.confuse > 0 && Math.random() < 0.3) {
    result.miss = true;
    result.selfDamage = 6;
    result.reason = '💫 因混亂誤判目標，攻擊失準並反傷自己。';
  }

  if (!result.miss && status.blind > 0 && Math.random() < 0.35) {
    result.miss = true;
    result.reason = '🌫️ 視野受阻，攻擊落空。';
  }

  if (!result.miss && defenderStatus.dodge > 0 && Math.random() < 0.45) {
    result.miss = true;
    result.reason = `🌀 ${defender.name}成功閃避這一擊！`;
  }

  return result;
}

function getMoveEffectSuccessRate(move = {}, effectKey = '', defender = null) {
  const key = String(effectKey || '');
  const tier = getMoveTier(move);
  const rateMap = {
    stun: [0.08, 0.18, 0.32],
    freeze: [0.08, 0.18, 0.32],
    bind: [0.16, 0.30, 0.44],
    slow: [0.20, 0.36, 0.50],
    fear: [0.16, 0.30, 0.44],
    confuse: [0.16, 0.30, 0.44],
    blind: [0.16, 0.30, 0.44],
    missNext: [0.18, 0.32, 0.46]
  };
  if (!rateMap[key]) return 1;
  let chance = rateMap[key][tier - 1] || rateMap[key][0];
  const defenderStatus = defender ? ensureStatusState(defender) : null;
  if (defenderStatus) {
    if (HARD_CC_KEYS.includes(key) && Number(defenderStatus.hardCcGuard || 0) > 0) {
      return 0;
    }
    if (Number(defenderStatus[key] || 0) > 0) {
      chance *= 0.45;
    }
  }
  return Math.max(0, Math.min(0.95, chance));
}

function applyControlStatusWithChance(defender, move, effectKey, duration, lines, defenderLabel) {
  const turns = Math.max(1, Number(duration || 1));
  const status = ensureStatusState(defender);
  const chance = getMoveEffectSuccessRate(move, effectKey, defender);
  const pct = Math.round(chance * 100);
  const read = {
    stun: { ok: '💫', fail: '🛡️', text: '暈眩' },
    freeze: { ok: '🧊', fail: '🛡️', text: '凍結' },
    bind: { ok: '⛓️', fail: '💨', text: '束縛' },
    slow: { ok: '🐢', fail: '💨', text: '緩速' },
    fear: { ok: '😨', fail: '💨', text: '恐懼' },
    confuse: { ok: '🌀', fail: '💨', text: '混亂' },
    blind: { ok: '🌫️', fail: '💨', text: '致盲' },
    missNext: { ok: '🎯', fail: '💨', text: '失準' }
  }[effectKey] || { ok: '✨', fail: '💨', text: effectKey };

  if (chance <= 0) {
    if (HARD_CC_KEYS.includes(effectKey)) {
      lines.push(`🛡️ ${defenderLabel}進入硬控抗性期，本次${read.text}未生效。`);
    } else {
      lines.push(`💨 ${defenderLabel}本回合免疫${read.text}干擾。`);
    }
    return false;
  }

  if (Math.random() > chance) {
    lines.push(`${read.fail} ${defenderLabel}扛住了${read.text}（命中率約 ${pct}%）。`);
    return false;
  }

  status[effectKey] = Math.max(status[effectKey], turns);
  if (HARD_CC_KEYS.includes(effectKey)) {
    status.hardCcGuard = Math.max(status.hardCcGuard, 2);
  }
  if (effectKey === 'missNext') {
    lines.push(`${read.ok} ${defenderLabel}下一次攻擊將落空（命中率約 ${pct}%）。`);
  } else {
    lines.push(`${read.ok} ${defenderLabel}受到${read.text}（${status[effectKey]} 回合，命中率約 ${pct}%）。`);
  }
  return true;
}

function applyMoveEffects(attacker, defender, move, rawInstantDamage, appliedDamage, lines, attackerLabel, defenderLabel) {
  const effect = move.effect || {};
  const attackerStatus = ensureStatusState(attacker);
  const defenderStatus = ensureStatusState(defender);

  if (effect.heal) {
    const healAmount = Math.max(1, Number(effect.heal || 0));
    attacker.hp = Math.min(attacker.maxHp || attacker.hp, attacker.hp + healAmount);
    lines.push(`💚 ${attackerLabel}恢復 ${healAmount} HP。`);
  }

  if (effect.cleanse) {
    clearNegativeStatuses(attacker);
    lines.push(`🫧 ${attackerLabel}清除了自身負面狀態。`);
  }

  if (effect.drain && appliedDamage > 0) {
    const healFromDrain = Math.min(Number(effect.drain || 0), Math.max(1, Math.floor(appliedDamage * 0.5)));
    attacker.hp = Math.min(attacker.maxHp || attacker.hp, attacker.hp + healFromDrain);
    lines.push(`🩸 ${attackerLabel}抽取能量，回復 ${healFromDrain} HP。`);
  }

  if (effect.selfDamage) {
    const selfDmg = Math.max(1, Number(effect.selfDamage || 0));
    attacker.hp = Math.max(0, attacker.hp - selfDmg);
    lines.push(`💥 ${attackerLabel}承受反噬，自損 ${selfDmg} HP。`);
  }

  if (effect.shield) {
    attackerStatus.shield = Math.max(attackerStatus.shield, Number(effect.shield || 1));
    lines.push(`🛡️ ${attackerLabel}展開護盾（${attackerStatus.shield} 回合）。`);
  }
  if (effect.reflect) {
    attackerStatus.reflect = Math.max(attackerStatus.reflect, Number(effect.reflect || 1));
    lines.push(`♻️ ${attackerLabel}進入反傷姿態（${attackerStatus.reflect} 回合）。`);
  }
  if (effect.dodge) {
    attackerStatus.dodge = Math.max(attackerStatus.dodge, Number(effect.dodge || 1));
    lines.push(`👣 ${attackerLabel}提升閃避（${attackerStatus.dodge} 回合）。`);
  }
  if (effect.thorns) {
    attackerStatus.thorns = Math.max(attackerStatus.thorns, Number(effect.thorns || 1));
    lines.push(`🌵 ${attackerLabel}啟動反刺外殼（${attackerStatus.thorns} 回合）。`);
  }

  const dotBase = Math.max(1, Number(rawInstantDamage || 1));
  if (effect.burn) {
    defenderStatus.burn = Math.max(defenderStatus.burn, Number(effect.burn || 1));
    defenderStatus.burnPower = Math.max(defenderStatus.burnPower, Math.max(1, Math.floor(dotBase * 0.22)));
    lines.push(`🔥 ${defenderLabel}陷入灼燒（${defenderStatus.burn} 回合）。`);
  }
  if (effect.poison) {
    defenderStatus.poison = Math.max(defenderStatus.poison, Number(effect.poison || 1));
    defenderStatus.poisonPower = Math.max(defenderStatus.poisonPower, Math.max(1, Math.floor(dotBase * 0.16)));
    lines.push(`☠️ ${defenderLabel}中毒（${defenderStatus.poison} 回合）。`);
  }
  if (effect.trap) {
    defenderStatus.trap = Math.max(defenderStatus.trap, Number(effect.trap || 1));
    defenderStatus.trapPower = Math.max(defenderStatus.trapPower, Math.max(1, Math.floor(dotBase * 0.18)));
    lines.push(`🪤 ${defenderLabel}踩入陷阱（${defenderStatus.trap} 回合）。`);
  }
  if (effect.bleed) {
    defenderStatus.bleed = Math.max(defenderStatus.bleed, Number(effect.bleed || 1));
    defenderStatus.bleedPower = Math.max(defenderStatus.bleedPower, Math.max(1, Math.floor(dotBase * 0.24)));
    lines.push(`🩸 ${defenderLabel}持續流血（${defenderStatus.bleed} 回合）。`);
  }
  if (effect.dot) {
    defenderStatus.dot = Math.max(defenderStatus.dot, 2);
    defenderStatus.dotPower = Math.max(defenderStatus.dotPower, Number(effect.dot || 1));
    lines.push(`⚡ ${defenderLabel}被掛上持續干擾（每回合 ${defenderStatus.dotPower}）。`);
  }

  if (effect.stun) applyControlStatusWithChance(defender, move, 'stun', effect.stun, lines, defenderLabel);
  if (effect.freeze) applyControlStatusWithChance(defender, move, 'freeze', effect.freeze, lines, defenderLabel);
  if (effect.bind) applyControlStatusWithChance(defender, move, 'bind', effect.bind, lines, defenderLabel);
  if (effect.slow) applyControlStatusWithChance(defender, move, 'slow', effect.slow, lines, defenderLabel);
  if (effect.fear) applyControlStatusWithChance(defender, move, 'fear', effect.fear, lines, defenderLabel);
  if (effect.confuse) applyControlStatusWithChance(defender, move, 'confuse', effect.confuse, lines, defenderLabel);
  if (effect.blind) applyControlStatusWithChance(defender, move, 'blind', effect.blind, lines, defenderLabel);
  if (effect.missNext) applyControlStatusWithChance(defender, move, 'missNext', effect.missNext, lines, defenderLabel);
  if (effect.defenseDown) {
    defenderStatus.defenseDown = Math.max(defenderStatus.defenseDown, Number(effect.defenseDown || 1));
    lines.push(`📉 ${defenderLabel}防禦下降（${defenderStatus.defenseDown} 回合）。`);
  }
  if (effect.defDown) {
    defenderStatus.defenseDown = Math.max(defenderStatus.defenseDown, Number(effect.defDown || 1));
    lines.push(`📉 ${defenderLabel}防禦下降（${defenderStatus.defenseDown} 回合）。`);
  }
  if (effect.spreadPoison) {
    defenderStatus.poison = Math.max(defenderStatus.poison, 2);
    defenderStatus.poisonPower = Math.max(defenderStatus.poisonPower, Math.max(1, Math.floor(dotBase * 0.12)));
    lines.push(`🧪 ${defenderLabel}感染擴散性毒霧。`);
  }
  if (effect.debuff === 'all') {
    applyControlStatusWithChance(defender, { ...move, tier: Math.max(getMoveTier(move), 2) }, 'slow', 1, lines, defenderLabel);
    defenderStatus.defenseDown = Math.max(defenderStatus.defenseDown, 1);
    applyControlStatusWithChance(defender, { ...move, tier: Math.max(getMoveTier(move), 2) }, 'blind', 1, lines, defenderLabel);
    lines.push(`📡 ${defenderLabel}全屬性受干擾（1 回合）。`);
  }
  if (effect.summon) {
    const turnCount = Math.max(1, Number(effect.summon || 1));
    applyControlStatusWithChance(defender, { ...move, tier: Math.max(getMoveTier(move), 2) }, 'blind', turnCount, lines, defenderLabel);
    applyControlStatusWithChance(defender, { ...move, tier: Math.max(getMoveTier(move), 2) }, 'missNext', 1, lines, defenderLabel);
    lines.push(`👥 ${attackerLabel}召出幻像干擾，${defenderLabel}命中率下降。`);
  }
}

function applyAttack(attacker, defender, move, moveDmg, lines, attackerLabel, defenderLabel) {
  const effect = move.effect || {};
  const attackerStatus = ensureStatusState(attacker);
  const defenderStatus = ensureStatusState(defender);

  if (effect.wait) {
    lines.push(`⚡ ${attackerLabel}選擇蓄能待機，暫不出手。`);
    return { dealtDamage: 0 };
  }

  const blockedReason = tryConsumeActionBlocker(attacker, attackerLabel);
  if (blockedReason) {
    lines.push(blockedReason);
    return { dealtDamage: 0 };
  }

  const missCheck = shouldMissByMentalDebuff(attacker, defender);
  if (missCheck.miss) {
    lines.push(`💨 ${attackerLabel}施展「${move.name}」，但${missCheck.reason}`);
    if (missCheck.selfDamage > 0) {
      attacker.hp = Math.max(0, attacker.hp - missCheck.selfDamage);
      lines.push(`⚠️ ${attackerLabel}因失誤損失 ${missCheck.selfDamage} HP。`);
    }
    return { dealtDamage: 0 };
  }

  let instant = Number(moveDmg.instant || 0);
  if (effect.splash) instant = Math.floor(instant * 1.2);
  if (attackerStatus.slow > 0) instant = Math.floor(instant * 0.8);

  const ignoreDefense = Boolean(effect.ignoreResistance);
  let defense = ignoreDefense ? 0 : getEffectiveDefense(defender);
  if (effect.armorBreak) defense = Math.floor(defense * 0.35);

  let rawDamage = Math.max(0, instant - defense);
  if (instant > 0 && rawDamage <= 0) rawDamage = 1;

  const shieldReduce = defenderStatus.shield > 0 ? (8 + defenderStatus.shield * 4) : 0;
  let finalDamage = Math.max(0, rawDamage - shieldReduce);
  if (rawDamage > 0 && finalDamage <= 0) {
    lines.push(`🛡️ ${defenderLabel}的護盾完全吸收了攻擊！`);
  }

  defender.hp = Math.max(0, defender.hp - finalDamage);
  lines.push(`⚔️ ${attackerLabel}施展「${move.name}」，造成 ${finalDamage} 點傷害！`);

  let reflected = 0;
  if (finalDamage > 0) {
    if (defenderStatus.reflect > 0) reflected += Math.max(1, Math.floor(finalDamage * 0.35));
    if (defenderStatus.thorns > 0) reflected += Math.max(1, Math.floor(finalDamage * 0.2));
    if (reflected > 0) {
      attacker.hp = Math.max(0, attacker.hp - reflected);
      lines.push(`🔁 ${defenderLabel}反制成功，反彈 ${reflected} 點傷害給 ${attackerLabel}！`);
    }
  }

  applyMoveEffects(attacker, defender, move, instant, finalDamage, lines, attackerLabel, defenderLabel);
  return { dealtDamage: finalDamage, reflected };
}

function decayStatusEndRound(entity) {
  const status = ensureStatusState(entity);
  for (const key of DECAY_STATUS_KEYS) {
    if (status[key] > 0) status[key] -= 1;
  }
}

// ============== 計算玩家招式傷害 ==============
function calculatePlayerMoveDamage(move, player, fighter) {
  if (!move || typeof move !== 'object') {
    return { instant: 0, overTime: 0, totalTurns: 0, total: 0 };
  }

  const effect = move.effect || {};
  if (effect.flee || effect.wait) {
    return { instant: 0, overTime: 0, totalTurns: 0, total: 0 };
  }

  const level = Number(fighter?.level || 1);
  const attack = Number(fighter?.attack || 20);

  let base = Number(move.baseDamage || move.damage || 0);
  base += level * 2;
  base += Math.floor(attack * 0.5);

  const instant = Math.max(0, base);
  let overTime = 0;
  let totalTurns = 0;

  if (effect.burn) {
    overTime += Math.max(1, Math.floor(base * 0.22)) * Number(effect.burn || 1);
    totalTurns += Number(effect.burn || 1);
  }
  if (effect.poison) {
    overTime += Math.max(1, Math.floor(base * 0.16)) * Number(effect.poison || 1);
    totalTurns += Number(effect.poison || 1);
  }
  if (effect.trap) {
    overTime += Math.max(1, Math.floor(base * 0.18)) * Number(effect.trap || 1);
    totalTurns += Number(effect.trap || 1);
  }
  if (effect.bleed) {
    overTime += Math.max(1, Math.floor(base * 0.24)) * Number(effect.bleed || 1);
    totalTurns += Number(effect.bleed || 1);
  }
  if (effect.dot) {
    overTime += Number(effect.dot || 0) * 2;
    totalTurns += 2;
  }
  if (effect.splash) overTime += Math.floor(base * 0.2);

  return {
    instant,
    overTime,
    totalTurns,
    total: instant + overTime
  };
}

// ============== 執行戰鬥回合 ==============
function executeBattleRound(player, fighter, enemy, chosenMove, enemyMove = null, options = {}) {
  const dryRun = Boolean(options?.dryRun);
  const nonLethal = Boolean(options?.nonLethal || enemy?.nonLethal);
  if (!chosenMove || typeof chosenMove !== 'object') {
    return {
      victory: null,
      enemyHp: enemy?.hp || 0,
      playerHp: fighter?.hp || 0,
      petName: fighter?.name || '寵物',
      enemyName: enemy?.name || '敵人',
      message: '⚠️ 當前沒有可用攻擊招式，請改用逃跑或返回主選單。'
    };
  }

  ensureStatusState(fighter);
  ensureStatusState(enemy);

  const lines = [];
  const fighterLabel = fighter?.isHuman ? `🧍 ${fighter.name}` : `🐾 ${fighter.name}`;
  const enemyLabel = `👹 ${enemy.name}`;

  const fighterDot = applyDotEffectsAtTurnStart(fighter, fighterLabel);
  const enemyDot = applyDotEffectsAtTurnStart(enemy, enemyLabel);
  lines.push(...fighterDot.lines, ...enemyDot.lines);

  if (enemy.hp <= 0 || fighter.hp <= 0) {
    lines.push('☠️ 回合開始時已有一方倒下。');
  } else {
    const normalizedPlayerMove = normalizeMove(chosenMove, fighter.attack || 10);
    const playerMoveDmg = calculatePlayerMoveDamage(normalizedPlayerMove, player, fighter);
    applyAttack(fighter, enemy, normalizedPlayerMove, playerMoveDmg, lines, fighterLabel, enemyLabel);

    if (enemy.hp > 0 && enemyMove) {
      const normalizedEnemyMove = normalizeMove(enemyMove, enemy.attack || 10);
      const enemyMoveDmg = calculatePlayerMoveDamage(
        {
          baseDamage: normalizedEnemyMove.baseDamage ?? normalizedEnemyMove.damage,
          effect: normalizedEnemyMove.effect || {},
          tier: normalizedEnemyMove.tier || 1
        },
        player,
        enemy
      );
      applyAttack(enemy, fighter, normalizedEnemyMove, enemyMoveDmg, lines, enemyLabel, fighterLabel);
    }
  }

  decayStatusEndRound(fighter);
  decayStatusEndRound(enemy);

  if (enemy.hp <= 0) {
    const reward = enemy.reward?.gold || [20, 40];
    const minGold = Number(reward[0] || 20);
    const maxGold = Number(reward[1] || minGold);
    const span = Math.max(0, maxGold - minGold);
    const goldReward = dryRun ? 0 : (minGold + Math.floor(Math.random() * (span + 1)));
    const enemyId = enemy.id || enemy.name;
    const isMonster = enemy.isMonster || false;
    let wantedLevel = 0;
    if (!dryRun && !nonLethal) {
      CORE.killNPC(enemyId, player.id, isMonster);
      wantedLevel = CORE.getPlayerWantedLevel(player.id);
    }
    const outcomeText = nonLethal
      ? `🤝 你在切磋中壓制了${enemy.name}。`
      : `🏆 你擊敗了${enemy.name}！獲得 ${goldReward} Rns！${wantedLevel > 0 ? `\n⚠️ 你現在是 ${wantedLevel} 級通緝犯！` : ''}`;

    return {
      victory: true,
      enemy: enemy.name,
      enemyId,
      gold: goldReward,
      wantedLevel,
      message: `${lines.join('\n')}\n${outcomeText}`
    };
  }

  if (fighter.hp <= 0) {
    return {
      victory: false,
      death: true,
      defeatedFighterType: fighter?.isHuman ? 'player' : 'pet',
      message: `${lines.join('\n')}\n💀 你被${enemy.name}擊敗了...`
    };
  }

  return {
    victory: null,
    enemyHp: enemy.hp,
    playerHp: fighter.hp,
    petName: fighter.name,
    enemyName: enemy.name,
    message: lines.join('\n')
  };
}

// =============_ 敵人選擇招式 ==============
function enemyChooseMove(enemy) {
  if (!enemy.moves || enemy.moves.length === 0) {
    return { name: '攻擊', damage: enemy.attack || 10, effect: {} };
  }

  const weighted = enemy.moves.map((rawMove) => {
    const move = normalizeMove(rawMove, enemy.attack || 10);
    const tier = clampInt(move?.tier || 1, 1, 3, 1);
    const effect = move?.effect || {};
    const hasControl = Boolean(effect.stun || effect.freeze || effect.bind || effect.slow || effect.fear || effect.confuse || effect.blind || effect.missNext);
    const hasDot = Boolean(effect.burn || effect.poison || effect.trap || effect.bleed || effect.dot || effect.spreadPoison);
    const highDamage = Number(move?.damage || 0) >= Number(enemy?.attack || 10) * 1.1;
    let weight = 1 + (tier - 1) * 0.7;
    if (hasControl) weight += 0.45;
    if (hasDot) weight += 0.3;
    if (highDamage) weight += 0.25;
    if (Number(enemy?.hp || 0) <= Number(enemy?.maxHp || enemy?.hp || 1) * 0.4 && effect.heal) {
      weight += 1.2;
    }
    return { move, weight: Math.max(0.2, weight) };
  });

  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * Math.max(0.0001, total);
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.move;
  }
  return weighted[weighted.length - 1].move;
}

module.exports = {
  FLEE_CONFIG,
  attemptFlee,
  createEnemy,
  createDigitalKingEnemy,
  buildEnemyMoveLoadout,
  EPIC_BOSSES,
  getMoveEnergyCost,
  getMoveEffectSuccessRate,
  calculatePlayerMoveDamage,
  executeBattleRound,
  enemyChooseMove
};
