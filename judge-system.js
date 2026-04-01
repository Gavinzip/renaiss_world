/**
 * ⚖️ Renaiss World - 裁判系統
 * 用想像力與創意決定戰鬥勝負
 */

const fs = require('fs');
const path = require('path');

// ============== 元素相剋 ==============
const ELEMENT_ADVANTAGE = {
  '金': { beats: ['木'], weakTo: ['火'] },
  '木': { beats: ['土'], weakTo: ['金'] },
  '水': { beats: ['火'], weakTo: ['土'] },
  '火': { beats: ['金'], weakTo: ['水'] },
  '土': { beats: ['水'], weakTo: ['木'] },
  '暗': { beats: ['光'], weakTo: ['複合'] },
  '毒': { beats: ['淨'], weakTo: ['光'] },
  '複合': { beats: ['暗', '毒'], weakTo: [] }
};

// ============== 裁判風格敘述 ==============
const NARRATIVE_STYLES = {
  // 正派勝利
  positive_win: [
    '只見俠者身影一晃，對手根本來不及反應！',
    '一道金光閃過，邪道中人已被制服在地！',
    '俠客運起內力，一招斃敵，乾淨利落！',
    '正氣凜然的一擊，讓邪派人士聞風喪膽！',
    '俠之大者，為國為民，這一掌蘊含俠義之心！'
  ],
  // 反派勝利
  negative_win: [
    '黑影一閃，對手還沒看清就已倒地！',
    '只見魔爪探出，敵人無處可逃！',
    '邪功發動，正道人士節節敗退！',
    '詭異的笑聲中，對手已被毒素入侵！',
    '心狠手辣的一擊，毫無留情！'
  ],
  // 精彩對決
  epic_clash: [
    '雙方實力不相上下，金鐵交鳴聲中難分難解！',
    '招式來回拆解了數十招，誰也奈何不了誰！',
    '內力激盪，周圍草木皆被震斷！',
    '一招硬碰，雙方各自退了三步！',
    '電光火石間，雙方已過手十餘招！'
  ],
  // 意外逆轉
  reversal: [
    '眼看就要落敗，誰知局勢突變！',
    '奇蹟發生！劣勢一方突然爆發！',
    '對手大意了！這一擊成為了轉折點！',
    '天意弄人，命運站在了這邊！',
    '沒有人想到結局會是這樣！'
  ],
  // 險勝
  close_win: [
    '差一點點就輸了！好驚險！',
    '兩敗俱傷的最後，勉強站著的是...',
    '贏得驚險，雙方都已力竭！',
    '靠著最後一口氣支撐著！',
    '這場勝利來之不易！'
  ]
};

// ============== 招式組合效果 ==============
const MOVE_COMBOS = {
  '金針刺穴+寒冰掌': '金寒交加，敵人穴位被封，行動全被限制！',
  '回春術+楊枝淨水': '陰陽調和，療效倍增，幾乎瞬間恢復！',
  '烈焰焚天+洪水滔天': '水火不容，兩股力量互相衝突，場面壯觀！',
  '吸星大法+蛛絲縛魂': '吸取精華加上束縛，根本逃不掉！',
  '金鐘罩+赤焰甲': '金火相生，防禦無敵！',
  '地震轟鳴+流沙陣': '天地之力合而為一，無處可逃！'
};

