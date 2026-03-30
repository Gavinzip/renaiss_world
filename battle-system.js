/**
 * ⚔️ Renaiss World - 戰鬥系統 v3
 * 逃跑30%失敗 x2 = 死亡
 */

const fs = require('fs');
const path = require('path');
const CORE = require('./game-core');

// ============== 逃跑系統 ==============
const FLEE_CONFIG = {
  successRate: 0.7,  // 70% 成功率
  maxAttempts: 2,     // 最多嘗試2次
  deathOnFail: true   // 第2次失敗 = 死亡
};

// 嘗試逃跑
function attemptFlee(player, pet, enemy, attemptNumber = 1) {
  const roll = Math.random();
  const success = roll < FLEE_CONFIG.successRate;
  
  if (success) {
    return {
      success: true,
      message: `🏃 逃跑成功！你脫離了戰鬥！`
    };
  }
  
  // 失敗了
  if (attemptNumber >= FLEE_CONFIG.maxAttempts) {
    // 第2次也失敗 = 死亡
    return {
      success: false,
      death: true,
      message: `💀 逃跑失敗！你已被敵人追上，無法逃脫！`
    };
  }
  
  // 第1次失敗，可以再試
  return {
    success: false,
    death: false,
    canRetry: true,
    message: `⚠️ 逃跑失敗！敵人追了上來，還有一次逃跑機會！`
  };
}

// ============== 敵方怪物（學習玩家的招式）==============
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
  
  return enemies[type] || enemies['哥布林'];
}

// ============== 史詩魔王（有自己的招式）==============
const EPIC_BOSSES = {
  '黃金龍': {
    name: '🐉 黃金龍',
    hp: 300,
    maxHp: 300,
    attack: 55,
    defense: 30,
    speed: 25,
    moves: [
      { name: '金龍擺尾', damage: 45, effect: { stun: 1 } },
      { name: '龍息', damage: 50, effect: { burn: 2 } },
      { name: '金鱗護體', damage: 0, effect: { shield: 2 } },
      { name: '飛龍在天', damage: 60, effect: {} }
    ],
    reward: { gold: [500, 700], moveLearnable: true }
  },
  '深淵魔': {
    name: '👹 深淵魔',
    hp: 350,
    maxHp: 350,
    attack: 60,
    defense: 25,
    speed: 20,
    moves: [
      { name: '深淵之手', damage: 40, effect: { bind: 2 } },
      { name: '惡魔咆哮', damage: 55, effect: { confuse: 1 } },
      { name: '靈魂吸取', damage: 35, effect: { drain: 25 } },
      { name: '黑暗領域', damage: 0, effect: { debuff: 'all' } },
      { name: '深淵崩毁', damage: 65, effect: {} }
    ],
    reward: { gold: [700, 900], moveLearnable: true }
  },
  '修羅鳳': {
    name: '🦅 修羅鳳',
    hp: 280,
    maxHp: 280,
    attack: 65,
    defense: 20,
    speed: 30,
    moves: [
      { name: '鳳凰火舞', damage: 50, effect: { burn: 3 } },
      { name: '羽刃風暴', damage: 45, effect: { bleed: 2 } },
      { name: '涅槃重生', damage: 0, effect: { heal: 80 } },
      { name: '修羅降臨', damage: 70, effect: { armorBreak: true } }
    ],
    reward: { gold: [600, 800], moveLearnable: true }
  },
  '骸骨王': {
    name: '💀 骸骨王',
    hp: 400,
    maxHp: 400,
    attack: 70,
    defense: 35,
    speed: 15,
    moves: [
      { name: '骨刺穿心', damage: 45, effect: { poison: 3 } },
      { name: '骸骨屏障', damage: 0, effect: { shield: 3 } },
      { name: '亡靈詛咒', damage: 40, effect: { defDown: 2 } },
      { name: '骸骨軍團', damage: 50, effect: { summon: 2 } },
      { name: '死亡一指', damage: 80, effect: {} },
      { name: '冥火焚身', damage: 55, effect: { burn: 2, poison: 1 } }
    ],
    reward: { gold: [1000, 1600], moveLearnable: true }
  }
};

