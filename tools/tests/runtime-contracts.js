const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');

function checkPetExports() {
  const PET = require(path.join(ROOT, 'modules', 'systems', 'pet', 'pet-system.js'));
  const required = [
    'loadPet',
    'getPetById',
    'getAllPetsByOwner',
    'savePet',
    'loadAllPets'
  ];
  for (const key of required) {
    assert.strictEqual(
      typeof PET[key],
      'function',
      `pet-system export missing/invalid: ${key}`
    );
  }
}

function checkCoreExports() {
  const CORE = require(path.join(ROOT, 'modules', 'core', 'game-core.js'));
  assert.strictEqual(
    typeof CORE.appendStoryContinuation,
    'function',
    'game-core export missing/invalid: appendStoryContinuation'
  );
}

function checkEventHandlerInjection() {
  const file = path.join(ROOT, 'modules', 'systems', 'runtime', 'init-game-feature-systems.js');
  const source = fs.readFileSync(file, 'utf8');
  const marker = 'const EVENT_HANDLER_UTILS = createEventHandlerUtils({';
  const start = source.indexOf(marker);
  assert(start >= 0, 'EVENT_HANDLER_UTILS wiring block not found');
  const end = source.indexOf('\n  });', start);
  assert(end > start, 'EVENT_HANDLER_UTILS wiring block end not found');
  const block = source.slice(start, end);
  assert(
    block.includes('getFactionPresenceHintForPlayer,'),
    'EVENT_HANDLER_UTILS missing getFactionPresenceHintForPlayer injection'
  );
  assert(
    block.includes('getPetElementDisplayName,'),
    'EVENT_HANDLER_UTILS missing getPetElementDisplayName injection'
  );
  assert(
    block.includes('openShopSession,'),
    'EVENT_HANDLER_UTILS missing openShopSession injection'
  );
  assert(
    block.includes('getMarketTypeLabel,'),
    'EVENT_HANDLER_UTILS missing getMarketTypeLabel injection'
  );
  assert(
    block.includes('format1,'),
    'EVENT_HANDLER_UTILS missing format1 injection'
  );
  assert(
    block.includes('formatBattleHpValue,'),
    'EVENT_HANDLER_UTILS missing formatBattleHpValue injection'
  );
  assert(
    block.includes('clearPendingConflictFollowup,'),
    'EVENT_HANDLER_UTILS missing clearPendingConflictFollowup injection'
  );
}

function checkPlayerPanelInjection() {
  const file = path.join(ROOT, 'modules', 'systems', 'runtime', 'init-game-feature-systems.js');
  const source = fs.readFileSync(file, 'utf8');
  const marker = 'const PLAYER_PANEL_UTILS = createPlayerPanelUtils({';
  const start = source.indexOf(marker);
  assert(start >= 0, 'PLAYER_PANEL_UTILS wiring block not found');
  const end = source.indexOf('\n  });', start);
  assert(end > start, 'PLAYER_PANEL_UTILS wiring block end not found');
  const block = source.slice(start, end);
  assert(
    block.includes('normalizePetMoveLoadout,'),
    'PLAYER_PANEL_UTILS missing normalizePetMoveLoadout injection'
  );
  assert(
    block.includes('describeMoveEffects,'),
    'PLAYER_PANEL_UTILS missing describeMoveEffects injection'
  );
  assert(
    block.includes('getPetAttackMoves,'),
    'PLAYER_PANEL_UTILS missing getPetAttackMoves injection'
  );
  assert(
    block.includes('getPetElementDisplayName,'),
    'PLAYER_PANEL_UTILS missing getPetElementDisplayName injection'
  );
  assert(
    block.includes('getPetElementColor,'),
    'PLAYER_PANEL_UTILS missing getPetElementColor injection'
  );
}

function checkEventHandlerDepsContract() {
  const file = path.join(ROOT, 'modules', 'content', 'event-handler-utils.js');
  const source = fs.readFileSync(file, 'utf8');
  const marker = 'const {';
  const start = source.indexOf(marker);
  assert(start >= 0, 'event-handler-utils deps destructuring not found');
  const end = source.indexOf('\n  } = deps;', start);
  assert(end > start, 'event-handler-utils deps destructuring end not found');
  const block = source.slice(start, end);
  assert(
    block.includes('getFactionPresenceHintForPlayer'),
    'event-handler-utils missing getFactionPresenceHintForPlayer dep'
  );
  assert(
    block.includes('getPetElementDisplayName'),
    'event-handler-utils missing getPetElementDisplayName dep'
  );
}

