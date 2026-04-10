function createFriendDuelUtils(deps = {}) {
  const getMoveSpeedValue = typeof deps.getMoveSpeedValue === 'function'
    ? deps.getMoveSpeedValue
    : (() => 10);
  const isFleeLikeMove = typeof deps.isFleeLikeMove === 'function'
    ? deps.isFleeLikeMove
    : (() => false);
  const normalizePetElementCode = typeof deps.normalizePetElementCode === 'function'
    ? deps.normalizePetElementCode
    : ((v) => String(v || '水'));
  const getPlayerOwnedPets = typeof deps.getPlayerOwnedPets === 'function'
    ? deps.getPlayerOwnedPets
    : (() => []);
  const canPetFight = typeof deps.canPetFight === 'function'
    ? deps.canPetFight
    : (() => true);
  const loadPlayer = typeof deps.loadPlayer === 'function'
    ? deps.loadPlayer
    : (() => null);
  const getPetById = typeof deps.getPetById === 'function'
    ? deps.getPetById
    : (() => null);
  const getBattleSwitchCandidates = typeof deps.getBattleSwitchCandidates === 'function'
    ? deps.getBattleSwitchCandidates
    : (() => []);

  function buildFriendDuelEnemyFromPet(friendPlayer, friendPet) {
    const petName = String(friendPet?.name || '夥伴').trim() || '夥伴';
    const ownerId = String(friendPlayer?.id || 'unknown').trim() || 'unknown';
    const ownerName = String(friendPlayer?.name || '好友').trim() || '好友';
    const petId = String(friendPet?.id || '').trim();
    const sourceMoves = Array.isArray(friendPet?.moves) ? friendPet.moves : [];
    const moves = sourceMoves
      .slice(0, 6)
      .map((m) => ({
        id: String(m?.id || '').trim(),
        name: String(m?.name || '普通攻擊').trim(),
        element: String(m?.element || '普通').trim(),
        tier: Math.max(1, Math.min(3, Number(m?.tier || 1))),
        priority: Math.max(-1, Math.min(3, Number(m?.priority || 0) || 0)),
        speed: getMoveSpeedValue(m),
        baseDamage: Math.max(1, Number(m?.baseDamage ?? m?.damage ?? 10) || 10),
        damage: Math.max(1, Number(m?.baseDamage ?? m?.damage ?? 10) || 10),
        effect: (m?.effect && typeof m.effect === 'object') ? { ...m.effect } : {},
        desc: String(m?.desc || '').trim()
      }))
      .filter((m) => m.name && !isFleeLikeMove(m));

    const fallbackMove = {
      id: 'friend_duel_strike',
      name: '友誼試探',
      element: '普通',
      tier: 1,
      priority: 0,
      speed: 10,
      baseDamage: Math.max(8, Number(friendPet?.attack || 12)),
      damage: Math.max(8, Number(friendPet?.attack || 12)),
      effect: {},
      desc: '以穩定節奏測試彼此實力'
    };

    const fullHp = Math.max(1, Number(friendPet?.maxHp || friendPet?.hp || 100));
    return {
      id: `friend_duel_${ownerId}_${petId || 'pet'}`,
      name: `${ownerName} 的 ${petName}`,
      ownerId,
      friendPetId: petId || null,
      element: normalizePetElementCode(friendPet?.type || friendPet?.element || '水'),
      petElement: normalizePetElementCode(friendPet?.type || friendPet?.element || '水'),
      hp: fullHp,
      maxHp: fullHp,
      attack: Math.max(8, Number(friendPet?.attack || 20)),
      defense: Math.max(1, Number(friendPet?.defense || 12)),
      moves: moves.length > 0 ? moves : [fallbackMove],
      reward: { gold: [0, 0] },
      isMonster: false,
      nonLethal: true
    };
  }

  function buildFriendDuelEnemyTeamFromPlayer(friendPlayer, preferredPet = null) {
    const ownerId = String(friendPlayer?.id || '').trim();
    const ownedPets = getPlayerOwnedPets(ownerId).filter((p) => Boolean(p?.hatched));
    const preferredId = String(preferredPet?.id || '').trim();
    let activePet = ownedPets.find((p) => String(p?.id || '').trim() === preferredId) || null;
    if (!activePet && preferredPet && canPetFight(preferredPet)) activePet = preferredPet;
    if (!activePet) activePet = ownedPets[0] || preferredPet;

    const activeId = String(activePet?.id || '').trim();
    const reservePetIds = ownedPets
      .map((p) => String(p?.id || '').trim())
      .filter((id) => id && id !== activeId);

    return {
      activePet,
      reservePetIds,
      enemy: buildFriendDuelEnemyFromPet(friendPlayer, activePet || preferredPet || {})
    };
  }

  function trySwitchFriendDuelEnemy(player, defeatedEnemyName = '') {
    const battle = player?.battleState;
    const duel = battle?.friendDuel;
    if (!battle || !duel) return { switched: false };
    const friendId = String(duel.friendId || '').trim();
    if (!Array.isArray(duel.enemyReservePetIds) || duel.enemyReservePetIds.length <= 0) {
      return { switched: false };
    }

    const rivalPlayer = friendId ? loadPlayer(friendId) : null;
    const rivalName = String(duel.friendName || rivalPlayer?.name || '好友').trim() || '好友';
    while (duel.enemyReservePetIds.length > 0) {
      const nextPetId = String(duel.enemyReservePetIds.shift() || '').trim();
      if (!nextPetId) continue;
      const nextPet = getPetById(nextPetId);
      if (!nextPet) continue;
      if (friendId && String(nextPet.ownerId || '').trim() !== friendId) continue;
      if (!nextPet.hatched) continue;
      const enemy = buildFriendDuelEnemyFromPet(rivalPlayer || { id: friendId, name: rivalName }, nextPet);
      battle.enemy = enemy;
      duel.currentEnemyPetId = nextPetId;
      const defeatedName = String(defeatedEnemyName || '').trim() || '對手寵物';
      return {
        switched: true,
        enemy,
        message: `🔁 ${defeatedName} 倒下，${rivalName} 改派 ${enemy.name} 上場。`
      };
    }
    return { switched: false };
  }

  function trySwitchFriendDuelPlayerPet(player, currentPet = null, combatant = null) {
    const battle = player?.battleState;
    if (!battle?.friendDuel) return { switched: false };
    const currentPetId = String(combatant?.id || currentPet?.id || battle.activePetId || '').trim();
    const nextPet = getBattleSwitchCandidates(player, currentPetId)[0] || null;
    if (!nextPet) return { switched: false };
    battle.activePetId = String(nextPet.id || '').trim() || battle.activePetId;
    battle.fighter = 'pet';
    const downName = String(currentPet?.name || combatant?.name || '目前寵物').trim() || '目前寵物';
    return {
      switched: true,
      nextPet,
      message: `🔁 ${downName} 倒下，你自動換上 ${nextPet.name} 繼續作戰。`
    };
  }

  function buildFriendDuelEnemyFromPlayer(friendPlayer, friendPet) {
    return buildFriendDuelEnemyTeamFromPlayer(friendPlayer, friendPet).enemy;
  }

  return {
    buildFriendDuelEnemyFromPet,
    buildFriendDuelEnemyTeamFromPlayer,
    trySwitchFriendDuelEnemy,
    trySwitchFriendDuelPlayerPet,
    buildFriendDuelEnemyFromPlayer
  };
}

module.exports = { createFriendDuelUtils };
