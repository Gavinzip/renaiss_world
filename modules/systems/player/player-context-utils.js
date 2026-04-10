function createPlayerContextUtils(deps = {}) {
  const {
    CORE,
    MAIN_STORY,
    DIGITAL_MASK_TURNS = 12
  } = deps;

  function getFactionPresenceHintForPlayer(player) {
    if (!player?.location || typeof CORE.getFactionPresenceForLocation !== 'function') return '';
    const status = CORE.getFactionPresenceForLocation(player.location);
    const mainStoryState = typeof MAIN_STORY.ensureMainStoryState === 'function'
      ? MAIN_STORY.ensureMainStoryState(player)
      : null;
    const revealRivalName = Number(mainStoryState?.act || 1) >= 5;
    const hints = [];
    if (status?.orderHere) hints.push('正派巡行隊在此活動');
    if (status?.chaosHere) hints.push(revealRivalName ? 'Digital 斥候在此活動' : '不明斥候在此活動');
    if (hints.length === 0) return '目前無明確勢力目擊';
    return hints.join('；');
  }

  function isDigitalMaskPhaseForPlayer(player) {
    if (!player) return false;
    const mainStoryState = typeof MAIN_STORY.ensureMainStoryState === 'function'
      ? MAIN_STORY.ensureMainStoryState(player)
      : null;
    const act = Number(mainStoryState?.act || 1);
    return Number(player?.storyTurns || 0) <= DIGITAL_MASK_TURNS && act < 5;
  }

  function getBattleFighterType(player, pet) {
    if (player?.battleState?.fighter === 'player') return 'player';
    return CORE.canPetFight(pet) ? 'pet' : 'player';
  }

  return {
    getFactionPresenceHintForPlayer,
    isDigitalMaskPhaseForPlayer,
    getBattleFighterType
  };
}

module.exports = {
  createPlayerContextUtils
};

