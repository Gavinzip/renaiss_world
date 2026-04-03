/**
 * 🧭 Island Story State Manager
 * 管理每個地點（島）劇情階段、完成狀態與地點解鎖
 */

const { getLocationStoryMetadata, getLocationPortalHub, MAP_LOCATIONS } = require('./world-map');

const DEFAULT_STAGE_COUNT = Math.max(3, Number(process.env.ISLAND_STORY_STAGE_COUNT || 3));

function normalizeLocation(location = '') {
  return String(location || '').trim();
}

function ensureUnlockedLocations(player) {
  if (!player || typeof player !== 'object') return [];
  if (!Array.isArray(player.unlockedLocations)) {
    player.unlockedLocations = [];
  }
  const uniq = [];
  const seen = new Set();
  for (const loc of player.unlockedLocations) {
    const name = normalizeLocation(loc);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    uniq.push(name);
  }
  player.unlockedLocations = uniq;
  return player.unlockedLocations;
}

function unlockLocation(player, location = '') {
  if (!player || typeof player !== 'object') return false;
  const loc = normalizeLocation(location || player.location || player.spawnLocation || '');
  if (!loc) return false;
  const list = ensureUnlockedLocations(player);
  if (list.includes(loc)) return false;
  list.push(loc);
  return true;
}

function isLocationUnlocked(player, location = '') {
  const loc = normalizeLocation(location);
  if (!loc) return false;
  const list = ensureUnlockedLocations(player);
  return list.includes(loc);
}

function getUnlockedLocations(player) {
  const list = ensureUnlockedLocations(player);
  return [...list];
}

function ensureIslandStoryState(player) {
  if (!player || typeof player !== 'object') return {};
  if (!player.islandStoryState || typeof player.islandStoryState !== 'object' || Array.isArray(player.islandStoryState)) {
    player.islandStoryState = {};
  }
  const state = player.islandStoryState;
  for (const key of Object.keys(state)) {
    const loc = normalizeLocation(key);
    if (!loc || loc !== key) {
      delete state[key];
      continue;
    }
    const meta = getLocationStoryMetadata(loc);
    const stageCount = Math.max(1, Number(meta?.stageCount || DEFAULT_STAGE_COUNT));
    const row = state[loc];
    if (!row || typeof row !== 'object') {
      state[loc] = {
        stage: 0,
        stageCount,
        completed: false,
        completedAt: 0,
        lastUpdatedAt: Date.now()
      };
      continue;
    }
    if (!Number.isFinite(Number(row.stage))) row.stage = 0;
    if (!Number.isFinite(Number(row.stageCount)) || Number(row.stageCount) <= 0) row.stageCount = stageCount;
    if (typeof row.completed !== 'boolean') row.completed = false;
    if (!Number.isFinite(Number(row.completedAt))) row.completedAt = 0;
    if (!Number.isFinite(Number(row.lastUpdatedAt))) row.lastUpdatedAt = Date.now();
  }
  return state;
}

function ensureIslandStoryEntry(player, location = '') {
  if (!player || typeof player !== 'object') return null;
  const loc = normalizeLocation(location || player.location || '');
  if (!loc) return null;
  const state = ensureIslandStoryState(player);
  const meta = getLocationStoryMetadata(loc);
  const stageCount = Math.max(1, Number(meta?.stageCount || DEFAULT_STAGE_COUNT));
  if (!state[loc] || typeof state[loc] !== 'object') {
    state[loc] = {
      stage: 0,
      stageCount,
      completed: false,
      completedAt: 0,
      lastUpdatedAt: Date.now()
    };
  }
  const row = state[loc];
  if (!Number.isFinite(Number(row.stage))) row.stage = 0;
  if (!Number.isFinite(Number(row.stageCount)) || Number(row.stageCount) <= 0) {
    row.stageCount = stageCount;
  }
  if (typeof row.completed !== 'boolean') row.completed = false;
  if (!Number.isFinite(Number(row.completedAt))) row.completedAt = 0;
  if (!Number.isFinite(Number(row.lastUpdatedAt))) row.lastUpdatedAt = Date.now();
  return row;
}

function getIslandStoryState(player, location = '') {
  const entry = ensureIslandStoryEntry(player, location || player?.location || '');
  if (!entry) return null;
  return { ...entry };
}

