const { computeAlignmentProfileFromPlayer } = require('../../content/alignment-profile-utils');
const { capWantedLevel } = require('../../content/wanted-utils');

function createMentorCadenceUtils(deps = {}) {
  const {
    CORE,
    ensureMentorSparRecordCore,
    getCompletedMentorIdsCore,
    hasMentorSparCompletedCore,
    chooseMentorTeachTemplatesFromSeedCore,
    isEligibleNearbyMentorNpcCore,
    getNearbyMentorCandidatesForPlayerCore,
    isMentorSparChoiceCore,
    buildMentorSparCooldownInfoCore,
    buildMentorCooldownReplacementChoiceCore,
    assignNearbyMentorToChoiceCore,
    enforceMentorSparAvailabilityCore,
    getPlayerStoryTurns,
    WANTED_AMBUSH_MIN_LEVEL = 2,
    BATTLE_CADENCE_TURNS = 5
  } = deps;

  function stableHashCode(source = '') {
    const text = String(source || '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function normalizeNpcAlignTag(npc = null) {
    const alignRaw = String(npc?.align || '').trim().toLowerCase();
    if (alignRaw === 'evil' || alignRaw === 'villain' || alignRaw === 'bad') return 'evil';
    if (alignRaw === 'good' || alignRaw === 'hero') return 'good';
    if (alignRaw === 'neutral') return 'neutral';
    const identity = [npc?.sect || '', npc?.title || '', npc?.name || ''].join(' ');
    if (/(digital|暗潮|黑市|滲透|叛徒|賊|匪|殺手|刺客|掠奪|敵對)/iu.test(identity)) return 'evil';
    if (/(導師|守護|醫生|工程|巡察|主導|皇室|公會|守備|聯盟)/u.test(identity)) return 'good';
    return 'neutral';
  }

  function isNpcHostileByProfile(npc = null) {
    if (!npc || typeof npc !== 'object') return false;
    if (normalizeNpcAlignTag(npc) === 'evil') return true;
    const identity = [npc?.sect || '', npc?.title || '', npc?.name || ''].join(' ');
    return /(digital|暗潮|黑市|滲透|叛徒|賊|匪|殺手|刺客|掠奪)/iu.test(identity);
  }

  function getPlayerWantedPressure(player = null) {
    if (!player || typeof player !== 'object') return 0;
    const localWanted = Math.max(0, Number(player?.wanted || 0));
    const alignment = computeAlignmentProfileFromPlayer(player, String(player?.location || '').trim());
    const wantedFloor = Math.max(0, Number(alignment.wantedFloor || 0));
    const wantedBoost = Math.max(0, Number(alignment.wantedBoost || 0));
    const playerId = String(player?.id || '').trim();
    let worldWanted = 0;
    if (playerId && CORE && typeof CORE.getPlayerWantedLevel === 'function') {
      worldWanted = Math.max(0, Number(CORE.getPlayerWantedLevel(playerId) || 0));
    }
    return capWantedLevel(Math.max(localWanted, worldWanted, wantedFloor + wantedBoost));
  }

  function getWantedEscalationProfile(wantedLevel = 0) {
    const clamped = capWantedLevel(wantedLevel);
    const active = clamped >= WANTED_AMBUSH_MIN_LEVEL;
    if (!active) {
      return {
        active: false,
        level: clamped,
        ambushChance: 0,
        hunterCount: 0,
        enemyScale: 1
      };
    }
    const ambushChance = Math.max(0.26, Math.min(0.96, 0.24 + clamped * 0.12));
    const hunterCount = Math.max(1, Math.min(5, 1 + Math.floor(clamped / 2)));
    const enemyScale = Math.max(1, Math.min(1.7, 1 + clamped * 0.09));
    return {
      active: true,
      level: clamped,
      ambushChance,
      hunterCount,
      enemyScale
    };
  }

  function getBattleCadenceInfo(player = null) {
    const turns = getPlayerStoryTurns(player);
    const span = BATTLE_CADENCE_TURNS;
    const step = (turns % span) + 1;
    return {
      turns,
      span,
      step,
      nearConflict: step >= Math.max(2, span - 1),
      dueConflict: step === span
    };
  }

  function ensureMentorSparRecord(player) {
    return ensureMentorSparRecordCore(player);
  }

  function getCompletedMentorIds(player) {
    return getCompletedMentorIdsCore(player);
  }

  function hasMentorSparCompleted(player, mentorId = '') {
    return hasMentorSparCompletedCore(player, mentorId);
  }

  function chooseMentorTeachTemplatesFromSeed(seed = '') {
    return chooseMentorTeachTemplatesFromSeedCore(seed);
  }

  function isEligibleNearbyMentorNpc(npc = null) {
    return isEligibleNearbyMentorNpcCore(npc);
  }

  function getNearbyMentorCandidatesForPlayer(player) {
    return getNearbyMentorCandidatesForPlayerCore(player);
  }

  function isMentorSparChoice(choice) {
    return isMentorSparChoiceCore(choice);
  }

  function buildMentorSparCooldownInfo(player) {
    return buildMentorSparCooldownInfoCore(player);
  }

  function buildMentorCooldownReplacementChoice(player, sourceChoice = null) {
    return buildMentorCooldownReplacementChoiceCore(player, sourceChoice);
  }

  function assignNearbyMentorToChoice(player, choice, mentor = null) {
    return assignNearbyMentorToChoiceCore(player, choice, mentor);
  }

  function enforceMentorSparAvailability(player, choices = []) {
    return enforceMentorSparAvailabilityCore(player, choices);
  }

  return {
    stableHashCode,
    normalizeNpcAlignTag,
    isNpcHostileByProfile,
    getPlayerWantedPressure,
    getWantedEscalationProfile,
    getBattleCadenceInfo,
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

module.exports = {
  createMentorCadenceUtils
};
