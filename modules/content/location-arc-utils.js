function createLocationArcUtils(deps = {}) {
  const {
    ensurePlayerIslandState,
    getLocationProfile,
    ISLAND_STORY,
    LOCATION_ARC_COMPLETE_TURNS = 10,
    getPlayerStoryTurns,
    isPortalChoice,
    isWishPoolChoice,
    isMarketChoice
  } = deps;

  function ensureLocationStoryProgressEntry(state, location = '') {
    if (!state || typeof state !== 'object') return null;
    const loc = String(location || '').trim();
    if (!loc) return null;
    if (typeof state.storyProgressByLocation !== 'object' || Array.isArray(state.storyProgressByLocation)) {
      state.storyProgressByLocation = {};
    }
    const current = state.storyProgressByLocation[loc];
    if (!current || typeof current !== 'object') {
      state.storyProgressByLocation[loc] = {
        battleDone: false,
        battleCount: 0,
        lastBattleTurn: 0,
        lastBattleNpcId: '',
        lastBattleNpcName: ''
      };
    }
    const row = state.storyProgressByLocation[loc];
    if (typeof row.battleDone !== 'boolean') row.battleDone = false;
    if (!Number.isFinite(Number(row.battleCount))) row.battleCount = 0;
    if (!Number.isFinite(Number(row.lastBattleTurn))) row.lastBattleTurn = 0;
    row.lastBattleNpcId = String(row.lastBattleNpcId || '').trim();
    row.lastBattleNpcName = String(row.lastBattleNpcName || '').trim();
    return row;
  }

  function ensureLocationArcState(player) {
    if (!player || typeof player !== 'object') return null;
    ensurePlayerIslandState(player);
    if (!player.locationArcState || typeof player.locationArcState !== 'object') {
      player.locationArcState = {
        currentLocation: String(player.location || ''),
        turnsInLocation: 0,
        completedLocations: {},
        systemExposureByLocation: {},
        storyProgressByLocation: {}
      };
    }
    if (typeof player.locationArcState.completedLocations !== 'object' || Array.isArray(player.locationArcState.completedLocations)) {
      player.locationArcState.completedLocations = {};
    }
    if (typeof player.locationArcState.systemExposureByLocation !== 'object' || Array.isArray(player.locationArcState.systemExposureByLocation)) {
      player.locationArcState.systemExposureByLocation = {};
    }
    if (typeof player.locationArcState.storyProgressByLocation !== 'object' || Array.isArray(player.locationArcState.storyProgressByLocation)) {
      player.locationArcState.storyProgressByLocation = {};
    }
    if (!Number.isFinite(Number(player.locationArcState.turnsInLocation))) {
      player.locationArcState.turnsInLocation = 0;
    }
    if (typeof player.locationArcState.currentLocation !== 'string') {
      player.locationArcState.currentLocation = String(player.location || '');
    }
    const currentLoc = String(player.locationArcState.currentLocation || player.location || '');
    if (currentLoc) {
      ensureLocationStoryProgressEntry(player.locationArcState, currentLoc);
    }
    return player.locationArcState;
  }

  function ensureRegionFreeRoamState(player) {
    if (!player || typeof player !== 'object') return {};
    if (!player.regionFreeRoam || typeof player.regionFreeRoam !== 'object' || Array.isArray(player.regionFreeRoam)) {
      player.regionFreeRoam = {};
    }
    return player.regionFreeRoam;
  }

  function unlockRegionFreeRoamByLocation(player, location = '') {
    if (!player) return '';
    const profile = typeof getLocationProfile === 'function' ? getLocationProfile(String(location || player.location || '').trim()) : null;
    const regionName = String(profile?.region || '').trim();
    if (!regionName) return '';
    const state = ensureRegionFreeRoamState(player);
    state[regionName] = {
      unlockedAt: Date.now(),
      byLocation: String(location || player.location || '').trim()
    };
    return regionName;
  }

  function canFreeRoamCurrentRegion(player) {
    if (!player) return false;
    const profile = typeof getLocationProfile === 'function' ? getLocationProfile(String(player.location || '').trim()) : null;
    const regionName = String(profile?.region || '').trim();
    if (!regionName) return false;
    const state = ensureRegionFreeRoamState(player);
    return Boolean(state[regionName]);
  }

  function syncLocationArcLocation(player) {
    const state = ensureLocationArcState(player);
    if (!state) return null;
    const nowLocation = String(player?.location || '');
    if (state.currentLocation === nowLocation) {
      if (nowLocation && !state.systemExposureByLocation[nowLocation]) {
        state.systemExposureByLocation[nowLocation] = {
          portalShown: false,
          portalLastShownTurn: 0,
          wishPoolShown: false,
          marketShown: false
        };
      }
      if (nowLocation) {
        ensurePlayerIslandState(player);
        if (ISLAND_STORY && typeof ISLAND_STORY.ensureIslandStoryEntry === 'function') {
          ISLAND_STORY.ensureIslandStoryEntry(player, nowLocation);
        }
      }
      return state;
    }

    if (state.currentLocation && Number(state.turnsInLocation || 0) >= LOCATION_ARC_COMPLETE_TURNS) {
      const prev = String(state.currentLocation);
      const prevProgress = ensureLocationStoryProgressEntry(state, prev);
      if (ISLAND_STORY && typeof ISLAND_STORY.updateIslandStoryProgress === 'function') {
        ISLAND_STORY.updateIslandStoryProgress(player, {
          location: prev,
          turnsInLocation: Number(state.turnsInLocation || 0),
          targetTurns: LOCATION_ARC_COMPLETE_TURNS,
          battleDone: Boolean(prevProgress?.battleDone)
        });
      }
      const prevIslandState = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
        ? ISLAND_STORY.getIslandStoryState(player, prev)
        : null;
      if (prevIslandState?.completed) {
        state.completedLocations[prev] = Number(state.completedLocations[prev] || 0) + 1;
      }
    }

    state.currentLocation = nowLocation;
    state.turnsInLocation = 0;
    if (nowLocation && !state.systemExposureByLocation[nowLocation]) {
      state.systemExposureByLocation[nowLocation] = {
        portalShown: false,
        portalLastShownTurn: 0,
        wishPoolShown: false,
        marketShown: false
      };
    }
    if (nowLocation) {
      ensureLocationStoryProgressEntry(state, nowLocation);
      ensurePlayerIslandState(player);
      if (ISLAND_STORY && typeof ISLAND_STORY.ensureIslandStoryEntry === 'function') {
        ISLAND_STORY.ensureIslandStoryEntry(player, nowLocation);
      }
    }
    return state;
  }

  function incrementLocationArcTurns(player, amount = 1) {
    const state = syncLocationArcLocation(player);
    if (!state) return 0;
    state.turnsInLocation = Math.max(0, Number(state.turnsInLocation || 0) + Math.max(0, Number(amount) || 0));
    return state.turnsInLocation;
  }

  function getCurrentLocationExposure(player) {
    const state = syncLocationArcLocation(player);
    if (!state) return null;
    const currentLocation = String(state.currentLocation || player?.location || '');
    if (!currentLocation) return null;
    if (!state.systemExposureByLocation[currentLocation] || typeof state.systemExposureByLocation[currentLocation] !== 'object') {
      state.systemExposureByLocation[currentLocation] = {
        portalShown: false,
        portalLastShownTurn: 0,
        wishPoolShown: false,
        marketShown: false
      };
    }
    if (!Number.isFinite(Number(state.systemExposureByLocation[currentLocation].portalLastShownTurn))) {
      state.systemExposureByLocation[currentLocation].portalLastShownTurn = 0;
    }
    return state.systemExposureByLocation[currentLocation];
  }

  function getCurrentLocationStoryProgress(player) {
    const state = syncLocationArcLocation(player);
    if (!state) return null;
    const currentLocation = String(state.currentLocation || player?.location || '').trim();
    if (!currentLocation) return null;
    return ensureLocationStoryProgressEntry(state, currentLocation);
  }

  function hasCurrentLocationStoryBattleDone(player) {
    const progress = getCurrentLocationStoryProgress(player);
    return Boolean(progress?.battleDone);
  }

  function markCurrentLocationStoryBattleDone(player, payload = {}) {
    if (!player) return;
    const progress = getCurrentLocationStoryProgress(player);
    if (!progress) return;
    progress.battleDone = true;
    progress.battleCount = Math.max(0, Number(progress.battleCount || 0)) + 1;
    progress.lastBattleTurn = getPlayerStoryTurns(player);
    progress.lastBattleNpcId = String(payload.npcId || payload.enemyId || progress.lastBattleNpcId || '').trim();
    progress.lastBattleNpcName = String(payload.npcName || payload.enemyName || progress.lastBattleNpcName || '').trim();
  }

  function markSystemChoiceExposure(player, choices = []) {
    if (!player) return;
    const exposure = getCurrentLocationExposure(player);
    if (!exposure) return;
    const list = Array.isArray(choices) ? choices : [];
    if (list.some(isPortalChoice)) exposure.portalShown = true;
    if (list.some(isWishPoolChoice)) exposure.wishPoolShown = true;
    if (list.some(isMarketChoice)) exposure.marketShown = true;
  }

  return {
    ensureLocationStoryProgressEntry,
    ensureLocationArcState,
    ensureRegionFreeRoamState,
    unlockRegionFreeRoamByLocation,
    canFreeRoamCurrentRegion,
    syncLocationArcLocation,
    incrementLocationArcTurns,
    getCurrentLocationExposure,
    getCurrentLocationStoryProgress,
    hasCurrentLocationStoryBattleDone,
    markCurrentLocationStoryBattleDone,
    markSystemChoiceExposure
  };
}

module.exports = { createLocationArcUtils };
