function createChoiceContextUtils(deps = {}) {
  const {
    getLocationProfile,
    getPortalDestinations,
    textIncludesAnyKeyword,
    buildLocationFeatureTextForChoiceScoring,
    getNearbyMentorCandidatesForPlayer,
    extractStoryEndingFocus,
    syncLocationArcLocation,
    hasMainStoryTravelGateCue,
    hasPortalTransitionCue,
    hasMarketNarrativeCue,
    computeStoryThreatScore,
    hasRoamTravelIntentText,
    getPlayerStoryTurns,
    getRecentChoiceHistory,
    getChoiceRiskCategory,
    isPortalChoice,
    isWishPoolChoice,
    isMarketChoice,
    isImmediateBattleChoice,
    normalizeChoiceFingerprintText,
    computeChoiceSimilarityByTokens,
    STORY_THREAT_SCORE_THRESHOLD = 38,
    LOCATION_ARC_COMPLETE_TURNS = 10,
    CHOICE_REPEAT_ACTION_COOLDOWN_TURNS = 3,
    CHOICE_REPEAT_SIMILARITY_THRESHOLD = 0.72
  } = deps;

  function getNearbySystemAvailabilityForChoiceScoring(location = '', player = null) {
    const featureText = buildLocationFeatureTextForChoiceScoring(location);
    const profile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
    const portalNodeDegree = typeof getPortalDestinations === 'function'
      ? getPortalDestinations(location).length
      : 0;
    const nearPortal = portalNodeDegree >= 1;
    const nearWishPool = textIncludesAnyKeyword(featureText, [
      '祭壇', '古祭', '靈泉', '神殿', '祈願', '祈福', '仙島', '巫', '石碑', '湖', '泉', '神龕', '祈', '塔', '雲橋'
    ]) || Number(profile?.difficulty || 3) <= 2;
    const nearMarket = textIncludesAnyKeyword(featureText, [
      '市集', '巴扎', '交易', '拍賣', '商隊', '商都', '商港', '碼頭', '港', '驛站', '公會', '商店'
    ]) || Number(profile?.difficulty || 3) <= 3;
    const nearMentorByMap = textIncludesAnyKeyword(featureText, [
      '工坊', '研究', '學院', '訓練', '巡察', '指揮', '守備', '哨站', '茶師'
    ]) || Number(profile?.difficulty || 3) <= 3;
    const nearMentorByNpc = player ? getNearbyMentorCandidatesForPlayer(player).length > 0 : false;
    const nearMentor = nearMentorByNpc || nearMentorByMap;
    return { nearPortal, nearWishPool, nearMarket, nearMentor };
  }

  function buildChoiceContextSignals(player = null) {
    const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
    const previousAction = String(player?.generationState?.sourceChoice || '').trim();
    const endingFocus = extractStoryEndingFocus(storyText);
    const state = player ? syncLocationArcLocation(player) : null;
    const turnsInLocation = Number(state?.turnsInLocation || 0);
    const nearCompletion = turnsInLocation >= Math.max(2, LOCATION_ARC_COMPLETE_TURNS - 1);
    const travelGateCue = hasMainStoryTravelGateCue(storyText);
    const portalCue = hasPortalTransitionCue(storyText);
    const marketCue = hasMarketNarrativeCue(storyText);
    const wishCue = /(許願|願望|祈願|祈福|祭壇|願池)/u.test(storyText);
    const mentorCue = /(導師|名師|友誼賽|切磋|指導|拜師)/u.test(storyText);
    const threatScore = computeStoryThreatScore(storyText);
    const travelIntent = hasRoamTravelIntentText([endingFocus, previousAction].filter(Boolean).join(' '));
    const location = String(player?.location || '');
    const currentTurn = getPlayerStoryTurns(player);
    const recentChoices = getRecentChoiceHistory(player, 10);
    const nearby = getNearbySystemAvailabilityForChoiceScoring(location, player);
    return {
      storyText,
      endingFocus,
      previousAction,
      currentTurn,
      location,
      recentChoices,
      turnsInLocation,
      nearCompletion,
      travelGateCue,
      portalCue,
      marketCue,
      wishCue,
      mentorCue,
      threatScore,
      travelIntent,
      ...nearby
    };
  }

  function computeChoiceContinuityScore(choice, signals = {}) {
    const text = [choice?.name || '', choice?.choice || '', choice?.desc || '', choice?.tag || ''].join(' ');
    const action = String(choice?.action || '');
    const category = getChoiceRiskCategory(choice);
    let score = 10;

    if (isPortalChoice(choice)) {
      if (signals.portalCue || signals.travelGateCue || signals.nearCompletion) score += 70;
      if (signals.nearPortal) score += 24;
      if (!signals.nearPortal && !signals.portalCue && !signals.travelGateCue) score -= 30;
    }

    if (isWishPoolChoice(choice)) {
      if (signals.wishCue || signals.nearWishPool) score += 48;
      else score -= 18;
    }

    if (isMarketChoice(choice) || action === 'scratch_lottery') {
      if (signals.marketCue || signals.nearMarket) score += 46;
      else score -= 20;
    }

    if (action === 'mentor_spar') {
      if (signals.mentorCue || signals.nearMentor) score += 42;
      else score -= 18;
    }

    if (isImmediateBattleChoice(choice)) {
      if (signals.threatScore >= STORY_THREAT_SCORE_THRESHOLD) score += 30;
      else score -= 24;
    } else if (category === 'social' || category === 'explore') {
      score += 8;
    }

    if (hasRoamTravelIntentText(text) && (signals.travelIntent || signals.nearCompletion || signals.travelGateCue)) {
      score += 22;
    }

    const prev = String(signals.previousAction || '');
    if (prev && text && (text.includes(prev.slice(0, Math.min(12, prev.length))) || prev.includes(String(choice?.name || '')))) {
      score += 26;
    }

    if (signals.endingFocus && textIncludesAnyKeyword(text, ['線索', '來源', '傳送門', '節點', '商人', '攤位', '封存艙', '檢測'])) {
      score += 8;
    }

    const recentChoices = Array.isArray(signals.recentChoices) ? signals.recentChoices : [];
    if (recentChoices.length > 0) {
      const currentFingerprintText = normalizeChoiceFingerprintText(text);
      const currentLocation = String(signals.location || '').trim();
      const currentTurn = Number(signals.currentTurn || 0);
      let maxSim = 0;
      for (const recent of recentChoices) {
        const recentText = normalizeChoiceFingerprintText(recent.choice || '');
        const sim = computeChoiceSimilarityByTokens(currentFingerprintText, recentText);
        if (sim > maxSim) maxSim = sim;
        const sameAction = action && String(recent.action || '') === action;
        const sameLocation = !currentLocation || !recent.location || String(recent.location) === currentLocation;
        const turnGap = Math.max(0, currentTurn - Number(recent.turn || 0));
        if (sameAction && sameLocation && turnGap <= CHOICE_REPEAT_ACTION_COOLDOWN_TURNS) {
          score -= 42;
        }
      }
      if (maxSim >= CHOICE_REPEAT_SIMILARITY_THRESHOLD) score -= 70;
      else if (maxSim >= CHOICE_REPEAT_SIMILARITY_THRESHOLD - 0.12) score -= 40;
    }

    return score;
  }

  return {
    getNearbySystemAvailabilityForChoiceScoring,
    buildChoiceContextSignals,
    computeChoiceContinuityScore
  };
}

module.exports = { createChoiceContextUtils };