// ============== 計算玩家招式傷害 ==============
function calculatePlayerMoveDamage(move, player, pet) {
  const level = pet.level || 1;
  const attack = pet.attack || 20;
  
  let damage = move.baseDamage || 0;
  
  // 等級加成
  damage += level * 2;
  
  // 攻擊加成
  damage += Math.floor(attack * 0.5);
  
  // 計算持續效果
  let instantDamage = damage;
  let dotDamage = 0;
  let dotTurns = 0;
  
  if (move.effect.burn) {
    dotDamage += Math.floor(damage * 0.6);
    dotTurns += move.effect.burn;
  }
  if (move.effect.poison) {
    dotDamage += Math.floor(damage * 0.4);
    dotTurns += move.effect.poison;
  }
  if (move.effect.trap) {
    dotDamage += Math.floor(damage * 0.5);
    dotTurns += move.effect.trap;
  }
  if (move.effect.dot) {
    dotDamage += move.effect.dot;
    dotTurns += 2;
  }
  
  instantDamage = damage - Math.floor(damage * 0.4); // 即時只有60%
  
  return {
    instant: Math.max(0, instantDamage),
    overTime: dotDamage,
    totalTurns: dotTurns,
    total: Math.max(0, instantDamage) + dotDamage
  };
}

// ============== 執行戰鬥回合 ==============
function executeBattleRound(player, pet, enemy, chosenMove, enemyMove = null) {
  const results = [];
  
  // ===== 玩家攻擊 =====
  const moveDmg = calculatePlayerMoveDamage(chosenMove, player, pet);
  const finalDamage = Math.max(1, moveDmg.total - enemy.defense);
  
  results.push({
    attacker: pet.name,
    defender: enemy.name,
    move: chosenMove.name,
    damage: finalDamage,
    effects: chosenMove.effect,
    message: `🐾 ${pet.name}施展「${chosenMove.name}」！造成 ${finalDamage} 點傷害！`
  });
  
  enemy.hp -= finalDamage;
  
  // ===== 敵人攻擊（如果敵人沒被控制）=====
  if (enemy.hp > 0 && enemyMove) {
    const enemyDamage = Math.max(1, enemyMove.damage - (pet.defense || 15));
    pet.hp -= enemyDamage;
    results.push({
      attacker: enemy.name,
      defender: pet.name,
      move: enemyMove.name,
      damage: enemyDamage,
      message: `👹 ${enemy.name}施展「${enemyMove.name}」！你受到 ${enemyDamage} 點傷害！`
    });
  }
  
  // ===== 檢查勝負 =====
  if (enemy.hp <= 0) {
    // 玩家勝利
    const goldReward = Math.floor(Math.random() * (enemy.reward.gold[1] - enemy.reward.gold[0])) + enemy.reward.gold[0];
    
    // 記錄到世界狀態（24小時重生）
    const enemyId = enemy.id || enemy.name;
    const isMonster = enemy.isMonster || false;
    CORE.killNPC(enemyId, player.id, isMonster);
    
    // 增加通緝等级
    const wantedLevel = CORE.getPlayerWantedLevel(player.id);
    
    return {
      victory: true,
      enemy: enemy.name,
      enemyId: enemyId,
      gold: goldReward,
      wantedLevel: wantedLevel,
      message: `🏆 你擊敗了${enemy.name}！獲得 ${goldReward} Rns！${wantedLevel > 0 ? `\n⚠️ 你現在是 ${wantedLevel} 級通緝犯！` : ''}`
    };
  }
  
  if (pet.hp <= 0) {
    // 玩家死亡
    return {
      victory: false,
      death: true,
      message: `💀 你被${enemy.name}擊敗了...`
    };
  }
  
  // 繼續戰鬥
  return {
    victory: null,
    enemyHp: enemy.hp,
    playerHp: pet.hp,
    petName: pet.name,
    enemyName: enemy.name,
    message: results.map(r => r.message).join('\n')
  };
}

// =============_ 敵人選擇招式 ==============
function enemyChooseMove(enemy) {
  if (!enemy.moves || enemy.moves.length === 0) {
    return { name: '攻擊', damage: enemy.attack || 10, effect: {} };
  }
  
  // 隨機選擇
  const moveIndex = Math.floor(Math.random() * enemy.moves.length);
  const move = enemy.moves[moveIndex];
  
  if (typeof move === 'string') {
    return { name: move, damage: enemy.attack || 10, effect: {} };
  }
  
  return move;
}

module.exports = {
  FLEE_CONFIG,
  attemptFlee,
  createEnemy,
  EPIC_BOSSES,
  calculatePlayerMoveDamage,
  executeBattleRound,
  enemyChooseMove
};
