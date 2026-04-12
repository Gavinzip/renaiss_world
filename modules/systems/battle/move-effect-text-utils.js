function createMoveEffectTextUtils(deps = {}) {
  const { BATTLE } = deps;

  function describeMoveEffects(moveOrEffect = {}) {
    const move = (moveOrEffect && typeof moveOrEffect === 'object' && moveOrEffect.effect)
      ? moveOrEffect
      : { effect: moveOrEffect || {}, tier: 1 };
    const effect = move.effect || {};
    if (!effect || typeof effect !== 'object') return '無效果';
    const getRate = (key) => {
      if (typeof BATTLE.getMoveEffectSuccessRate !== 'function') return null;
      const value = Number(BATTLE.getMoveEffectSuccessRate(move, key));
      if (!Number.isFinite(value)) return null;
      return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
    };
    const notes = [];
    if (effect.burn) notes.push(`灼燒${effect.burn}回（每回約22%持續傷害）`);
    if (effect.poison) notes.push(`中毒${effect.poison}回（每回約16%持續傷害）`);
    if (effect.trap) notes.push(`陷阱${effect.trap}回（每回約18%持續傷害）`);
    if (effect.bleed) notes.push(`流血${effect.bleed}回（每回約24%持續傷害）`);
    if (effect.dot) notes.push(`持續干擾（2回，每回${effect.dot}）`);
    if (effect.stun) notes.push(`暈眩${effect.stun}回（命中約${getRate('stun') || '?'}，硬控有抗性）`);
    if (effect.freeze) notes.push(`凍結${effect.freeze}回（命中約${getRate('freeze') || '?'}，硬控有抗性）`);
    if (effect.bind) notes.push(`束縛${effect.bind}回（命中約${getRate('bind') || '?'}，無法逃跑）`);
    if (effect.slow) notes.push(`緩速${effect.slow}回（命中約${getRate('slow') || '?'}，輸出-20%）`);
    if (effect.fear) notes.push(`恐懼${effect.fear}回（命中約${getRate('fear') || '?'}）`);
    if (effect.confuse) notes.push(`混亂${effect.confuse}回（命中約${getRate('confuse') || '?'}）`);
    if (effect.blind) notes.push(`致盲${effect.blind}回（命中約${getRate('blind') || '?'}）`);
    if (effect.missNext) notes.push(`使對手下次攻擊落空（命中約${getRate('missNext') || '?'})`);
    if (effect.defenseDown || effect.defDown) notes.push(`降防${effect.defenseDown || effect.defDown}回（對高防目標更有效）`);
    if (effect.shield) notes.push(`護盾${effect.shield}回（每次受擊減傷）`);
    if (effect.dodge) notes.push(`閃避${effect.dodge}回（約45%躲招）`);
    if (effect.reflect) notes.push(`反射${effect.reflect}回（回彈35%）`);
    if (effect.thorns) notes.push(`反刺${effect.thorns}回（回彈20%）`);
    if (effect.heal) notes.push(`治療${effect.heal}`);
    if (effect.cleanse) notes.push('淨化負面狀態');
    if (effect.drain) notes.push(`汲取回復（上限${effect.drain}）`);
    if (effect.selfDamage) notes.push(`自損${effect.selfDamage}`);
    if (effect.splash) notes.push('範圍衝擊（本擊+20%）');
    if (effect.armorBreak) notes.push('破甲（大幅削減目標防禦）');
    if (effect.ignoreResistance) notes.push('無視防禦（直接穿透防禦）');
    if (effect.spreadPoison) notes.push('擴散毒化（附加中毒）');
    if (effect.debuff === 'all') notes.push('全體弱化（緩速+降防+致盲）');
    if (effect.summon) notes.push(`幻像干擾${effect.summon}回（失手率上升）`);
    if (effect.flee) notes.push('逃跑技能');
    if (effect.wait) notes.push('待機蓄能（不攻擊）');
    return notes.length > 0 ? notes.join('；') : '無效果';
  }

  return { describeMoveEffects };
}

module.exports = {
  createMoveEffectTextUtils
};
