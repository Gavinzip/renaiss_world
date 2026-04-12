function createMentorResultBuilderUtils(deps = {}) {
  const {
    CORE,
    PET,
    getAllPetSkillMoves = () => [],
    getNearbyMentorCandidatesForPlayer = () => [],
    hasMentorSparCompleted = () => false,
    isEligibleNearbyMentorNpc = () => false,
    chooseMentorTeachTemplatesFromSeed = () => [],
    chooseRandomUnique = (list = [], count = 1) => (Array.isArray(list) ? list.slice(0, count) : []),
    getLocationDifficultyForPlayer = () => 0,
    MENTOR_SPAR_WIN_HP_RATIO = 0.35,
    HUMAN_COMBAT_MOVE = {}
  } = deps;

  let moveTemplateByName = null;

  function cloneMoveTemplateForBattle(move = {}) {
    return {
      ...move,
      effect: { ...(move?.effect || {}) }
    };
  }

  function buildMoveTemplateByNameMap() {
    const list = [
      ...getAllPetSkillMoves(),
      ...(Array.isArray(PET?.INITIAL_MOVES) ? PET.INITIAL_MOVES : [])
    ];
    const map = new Map();
    for (const move of list) {
      const key = String(move?.name || '').trim();
      if (!key || map.has(key)) continue;
      map.set(key, move);
    }
    return map;
  }

  function getMoveTemplateByNameMap() {
    if (!moveTemplateByName) {
      moveTemplateByName = buildMoveTemplateByNameMap();
    }
    return moveTemplateByName;
  }

  function getMentorCandidatesForPlayer(player, event = null) {
    const nearby = getNearbyMentorCandidatesForPlayer(player);
    if (nearby.length === 0) return [];
    const requestedMentorId = String(event?.mentorId || event?.mentorSpar?.mentorId || '').trim();
    if (!requestedMentorId) return nearby;
    const preferred = nearby.find((row) => String(row?.id || '').trim() === requestedMentorId);
    if (!preferred) return nearby;
    return [preferred, ...nearby.filter((row) => String(row?.id || '').trim() !== requestedMentorId)];
  }

  function resolveMentorCandidateForEvent(event, player) {
    const requestedMentorId = String(event?.mentorId || event?.mentorSpar?.mentorId || '').trim();
    if (requestedMentorId) {
      const info = typeof CORE.getAgentFullInfo === 'function'
        ? CORE.getAgentFullInfo(requestedMentorId)
        : null;
      const sameLocation = String(info?.loc || '').trim() === String(player?.location || '').trim();
      const completed = hasMentorSparCompleted(player, requestedMentorId);
      if (info && sameLocation && !completed && isEligibleNearbyMentorNpc(info)) {
        if (typeof CORE.isNPCAlive !== 'function' || CORE.isNPCAlive(requestedMentorId)) {
          return {
            id: requestedMentorId,
            name: String(info.name || '導師').trim(),
            title: String(info.title || '在地導師').trim(),
            loc: String(info.loc || player?.location || '').trim(),
            teaches: chooseMentorTeachTemplatesFromSeed(requestedMentorId),
            power: Number(info?.stats?.戰力 || 0)
          };
        }
      }
    }
    const candidates = getMentorCandidatesForPlayer(player, event);
    if (candidates.length <= 0) return null;
    return candidates[0];
  }

  function chooseMentorTeachMoves(mentor, pet) {
    const teaches = Array.isArray(mentor?.teaches) ? mentor.teaches : [];
    const templateMap = getMoveTemplateByNameMap();
    const templates = teaches
      .map((name) => templateMap.get(String(name || '').trim()))
      .filter(Boolean)
      .map((move) => cloneMoveTemplateForBattle(move));
    if (templates.length === 0) {
      const fallbackPool = getAllPetSkillMoves()
        .filter((m) => Number(m?.tier || 1) >= 2);
      const picked = chooseRandomUnique(fallbackPool, 3).map((m) => cloneMoveTemplateForBattle(m));
      return picked;
    }
    const known = new Set((pet?.moves || []).map((m) => String(m?.id || '').trim()).filter(Boolean));
    const unlearned = templates.filter((m) => !known.has(String(m?.id || '').trim()));
    const dedup = [];
    const seen = new Set();
    for (const move of [...unlearned, ...templates]) {
      const id = String(move?.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      dedup.push(move);
      if (dedup.length >= 3) break;
    }
    return dedup;
  }

  function buildMentorSparResult(event, player, pet) {
    const mentor = resolveMentorCandidateForEvent(event, player);
    if (!mentor) {
      return {
        type: 'social',
        isMentorSpar: false,
        mentorUnavailable: true,
        message: `你在${player?.location || '附近'}暫時沒找到可切磋的在地導師。\n先觀察周邊 NPC 動向，等導師現身再提出友誼賽。`
      };
    }

    const teachMoves = chooseMentorTeachMoves(mentor, pet);
    const difficulty = getLocationDifficultyForPlayer(player);
    const petMaxHp = Math.max(80, Number(pet?.maxHp || 100));
    const petAtk = Math.max(12, Number(pet?.attack || 20));
    const enemyMaxHp = Math.max(95, Math.floor(petMaxHp * (1.12 + difficulty * 0.04)));
    const enemyAttack = Math.max(14, Math.floor(petAtk * (0.9 + difficulty * 0.04)));
    const enemyDefense = 0;
    const acceptHpThreshold = Math.max(1, Math.floor(enemyMaxHp * MENTOR_SPAR_WIN_HP_RATIO));
    const ratioPercent = Math.round(MENTOR_SPAR_WIN_HP_RATIO * 100);
    const mentorName = String(mentor?.name || '導師');
    const mentorTitle = String(mentor?.title || '在地導師');
    const mentorLoc = String(mentor?.loc || player?.location || '').trim();

    const fallbackMoves = teachMoves.length > 0
      ? teachMoves
      : [cloneMoveTemplateForBattle(HUMAN_COMBAT_MOVE)];

    return {
      type: 'combat',
      isMentorSpar: true,
      message:
        `你在${mentorLoc || player?.location || '附近'}遇見 **${mentorName}（${mentorTitle}）**，對方接受你的請求，提出一場友誼賽。\n` +
        `規則：將導師壓到 **${ratioPercent}% HP 以下** 即視為通過考驗；若你方寵物被打到 0，導師會當場治療回滿。`,
      enemy: {
        id: `mentor_${String(mentor?.id || 'unknown')}`,
        name: mentorName,
        hp: enemyMaxHp,
        maxHp: enemyMaxHp,
        attack: enemyAttack,
        defense: enemyDefense,
        moves: fallbackMoves,
        reward: { gold: [0, 0] },
        isMonster: false,
        companionPet: false,
        nonLethal: true
      },
      mentorSpar: {
        mentorId: String(mentor?.id || 'unknown'),
        mentorName,
        mentorTitle,
        mentorLoc,
        teachMoveIds: fallbackMoves.map((m) => String(m?.id || '').trim()).filter(Boolean),
        teachMoveNames: fallbackMoves.map((m) => String(m?.name || '').trim()).filter(Boolean),
        acceptHpThreshold,
        acceptHpRatio: MENTOR_SPAR_WIN_HP_RATIO,
        ratioPercent
      }
    };
  }

  return {
    cloneMoveTemplateForBattle,
    buildMoveTemplateByNameMap,
    getMentorCandidatesForPlayer,
    resolveMentorCandidateForEvent,
    chooseMentorTeachMoves,
    buildMentorSparResult
  };
}

module.exports = {
  createMentorResultBuilderUtils
};