function countCompletedIslands(player) {
  const state = ensureIslandStoryState(player);
  let total = 0;
  for (const loc of Object.keys(state)) {
    if (state[loc]?.completed) total += 1;
  }
  return total;
}

function calculateStageByTurns(turnsInLocation = 0, targetTurns = 6, stageCount = DEFAULT_STAGE_COUNT) {
  const safeTurns = Math.max(0, Number(turnsInLocation || 0));
  const safeTarget = Math.max(1, Number(targetTurns || 6));
  const safeStageCount = Math.max(1, Number(stageCount || DEFAULT_STAGE_COUNT));
  if (safeTurns <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, safeTurns / safeTarget));
  const raw = Math.ceil(ratio * safeStageCount);
  return Math.max(1, Math.min(safeStageCount, raw));
}

function updateIslandStoryProgress(player, options = {}) {
  if (!player || typeof player !== 'object') return null;
  const location = normalizeLocation(options.location || player.location || '');
  if (!location) return null;
  const entry = ensureIslandStoryEntry(player, location);
  if (!entry) return null;
  const meta = getLocationStoryMetadata(location);
  const stageCount = Math.max(1, Number(meta?.stageCount || entry.stageCount || DEFAULT_STAGE_COUNT));
  entry.stageCount = stageCount;

  const turnsInLocation = Math.max(0, Number(options.turnsInLocation || 0));
  const targetTurns = Math.max(1, Number(options.targetTurns || 6));
  const battleDone = Boolean(options.battleDone);
  const nextStage = calculateStageByTurns(turnsInLocation, targetTurns, stageCount);
  entry.stage = Math.max(entry.stage, nextStage);

  if (!entry.completed && battleDone && turnsInLocation >= targetTurns) {
    entry.completed = true;
    entry.stage = stageCount;
    entry.completedAt = Date.now();
  }
  entry.lastUpdatedAt = Date.now();
  return { ...entry };
}

function getNextPrimaryLocation(location = '') {
  const meta = getLocationStoryMetadata(location);
  return normalizeLocation(meta?.nextPrimary || '');
}

function buildIslandGuidancePrompt(player, location = '') {
  const loc = normalizeLocation(location || player?.location || '');
  if (!loc) return '';
  const meta = getLocationStoryMetadata(loc) || {};
  const state = ensureIslandStoryEntry(player, loc);
  if (!state) return '';
  if (state.completed) return '';

  const stage = Math.max(0, Number(state.stage || 0));
  const stageCount = Math.max(1, Number(state.stageCount || meta.stageCount || DEFAULT_STAGE_COUNT));
  const nextPrimary = normalizeLocation(meta?.nextPrimary || '');
  const hook = String(meta?.hook || `${loc}仍有未解開的在地線索`).trim();

  const stageGoal =
    stage <= 0
      ? '先建立在地關係與威脅線索'
      : stage < stageCount
        ? '推進在地衝突並收斂核心情報'
        : '完成收尾並準備跨區';

  const nextPortalHub = normalizeLocation(
    nextPrimary
      ? getLocationPortalHub(nextPrimary)
      : getLocationPortalHub(loc)
  );
  const travelHint = nextPortalHub
    ? `完成後請前往「${nextPortalHub}」主傳送門，再跨區前進`
    : (nextPrimary ? `完成後可引導前往：${nextPrimary}` : '完成後可引導前往下一個已開放地區');
  return [
    `【島內主線引導】`,
    `當前地點：${loc}（${String(meta.storyTag || `D${meta.difficulty || '?'}`)}）`,
    `進度：stage ${stage}/${stageCount}（未完成）`,
    `本地主題：${hook}`,
    `本階段目標：${stageGoal}`,
    `收尾方向：${travelHint}`
  ].join('\n');
}

function getAllKnownLocations() {
  return Array.isArray(MAP_LOCATIONS) ? [...MAP_LOCATIONS] : [];
}

module.exports = {
  DEFAULT_STAGE_COUNT,
  ensureUnlockedLocations,
  unlockLocation,
  isLocationUnlocked,
  getUnlockedLocations,
  ensureIslandStoryState,
  ensureIslandStoryEntry,
  getIslandStoryState,
  countCompletedIslands,
  updateIslandStoryProgress,
  calculateStageByTurns,
  buildIslandGuidancePrompt,
  getNextPrimaryLocation,
  getAllKnownLocations
};