function checkMapNavigationInjection() {
  const file = path.join(ROOT, 'modules', 'systems', 'runtime', 'init-map-onboarding-runtime-utils.js');
  const source = fs.readFileSync(file, 'utf8');
  const marker = 'const MAP_NAVIGATION_UTILS = createMapNavigationUtils({';
  const start = source.indexOf(marker);
  assert(start >= 0, 'MAP_NAVIGATION_UTILS wiring block not found');
  const end = source.indexOf('\n  });', start);
  assert(end > start, 'MAP_NAVIGATION_UTILS wiring block end not found');
  const block = source.slice(start, end);
  assert(
    block.includes('getMapText,'),
    'MAP_NAVIGATION_UTILS missing getMapText injection'
  );
  assert(
    block.includes('getRegionLocationsByLocation,'),
    'MAP_NAVIGATION_UTILS missing getRegionLocationsByLocation injection'
  );
}

function checkRuntimeBaseDeps() {
  const file = path.join(ROOT, 'bot.js');
  const source = fs.readFileSync(file, 'utf8');
  const marker = 'const RUNTIME_BASE_DEPS = {';
  const start = source.indexOf(marker);
  assert(start >= 0, 'RUNTIME_BASE_DEPS block not found');
  const end = source.indexOf('\n};', start);
  assert(end > start, 'RUNTIME_BASE_DEPS block end not found');
  const block = source.slice(start, end);
  assert(
    block.includes('normalizePetMoveLoadout,'),
    'RUNTIME_BASE_DEPS missing normalizePetMoveLoadout'
  );
  assert(
    block.includes('describeMoveEffects,'),
    'RUNTIME_BASE_DEPS missing describeMoveEffects'
  );
  assert(
    block.includes('getPetAttackMoves,'),
    'RUNTIME_BASE_DEPS missing getPetAttackMoves'
  );
  assert(
    block.includes('showIslandMap,'),
    'RUNTIME_BASE_DEPS missing showIslandMap'
  );
  assert(
    block.includes('showPortalSelection,'),
    'RUNTIME_BASE_DEPS missing showPortalSelection'
  );
  assert(
    block.includes('showTeleportDeviceSelection,'),
    'RUNTIME_BASE_DEPS missing showTeleportDeviceSelection'
  );
  assert(
    block.includes('getMapText: (...args) => getMapText(...args),'),
    'RUNTIME_BASE_DEPS missing getMapText injection'
  );
  assert(
    block.includes('normalizeMapViewMode: (...args) => normalizeMapViewMode(...args),'),
    'RUNTIME_BASE_DEPS missing normalizeMapViewMode injection'
  );
  assert(
    block.includes('getRegionLocationsByLocation,'),
    'RUNTIME_BASE_DEPS missing getRegionLocationsByLocation'
  );
  assert(
    block.includes('consumeTeleportDevice,'),
    'RUNTIME_BASE_DEPS missing consumeTeleportDevice'
  );
  assert(
    block.includes('rememberPlayer: (...args) => rememberPlayer(...args),'),
    'RUNTIME_BASE_DEPS missing rememberPlayer injection'
  );
  assert(
    block.includes('getLocationProfile,'),
    'RUNTIME_BASE_DEPS missing getLocationProfile'
  );
}

function checkOnboardingRuntimeInjection() {
  const file = path.join(ROOT, 'modules', 'systems', 'runtime', 'init-game-feature-systems.js');
  const source = fs.readFileSync(file, 'utf8');
  const marker = 'const ONBOARDING_RUNTIME_FLOW_UTILS = createOnboardingRuntimeFlowUtils({';
  const start = source.indexOf(marker);
  assert(start >= 0, 'ONBOARDING_RUNTIME_FLOW_UTILS wiring block not found');
  const end = source.indexOf('\n  });', start);
  assert(end > start, 'ONBOARDING_RUNTIME_FLOW_UTILS wiring block end not found');
  const block = source.slice(start, end);
  assert(
    block.includes('getLocationProfile: deps.getLocationProfile,'),
    'ONBOARDING_RUNTIME_FLOW_UTILS missing getLocationProfile injection'
  );
}

