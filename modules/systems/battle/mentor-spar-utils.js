function createMentorSparUtils(deps = {}) {
  const {
    CORE,
    EVENTS,
    getAllPetSkillMoves = () => [],
    stableHashCode = (s = '') => {
      const text = String(s || '');
      let hash = 0;
      for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
      return Math.abs(hash);
    },
    normalizeNpcAlignTag = () => 'neutral',
    getPlayerStoryTurns = () => 0,
    MENTOR_BLOCKED_SECT_PATTERN = /(暗潮議會|暗黑組織|沙盜團|馬賊團|反派|Digital|混亂|滲透|刺客|盜匪)/iu,
    MENTOR_NEARBY_SCAN_LIMIT = 5,
    MENTOR_SPAR_COOLDOWN_TURNS = 4,
    CHOICE_DISPLAY_COUNT = 5
  } = deps;
  const { getChoiceTag } = require('../runtime/utils/global-language-resources');

  function ensureMentorSparRecord(player) {
    if (!player || typeof player !== 'object') return null;
    if (!player.mentorSparRecord || typeof player.mentorSparRecord !== 'object') {
      player.mentorSparRecord = {
        completedByMentor: {},
        completedOrder: [],
        totalCompleted: 0
      };
    }
    if (!player.mentorSparRecord.completedByMentor || typeof player.mentorSparRecord.completedByMentor !== 'object') {
      player.mentorSparRecord.completedByMentor = {};
    }
    if (!Array.isArray(player.mentorSparRecord.completedOrder)) {
      player.mentorSparRecord.completedOrder = [];
    }
    if (!Number.isFinite(Number(player.mentorSparRecord.totalCompleted))) {
      player.mentorSparRecord.totalCompleted = Object.keys(player.mentorSparRecord.completedByMentor).length;
    }
    return player.mentorSparRecord;
  }

  function getCompletedMentorIds(player) {
    const record = ensureMentorSparRecord(player);
    return record ? new Set(Object.keys(record.completedByMentor || {})) : new Set();
  }

  function hasMentorSparCompleted(player, mentorId = '') {
    const key = String(mentorId || '').trim();
    if (!key) return false;
    const record = ensureMentorSparRecord(player);
    return Boolean(record?.completedByMentor?.[key]);
  }

  function chooseMentorTeachTemplatesFromSeed(seed = '') {
    const seedText = String(seed || '').trim();
    if (/^mentor_/u.test(seedText)) {
      const pool = getAllPetSkillMoves()
        .filter((move) => Number(move?.tier || 1) >= 3)
        .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
      const picked = [];
      let idx = pool.length > 0 ? stableHashCode(seedText) % pool.length : 0;
      while (pool.length > 0 && picked.length < 3) {
        const move = pool[idx % pool.length];
        if (move?.name && !picked.includes(move.name)) picked.push(move.name);
        idx += 1;
        if (idx > pool.length * 3) break;
      }
      if (picked.length >= 3) return picked.slice(0, 3);
    }

    const masterPool = Array.isArray(EVENTS?.MASTERS) ? EVENTS.MASTERS : [];
    const chosenMaster = masterPool.length > 0
      ? masterPool[stableHashCode(seed) % masterPool.length]
      : null;
    const masterTeaches = Array.isArray(chosenMaster?.teaches) ? chosenMaster.teaches : [];
    if (masterTeaches.length > 0) return masterTeaches.slice(0, 3);

    const candidateMoves = getAllPetSkillMoves();
    if (candidateMoves.length === 0) return ['堡壘力場', '電漿盛放', '再生矩陣'];
    const sorted = [...candidateMoves].sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
    const picked = [];
    const seen = new Set();
    let idx = stableHashCode(seed || 'mentor_seed') % sorted.length;
    while (picked.length < 3 && seen.size < sorted.length) {
      const move = sorted[idx];
      const id = String(move?.id || '').trim();
      seen.add(id || `idx_${idx}`);
      if (move?.name && Number(move?.tier || 1) >= 2 && !picked.includes(move.name)) {
        picked.push(move.name);
      }
      idx = (idx + 1) % sorted.length;
    }
    if (picked.length < 3) {
      for (const move of sorted) {
        if (!move?.name || picked.includes(move.name)) continue;
        picked.push(move.name);
        if (picked.length >= 3) break;
      }
    }
    return picked.slice(0, 3);
  }

  function isEligibleNearbyMentorNpc(npc = null) {
    if (!npc || typeof npc !== 'object') return false;
    const align = normalizeNpcAlignTag(npc);
    if (align === 'evil') return false;
    const sect = String(npc.sect || npc.title || '').trim();
    if (MENTOR_BLOCKED_SECT_PATTERN.test(sect)) return false;
    return true;
  }

  function getNearbyMentorCandidatesForPlayer(player) {
    if (!player) return [];
    const location = String(player.location || '').trim();
    if (!location) return [];
    const ids = typeof CORE.getNearbyNpcIds === 'function'
      ? CORE.getNearbyNpcIds(location, MENTOR_NEARBY_SCAN_LIMIT)
      : [];
    if (!Array.isArray(ids) || ids.length === 0) return [];

    const completed = getCompletedMentorIds(player);
    const list = [];
    for (const npcId of ids) {
      const info = typeof CORE.getAgentFullInfo === 'function'
        ? CORE.getAgentFullInfo(npcId)
        : null;
      if (!info || !isEligibleNearbyMentorNpc(info)) continue;
      const mentorId = String(info.id || npcId || '').trim();
      if (!mentorId || completed.has(mentorId)) continue;
      if (typeof CORE.isNPCAlive === 'function' && !CORE.isNPCAlive(mentorId)) continue;
      list.push({
        id: mentorId,
        name: String(info.name || '導師').trim(),
        title: String(info.title || '在地導師').trim(),
        loc: String(info.loc || location).trim(),
        teaches: chooseMentorTeachTemplatesFromSeed(mentorId),
        mentorMaster: Boolean(info?.mentorMaster),
        power: Number(info?.stats?.戰力 || 0) + (info?.mentorMaster ? 120 : 0)
      });
    }

    return list.sort((a, b) => {
      if (Boolean(b.mentorMaster) !== Boolean(a.mentorMaster)) {
        return Boolean(b.mentorMaster) ? 1 : -1;
      }
      const p = Number(b.power || 0) - Number(a.power || 0);
      if (p !== 0) return p;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  function isMentorSparChoice(choice) {
    if (!choice || typeof choice !== 'object') return false;
    if (String(choice.action || '').trim() === 'mentor_spar') return true;
    const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
    if (/(友誼賽|切磋|拜師)/u.test(text)) return true;
    return /(名師|導師).*(比試|對戰|挑戰|請求)/u.test(text);
  }

  function buildMentorSparCooldownInfo(player) {
    const currentTurn = getPlayerStoryTurns(player);
    const lastTurn = Number(player?.lastMentorSparTurn || 0);
    const safeLastTurn = Number.isFinite(lastTurn) ? Math.max(0, Math.floor(lastTurn)) : 0;
    const nextReadyTurn = safeLastTurn > 0
      ? safeLastTurn + MENTOR_SPAR_COOLDOWN_TURNS
      : 0;
    const remaining = safeLastTurn > 0 ? Math.max(0, nextReadyTurn - currentTurn) : 0;
    return {
      currentTurn,
      lastTurn: safeLastTurn,
      nextReadyTurn,
      remaining,
      ready: remaining <= 0
    };
  }

  function buildMentorCooldownReplacementChoice(player, sourceChoice = null) {
    const location = String(player?.location || '附近據點');
    const source = sourceChoice && typeof sourceChoice === 'object' ? sourceChoice : {};
    const tag = String(source.tag || '').trim();
    if (/🤝|社交|交談/u.test(tag)) {
      return {
        action: 'social',
        tag: getChoiceTag('social', player?.language || 'zh-TW'),
        name: '整理導師筆記',
        choice: `在${location}整理剛獲得的導師筆記，向在地人確認實戰用法`,
        desc: '先把新知識消化後再挑戰更高難度'
      };
    }
    return {
      action: 'explore',
      tag: getChoiceTag('explore', player?.language || 'zh-TW'),
      name: '尋找可學對象',
      choice: `在${location}先整理線索並觀察周邊，等待合適導師現身`,
      desc: '附近沒有可切磋對象或仍在冷卻中，先做準備更穩妥'
    };
  }

  function assignNearbyMentorToChoice(player, choice, mentor = null) {
    const source = choice && typeof choice === 'object' ? { ...choice } : {};
    const picked = mentor || getNearbyMentorCandidatesForPlayer(player)[0] || null;
    if (!picked) return buildMentorCooldownReplacementChoice(player, source);
    source.action = 'mentor_spar';
    source.mentorId = picked.id;
    source.mentorName = picked.name;
    source.mentorLoc = picked.loc;
    source.mentorTitle = picked.title;
    source.tag = getChoiceTag('friendly_spar', player?.language || 'zh-TW');
    source.name = `向${picked.name}請求友誼賽`;
    source.choice = `向${picked.name}提出友誼賽請求，驗證你對戰術的掌握（會進入戰鬥）`;
    source.desc = `${picked.title}願意指導你；每位導師只可切磋一次`;
    return source;
  }

  function enforceMentorSparAvailability(player, choices = []) {
    const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
    if (!player || list.length === 0) return list;
    const cd = buildMentorSparCooldownInfo(player);
    const mentors = getNearbyMentorCandidatesForPlayer(player);
    const canSpar = cd.ready && mentors.length > 0;
    let assignCursor = 0;

    return list.map((choice) => {
      if (!isMentorSparChoice(choice)) return choice;
      if (!canSpar) return buildMentorCooldownReplacementChoice(player, choice);
      const mentor = mentors[assignCursor % mentors.length];
      assignCursor += 1;
      return assignNearbyMentorToChoice(player, choice, mentor);
    });
  }

  return {
    ensureMentorSparRecord,
    getCompletedMentorIds,
    hasMentorSparCompleted,
    chooseMentorTeachTemplatesFromSeed,
    isEligibleNearbyMentorNpc,
    getNearbyMentorCandidatesForPlayer,
    isMentorSparChoice,
    buildMentorSparCooldownInfo,
    buildMentorCooldownReplacementChoice,
    assignNearbyMentorToChoice,
    enforceMentorSparAvailability
  };
}

module.exports = { createMentorSparUtils };
