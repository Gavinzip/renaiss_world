function createEntryGateUtils(deps = {}) {
  const {
    CORE,
    PET,
    BATTLE,
    ISLAND_STORY,
    getLocationProfile,
    LOCATION_ARC_COMPLETE_TURNS = 10,
    LOCATION_ENTRY_GATE_ENABLED = true,
    LOCATION_ENTRY_MIN_WINRATE = 50,
    syncLocationArcLocation,
    ensureLocationStoryProgressEntry,
    buildHumanCombatant,
    getActiveCombatant,
    getCombatantMoves,
    getBattleFighterType
  } = deps;

  const LOCATION_ENTRY_BASELINE_CURVE = Object.freeze({
    1: { hp: 56, attack: 10, defense: 0 },
    2: { hp: 72, attack: 12, defense: 0 },
    3: { hp: 94, attack: 15, defense: 0 },
    4: { hp: 122, attack: 18, defense: 0 },
    5: { hp: 154, attack: 22, defense: 0 }
  });

  function getPlayerProgressDifficultyTier(player) {
    const currentProfile = typeof getLocationProfile === 'function'
      ? getLocationProfile(player?.location || '')
      : null;
    let tier = Math.max(1, Math.min(5, Number(currentProfile?.difficulty || 1)));

    if (ISLAND_STORY && typeof ISLAND_STORY.getUnlockedLocations === 'function') {
      const unlocked = ISLAND_STORY.getUnlockedLocations(player);
      for (const loc of unlocked) {
        const profile = typeof getLocationProfile === 'function' ? getLocationProfile(loc) : null;
        const diff = Math.max(1, Math.min(5, Number(profile?.difficulty || 1)));
        if (diff > tier) tier = diff;
      }
    }
    return tier;
  }

  function ensureEntryGateProgressState(player) {
    if (!player || typeof player !== 'object') return null;
    if (!player.entryGateProgress || typeof player.entryGateProgress !== 'object' || Array.isArray(player.entryGateProgress)) {
      player.entryGateProgress = {
        entryPowerByTier: {}
      };
    }
    if (!player.entryGateProgress.entryPowerByTier || typeof player.entryGateProgress.entryPowerByTier !== 'object') {
      player.entryGateProgress.entryPowerByTier = {};
    }
    return player.entryGateProgress;
  }

  function calculateCurrentCombatPower(player, pet = null) {
    if (!player) return 0;
    const safePet = pet || PET.loadPet(player.id);
    const fighterType = CORE.canPetFight(safePet) ? 'pet' : 'player';
    const combatant = fighterType === 'player'
      ? buildHumanCombatant(player)
      : getActiveCombatant(player, safePet);
    if (!combatant) return 0;

    const level = Math.max(1, Number(player?.level || 1));
    const moves = getCombatantMoves(combatant, safePet);
    let avgMovePressure = Math.max(1, Number(combatant.attack || 10) * 0.8);
    if (moves.length > 0) {
      const total = moves.reduce((sum, move) => {
        const dmg = BATTLE.calculatePlayerMoveDamage(move, player, combatant);
        return sum + Math.max(1, Number(dmg?.total || dmg?.base || 0));
      }, 0);
      avgMovePressure = Math.max(1, total / moves.length);
    }

    const score =
      Number(combatant.attack || 0) * 2.4 +
      Number(combatant.maxHp || combatant.hp || 0) * 0.45 +
      avgMovePressure * 1.3 +
      level * 4;
    return Math.max(1, Math.round(score));
  }

  function getEntryTierBaselinePower(player, tier, currentPower) {
    const safeTier = Math.max(1, Math.min(5, Number(tier || 1)));
    const state = ensureEntryGateProgressState(player);
    if (!state) return Math.max(1, Number(currentPower || 1));
    if (!Number.isFinite(Number(state.entryPowerByTier[safeTier]))) {
      state.entryPowerByTier[safeTier] = Math.max(1, Number(currentPower || 1));
    }
    return Math.max(1, Number(state.entryPowerByTier[safeTier] || currentPower || 1));
  }

  function ensurePlayerIslandState(player) {
    if (!player || typeof player !== 'object') return;
    ensureEntryGateProgressState(player);
    if (ISLAND_STORY && typeof ISLAND_STORY.ensureIslandStoryState === 'function') {
      ISLAND_STORY.ensureIslandStoryState(player);
    }
    if (ISLAND_STORY && typeof ISLAND_STORY.ensureUnlockedLocations === 'function') {
      ISLAND_STORY.ensureUnlockedLocations(player);
    }
    const currentLoc = String(player.location || player.spawnLocation || '').trim();
    if (currentLoc && ISLAND_STORY && typeof ISLAND_STORY.unlockLocation === 'function') {
      ISLAND_STORY.unlockLocation(player, currentLoc);
    }
    const tier = getPlayerProgressDifficultyTier(player);
    const power = calculateCurrentCombatPower(player);
    getEntryTierBaselinePower(player, tier, power);
  }

  function syncCurrentIslandStoryProgress(player) {
    if (!player || typeof player !== 'object') return null;
    ensurePlayerIslandState(player);
    const location = String(player.location || '').trim();
    if (!location) return null;
    const state = typeof syncLocationArcLocation === 'function' ? syncLocationArcLocation(player) : null;
    const turnsInLocation = Math.max(0, Number(state?.turnsInLocation || 0));
    const storyProgress = typeof ensureLocationStoryProgressEntry === 'function'
      ? ensureLocationStoryProgressEntry(state, location)
      : null;
    const battleDone = Boolean(storyProgress?.battleDone);
    if (!ISLAND_STORY || typeof ISLAND_STORY.updateIslandStoryProgress !== 'function') return null;
    return ISLAND_STORY.updateIslandStoryProgress(player, {
      location,
      turnsInLocation,
      targetTurns: LOCATION_ARC_COMPLETE_TURNS,
      battleDone
    });
  }

  function buildLocationEntryBaselineEnemy(targetLocation, player = null) {
    const profile = typeof getLocationProfile === 'function' ? getLocationProfile(targetLocation) : null;
    const difficulty = Math.max(1, Math.min(5, Number(profile?.difficulty || 3)));
    const progressTier = getPlayerProgressDifficultyTier(player);
    const gap = difficulty - progressTier;
    const curve = LOCATION_ENTRY_BASELINE_CURVE[difficulty] || LOCATION_ENTRY_BASELINE_CURVE[3];
    const name = `D${difficulty} 守門者`;
    const scale =
      gap <= 0
        ? { hp: 1.0, attack: 1.0 }
        : gap === 1
          ? { hp: 1.1, attack: 1.1 }
          : gap === 2
            ? { hp: 1.25, attack: 1.25 }
            : { hp: 1.4, attack: 1.4 };
    const hp = Math.max(1, Math.floor(Number(curve.hp || 140) * scale.hp));
    const attack = Math.max(1, Math.floor(Number(curve.attack || 24) * scale.attack));
    const defense = 0;
    const levelRef = Math.max(1, Number(player?.level || 1) + difficulty * 2);
    return {
      id: `entry_gate_d${difficulty}`,
      name,
      hp,
      maxHp: hp,
      attack,
      defense,
      moves: BATTLE.buildEnemyMoveLoadout(name, levelRef, ['壓制斬', '試探突進', '破勢重擊'], {
        villain: false,
        attack
      }),
      reward: { gold: [0, 0] },
      isMonster: false,
      companionPet: false,
      ignoreBeginnerBalance: true,
      ignoreBeginnerDanger: true,
      entryGap: gap,
      progressTier
    };
  }

  function canEnterLocation(player, targetLocation) {
    if (!LOCATION_ENTRY_GATE_ENABLED) {
      return { allowed: true, winRate: 100, rank: '關閉', reason: 'entry_gate_disabled' };
    }
    if (!player || !targetLocation) {
      return { allowed: false, winRate: 0, rank: '資料不足', reason: 'missing_player_or_location' };
    }
    const target = String(targetLocation || '').trim();
    if (!target) return { allowed: false, winRate: 0, rank: '資料不足', reason: 'empty_target' };
    if (String(player.location || '').trim() === target) {
      return { allowed: true, winRate: 80, rawWinRate: 80, rank: '同地點', reason: 'same_location' };
    }

    ensurePlayerIslandState(player);
    const gateEnemy = buildLocationEntryBaselineEnemy(target, player);
    const pet = PET.loadPet(player.id);
    const fighterType = typeof getBattleFighterType === 'function'
      ? getBattleFighterType(player, pet)
      : (CORE.canPetFight(pet) ? 'pet' : 'player');
    const profile = typeof getLocationProfile === 'function' ? getLocationProfile(target) : null;
    const targetDifficulty = Math.max(1, Math.min(5, Number(profile?.difficulty || 3)));
    const progressTier = getPlayerProgressDifficultyTier(player);
    const gap = targetDifficulty - progressTier;
    const currentPower = calculateCurrentCombatPower(player, pet);
    const tierBaselinePower = getEntryTierBaselinePower(player, progressTier, currentPower);
    const powerDelta = currentPower - tierBaselinePower;
    const progressRatio = tierBaselinePower > 0 ? powerDelta / tierBaselinePower : 0;

    const baseWinRate =
      gap <= 0
        ? 80
        : gap === 1
          ? 30
          : gap === 2
            ? 16
            : 8;
    const growthGain =
      gap <= 0
        ? 24
        : gap === 1
          ? 260
          : gap === 2
            ? 210
            : 170;

    const rawWinRate = Math.max(0, Math.min(100, baseWinRate + progressRatio * growthGain));
    const winRate = Math.max(1, Math.min(99, Math.round(rawWinRate)));
    const allowed = winRate > LOCATION_ENTRY_MIN_WINRATE;
    const rank = winRate >= 75 ? '高機率' : winRate >= 55 ? '可一戰' : winRate >= 35 ? '偏低' : '高風險';
    return {
      allowed,
      targetLocation: target,
      difficulty: targetDifficulty,
      winRate,
      rawWinRate,
      rank,
      fighterType,
      progressTier,
      powerDelta: Math.round(powerDelta),
      reason: allowed ? 'ok' : 'winrate_too_low',
      gateEnemy
    };
  }

  return {
    LOCATION_ENTRY_BASELINE_CURVE,
    getPlayerProgressDifficultyTier,
    ensureEntryGateProgressState,
    calculateCurrentCombatPower,
    getEntryTierBaselinePower,
    ensurePlayerIslandState,
    syncCurrentIslandStoryProgress,
    buildLocationEntryBaselineEnemy,
    canEnterLocation
  };
}

module.exports = { createEntryGateUtils };