// ============== 裁判決定勝負 ==============
function judgeBattle(attacker, defender, attackerMove, defenderMove, context = {}) {
  const result = {
    winner: null,
    damage: {},
    narrative: '',
    isReversal: false,
    moveEffects: [],
    dramatic: false
  };
  
  // ===== 1. 基礎數值計算 =====
  let attackerScore = 0;
  let defenderScore = 0;
  
  // 攻擊力加成
  attackerScore += (attacker.attack || 20) * 0.4;
  defenderScore += (defender.defense || 15) * 0.3;
  
  // 等級加成
  attackerScore += (attacker.level || 1) * 10;
  defenderScore += (defender.level || 1) * 10;
  
  // 速度加成（先手優勢）
  if ((attacker.speed || 20) > (defender.speed || 20)) {
    attackerScore += 15;
  }
  
  // ===== 2. 招式分析 =====
  const atkMove = attackerMove || { name: '普通攻擊', damage: 20 };
  const defMove = defenderMove || { name: '防禦', damage: 0 };
  
  // 招式傷害加成
  attackerScore += atkMove.damage || 0;
  
  // 招式效果加成
  if (atkMove.effect) {
    if (atkMove.effect.stun) attackerScore += 20;
    if (atkMove.effect.poison) attackerScore += 15;
    if (atkMove.effect.bind) attackerScore += 15;
    if (atkMove.effect.drain) attackerScore += 20;
    if (atkMove.effect.burn) attackerScore += 10;
    if (atkMove.effect.critical) attackerScore += 30;
    
    result.moveEffects.push(atkMove.effect.desc || atkMove.name);
  }
  
  if (defMove.effect) {
    if (defMove.effect.shield) defenderScore += 25;
    if (defMove.effect.reflect) defenderScore += 20;
    if (defMove.effect.heal) defenderScore += 15;
  }
  
  // ===== 3. 元素相剋 =====
  const atkElement = atkMove.element || '複合';
  const defElement = defMove.element || '複合';
  
  if (ELEMENT_ADVANTAGE[atkElement]?.beats?.includes(defElement)) {
    attackerScore += 25;
    result.moveEffects.push(`【元素優勢】${atkElement}剋制${defElement}！`);
  }
  if (ELEMENT_ADVANTAGE[defElement]?.beats?.includes(atkElement)) {
    defenderScore += 25;
    result.moveEffects.push(`【元素劣勢】${atkElement}被${defElement}剋制！`);
  }
  
  // ===== 4. 招式組合判定 =====
  const comboKey = `${atkMove.name}+${defMove.name}`;
  if (MOVE_COMBOS[comboKey]) {
    attackerScore += 30;
    result.moveEffects.push(`【招式共鳴】${MOVE_COMBOS[comboKey]}`);
    result.dramatic = true;
  }
  
  // ===== 5. 運氣加成（幸運值）=====
  const atkLuck = attacker.stats?.幸運 || 50;
  const defLuck = defender.stats?.幸運 || 50;
  
  attackerScore += (atkLuck - 50) * 0.3;
  defenderScore += (defLuck - 50) * 0.3;
  
  // 爆擊（高運氣）
  if (Math.random() * 100 < atkLuck / 3) {
    attackerScore *= 1.5;
    result.moveEffects.push(`【暴擊】${attacker.name || '攻擊者'}運氣爆發！`);
    result.dramatic = true;
  }
  
  // ===== 6. 隨機因素（讓比賽更有懸念）=====
  attackerScore += Math.random() * 30 - 15;
  defenderScore += Math.random() * 30 - 15;
  
  // ===== 7. 判定勝負 =====
  const scoreDiff = Math.abs(attackerScore - defenderScore);
  const isClose = scoreDiff < 30;
  const isReversalChance = Math.random() < 0.15; // 15%逆轉機會
  
  // 計算生命損失
  let atkDamage = 0;
  let defDamage = 0;
  
  if (attackerScore > defenderScore) {
    result.winner = attacker;
    atkDamage = Math.floor(30 + (attackerScore - defenderScore) * 0.5);
    defDamage = Math.floor((defenderScore / attackerScore) * 20);
  } else if (defenderScore > attackerScore) {
    result.winner = defender;
    defDamage = Math.floor(30 + (defenderScore - attackerScore) * 0.5);
    atkDamage = Math.floor((attackerScore / defenderScore) * 20);
  } else {
    // 平手 - 給予隨機勝利者
    result.winner = Math.random() < 0.5 ? attacker : defender;
    atkDamage = Math.floor(Math.random() * 20);
    defDamage = Math.floor(Math.random() * 20);
  }
  
  result.damage = {
    attacker: Math.max(0, atkDamage),
    defender: Math.max(0, defDamage)
  };
  
  // ===== 8. 生成裁判敘述 =====
  result.narrative = generateNarrative(result, attacker, defender, atkMove, defMove, context);
  
  // ===== 9. 逆轉判定 =====
  if (isReversalChance && !result.dramatic) {
    result.isReversal = true;
    result.winner = result.winner === attacker ? defender : attacker;
    result.narrative = generateReversalNarrative(result, attacker, defender);
    result.damage = {
      attacker: result.winner === attacker ? 10 : 50,
      defender: result.winner === defender ? 10 : 50
    };
  }
  
  return result;
}

