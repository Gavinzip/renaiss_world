function createMapNavigationUtils(deps = {}) {
  const {
    getMapText = () => ({}),
    normalizeLangCode = (lang = 'zh-TW') => String(lang || 'zh-TW'),
    getPlayerUILang = () => 'zh-TW',
    getLocationProfile = () => null,
    getLocationPortalHub = (location = '') => String(location || '').trim(),
    getPortalDestinations = () => [],
    getConnectedLocations = () => [],
    findLocationPath = () => [],
    getRegionLocationsByLocation = () => [],
    isMainPortalHubLocation = () => false,
    getTeleportDeviceStockInfo = () => ({ count: 0, soonestRemainingMs: 0 }),
    formatTeleportDeviceRemaining = () => 'N/A',
    canFreeRoamCurrentRegion = () => false,
    ensureLocationArcState = () => ({ completedLocations: {} }),
    canEnterLocation = () => ({ allowed: true, winRate: 100 }),
    syncLocationArcLocation = () => {},
    ensurePlayerIslandState = () => {},
    pickWeightedKey = () => null,
    computeStoryThreatScore = () => 0,
    format1 = (v) => String(v ?? 0),
    shouldTriggerBattle = () => false,
    ISLAND_STORY = null,
    LOCATION_ENTRY_MIN_WINRATE = 50,
    STORY_THREAT_SCORE_THRESHOLD = 38,
    ROAM_MOVE_BASE_CHANCE = 0.42,
    ROAM_MOVE_EXPLORE_BONUS = 0.16,
    ROAM_MOVE_WANDER_BONUS = 0.2
  } = deps;

  const MISSION_REGION_PORTAL_HUB_ORDER = Object.freeze([
    ['central_core', '襄陽城'],
    ['west_desert', '敦煌'],
    ['southern_delta', '廣州'],
    ['northern_highland', '草原部落'],
    ['island_routes', '星潮港'],
    ['hidden_deeps', '光明頂']
  ]);

  function joinByLang(items = [], lang = 'zh-TW') {
    const list = Array.isArray(items) ? items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean) : [];
    if (list.length === 0) return '';
    return list.join(lang === 'en' || lang === 'ko' ? ', ' : '、');
  }

  function buildPortalUsageGuide(player, lang = '') {
    const uiLang = normalizeLangCode(lang || player?.language || 'zh-TW');
    const tx = getMapText(uiLang);
    const access = getPortalAccessContext(player);
    if (!access.crossRegionUnlocked) {
      return tx.mapPortalGuideLocked || tx.mapPortalGuide(tx.mapNoPortal);
    }
    const preview = access.destinations.length > 0
      ? joinByLang(access.destinations.slice(0, 3), uiLang)
      : tx.mapNoPortal;
    return tx.mapPortalGuide(preview);
  }

  function formatPortalDestinationDisplay(location = '', lang = '') {
    const uiLang = normalizeLangCode(lang || 'zh-TW');
    const name = String(location || '').trim();
    if (!name) return '';
    const profile = typeof getLocationProfile === 'function' ? getLocationProfile(name) : null;
    const region = String(profile?.region || '').trim();
    if (!region) return name;
    return uiLang === 'en' || uiLang === 'ko' ? `${name} (${region})` : `${name}（${region}）`;
  }

  function getRegionNameByLocation(location = '') {
    const profile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
    return String(profile?.region || '').trim();
  }

  function isDestinationCompleted(player, destination = '') {
    const loc = String(destination || '').trim();
    if (!loc || !player) return false;

    const islandState = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
      ? ISLAND_STORY.getIslandStoryState(player, loc)
      : null;
    if (Boolean(islandState?.completed)) return true;

    const completedLocations = player?.locationArcState?.completedLocations;
    if (completedLocations && typeof completedLocations === 'object' && !Array.isArray(completedLocations)) {
      if (Number(completedLocations[loc] || 0) > 0) return true;
    }

    const regionName = getRegionNameByLocation(loc);
    const regionState = player?.regionFreeRoam;
    if (regionName && regionState && typeof regionState === 'object' && !Array.isArray(regionState)) {
      if (Boolean(regionState[regionName])) return true;
    }

    return false;
  }

  function isRegionProgressCompleted(player, regionId = '', hub = '') {
    const rid = String(regionId || '').trim();
    const hubLoc = String(hub || '').trim();
    if (!rid) return false;

    const missionRegions = player?.mainStory?.mission?.regions;
    if (missionRegions && typeof missionRegions === 'object' && !Array.isArray(missionRegions)) {
      const row = missionRegions[rid];
      if (row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, 'keyFound')) {
        return Boolean(row.keyFound);
      }
    }

    const islandRow = hubLoc
      ? player?.islandStoryState?.[hubLoc]
      : null;
    if (islandRow && typeof islandRow === 'object') {
      return Boolean(islandRow.completed);
    }
    return false;
  }

  function resolvePortalProgressState(player, candidateHubs = []) {
    const allowed = new Set(
      (Array.isArray(candidateHubs) ? candidateHubs : [])
        .map((loc) => String(loc || '').trim())
        .filter(Boolean)
    );
    let highestCompletedIndex = -1;
    for (let i = 0; i < MISSION_REGION_PORTAL_HUB_ORDER.length; i += 1) {
      const [regionId, hub] = MISSION_REGION_PORTAL_HUB_ORDER[i];
      if (!regionId || !hub) break;
      if (!isRegionProgressCompleted(player, regionId, hub)) break;
      highestCompletedIndex = i;
    }

    const unlockedHubs = new Set();
    for (let i = 0; i <= highestCompletedIndex; i += 1) {
      const hub = String(MISSION_REGION_PORTAL_HUB_ORDER[i]?.[1] || '').trim();
      if (!hub) continue;
      unlockedHubs.add(hub);
    }

    const nextIndex = highestCompletedIndex + 1;
    let nextHub = '';
    if (nextIndex >= 0 && nextIndex < MISSION_REGION_PORTAL_HUB_ORDER.length) {
      nextHub = String(MISSION_REGION_PORTAL_HUB_ORDER[nextIndex]?.[1] || '').trim();
      if (nextHub) unlockedHubs.add(nextHub);
    }

    if (allowed.size > 0) {
      for (const hub of Array.from(unlockedHubs)) {
        if (!allowed.has(hub)) unlockedHubs.delete(hub);
      }
      if (nextHub && !allowed.has(nextHub)) nextHub = '';
    }

    return { unlockedHubs, nextHub };
  }

  function getPortalAccessContext(player) {
    const from = String(player?.location || '').trim();
    const atPortalHub = isMainPortalHubLocation(from);
    const rawDestinations = typeof getPortalDestinations === 'function'
      ? getPortalDestinations(from)
      : [];
    const cleaned = Array.isArray(rawDestinations)
      ? rawDestinations
        .map((loc) => String(loc || '').trim())
        .filter((loc) => loc && loc !== from)
      : [];
    const islandState = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
      ? ISLAND_STORY.getIslandStoryState(player, from)
      : null;
    const islandCompleted = Boolean(islandState?.completed);
    const regionUnlocked = canFreeRoamCurrentRegion(player);
    const portalProgress = resolvePortalProgressState(player, cleaned);
    const nextPortalHub = String(portalProgress?.nextHub || '').trim();
    const unlockedHubs = portalProgress?.unlockedHubs instanceof Set
      ? portalProgress.unlockedHubs
      : new Set();
    const hasAnyHistoricalPortalProgress = Boolean(
      unlockedHubs.size > 0
      || nextPortalHub
      || cleaned.some((loc) => isDestinationCompleted(player, loc))
    );
    const crossRegionUnlocked = Boolean(islandCompleted || regionUnlocked || hasAnyHistoricalPortalProgress);
    const destinationEntries = cleaned.map((loc) => {
      const completed = isDestinationCompleted(player, loc);
      const isNext = Boolean(nextPortalHub) && loc === nextPortalHub;
      const isUnlocked = Boolean(unlockedHubs.has(loc));
      const enabled = Boolean(crossRegionUnlocked && (isUnlocked || completed));
      const state = completed ? 'completed' : (isNext || isUnlocked ? 'next' : 'locked');
      return {
        location: loc,
        enabled,
        state
      };
    });
    const destinations = destinationEntries.filter((row) => row.enabled).map((row) => row.location);
    return {
      from,
      atPortalHub,
      islandCompleted,
      regionUnlocked,
      crossRegionUnlocked,
      nextPortalHub,
      destinationEntries: atPortalHub ? destinationEntries : [],
      destinations: atPortalHub && crossRegionUnlocked ? destinations : []
    };
  }

  function buildDeviceUsageGuide(player, lang = '') {
    const uiLang = normalizeLangCode(lang || player?.language || 'zh-TW');
    const tx = getMapText(uiLang);
    const info = getTeleportDeviceStockInfo(player);
    const allInRegion = typeof getRegionLocationsByLocation === 'function'
      ? getRegionLocationsByLocation(player?.location || '')
      : [];
    const preview = Array.isArray(allInRegion) && allInRegion.length > 0
      ? joinByLang(allInRegion.filter((loc) => String(loc || '').trim() !== String(player?.location || '').trim()).slice(0, 3), uiLang)
      : tx.mapNoCities;
    const ttlText = info.count > 0
      ? formatTeleportDeviceRemaining(info.soonestRemainingMs)
      : (uiLang === 'en' || uiLang === 'ko' ? 'N/A' : '無');
    return tx.mapDeviceGuide(preview || tx.mapNoCities, info.count, ttlText);
  }

  function hasRoamTravelIntentText(text = '') {
    return /(漫步|四處|探索|巡路|遠行|前進|離開|換個地點|別處|沿路|追查|趕往|前往|移動|轉往|繞行|穿越|傳送門|節點)/u.test(String(text || ''));
  }

  function hasConflictCueText(text = '') {
    return /(戰鬥|開打|殺手|刺客|獵手|伏擊|追兵|敵人|敵方|圍攻|對峙|攔截|夜襲|突襲|可疑人物|強制|壓制|控制可疑)/u.test(String(text || ''));
  }

  function isRoamEligibleAction(player, event, result) {
    const action = String(event?.action || '');
    const type = String(result?.type || '');
    const text = [event?.name || '', event?.choice || '', event?.desc || '', result?.message || ''].join(' ');
    const travelIntent = hasRoamTravelIntentText(text);
    const exploreLike = ['explore', 'travel', 'risk', 'surprise', 'hunt', 'forage'].includes(action) || ['explore', 'travel'].includes(type);
    if (!event || !result) return false;
    if (shouldTriggerBattle(event, result)) return false;
    if (['combat', 'travel', 'portal_ready', 'wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery', 'main_story'].includes(type)) {
      return false;
    }
    if (['teleport', 'portal_intent', 'wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery', 'mentor_spar', 'fight'].includes(action)) {
      return false;
    }
    if (hasConflictCueText(text)) return false;
    if (!travelIntent && !exploreLike) return false;
    const storyThreat = computeStoryThreatScore(player?.currentStory || '');
    if (!travelIntent && storyThreat >= Math.max(24, STORY_THREAT_SCORE_THRESHOLD - 6)) return false;
    return true;
  }

  function getRoamMoveChance(event, result) {
    let chance = ROAM_MOVE_BASE_CHANCE;
    const action = String(event?.action || '');
    const type = String(result?.type || '');
    const text = [event?.name || '', event?.choice || '', event?.desc || '', result?.message || ''].join(' ');
    const travelIntent = hasRoamTravelIntentText(text);
    if (action === 'explore' || type === 'explore') chance += ROAM_MOVE_EXPLORE_BONUS;
    if (travelIntent) {
      chance += ROAM_MOVE_WANDER_BONUS;
    } else {
      chance -= 0.12;
    }
    if (/傳送門|市集|商店|鑑價|許願池/u.test(text)) {
      chance += 0.08;
    }
    if (hasConflictCueText(text)) {
      chance = Math.min(chance, 0.06);
    }
    return Math.max(0, Math.min(0.92, chance));
  }

  function pickRoamDestination(player) {
    const from = String(player?.location || '');
    if (!from) return null;
    const rawCandidates = typeof getConnectedLocations === 'function'
      ? getConnectedLocations(from)
      : [];
    const candidates = Array.isArray(rawCandidates)
      ? rawCandidates.filter((loc) => loc && loc !== from)
      : [];
    if (candidates.length === 0) return null;

    const state = ensureLocationArcState(player);
    const completed = state?.completedLocations && typeof state.completedLocations === 'object'
      ? state.completedLocations
      : {};
    const weighted = candidates.map((loc) => {
      const profile = typeof getLocationProfile === 'function' ? getLocationProfile(loc) : null;
      const difficulty = Number(profile?.difficulty || 3);
      let weight = 1;
      if (!completed[loc]) weight += 0.9;
      if (difficulty <= 2) weight += 0.2;
      if (difficulty >= 4) weight -= 0.1;
      return [loc, Math.max(0.15, weight)];
    });
    return pickWeightedKey(weighted);
  }

  function maybeApplyRoamMovement(player, event, result, queueMemory) {
    if (!player || !event || !result) return null;
    const uiLang = getPlayerUILang(player);
    const tx = getMapText(uiLang);
    const fromLocation = String(player.location || '');
    const manualTarget = String(player.navigationTarget || '').trim();
    if (!manualTarget) return null;
    if (!isRoamEligibleAction(player, event, result)) return null;

    const islandState = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
      ? ISLAND_STORY.getIslandStoryState(player, fromLocation)
      : null;
    const islandCompleted = Boolean(islandState?.completed);
    if (!islandCompleted && !canFreeRoamCurrentRegion(player)) {
      player.navigationTarget = '';
      const lockedLine = tx.mapAutoTravelLocked(manualTarget);
      result.message = `${String(result.message || '').trim()}\n\n${lockedLine}`.trim();
      return null;
    }

    const targetLocation = manualTarget;
    if (!targetLocation || targetLocation === fromLocation) {
      player.navigationTarget = '';
      return null;
    }
    const fromProfile = typeof getLocationProfile === 'function' ? getLocationProfile(fromLocation) : null;
    const targetProfile = typeof getLocationProfile === 'function' ? getLocationProfile(targetLocation) : null;
    if (!fromProfile || !targetProfile || String(fromProfile.region || '') !== String(targetProfile.region || '')) {
      player.navigationTarget = '';
      const blockedLine = tx.mapAutoTravelCrossRegion;
      result.message = `${String(result.message || '').trim()}\n\n${blockedLine}`.trim();
      return null;
    }

    const routePath = typeof findLocationPath === 'function'
      ? findLocationPath(fromLocation, targetLocation)
      : [];
    if (!Array.isArray(routePath) || routePath.length < 2) {
      player.navigationTarget = '';
      const blockedLine = typeof tx.mapAutoTravelNoRoute === 'function'
        ? tx.mapAutoTravelNoRoute(targetLocation, fromLocation)
        : `🧭 你想前往 **${targetLocation}**，但從 **${fromLocation}** 找不到合法地圖路線。`;
      result.message = `${String(result.message || '').trim()}\n\n${blockedLine}`.trim();
      result.autoTravel = {
        fromLocation,
        targetLocation,
        blocked: true,
        reason: 'route_missing'
      };
      if (typeof queueMemory === 'function') {
        queueMemory({
          type: '移動',
          content: `嘗試探索前往${targetLocation}`,
          outcome: '受阻｜地圖路線不存在',
          importance: 1,
          tags: ['travel', 'wander', 'blocked', 'route_missing']
        });
      }
      return result.autoTravel;
    }

    const stepLocation = String(routePath[1] || '').trim();
    const entryGate = canEnterLocation(player, stepLocation);
    if (!entryGate.allowed) {
      player.navigationTarget = '';
      const blockedLine = tx.mapAutoTravelGateBlocked(stepLocation, fromLocation, entryGate.winRate);
      result.message = `${String(result.message || '').trim()}\n\n${blockedLine}`.trim();
      result.autoTravel = {
        fromLocation,
        targetLocation: stepLocation,
        finalTargetLocation: targetLocation,
        blocked: true,
        winRate: entryGate.winRate,
        reason: 'entry_gate'
      };
      if (typeof queueMemory === 'function') {
        queueMemory({
          type: '移動',
          content: stepLocation === targetLocation
            ? `嘗試探索前往${targetLocation}`
            : `嘗試沿地圖路線前往${targetLocation}（下一站：${stepLocation}）`,
          outcome: `受阻｜勝率 ${format1(entryGate.winRate)}%`,
          importance: 1,
          tags: ['travel', 'wander', 'blocked', 'entry_gate']
        });
      }
      return result.autoTravel;
    }

    player.location = stepLocation;
    syncLocationArcLocation(player);
    ensurePlayerIslandState(player);
    player.portalMenuOpen = false;
    const arrived = stepLocation === targetLocation;
    player.navigationTarget = arrived ? '' : targetLocation;

    const moveLine = arrived
      ? tx.mapAutoTravelMoved(fromLocation, targetLocation)
      : (typeof tx.mapAutoTravelMovedStep === 'function'
        ? tx.mapAutoTravelMovedStep(fromLocation, stepLocation, targetLocation)
        : `🧭 你依照地圖座標先從 **${fromLocation}** 推進到 **${stepLocation}**，繼續朝 **${targetLocation}** 前進。`);
    result.message = `${String(result.message || '').trim()}\n\n${moveLine}`.trim();
    result.autoTravel = {
      fromLocation,
      targetLocation: stepLocation,
      finalTargetLocation: targetLocation,
      reason: 'manual_navigation',
      arrived
    };

    if (typeof queueMemory === 'function') {
      queueMemory({
        type: '移動',
        content: arrived
          ? `依座標導航從${fromLocation}前往${targetLocation}`
          : `依座標導航先從${fromLocation}前往${stepLocation}`,
        outcome: arrived ? '區內自由探索移動' : `沿地圖路線前進（目標：${targetLocation}）`,
        importance: 2,
        tags: ['travel', 'navigation', 'map_move']
      });
    }

    return result.autoTravel;
  }

  function appendUniqueItem(arr, item, limit = 120) {
    if (!Array.isArray(arr) || !item) return;
    arr.unshift(item);
    if (arr.length > limit) arr.length = limit;
  }

  return {
    joinByLang,
    buildPortalUsageGuide,
    formatPortalDestinationDisplay,
    getPortalAccessContext,
    buildDeviceUsageGuide,
    hasRoamTravelIntentText,
    hasConflictCueText,
    isRoamEligibleAction,
    getRoamMoveChance,
    pickRoamDestination,
    maybeApplyRoamMovement,
    appendUniqueItem
  };
}

module.exports = { createMapNavigationUtils };
