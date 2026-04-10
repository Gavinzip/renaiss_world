function createGachaSlotUtils() {
  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function buildSlotReels(isJackpot) {
    const normalPool = ['🍒', '🍋', '🍇', '🔔', '🍀', '⭐', '🪙', '🎲'];
    const jackpotPool = ['💎', '👑', '🔮', '🌟', '7️⃣'];
    if (isJackpot) {
      const symbol = pickRandom(jackpotPool);
      return [symbol, symbol, symbol];
    }
    const reels = [pickRandom(normalPool), pickRandom(normalPool), pickRandom(normalPool)];
    while (reels[0] === reels[1] && reels[1] === reels[2]) {
      reels[2] = pickRandom(normalPool);
    }
    return reels;
  }

  function formatGachaSlotLine(draw, index) {
    const isJackpot = draw.tier === 3;
    const reels = buildSlotReels(isJackpot);
    const jackpotText = isJackpot ? ' → **JACKPOT!**' : '';
    return `${index + 1}. 🎰 [ ${reels[0]} | ${reels[1]} | ${reels[2]} ]${jackpotText}\n${draw.tierEmoji} **${draw.move.name}** (${draw.tierName}) - ${draw.move.desc}`;
  }

  function buildGachaReelLines(slotRows = [], revealCount = 0, showSkill = false) {
    return slotRows.map((row, index) => {
      const reels = Array.isArray(row?.reels) ? row.reels : ['❔', '❔', '❔'];
      const a = revealCount >= 1 ? reels[0] : '❔';
      const b = revealCount >= 2 ? reels[1] : '❔';
      const c = revealCount >= 3 ? reels[2] : '❔';
      const jackpotText = row?.draw?.tier === 3 && revealCount >= 3 ? ' → **JACKPOT!**' : '';
      const skillText = showSkill
        ? `${row.draw.tierEmoji} **${row.draw.move.name}** (${row.draw.tierName}) - ${row.draw.move.desc}`
        : '🎁 技能揭曉中...';
      return `${index + 1}. 🎰 [ ${a} | ${b} | ${c} ]${jackpotText}\n${skillText}`;
    }).join('\n\n');
  }

  return {
    pickRandom,
    buildSlotReels,
    formatGachaSlotLine,
    buildGachaReelLines
  };
}

module.exports = {
  createGachaSlotUtils
};