// ============== 生成裁判敘述 ==============
function generateNarrative(result, attacker, defender, atkMove, defMove, context) {
  const winner = result.winner;
  const isAttackerWinner = winner === attacker;
  const isClose = Math.abs(result.damage.attacker - result.damage.defender) < 20;
  const moveCount = context.totalMoves || 1;
  
  let narrative = '';
  
  // ===== 開場白 =====
  const openers = [
    '只見雙方對峙，空氣中充滿了緊張的氣息...',
    '電光火石間，兩道身影交錯而過！',
    '內力催動，雙方同時出手！',
    '招式交織，誰能在這回合佔得先機？',
    '這一刻，決定命運的一擊！'
  ];
  narrative += openers[Math.floor(Math.random() * openers.length)] + '\n\n';
  
  // ===== 招式描述 =====
  const moveDesc = isAttackerWinner
    ? `「${atkMove.name}」正中要害！`
    : `「${defMove.name}」完美化解攻勢！`;
  narrative += moveDesc + '\n';
  
  // ===== 招式效果 =====
  if (result.moveEffects.length > 0) {
    const effects = result.moveEffects.slice(0, 3).join('\n');
    narrative += effects + '\n';
  }
  
  // ===== 結果判定 =====
  narrative += '\n';
  
  if (result.dramatic) {
    narrative += '🌟 ' + NARRATIVE_STYLES.epic_clash[Math.floor(Math.random() * NARRATIVE_STYLES.epic_clash.length)] + '\n\n';
  } else if (isClose) {
    narrative += '😰 ' + NARRATIVE_STYLES.close_win[Math.floor(Math.random() * NARRATIVE_STYLES.close_win.length)] + '\n\n';
  }
  
  // ===== 最終結果 =====
  const winnerName = isAttackerWinner 
    ? (attacker.name || '攻擊者') 
    : (defender.name || '防禦者');
  
  const loserName = isAttackerWinner 
    ? (defender.name || '防禦者') 
    : (attacker.name || '攻擊者');
  
  const winStyles = isAttackerWinner 
    ? (attacker.type === '正派' ? NARRATIVE_STYLES.positive_win : NARRATIVE_STYLES.negative_win)
    : (defender.type === '正派' ? NARRATIVE_STYLES.positive_win : NARRATIVE_STYLES.negative_win);
  
  narrative += '🏆 **裁判判定：** ' + winnerName + '勝利！\n\n';
  narrative += '📖 ' + winStyles[Math.floor(Math.random() * winStyles.length)] + '\n\n';
  
  // ===== 戰鬥統計 =====
  narrative += `⚔️ 造成傷害：${isAttackerWinner ? result.damage.defender : result.damage.attacker}\n`;
  
  if (result.moveEffects.length > 0) {
    narrative += `\n💫 裁判點評：這場戰鬥展現了武學的精髓`;
  }
  
  return narrative;
}

// ============== 逆轉敘述 ==============
function generateReversalNarrative(result, attacker, defender) {
  const winner = result.winner;
  const isAttackerWinner = winner === attacker;
  
  let narrative = '';
  
  narrative += '⚡ ' + NARRATIVE_STYLES.reversal[Math.floor(Math.random() * NARRATIVE_STYLES.reversal.length)] + '\n\n';
  
  const winnerName = isAttackerWinner 
    ? (attacker.name || '攻擊者') 
    : (defender.name || '防禦者');
  
  const winStyles = winner.type === '正派' 
    ? NARRATIVE_STYLES.positive_win 
    : NARRATIVE_STYLES.negative_win;
  
  narrative += '🏆 **裁判判定（逆轉）：** ' + winnerName + '勝利！\n\n';
  narrative += '📖 ' + winStyles[Math.floor(Math.random() * winStyles.length)] + '\n\n';
  
  narrative += `⚔️ 造成傷害：${isAttackerWinner ? result.damage.defender : result.damage.attacker}\n`;
  narrative += '\n💫 裁判點評：江湖處處是驚喜，誰也不知道下一秒會發生什麼！';
  
  return narrative;
}

// ============== 裁判點評（戰鬥總結）==============
function getJudgeComment(result, battleContext) {
  const comments = [
    '這場戰鬥充分展現了武學的精髓！',
    '招式之間的配合恰到好處！',
    '雙方的實力都在伯仲之間！',
    '精彩的一戰！讓人熱血沸騰！',
    '裁判對雙方的表現都非常滿意！',
    '這就是江湖！處處充滿驚奇！',
    '無論勝敗，能站在這裡的都是好漢！',
    '期待下次能看到更精彩的對決！'
  ];
  
  return comments[Math.floor(Math.random() * comments.length)];
}

// ============== 獲取招式克制資訊 ==============
function getElementAdvantage(element) {
  const info = ELEMENT_ADVANTAGE[element];
  if (!info) return { beats: [], weakTo: [] };
  
  return {
    beats: info.beats || [],
    weakTo: info.weakTo || []
  };
}

// ============== 預測戰鬥結果（不實際執行）==============
function predictBattle(attacker, defender) {
  const atkLuck = attacker.stats?.幸運 || 50;
  const defLuck = defender.stats?.幸運 || 50;
  const atkPower = (attacker.attack || 20) + (attacker.level || 1) * 10 + (atkLuck - 50) * 0.3;
  const defPower = (defender.defense || 15) + (defender.level || 1) * 10 + (defLuck - 50) * 0.3;
  
  const atkChance = Math.min(95, Math.max(5, 50 + (atkPower - defPower) / 2));
  
  return {
    attackerWinChance: Math.round(atkChance),
    defenderWinChance: Math.round(100 - atkChance),
    recommendation: atkChance > 60 ? '進攻' : atkChance < 40 ? '防守' : '小心'
  };
}

module.exports = {
  judgeBattle,
  generateNarrative,
  generateReversalNarrative,
  getJudgeComment,
  getElementAdvantage,
  predictBattle,
  ELEMENT_ADVANTAGE,
  MOVE_COMBOS,
  NARRATIVE_STYLES
};
