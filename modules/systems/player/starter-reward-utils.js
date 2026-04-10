function createStarterRewardUtils(deps = {}) {
  const {
    CORE,
    GACHA,
    addSkillChipToInventory = () => false,
    STARTER_FIVE_PULL_COUNT = 5
  } = deps;

  function ensureStarterRewardState(player) {
    if (!player || typeof player !== 'object') return;
    if (!player.starterRewards || typeof player.starterRewards !== 'object') {
      player.starterRewards = { fivePullClaimed: false, claimedAt: 0 };
    }
    if (typeof player.starterRewards.fivePullClaimed !== 'boolean') {
      player.starterRewards.fivePullClaimed = false;
    }
    if (!Number.isFinite(Number(player.starterRewards.claimedAt))) {
      player.starterRewards.claimedAt = 0;
    }
  }

  function grantStarterFivePullIfNeeded(playerId) {
    const player = CORE.loadPlayer(playerId);
    if (!player) return null;
    ensureStarterRewardState(player);
    if (player.starterRewards.fivePullClaimed) return null;

    const drawResult = GACHA.drawMoveFree(player, STARTER_FIVE_PULL_COUNT, { grantPoints: false });
    if (!drawResult?.success) return null;

    const grantedChips = [];
    const failedMoves = [];

    for (const draw of drawResult.draws || []) {
      const move = draw?.move;
      if (!move?.name) continue;
      const added = addSkillChipToInventory(player, move.name);
      if (added) {
        grantedChips.push({
          name: move.name,
          tier: draw?.tier || move.tier || 1,
          emoji: draw?.tierEmoji || (move.tier === 3 ? '🔮' : move.tier === 2 ? '💠' : '⚪')
        });
        continue;
      }
      failedMoves.push(`${move.name}（發放失敗）`);
    }

    ensureStarterRewardState(player);
    player.starterRewards.fivePullClaimed = true;
    player.starterRewards.claimedAt = Date.now();
    CORE.savePlayer(player);

    return {
      draws: drawResult.draws || [],
      grantedChips,
      learnedMoves: grantedChips,
      duplicateMoves: [],
      failedMoves
    };
  }

  return {
    ensureStarterRewardState,
    grantStarterFivePullIfNeeded
  };
}

module.exports = { createStarterRewardUtils };