function checkInteractionDispatcherDeps() {
  const file = path.join(ROOT, 'bot.js');
  const source = fs.readFileSync(file, 'utf8');
  const marker = 'const INTERACTION_DISPATCHER_DEPS = initInteractionDispatcherDeps({';
  const start = source.indexOf(marker);
  assert(start >= 0, 'INTERACTION_DISPATCHER_DEPS block not found');
  const end = source.indexOf('\n});', start);
  assert(end > start, 'INTERACTION_DISPATCHER_DEPS block end not found');
  const block = source.slice(start, end);
  assert(
    block.includes('startManualBattle,'),
    'INTERACTION_DISPATCHER_DEPS missing startManualBattle'
  );
  assert(
    block.includes('startManualBattleOnline,'),
    'INTERACTION_DISPATCHER_DEPS missing startManualBattleOnline'
  );
  assert(
    block.includes('startAutoBattle,'),
    'INTERACTION_DISPATCHER_DEPS missing startAutoBattle'
  );
  assert(
    block.includes('continueBattleWithHuman,'),
    'INTERACTION_DISPATCHER_DEPS missing continueBattleWithHuman'
  );
  assert(
    block.includes('handleFight,'),
    'INTERACTION_DISPATCHER_DEPS missing handleFight'
  );
  assert(
    block.includes('handleUseMove,'),
    'INTERACTION_DISPATCHER_DEPS missing handleUseMove'
  );
}

function checkBattleRuntimeDomainDeps() {
  const file = path.join(ROOT, 'bot.js');
  const source = fs.readFileSync(file, 'utf8');
  const marker = 'const BATTLE_RUNTIME_DOMAIN = initBattleRuntimeDomain({';
  const start = source.indexOf(marker);
  assert(start >= 0, 'BATTLE_RUNTIME_DOMAIN block not found');
  const end = source.indexOf('\n});', start);
  assert(end > start, 'BATTLE_RUNTIME_DOMAIN block end not found');
  const block = source.slice(start, end);
  assert(
    block.includes('appendStoryContinuation:'),
    'BATTLE_RUNTIME_DOMAIN missing appendStoryContinuation injection'
  );
  assert(
    block.includes('CORE.appendStoryContinuation'),
    'BATTLE_RUNTIME_DOMAIN appendStoryContinuation should reference CORE safely'
  );
}

function checkFriendOnlineTurnStateSync() {
  const file = path.join(ROOT, 'modules', 'systems', 'battle', 'friend-online-utils.js');
  const source = fs.readFileSync(file, 'utf8');
  const marker = 'async function resolveOnlineFriendDuelTurn(hostPlayer, options = {}) {';
  const start = source.indexOf(marker);
  assert(start >= 0, 'resolveOnlineFriendDuelTurn block not found');
  const end = source.indexOf('\n  function trimButtonLabel', start);
  assert(end > start, 'resolveOnlineFriendDuelTurn block end not found');
  const block = source.slice(start, end);
  assert(
    block.includes('hostPlayer.battleState.enemy = enemy;'),
    'resolveOnlineFriendDuelTurn missing enemy sync back to battleState'
  );
  assert(
    block.includes('hostPlayer.battleState.activePetId = String(combatant.id || \'\').trim() || hostPlayer.battleState.activePetId;'),
    'resolveOnlineFriendDuelTurn missing activePetId sync back to battleState'
  );
}

function main() {
  checkPetExports();
  checkCoreExports();
  checkEventHandlerInjection();
  checkEventHandlerDepsContract();
  checkPlayerPanelInjection();
  checkMapNavigationInjection();
  checkRuntimeBaseDeps();
  checkOnboardingRuntimeInjection();
  checkInteractionDispatcherDeps();
  checkBattleRuntimeDomainDeps();
  checkFriendOnlineTurnStateSync();
  console.log('OK runtime-contracts');
}

main();
