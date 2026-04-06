// Renaiss World Discord Bot v5
/**
 * 🌟 Renaiss World - Discord Bot v5
 * Renaiss星球 - 寵物對戰 RPG
 * 完整版本：無死路、隨機抽招、設置/角色按鈕
 */

const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// 讀取 .env 檔案
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// ============== 設定 ==============
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  LANGUAGE: 'zh-TW' // 預設語言
};
const WORLD_BACKUP_NOTIFY_CHANNEL_ID = 1473923458751660063;

const { setupWorldStorage } = require('./storage-paths');
const STORAGE = setupWorldStorage();
const DATA_DIR = STORAGE.dataDir;
const PLAYER_THREADS_FILE = path.join(DATA_DIR, 'player_threads.json');
const PLAYERS_DIR = path.join(DATA_DIR, 'players');
const PETS_FILE = path.join(DATA_DIR, 'pets.json');
const USER_WALLETS_FILE = path.join(DATA_DIR, 'user_wallets.json');
const SCRATCH_LOTTERY_FILE = path.join(DATA_DIR, 'scratch_lottery.json');
const RESETDATA_PASSWORD = String(process.env.RESETDATA_PASSWORD || '0121').trim();

// ============== 初始化 ==============
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ============== Discord Client ==============
const CLIENT = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// ============== 模組 ==============
const CORE = require('./game-core');
const PET = require('./pet-system');
const BATTLE = require('./battle-system');
const EVENTS = require('./event-system');
const FOOD = require('./food-system');
const STORY = require('./storyteller');
const GACHA = require('./gacha-system');
const WALLET = require('./wallet-system');
const WISH = require('./wish-pool-ai');
const MAIN_STORY = require('./main-story');
const ECON = require('./economy-system');
const MEMORY_INDEX = require('./memory-index');
const ISLAND_STORY = require('./island-story');
const { startWorldBackupScheduler, runWorldBackup, getBackupDebugStatus } = require('./world-backup');
const {
  ISLAND_MAP_TEXT,
  buildIslandMapAnsi,
  MAP_LOCATIONS,
  getLocationProfile,
  getLocationStoryMetadata,
  getLocationStoryContext,
  getPortalDestinations,
  getLocationPortalHub,
  getRegionPortalHubs,
  getRegionLocationsByLocation,
  buildRegionMapSnapshot
} = require('./world-map');

try {
  CORE.loadWorld();
} catch (e) {
  console.log('[世界] 載入失敗:', e.message);
}

// ============== 翻譯文字 ==============
const TEXT = {
  'zh-TW': {
    welcome: '歡迎來到 Renaiss 星球！',
    welcomeBack: '你回來了！繼續你的冒險吧！',
    choosePath: '選擇你的道路',
    journey: 'Renaiss 星球探險之旅',
    continue: '➡️ 繼續',
    settings: '⚙️ 設置',
    character: '👤 角色',
    back: '🔙 返回',
    petCreated: '寵物誕生！',
    drawMove: '🎰 抽取天賦招式！',
    enterName: '📝 為寵物取名',
    adventure: '🌟 探險選項',
    combat: '⚔️ 戰鬥',
    flee: '🏃 逃跑',
    victory: '🏆 勝利！',
    defeat: '💀 失敗...',
    hp: '生命',
    atk: '攻擊',
    def: '防禦',
    gold: 'Rns 代幣'
  },
  'zh-CN': {
    welcome: '欢迎来到 Renaiss 星球！',
    welcomeBack: '你回来了！继续你的冒险吧！',
    choosePath: '选择你的道路',
    journey: 'Renaiss 星球探险之旅',
    continue: '➡️ 继续',
    settings: '⚙️ 设置',
    character: '👤 角色',
    back: '🔙 返回',
    petCreated: '宠物诞生！',
    drawMove: '🎰 抽取天赋招式！',
    enterName: '📝 为宠物取名',
    adventure: '🌟 探险选项',
    combat: '⚔️ 战斗',
    flee: '🏃 逃跑',
    victory: '🏆 胜利！',
    defeat: '💀 失败...',
    hp: '生命',
    atk: '攻击',
    def: '防御',
    gold: 'Rns 代币'
  },
  en: {
    welcome: 'Welcome to Renaiss Planet!',
    welcomeBack: 'Welcome back! Continue your adventure!',
    choosePath: 'Choose Your Path',
    journey: 'Renaiss Adventure Journey',
    continue: '➡️ Continue',
    settings: '⚙️ Settings',
    character: '👤 Character',
    back: '🔙 Back',
    petCreated: 'Pet Born!',
    drawMove: '🎰 Draw Talent Move!',
    enterName: '📝 Name Your Pet',
    adventure: '🌟 Adventure Options',
    combat: '⚔️ Combat',
    flee: '🏃 Flee',
    victory: '🏆 Victory!',
    defeat: '💀 Defeat...',
    hp: 'HP',
    atk: 'ATK',
    def: 'DEF',
    gold: 'Rns Token'
  }
};

function t(key, lang = 'zh-TW') {
  const code = normalizeLangCode(lang || CONFIG.LANGUAGE || 'zh-TW');
  return TEXT[code]?.[key] || TEXT['zh-TW']?.[key] || key;
}

function getMarketTypeLabel(marketType = 'renaiss') {
  return String(marketType || '').trim().toLowerCase() === 'digital'
    ? '神秘鑑價站'
    : '鑑價站';
}

function formatFinanceAmount(amount = 0) {
  const num = Math.floor(Number(amount || 0));
  if (!Number.isFinite(num)) return '0';
  return `${num > 0 ? '+' : ''}${num}`;
}

function round1(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return Number(fallback) || 0;
  return Math.round(num * 10) / 10;
}

function format1(value, fallback = 0) {
  return String(Math.round(round1(value, fallback)));
}

function getMoveSpeedValue(move = {}) {
  const raw = Number(move?.speed);
  if (Number.isFinite(raw)) {
    if (raw >= 1 && raw <= 20) return Math.max(1, Math.min(20, Math.floor(raw)));
    const legacyMap = { '-1': 4, '0': 10, '1': 13, '2': 16, '3': 20 };
    const mapped = Number(legacyMap[String(Math.floor(raw))] || 0);
    if (mapped > 0) return mapped;
  }
  const legacyPriorityMap = { '-1': 4, '0': 10, '1': 13, '2': 16, '3': 20 };
  const mappedPriority = Number(legacyPriorityMap[String(Math.floor(Number(move?.priority || 0)))] || 0);
  if (mappedPriority > 0) return mappedPriority;
  return 10;
}

// ============== 玩家討論串管理 ==============
function loadPlayerThreads() {
  if (!fs.existsSync(PLAYER_THREADS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PLAYER_THREADS_FILE, 'utf8'));
  } catch { return {}; }
}

function savePlayerThreads(threads) {
  fs.writeFileSync(PLAYER_THREADS_FILE, JSON.stringify(threads, null, 2));
}

function loadJsonObject(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveJsonObject(filePath, data) {
  const safe = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(safe, null, 2));
}

function clearSelfCharacterData(userId) {
  const id = String(userId || '').trim();
  if (!id) throw new Error('missing user id');
  const report = {
    scope: 'self',
    removedPlayerFile: false,
    removedLegacyMemoryFile: false,
    removedPet: false,
    removedThread: false,
    removedWallet: false,
    clearedSemanticMemory: 0,
    clearedNpcQuotes: 0,
    purgedFriendRefsPlayers: 0,
    purgedFriendRefsLinks: 0
  };

  const playerFile = path.join(PLAYERS_DIR, `${id}.json`);
  const legacyMemoryFile = path.join(PLAYERS_DIR, `${id}_memory.json`);

  if (fs.existsSync(playerFile)) {
    fs.unlinkSync(playerFile);
    report.removedPlayerFile = true;
  }
  if (fs.existsSync(legacyMemoryFile)) {
    fs.unlinkSync(legacyMemoryFile);
    report.removedLegacyMemoryFile = true;
  }

  if (typeof PET.deletePetByOwner === 'function') {
    report.removedPet = Boolean(PET.deletePetByOwner(id));
  }

  const threads = loadPlayerThreads();
  if (Object.prototype.hasOwnProperty.call(threads, id)) {
    delete threads[id];
    savePlayerThreads(threads);
    report.removedThread = true;
  }

  const wallets = loadJsonObject(USER_WALLETS_FILE);
  if (Object.prototype.hasOwnProperty.call(wallets, id)) {
    delete wallets[id];
    saveJsonObject(USER_WALLETS_FILE, wallets);
    report.removedWallet = true;
  }

  if (typeof MEMORY_INDEX.clearPlayerRelatedMemories === 'function') {
    report.clearedSemanticMemory = Number(MEMORY_INDEX.clearPlayerRelatedMemories(id) || 0);
  }
  if (typeof CORE.clearPlayerNpcQuoteMemory === 'function') {
    report.clearedNpcQuotes = Number(CORE.clearPlayerNpcQuoteMemory(id) || 0);
  }

  releaseStoryLock(id);
  const purge = purgePlayerFromAllFriendLists(id);
  report.purgedFriendRefsPlayers = Number(purge?.affectedPlayers || 0);
  report.purgedFriendRefsLinks = Number(purge?.removedLinks || 0);
  return report;
}

function clearTargetPlayerAllData(userId) {
  const id = String(userId || '').trim();
  if (!id) throw new Error('missing user id');
  return clearSelfCharacterData(id);
}

function clearWorldRuntimeData(mode = 'events') {
  const report = {
    mode: (String(mode || '').trim().toLowerCase() === 'all') ? 'all' : 'events',
    core: false,
    board: false
  };
  try {
    if (typeof CORE.resetWorldState === 'function') {
      CORE.resetWorldState({ mode: report.mode });
      report.core = true;
    }
  } catch (e) {
    console.error('[reset] CORE.resetWorldState 失敗:', e?.message || e);
  }
  try {
    if (typeof EVENTS.clearWorldEvents === 'function') {
      EVENTS.clearWorldEvents();
      report.board = true;
    }
  } catch (e) {
    console.error('[reset] EVENTS.clearWorldEvents 失敗:', e?.message || e);
  }
  return report;
}

function clearAllCharacterData(options = {}) {
  const clearWorld = options?.clearWorld !== false;
  const worldMode = String(options?.worldMode || 'all').trim().toLowerCase() === 'events' ? 'events' : 'all';
  const report = {
    scope: 'all',
    removedPlayerFiles: 0,
    removedLegacyMemoryFiles: 0,
    resetPets: false,
    resetThreads: false,
    resetWallets: false,
    resetScratchLottery: false,
    clearedSemanticMemory: 0,
    clearedNpcQuotes: 0,
    resetWorldCore: false,
    resetWorldBoard: false
  };

  fs.mkdirSync(PLAYERS_DIR, { recursive: true });
  const names = fs.readdirSync(PLAYERS_DIR);
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const target = path.join(PLAYERS_DIR, name);
    fs.unlinkSync(target);
    if (name.endsWith('_memory.json')) report.removedLegacyMemoryFiles += 1;
    else report.removedPlayerFiles += 1;
  }

  saveJsonObject(PETS_FILE, {});
  report.resetPets = true;
  saveJsonObject(PLAYER_THREADS_FILE, {});
  report.resetThreads = true;
  saveJsonObject(USER_WALLETS_FILE, {});
  report.resetWallets = true;
  saveJsonObject(SCRATCH_LOTTERY_FILE, {});
  report.resetScratchLottery = true;

  if (typeof MEMORY_INDEX.clearAllMemories === 'function') {
    report.clearedSemanticMemory = Number(MEMORY_INDEX.clearAllMemories() || 0);
  }
  if (typeof CORE.clearAllNpcQuoteMemory === 'function') {
    report.clearedNpcQuotes = Number(CORE.clearAllNpcQuoteMemory() || 0);
  }

  if (clearWorld) {
    const worldReport = clearWorldRuntimeData(worldMode);
    report.resetWorldCore = Boolean(worldReport.core);
    report.resetWorldBoard = Boolean(worldReport.board);
  }

  STORY_GEN_LOCKS.clear();
  return report;
}

function setPlayerThread(userId, threadId) {
  const threads = loadPlayerThreads();
  if (threadId === null || threadId === undefined) {
    delete threads[userId]; // 刪除記錄
  } else {
    threads[userId] = threadId;
  }
  savePlayerThreads(threads);
}

function getPlayerThread(userId) {
  const threads = loadPlayerThreads();
  return threads[userId] || null;
}

function getThreadOwnerUserId(threadId) {
  if (!threadId) return null;
  const threads = loadPlayerThreads();
  for (const [uid, tid] of Object.entries(threads)) {
    if (tid === threadId) return uid;
  }
  return null;
}

function normalizeFriendId(value = '') {
  const id = String(value || '').trim();
  if (!/^\d{15,22}$/.test(id)) return '';
  return id;
}

function ensurePlayerFriendState(player) {
  if (!player || typeof player !== 'object') {
    return { friends: [], friendRequestsIncoming: [], friendRequestsOutgoing: [] };
  }
  if (!player.social || typeof player.social !== 'object' || Array.isArray(player.social)) {
    player.social = {};
  }
  const social = player.social;
  const selfId = String(player.id || '').trim();
  const normalizeList = (arr) => {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(arr) ? arr : []) {
      const id = normalizeFriendId(raw);
      if (!id || id === selfId || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };
  social.friends = normalizeList(social.friends);
  social.friendRequestsIncoming = normalizeList(social.friendRequestsIncoming).filter((id) => !social.friends.includes(id));
  social.friendRequestsOutgoing = normalizeList(social.friendRequestsOutgoing).filter((id) => !social.friends.includes(id));
  return social;
}

function removeFriendIdFromList(list, friendId) {
  const target = String(friendId || '').trim();
  const source = Array.isArray(list) ? list : [];
  return source.filter((id) => String(id || '').trim() !== target);
}

function resetFriendPairState(fromSocial, targetSocial, fromId = '', targetId = '') {
  const srcId = String(fromId || '').trim();
  const dstId = String(targetId || '').trim();
  if (!fromSocial || !targetSocial || !srcId || !dstId) return;

  fromSocial.friends = removeFriendIdFromList(fromSocial.friends, dstId);
  targetSocial.friends = removeFriendIdFromList(targetSocial.friends, srcId);
  fromSocial.friendRequestsIncoming = removeFriendIdFromList(fromSocial.friendRequestsIncoming, dstId);
  fromSocial.friendRequestsOutgoing = removeFriendIdFromList(fromSocial.friendRequestsOutgoing, dstId);
  targetSocial.friendRequestsIncoming = removeFriendIdFromList(targetSocial.friendRequestsIncoming, srcId);
  targetSocial.friendRequestsOutgoing = removeFriendIdFromList(targetSocial.friendRequestsOutgoing, srcId);

  if (fromSocial.friendBattleStats && typeof fromSocial.friendBattleStats === 'object' && !Array.isArray(fromSocial.friendBattleStats)) {
    delete fromSocial.friendBattleStats[dstId];
  }
  if (targetSocial.friendBattleStats && typeof targetSocial.friendBattleStats === 'object' && !Array.isArray(targetSocial.friendBattleStats)) {
    delete targetSocial.friendBattleStats[srcId];
  }
}

function removeFriendLinkFromPlayer(player, targetId = '') {
  if (!player || typeof player !== 'object') return false;
  const id = String(targetId || '').trim();
  if (!id) return false;
  const social = ensurePlayerFriendState(player);
  let changed = false;

  const nextFriends = removeFriendIdFromList(social.friends, id);
  if (nextFriends.length !== social.friends.length) {
    social.friends = nextFriends;
    changed = true;
  }
  const nextIncoming = removeFriendIdFromList(social.friendRequestsIncoming, id);
  if (nextIncoming.length !== social.friendRequestsIncoming.length) {
    social.friendRequestsIncoming = nextIncoming;
    changed = true;
  }
  const nextOutgoing = removeFriendIdFromList(social.friendRequestsOutgoing, id);
  if (nextOutgoing.length !== social.friendRequestsOutgoing.length) {
    social.friendRequestsOutgoing = nextOutgoing;
    changed = true;
  }
  if (social.friendBattleStats && typeof social.friendBattleStats === 'object' && !Array.isArray(social.friendBattleStats)) {
    if (Object.prototype.hasOwnProperty.call(social.friendBattleStats, id)) {
      delete social.friendBattleStats[id];
      changed = true;
    }
  }
  return changed;
}

function pruneMissingFriendLinksForPlayer(player) {
  if (!player || typeof player !== 'object') return false;
  const social = ensurePlayerFriendState(player);
  const checks = [
    ...(Array.isArray(social.friends) ? social.friends : []),
    ...(Array.isArray(social.friendRequestsIncoming) ? social.friendRequestsIncoming : []),
    ...(Array.isArray(social.friendRequestsOutgoing) ? social.friendRequestsOutgoing : [])
  ];
  let changed = false;
  for (const rawId of checks) {
    const id = String(rawId || '').trim();
    if (!id) continue;
    if (CORE.loadPlayer(id)) continue;
    if (removeFriendLinkFromPlayer(player, id)) changed = true;
  }
  return changed;
}

function purgePlayerFromAllFriendLists(targetId = '') {
  const id = String(targetId || '').trim();
  if (!id) return { affectedPlayers: 0, removedLinks: 0 };
  const players = typeof CORE.getAllPlayers === 'function' ? CORE.getAllPlayers() : [];
  let affectedPlayers = 0;
  let removedLinks = 0;
  for (const player of Array.isArray(players) ? players : []) {
    if (!player || typeof player !== 'object') continue;
    if (String(player.id || '').trim() === id) continue;
    const social = ensurePlayerFriendState(player);
    const before =
      (Array.isArray(social.friends) ? social.friends.length : 0) +
      (Array.isArray(social.friendRequestsIncoming) ? social.friendRequestsIncoming.length : 0) +
      (Array.isArray(social.friendRequestsOutgoing) ? social.friendRequestsOutgoing.length : 0) +
      ((social.friendBattleStats && typeof social.friendBattleStats === 'object' && !Array.isArray(social.friendBattleStats) && Object.prototype.hasOwnProperty.call(social.friendBattleStats, id)) ? 1 : 0);
    if (!removeFriendLinkFromPlayer(player, id)) continue;
    const after =
      (Array.isArray(social.friends) ? social.friends.length : 0) +
      (Array.isArray(social.friendRequestsIncoming) ? social.friendRequestsIncoming.length : 0) +
      (Array.isArray(social.friendRequestsOutgoing) ? social.friendRequestsOutgoing.length : 0) +
      ((social.friendBattleStats && typeof social.friendBattleStats === 'object' && !Array.isArray(social.friendBattleStats) && Object.prototype.hasOwnProperty.call(social.friendBattleStats, id)) ? 1 : 0);
    removedLinks += Math.max(0, before - after);
    CORE.savePlayer(player);
    affectedPlayers += 1;
  }
  return { affectedPlayers, removedLinks };
}

function getPlayerDisplayNameById(playerId = '') {
  const id = String(playerId || '').trim();
  if (!id) return '未知玩家';
  const p = CORE.loadPlayer(id);
  if (!p) return `玩家(${id})`;
  return String(p.name || '').trim() || `玩家(${id})`;
}

function isMutualFriend(player, targetId = '') {
  if (!player || typeof player !== 'object') return false;
  const id = String(targetId || '').trim();
  if (!id) return false;
  const social = ensurePlayerFriendState(player);
  return social.friends.includes(id);
}

function finalizeMutualFriendship(playerA, playerB) {
  const socialA = ensurePlayerFriendState(playerA);
  const socialB = ensurePlayerFriendState(playerB);
  const idA = String(playerA?.id || '').trim();
  const idB = String(playerB?.id || '').trim();
  if (!idA || !idB || idA === idB) return;
  if (!socialA.friends.includes(idB)) socialA.friends.push(idB);
  if (!socialB.friends.includes(idA)) socialB.friends.push(idA);
  socialA.friendRequestsIncoming = removeFriendIdFromList(socialA.friendRequestsIncoming, idB);
  socialA.friendRequestsOutgoing = removeFriendIdFromList(socialA.friendRequestsOutgoing, idB);
  socialB.friendRequestsIncoming = removeFriendIdFromList(socialB.friendRequestsIncoming, idA);
  socialB.friendRequestsOutgoing = removeFriendIdFromList(socialB.friendRequestsOutgoing, idA);
}

function createFriendRequest(fromUserId, targetUserId) {
  const fromId = normalizeFriendId(fromUserId);
  const targetId = normalizeFriendId(targetUserId);
  if (!fromId || !targetId) return { ok: false, code: 'invalid_id' };
  if (fromId === targetId) return { ok: false, code: 'self' };
  const fromPlayer = CORE.loadPlayer(fromId);
  const targetPlayer = CORE.loadPlayer(targetId);
  if (!fromPlayer) return { ok: false, code: 'from_not_found' };
  if (!targetPlayer) return { ok: false, code: 'target_not_found' };

  const fromSocial = ensurePlayerFriendState(fromPlayer);
  const targetSocial = ensurePlayerFriendState(targetPlayer);

  const reversePending = fromSocial.friendRequestsIncoming.includes(targetId) || targetSocial.friendRequestsOutgoing.includes(fromId);
  if (reversePending) {
    finalizeMutualFriendship(fromPlayer, targetPlayer);
    CORE.savePlayer(fromPlayer);
    CORE.savePlayer(targetPlayer);
    return { ok: true, code: 'auto_accepted', targetName: getPlayerDisplayNameById(targetId) };
  }

  // 送出申請時採「覆蓋」語意：先清掉這對 ID 之間舊的好友/申請/戰績關係，再寫入最新申請。
  // 這可避免玩家刪檔重建後，對方殘留同 ID 的舊紀錄造成重複或卡住。
  resetFriendPairState(fromSocial, targetSocial, fromId, targetId);
  if (!fromSocial.friendRequestsOutgoing.includes(targetId)) fromSocial.friendRequestsOutgoing.push(targetId);
  if (!targetSocial.friendRequestsIncoming.includes(fromId)) targetSocial.friendRequestsIncoming.push(fromId);
  CORE.savePlayer(fromPlayer);
  CORE.savePlayer(targetPlayer);
  return { ok: true, code: 'requested', overwritten: true, targetName: getPlayerDisplayNameById(targetId) };
}

function acceptFriendRequest(receiverUserId, requesterUserId) {
  const receiverId = normalizeFriendId(receiverUserId);
  const requesterId = normalizeFriendId(requesterUserId);
  if (!receiverId || !requesterId) return { ok: false, code: 'invalid_id' };
  const receiver = CORE.loadPlayer(receiverId);
  const requester = CORE.loadPlayer(requesterId);
  if (!receiver || !requester) return { ok: false, code: 'player_not_found' };
  const receiverSocial = ensurePlayerFriendState(receiver);
  const requesterSocial = ensurePlayerFriendState(requester);
  const hasPending = receiverSocial.friendRequestsIncoming.includes(requesterId) || requesterSocial.friendRequestsOutgoing.includes(receiverId);
  if (!hasPending && !(receiverSocial.friends.includes(requesterId) && requesterSocial.friends.includes(receiverId))) {
    return { ok: false, code: 'request_not_found', requesterName: getPlayerDisplayNameById(requesterId) };
  }
  finalizeMutualFriendship(receiver, requester);
  CORE.savePlayer(receiver);
  CORE.savePlayer(requester);
  return { ok: true, code: 'accepted', requesterName: getPlayerDisplayNameById(requesterId) };
}

function cancelOutgoingFriendRequest(fromUserId, targetUserId) {
  const fromId = normalizeFriendId(fromUserId);
  const targetId = normalizeFriendId(targetUserId);
  if (!fromId || !targetId) return { ok: false, code: 'invalid_id' };
  const fromPlayer = CORE.loadPlayer(fromId);
  const targetPlayer = CORE.loadPlayer(targetId);
  if (!fromPlayer || !targetPlayer) return { ok: false, code: 'player_not_found' };
  const fromSocial = ensurePlayerFriendState(fromPlayer);
  const targetSocial = ensurePlayerFriendState(targetPlayer);
  const had = fromSocial.friendRequestsOutgoing.includes(targetId) || targetSocial.friendRequestsIncoming.includes(fromId);
  fromSocial.friendRequestsOutgoing = removeFriendIdFromList(fromSocial.friendRequestsOutgoing, targetId);
  targetSocial.friendRequestsIncoming = removeFriendIdFromList(targetSocial.friendRequestsIncoming, fromId);
  CORE.savePlayer(fromPlayer);
  CORE.savePlayer(targetPlayer);
  if (!had) return { ok: false, code: 'request_not_found', targetName: getPlayerDisplayNameById(targetId) };
  return { ok: true, code: 'cancelled', targetName: getPlayerDisplayNameById(targetId) };
}

function ensureFriendBattleStatsMap(player) {
  const social = ensurePlayerFriendState(player);
  if (!social.friendBattleStats || typeof social.friendBattleStats !== 'object' || Array.isArray(social.friendBattleStats)) {
    social.friendBattleStats = {};
  }
  return social.friendBattleStats;
}

function getFriendBattleRecord(player, friendId = '') {
  const id = String(friendId || '').trim();
  const map = ensureFriendBattleStatsMap(player);
  if (!map[id] || typeof map[id] !== 'object') {
    map[id] = { wins: 0, losses: 0, total: 0, lastResult: '', lastAt: 0 };
  }
  const row = map[id];
  row.wins = Math.max(0, Math.floor(Number(row.wins || 0)));
  row.losses = Math.max(0, Math.floor(Number(row.losses || 0)));
  row.total = Math.max(0, Math.floor(Number(row.total || (row.wins + row.losses))));
  row.lastResult = String(row.lastResult || '').trim();
  row.lastAt = Math.max(0, Number(row.lastAt || 0));
  return row;
}

function applyFriendBattleResult(player, friendId = '', didWin = false) {
  if (!player || typeof player !== 'object') return null;
  const id = String(friendId || '').trim();
  if (!id) return null;
  const record = getFriendBattleRecord(player, id);
  if (didWin) record.wins += 1;
  else record.losses += 1;
  record.total = record.wins + record.losses;
  record.lastResult = didWin ? 'win' : 'loss';
  record.lastAt = Date.now();
  return record;
}

function buildFriendDuelSnapshot(player) {
  if (!player || typeof player !== 'object') return null;
  const ownerId = String(player.id || '').trim();
  if (!ownerId) return null;
  const ownedPets = getPlayerOwnedPets(ownerId);
  const petStates = {};
  for (const p of ownedPets) {
    const id = String(p?.id || '').trim();
    if (!id) continue;
    petStates[id] = {
      hp: Math.max(0, Number(p?.hp || 0)),
      status: cloneStatusState(p?.status),
      reviveAt: p?.reviveAt || null,
      reviveTurnsRemaining: Math.max(0, Number(p?.reviveTurnsRemaining || 0))
    };
  }
  return {
    playerHp: Math.max(0, Number(player?.stats?.生命 || 0)),
    petStates
  };
}

function restoreFriendDuelSnapshot(player, snapshot, activePet = null) {
  if (!player || !snapshot || typeof snapshot !== 'object') return false;
  let restored = false;
  const maxPlayerHp = Math.max(1, Number(player?.maxStats?.生命 || 100));
  if (Number.isFinite(Number(snapshot?.playerHp)) && player?.stats) {
    player.stats.生命 = Math.max(0, Math.min(maxPlayerHp, Number(snapshot.playerHp)));
    restored = true;
  }

  const petStates = snapshot?.petStates && typeof snapshot.petStates === 'object'
    ? snapshot.petStates
    : {};
  for (const [petId, state] of Object.entries(petStates)) {
    const id = String(petId || '').trim();
    if (!id || !state || typeof state !== 'object') continue;
    const savedPet = (typeof PET.getPetById === 'function') ? PET.getPetById(id) : null;
    if (!savedPet || String(savedPet.ownerId || '').trim() !== String(player.id || '').trim()) continue;
    const maxHp = Math.max(1, Number(savedPet?.maxHp || savedPet?.hp || 100));
    savedPet.hp = Math.max(0, Math.min(maxHp, Number(state?.hp || 0)));
    savedPet.status = cloneStatusState(state?.status);
    savedPet.reviveAt = state?.reviveAt || null;
    savedPet.reviveTurnsRemaining = Math.max(0, Number(state?.reviveTurnsRemaining || 0));
    PET.savePet(savedPet);
    if (activePet && String(activePet?.id || '').trim() === id) {
      activePet.hp = savedPet.hp;
      activePet.status = cloneStatusState(savedPet.status);
      activePet.reviveAt = savedPet.reviveAt || null;
      activePet.reviveTurnsRemaining = savedPet.reviveTurnsRemaining;
    }
    restored = true;
  }
  return restored;
}

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
  if (!activePet && preferredPet && CORE.canPetFight(preferredPet)) activePet = preferredPet;
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

  const rivalPlayer = friendId ? CORE.loadPlayer(friendId) : null;
  const rivalName = String(duel.friendName || rivalPlayer?.name || '好友').trim() || '好友';
  while (duel.enemyReservePetIds.length > 0) {
    const nextPetId = String(duel.enemyReservePetIds.shift() || '').trim();
    if (!nextPetId) continue;
    const nextPet = PET.getPetById(nextPetId);
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

function finalizeFriendDuel(player, pet, combatant, detailText = '', didWin = false) {
  const battleState = player?.battleState || {};
  const duel = battleState?.friendDuel || {};
  const roomId = String(duel?.online?.roomId || '').trim();
  if (roomId) clearOnlineFriendDuelTimer(roomId);
  const rivalId = String(duel.friendId || '').trim();
  const rivalName = String(duel.friendName || '好友').trim() || '好友';
  const sourceChoice = String(battleState?.sourceChoice || '').trim();
  const preBattleStory = String(battleState?.preBattleStory || player?.currentStory || '').trim();
  const returnStory = String(duel.returnStory || preBattleStory || player?.currentStory || '').trim();
  const returnChoices = Array.isArray(duel.returnChoices)
    ? duel.returnChoices
      .filter((choice) => choice && typeof choice === 'object')
      .slice(0, CHOICE_DISPLAY_COUNT)
      .map((choice) => ({ ...choice }))
    : [];
  const preState = (duel.preState && typeof duel.preState === 'object') ? duel.preState : null;

  const rivalPlayer = rivalId ? CORE.loadPlayer(rivalId) : null;
  if (rivalPlayer) {
    applyFriendBattleResult(rivalPlayer, String(player.id || '').trim(), !didWin);
    CORE.savePlayer(rivalPlayer);
  }
  const myRecord = applyFriendBattleResult(player, rivalId, didWin);

  const restoredBySnapshot = restoreFriendDuelSnapshot(player, preState, pet);
  if (!restoredBySnapshot) {
    if (pet && Number(pet.hp || 0) <= 0) {
      pet.hp = 1;
      pet.status = '正常';
      pet.reviveAt = null;
      pet.reviveTurnsRemaining = 0;
      PET.savePet(pet);
    }
    if (combatant?.isHuman && Number(player?.stats?.生命 || 0) <= 0) {
      player.stats.生命 = 1;
    }
  }

  rememberPlayer(player, {
    type: '好友友誼戰',
    content: `與 ${rivalName} 進行友誼戰`,
    outcome: didWin ? '勝利' : '落敗',
    importance: 2,
    tags: ['friend_duel', didWin ? 'win' : 'loss']
  });

  const summaryLine = `目前對 ${rivalName} 戰績：${myRecord?.wins || 0} 勝 / ${myRecord?.losses || 0} 敗`;
  player.currentStory = returnStory || player.currentStory || '';
  if (returnChoices.length > 0) {
    player.eventChoices = returnChoices;
  }
  if (player.pendingStoryTrigger) {
    clearPendingStoryTrigger(player);
  }
  // 友誼戰為獨立流程：結束後若誤按舊版「回到冒險」，也要先導回好友頁，避免直接進主劇情。
  player.pendingFriendDuelReturn = true;
  player.battleState = null;
  CORE.savePlayer(player);
  return {
    rivalName,
    record: myRecord,
    summaryLine,
    sourceChoice
  };
}

async function startFriendDuel(interaction, user, friendId = '') {
  const challenger = CORE.loadPlayer(user.id);
  const targetId = normalizeFriendId(friendId);
  if (!challenger || !targetId) {
    await interaction.reply({ content: '❌ 無法發起友誼戰。', ephemeral: true }).catch(() => {});
    return;
  }
  const social = ensurePlayerFriendState(challenger);
  if (!social.friends.includes(targetId)) {
    await showFriendsMenu(interaction, user, '你們尚未互加好友，無法發起友誼戰。');
    return;
  }
  // 友誼戰優先：若玩家殘留舊戰鬥狀態（常見於互動中斷/畫面遺失），允許本次直接覆蓋。
  if (challenger.battleState?.enemy) {
    const previousOnlineRoomId = String(challenger?.battleState?.friendDuel?.online?.roomId || '').trim();
    if (previousOnlineRoomId) {
      clearOnlineFriendDuelTimer(previousOnlineRoomId);
    }
    challenger.battleState = null;
    CORE.savePlayer(challenger);
  }

  const targetPlayer = CORE.loadPlayer(targetId);
  if (!targetPlayer) {
    await showFriendsMenu(interaction, user, '該好友資料不存在，無法發起對戰。');
    return;
  }
  const targetSocial = ensurePlayerFriendState(targetPlayer);
  if (!targetSocial.friends.includes(String(challenger.id || '').trim())) {
    await showFriendsMenu(interaction, user, '對方尚未與你互加成功，請重新確認。');
    return;
  }

  const myPetFallback = PET.loadPet(user.id);
  const myPetResolved = resolvePlayerMainPet(challenger, { fallbackPet: myPetFallback });
  const myPet = myPetResolved?.pet || myPetFallback;
  if (myPetResolved?.changed) CORE.savePlayer(challenger);
  const targetPetFallback = PET.loadPet(targetId);
  const targetPetResolved = resolvePlayerMainPet(targetPlayer, { fallbackPet: targetPetFallback });
  const targetPet = targetPetResolved?.pet || targetPetFallback;
  if (targetPetResolved?.changed) CORE.savePlayer(targetPlayer);
  if (!myPet || !myPet.hatched) {
    await interaction.reply({ content: '⚠️ 你尚未完成寵物孵化，無法友誼戰。', ephemeral: true }).catch(() => {});
    return;
  }
  if (!targetPet || !targetPet.hatched) {
    await showFriendsMenu(interaction, user, `${targetPlayer.name} 尚未準備好寵物，暫時不能友誼戰。`);
    return;
  }

  const enemyTeam = buildFriendDuelEnemyTeamFromPlayer(targetPlayer, targetPet);
  if (!enemyTeam?.activePet) {
    await showFriendsMenu(interaction, user, `${targetPlayer.name} 目前沒有可出戰的寵物，稍後再試。`);
    return;
  }
  const enemy = enemyTeam.enemy;
  const fighterType = 'pet';
  const duelOwnedPets = getPlayerOwnedPets(String(challenger.id || '').trim()).filter((p) => Boolean(p?.hatched));
  const duelPetStates = {};
  for (const p of duelOwnedPets) {
    const id = String(p?.id || '').trim();
    if (!id) continue;
    const fullHp = Math.max(1, Number(p?.maxHp || p?.hp || 100));
    duelPetStates[id] = { hp: fullHp, status: {} };
  }
  const sourceChoice = `向好友 ${targetPlayer.name} 發起友誼戰`;
  const duelSnapshot = buildFriendDuelSnapshot(challenger);
  const preservedStory = String(challenger.currentStory || '').trim();
  const preservedChoices = Array.isArray(challenger.eventChoices)
    ? normalizeEventChoices(challenger, challenger.eventChoices)
      .slice(0, CHOICE_DISPLAY_COUNT)
      .map((choice) => ({ ...choice }))
    : [];
  const preBattleStory = composeActionBridgeStory(challenger, sourceChoice, `你鎖定了 ${targetPlayer.name} 的夥伴 ${targetPet.name || '夥伴'}，準備切磋。`);
  const myDuelPetPreview = {
    ...myPet,
    hp: Math.max(1, Number(myPet?.maxHp || myPet?.hp || 100)),
    maxHp: Math.max(1, Number(myPet?.maxHp || myPet?.hp || 100)),
    status: {}
  };
  const estimate = estimateBattleOutcome(challenger, myDuelPetPreview, enemy, fighterType);
  const fighterLabel = fighterType === 'pet'
    ? `🐾 ${myPet.name}`
    : `🧍 ${challenger.name}(ATK 10)`;
  const enemyElementText = formatBattleElementDisplay(resolveEnemyBattleElement(enemy));
  const allyElementText = fighterType === 'pet'
    ? formatBattleElementDisplay(myPet?.type || myPet?.element || '')
    : '🧍 無屬性';
  const relationText = getBattleElementRelation(
    fighterType === 'pet' ? (myPet?.type || myPet?.element || '') : '',
    resolveEnemyBattleElement(enemy)
  ).text;

  challenger.battleState = {
    enemy,
    fighter: fighterType,
    mode: null,
    fleeAttempts: 0,
    energy: 2,
    turn: 1,
    startedAt: Date.now(),
    sourceChoice,
    preBattleStory,
    humanState: null,
    petState: duelPetStates[String(myPet?.id || '').trim()] || { hp: Math.max(1, Number(myPet?.maxHp || myPet?.hp || 100)), status: {} },
    activePetId: String(myPet?.id || '').trim() || null,
    petStates: duelPetStates,
    friendDuel: {
      friendId: targetId,
      friendName: String(targetPlayer.name || '').trim() || `玩家(${targetId})`,
      friendPetName: String(targetPet?.name || '').trim() || '夥伴',
      currentEnemyPetId: String(enemyTeam?.activePet?.id || targetPet?.id || '').trim() || null,
      enemyReservePetIds: Array.isArray(enemyTeam?.reservePetIds) ? enemyTeam.reservePetIds.slice() : [],
      startedTurn: getPlayerStoryTurns(challenger),
      returnStory: preservedStory,
      returnChoices: preservedChoices,
      preState: duelSnapshot
    }
  };
  rememberPlayer(challenger, {
    type: '好友友誼戰',
    content: `向 ${targetPlayer.name} 發起友誼戰`,
    outcome: '等待開戰',
    importance: 2,
    tags: ['friend_duel', 'battle_start']
  });
  CORE.savePlayer(challenger);

  const embed = new EmbedBuilder()
    .setTitle(`🤝 好友友誼戰：${challenger.name} vs ${targetPlayer.name}`)
    .setColor(0x8b5cf6)
    .setDescription(
      `**友誼戰即將開始！**\n\n` +
      `對手：${enemy.name}\n` +
      `🏷️ 敵方屬性：${enemyElementText}\n` +
      `❤️ 對手 HP：${formatBattleHpValue(enemy?.hp, 0)}/${formatBattleHpValue(enemy?.maxHp, 1)}\n` +
      `⚔️ 對手攻擊：${enemy.attack}\n` +
      `${fighterLabel} 出戰\n` +
      `🏷️ 我方屬性：${allyElementText}\n` +
      `${relationText}\n` +
      `⚡ 戰鬥能量規則：每回合 +2，可結轉\n` +
      `🌐 線上手動模式：雙方每回合 ${Math.floor(FRIEND_DUEL_ONLINE_TURN_MS / 1000)} 秒內同時提交行動\n` +
      `🤝 友誼戰規則：不影響生死、無通緝、無金幣掉落\n` +
      `📊 勝率預估：${estimate.rank}（約 ${format1(estimate.winRate)}%）\n\n` +
      `請選擇戰鬥模式：`
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('battle_mode_manual').setLabel('⚔️ 手動模式').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('battle_mode_ai').setLabel('🤖 AI戰鬥').setStyle(ButtonStyle.Primary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

async function showFriendManualModePicker(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  const duel = player?.battleState?.friendDuel;
  const enemy = player?.battleState?.enemy;
  if (!player || !pet || !duel || !enemy) {
    await interaction.reply({ content: '❌ 找不到可用的好友對戰狀態，請重新發起。', ephemeral: true }).catch(() => {});
    return;
  }
  if (petResolved?.changed) CORE.savePlayer(player);

  const embed = new EmbedBuilder()
    .setTitle('⚔️ 手動模式選擇')
    .setColor(0x8b5cf6)
    .setDescription(
      `對手：${String(duel.friendName || '好友').trim() || '好友'}\n` +
      `請選擇手動模式：\n` +
      `1) 手動（對手AI）\n` +
      `2) 手動（真人即時，雙方每回合限時提交）`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('battle_mode_manual_offline').setLabel('⚔️ 手動（對手AI）').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('battle_mode_manual_online').setLabel('🌐 手動（真人即時）').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('battle_mode_manual_back').setLabel('↩️ 返回').setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

function parseOnlineFriendDuelAction(customId = '') {
  const text = String(customId || '').trim();
  let matched = text.match(/^fdonline_join_([^_]+)$/);
  if (matched) {
    return {
      kind: 'join',
      hostId: String(matched[1] || '').trim(),
      moveIndex: -1
    };
  }
  matched = text.match(/^fdonline_move_([^_]+)_(\d+)$/);
  if (matched) {
    return {
      kind: 'move',
      hostId: String(matched[1] || '').trim(),
      moveIndex: Math.max(0, Number.parseInt(matched[2], 10) || 0)
    };
  }
  matched = text.match(/^fdonline_wait_([^_]+)$/);
  if (matched) {
    return {
      kind: 'wait',
      hostId: String(matched[1] || '').trim(),
      moveIndex: -1
    };
  }
  matched = text.match(/^fdonline_view_([^_]+)$/);
  if (matched) {
    return {
      kind: 'view',
      hostId: String(matched[1] || '').trim(),
      moveIndex: -1
    };
  }
  return null;
}

function getOnlineFriendDuelState(player) {
  const online = player?.battleState?.friendDuel?.online;
  if (!online || typeof online !== 'object' || !online.enabled) return null;
  return online;
}

function getOnlineFriendDuelHostPlayer(hostId = '') {
  const id = String(hostId || '').trim();
  if (!id) return null;
  const host = CORE.loadPlayer(id);
  if (!host) return null;
  const online = getOnlineFriendDuelState(host);
  if (!online) return null;
  if (String(online.hostId || '').trim() !== id) return null;
  return host;
}

function canOperateOnlineFriendDuel(hostPlayer, userId = '', channelId = '') {
  const online = getOnlineFriendDuelState(hostPlayer);
  if (!online) return false;
  const uid = String(userId || '').trim();
  if (!uid) return false;
  const hostId = String(online.hostId || '').trim();
  const rivalId = String(online.rivalId || '').trim();
  if (uid !== hostId && uid !== rivalId) return false;
  const duelChannelId = String(online.channelId || '').trim();
  if (duelChannelId && String(channelId || '').trim() && duelChannelId !== String(channelId || '').trim()) {
    return false;
  }
  return true;
}

function shouldBypassThreadGuardForOnlineFriendDuel(interaction, userId = '') {
  if (!interaction?.isButton?.()) return false;
  const action = parseOnlineFriendDuelAction(interaction.customId || '');
  if (!action?.hostId) return false;
  const hostPlayer = getOnlineFriendDuelHostPlayer(action.hostId);
  if (!hostPlayer) return false;
  return canOperateOnlineFriendDuel(hostPlayer, userId, interaction.channelId);
}

function clearOnlineFriendDuelTimer(roomId = '') {
  const key = String(roomId || '').trim();
  if (!key) return;
  const timer = ONLINE_FRIEND_DUEL_TIMERS.get(key);
  if (timer) clearTimeout(timer);
  ONLINE_FRIEND_DUEL_TIMERS.delete(key);
}

function trimButtonLabel(text = '', maxLen = 18) {
  const source = String(text || '').trim();
  if (!source) return '未知';
  return source.length > maxLen ? `${source.slice(0, Math.max(1, maxLen - 1))}…` : source;
}

async function showFriendAddModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('friend_add_modal')
    .setTitle('🤝 新增好友');

  const input = new TextInputBuilder()
    .setCustomId('friend_target_id')
    .setLabel('輸入對方 Discord User ID')
    .setPlaceholder('例如：1051129116419702784')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(15)
    .setMaxLength(22);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showFriendsMenu(interaction, user, notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  const social = ensurePlayerFriendState(player);

  const friends = social.friends
    .map((id) => ({ id, name: getPlayerDisplayNameById(id) }))
    .filter((row) => normalizeFriendId(row.id));
  const incoming = social.friendRequestsIncoming
    .map((id) => ({ id, name: getPlayerDisplayNameById(id) }))
    .filter((row) => normalizeFriendId(row.id));
  const outgoing = social.friendRequestsOutgoing
    .map((id) => ({ id, name: getPlayerDisplayNameById(id) }))
    .filter((row) => normalizeFriendId(row.id));

  const formatList = (rows, emptyText, limit = 6) => {
    if (!Array.isArray(rows) || rows.length === 0) return emptyText;
    const head = rows.slice(0, limit).map((row) => `• ${row.name}`);
    const extra = rows.length > limit ? `\n…還有 ${rows.length - limit} 位` : '';
    return `${head.join('\n')}${extra}`;
  };

  const embed = new EmbedBuilder()
    .setTitle('🤝 好友系統')
    .setColor(0x4caf50)
    .setDescription(`${notice ? `📢 ${notice}\n\n` : ''}使用 Discord User ID 發送好友申請；雙方互加（同意）後，才能查看對方資訊。`)
    .addFields(
      { name: '👥 我的好友', value: `${friends.length} 位`, inline: true },
      { name: '📨 待我同意', value: `${incoming.length} 位`, inline: true },
      { name: '📤 我已送出', value: `${outgoing.length} 位`, inline: true },
      { name: '好友名單（顯示遊戲名）', value: formatList(friends, '目前沒有好友'), inline: false },
      { name: '待同意申請', value: formatList(incoming, '目前沒有待同意申請'), inline: false },
      { name: '已送出申請', value: formatList(outgoing, '目前沒有送出的申請'), inline: false }
    );

  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_friend_add_modal').setLabel('➕ 新增好友').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('friend_refresh').setLabel('🔄 重新整理').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('main_menu').setLabel('🔙 返回').setStyle(ButtonStyle.Secondary)
    )
  );

  if (friends.length > 0 && rows.length < 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        friends.slice(0, 5).map((row) =>
          new ButtonBuilder()
            .setCustomId(`friend_view_${row.id}`)
            .setLabel(`👤 ${trimButtonLabel(row.name, 14)}`)
            .setStyle(ButtonStyle.Secondary)
        )
      )
    );
  }

  if (incoming.length > 0 && rows.length < 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        incoming.slice(0, 5).map((row) =>
          new ButtonBuilder()
            .setCustomId(`friend_accept_${row.id}`)
            .setLabel(`✅ 同意 ${trimButtonLabel(row.name, 10)}`)
            .setStyle(ButtonStyle.Success)
        )
      )
    );
  }

  if (outgoing.length > 0 && rows.length < 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        outgoing.slice(0, 5).map((row) =>
          new ButtonBuilder()
            .setCustomId(`friend_cancel_${row.id}`)
            .setLabel(`❌ 撤回 ${trimButtonLabel(row.name, 10)}`)
            .setStyle(ButtonStyle.Danger)
        )
      )
    );
  }

  await interaction.update({ embeds: [embed], components: rows });
}

async function showFriendCharacter(interaction, user, friendId = '') {
  const viewer = CORE.loadPlayer(user.id);
  if (!viewer) {
    await interaction.update({ content: '❌ 找不到角色！', embeds: [], components: [] }).catch(() => {});
    return;
  }
  ensurePlayerFriendState(viewer);
  const targetId = normalizeFriendId(friendId);
  if (!targetId || !isMutualFriend(viewer, targetId)) {
    await showFriendsMenu(interaction, user, '你們尚未互加好友，無法查看對方資料。');
    return;
  }

  const target = CORE.loadPlayer(targetId);
  if (!target) {
    await showFriendsMenu(interaction, user, '該玩家資料目前不可用，請稍後再試。');
    return;
  }
  const targetPet = PET.loadPet(targetId);
  const duelRecord = getFriendBattleRecord(viewer, targetId);
  const hp = `${Number(target?.stats?.生命 || 0)}/${Number(target?.maxStats?.生命 || 100)}`;
  const energy = `${Number(target?.stats?.能量 || 0)}/${Number(target?.maxStats?.能量 || 100)}`;
  const petText = targetPet
    ? `${targetPet.name || '未命名'}（${targetPet.type || '未知'}） HP ${targetPet.hp || 0}/${targetPet.maxHp || 100}`
    : '尚無寵物資料';

  const embed = new EmbedBuilder()
    .setTitle(`👤 好友資訊：${target.name}`)
    .setColor(0x3f51b5)
    .setDescription('僅互加好友可見')
    .addFields(
      { name: '🏷️ 稱號', value: String(target.title || '冒險者'), inline: false },
      { name: '📍 位置', value: String(target.location || '未知'), inline: true },
      { name: '📊 等級', value: String(target.level || 1), inline: true },
      { name: '💰 Rns', value: String(Math.max(0, Number(target?.stats?.財富 || 0))), inline: true },
      { name: '❤️ 生命', value: hp, inline: true },
      { name: '⚡ 能量', value: energy, inline: true },
      { name: '📊 你對TA戰績', value: `${duelRecord.wins} 勝 / ${duelRecord.losses} 敗`, inline: true },
      { name: '🐾 夥伴', value: petText, inline: false }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`friend_duel_${targetId}`).setLabel('⚔️ 發起友誼戰').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('open_friends').setLabel('🤝 返回好友').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel('🔙 返回主選單').setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

async function rejectIfNotThreadOwner(interaction, userId) {
  if (shouldBypassThreadGuardForOnlineFriendDuel(interaction, userId)) return false;
  if (!interaction.channel?.isThread?.()) return false;
  const ownerId = getThreadOwnerUserId(interaction.channelId);
  if (!ownerId) return false;
  if (ownerId === userId) return false;

  const warning = '⚠️ 這不是你的遊戲討論串，不能操作其他玩家的按鈕。';
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content: warning, ephemeral: true }).catch(() => {});
  } else {
    await interaction.reply({ content: warning, ephemeral: true }).catch(() => {});
  }
  return true;
}

async function rejectIfNotLatestThread(interaction, userId) {
  if (shouldBypassThreadGuardForOnlineFriendDuel(interaction, userId)) return false;
  const latestThreadId = getPlayerThread(userId);
  if (!latestThreadId) return false;
  if (!interaction.channel?.isThread?.()) return false;
  if (interaction.channelId === latestThreadId) return false;

  const warning = '⚠️ 這是舊討論串按鈕，請到你最新的遊戲討論串操作（或使用 /start 重開）。';
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content: warning, ephemeral: true }).catch(() => {});
  } else {
    await interaction.reply({ content: warning, ephemeral: true }).catch(() => {});
  }
  // 只清自己的舊討論串按鈕，避免誤清其他玩家的訊息按鈕
  const ownerId = getThreadOwnerUserId(interaction.channelId);
  if (ownerId && ownerId === userId) {
    await interaction.message?.edit({ components: [] }).catch(() => {});
  }
  return true;
}

// ============== 玩家臨時資料（語言選擇等）==============
let playerTempData = {};

function setPlayerTempData(userId, key, value) {
  if (!playerTempData[userId]) playerTempData[userId] = {};
  playerTempData[userId][key] = value;
}

function getPlayerTempData(userId, key) {
  return playerTempData[userId]?.[key] || null;
}

function clearPlayerTempData(userId) {
  delete playerTempData[userId];
}

function normalizeLangCode(lang = 'zh-TW') {
  const raw = String(lang || '').trim();
  if (raw === 'en' || raw === 'zh-CN') return raw;
  return 'zh-TW';
}

async function notifyWorldBackupSuccess(result) {
  if (!result || !result.ok) return;
  if (!WORLD_BACKUP_NOTIFY_CHANNEL_ID || WORLD_BACKUP_NOTIFY_CHANNEL_ID <= 0) return;

  try {
    let channel = CLIENT.channels.cache.get(WORLD_BACKUP_NOTIFY_CHANNEL_ID);
    if (!channel) {
      channel = await CLIENT.channels.fetch(WORLD_BACKUP_NOTIFY_CHANNEL_ID);
    }
    if (!channel || typeof channel.send !== 'function') return;

    const changedText = result.changed ? '有新變更已推送' : '無新變更（已檢查）';
    const reasonText = String(result.reason || 'scheduled');
    const branchText = String(result.branch || 'main');
    await channel.send(
      `✅ 成功備份世界資料\n` +
      `來源：${reasonText}\n` +
      `分支：${branchText}\n` +
      `狀態：${changedText}`
    );
  } catch (e) {
    console.log(`[Backup] notify channel failed: ${String(e?.message || e)}`);
  }
}

async function findMessageInChannel(channel, messageId) {
  if (!channel || !messageId || typeof messageId !== 'string') return null;
  if (!channel.messages) return null;
  const cached = channel.messages.cache?.get(messageId);
  if (cached) return cached;
  try {
    return await channel.messages.fetch(messageId);
  } catch {
    return null;
  }
}

async function disableMessageComponents(channel, messageId) {
  if (!messageId || messageId.startsWith('instant_')) return;
  const msg = await findMessageInChannel(channel, messageId);
  if (!msg) return;
  await msg.edit({ components: [] }).catch(() => {});
}

async function lockPressedButtonImmediately(interaction) {
  if (!interaction?.isButton?.() || !interaction.message?.id) return;
  await disableMessageComponents(interaction.channel, interaction.message.id);
}

function isModalLauncherButtonId(customId = '') {
  const cid = String(customId || '').trim();
  if (!cid) return false;
  return (
    cid === 'open_wallet_modal' ||
    cid === 'open_profile' ||
    cid === 'open_character' ||
    cid === 'open_friends' ||
    cid === 'open_settings' ||
    cid === 'open_gacha' ||
    cid === 'main_menu' ||
    cid === 'open_friend_add_modal' ||
    cid === 'sync_wallet_now' ||
    cid.startsWith('claim_new_pet_element_')
  );
}

function snapshotMessageComponentsForRestore(message) {
  if (!message || !Array.isArray(message.components)) return [];
  return message.components
    .map((row) => {
      try {
        return typeof row?.toJSON === 'function' ? row.toJSON() : row;
      } catch {
        return null;
      }
    })
    .filter((row) => row && Array.isArray(row.components) && row.components.length > 0);
}

function createButtonInteractionTemplateContext(interaction, customId = '') {
  const context = {
    enabled: false,
    restored: false,
    customId: String(customId || '').trim(),
    messageId: String(interaction?.message?.id || '').trim(),
    snapshot: [],
    hidePromise: null
  };
  if (!interaction?.isButton?.() || !context.messageId) return context;
  if (isModalLauncherButtonId(customId)) return context;
  const snapshot = snapshotMessageComponentsForRestore(interaction.message);
  if (!Array.isArray(snapshot) || snapshot.length <= 0) return context;
  context.enabled = true;
  context.snapshot = snapshot;
  // 先隱藏按鈕再進主流程，避免與後續更新競態（更新完又被舊隱藏覆蓋）。
  context.hidePromise = lockPressedButtonImmediately(interaction).catch(() => {});
  return context;
}

function attachButtonTemplateReplyAutoRestore(interaction, context) {
  if (!interaction || !context?.enabled || context?._hooked) return;
  context._hooked = true;
  const wrapMethod = (methodName) => {
    const original = interaction?.[methodName];
    if (typeof original !== 'function') return;
    interaction[methodName] = async (...args) => {
      try {
        return await original.apply(interaction, args);
      } finally {
        await restoreButtonTemplateSnapshot(interaction, context).catch(() => {});
      }
    };
  };
  wrapMethod('reply');
  wrapMethod('followUp');
}

async function restoreButtonTemplateSnapshot(interaction, context) {
  if (!context?.enabled || context?.restored) return false;
  if (!Array.isArray(context.snapshot) || context.snapshot.length <= 0) return false;
  const channel = interaction?.channel;
  if (!channel) return false;
  const messageId = String(context.messageId || interaction?.message?.id || '').trim();
  if (!messageId) return false;
  const msg = await findMessageInChannel(channel, messageId);
  if (!msg) return false;
  const ok = await msg.edit({ components: context.snapshot }).then(() => true).catch(() => false);
  if (ok) context.restored = true;
  return ok;
}

async function updateInteractionMessage(interaction, payload) {
  if (!interaction) return;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }
  await interaction.update(payload);
}

async function resumeExistingOnboardingOrGame(interaction, user) {
  const existingPlayer = CORE.loadPlayer(user.id);
  const existingPet = PET.loadPet(user.id);
  if (!existingPlayer || !existingPet) return false;

  if (existingPet.hatched && existingPet.waitingForName) {
    const tierMove = existingPet.moves?.[2];
    const embed = new EmbedBuilder()
      .setTitle(`🎰 恭喜獲得：${tierMove?.name || '天賦招式'}！`)
      .setColor(0xffd700)
      .setDescription('請先為你的寵物命名，才能開始冒險。')
      .addFields({ name: '⚔️ 招式', value: tierMove?.name || '未知', inline: true });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('enter_pet_name').setLabel('✏️ 輸入名字').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('skip_name').setLabel('🔨 隨機').setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true }).catch(() => {});
    return true;
  }

  if (!existingPet.hatched) {
    const embed = new EmbedBuilder()
      .setTitle('🐾 你的寵物蛋還沒孵化！')
      .setColor(0xffa500)
      .setDescription('讓我們繼續孵化你的寵物吧！');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hatch_egg').setLabel('🔨 敲開寵物蛋！').setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true }).catch(() => {});
    return true;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 回到冒險').setStyle(ButtonStyle.Success)
  );
  await interaction.reply({ content: '✅ 你已完成建角，請直接回到冒險。', components: [row], ephemeral: true }).catch(() => {});
  return true;
}

function trackActiveGameMessage(player, channelId, messageId) {
  if (!player) return;
  player.activeThreadId = channelId || null;
  player.activeMessageId = messageId || null;
  CORE.savePlayer(player);
}

const STORY_GEN_LOCKS = new Map();
const STORY_GEN_LOCK_TTL_MS = 180000;
const CHOICE_POOL_COUNT = 5;
const CHOICE_DISPLAY_COUNT = 5;
const BATTLE_ESTIMATE_SIMULATIONS = Math.max(20, Math.min(500, Number(process.env.BATTLE_ESTIMATE_SIMULATIONS || 100)));
const BATTLE_ESTIMATE_MAX_TURNS = 16;
const CUSTOM_INPUT_OPTION_RATE = Math.max(0, Math.min(1, Number(process.env.CUSTOM_INPUT_OPTION_RATE || 0.01)));
const CUSTOM_INPUT_MAX_LENGTH = 120;
const EARLY_GAME_GOLD_GUARANTEE_TURNS = Math.max(1, Math.min(10, Number(process.env.EARLY_GAME_GOLD_GUARANTEE_TURNS || 5)));
const DIGITAL_MASK_TURNS = Math.max(1, Number(process.env.DIGITAL_MASK_TURNS || 12));
const PET_MOVE_LOADOUT_LIMIT = Math.max(1, Math.min(5, Number(process.env.PET_MOVE_LOADOUT_LIMIT || 5)));
const SHOP_SELL_SELECT_LIMIT = 25;
const SHOP_HAGGLE_SELECT_LIMIT = 25;
const SHOP_HAGGLE_BULK_SELECT_LIMIT = 20;
const MARKET_LIST_PAGE_SIZE = Math.max(5, Math.min(20, Number(process.env.MARKET_LIST_PAGE_SIZE || 20)));
const MOVES_DETAIL_PAGE_SIZE = Math.max(4, Math.min(12, Number(process.env.MOVES_DETAIL_PAGE_SIZE || 6)));
const SHOP_HAGGLE_OFFER_TTL_MS = 10 * 60 * 1000;
const SHOP_HAGGLE_BLOCKED_ITEMS = new Set(['乾糧一包', '水囊']);
const NPC_DIALOGUE_LOG_LIMIT = Math.max(20, Math.min(200, Number(process.env.NPC_DIALOGUE_LOG_LIMIT || 80)));
const PLAYER_CODEX_NPC_LIMIT = Math.max(50, Math.min(1000, Number(process.env.PLAYER_CODEX_NPC_LIMIT || 500)));
const PLAYER_CODEX_DRAW_LIMIT = Math.max(50, Math.min(2000, Number(process.env.PLAYER_CODEX_DRAW_LIMIT || 800)));
const STARTER_FIVE_PULL_COUNT = 5;
const GENERATION_HISTORY_LIMIT = Math.max(5, Math.min(100, Number(process.env.GENERATION_HISTORY_LIMIT || 20)));
const GENERATION_PENDING_STALE_MS = Math.max(30000, Number(process.env.GENERATION_PENDING_STALE_MS || 180000));
const MAP_ENABLE_WIDE_ANSI = String(process.env.MAP_ENABLE_WIDE_ANSI || '0') === '1';
const MARKET_GUARANTEE_GAP_TURNS = Math.max(1, Math.min(8, Number(process.env.MARKET_GUARANTEE_GAP_TURNS || 3)));
const LOCATION_ARC_COMPLETE_TURNS = Math.max(3, Math.min(16, Number(process.env.LOCATION_ARC_COMPLETE_TURNS || 10)));
const LOCATION_STORY_BATTLE_MIN_TURNS = Math.max(0, Math.min(6, Number(process.env.LOCATION_STORY_BATTLE_MIN_TURNS || 1)));
const PORTAL_GUIDE_MIN_TURNS = Math.max(1, Math.min(6, Number(process.env.PORTAL_GUIDE_MIN_TURNS || 1)));
const PORTAL_RESHOW_COOLDOWN_TURNS = Math.max(1, Math.min(10, Number(process.env.PORTAL_RESHOW_COOLDOWN_TURNS || 2)));
const WISH_POOL_GUIDE_MIN_TURNS = Math.max(1, Math.min(6, Number(process.env.WISH_POOL_GUIDE_MIN_TURNS || 2)));
const MENTOR_SPAR_COOLDOWN_TURNS = Math.max(1, Math.min(12, Number(process.env.MENTOR_SPAR_COOLDOWN_TURNS || 4)));
const MENTOR_NEARBY_SCAN_LIMIT = Math.max(1, Math.min(8, Number(process.env.MENTOR_NEARBY_SCAN_LIMIT || 5)));
const PET_PASSIVE_HEAL_PER_STORY_TURN = Math.max(0, Math.min(30, Number(process.env.PET_PASSIVE_HEAL_PER_STORY_TURN || 10)));
const QUICK_SHOP_COOLDOWN_TURNS = Math.max(1, Math.min(20, Number(process.env.QUICK_SHOP_COOLDOWN_TURNS || 5)));
const ROAM_MOVE_BASE_CHANCE = Math.max(0, Math.min(0.95, Number(process.env.ROAM_MOVE_BASE_CHANCE || 0.42)));
const ROAM_MOVE_EXPLORE_BONUS = Math.max(0, Math.min(0.5, Number(process.env.ROAM_MOVE_EXPLORE_BONUS || 0.16)));
const ROAM_MOVE_WANDER_BONUS = Math.max(0, Math.min(0.5, Number(process.env.ROAM_MOVE_WANDER_BONUS || 0.2)));
const STORY_THREAT_SCORE_THRESHOLD = Math.max(10, Math.min(90, Number(process.env.STORY_THREAT_SCORE_THRESHOLD || 38)));
const RECENT_CHOICE_HISTORY_LIMIT = Math.max(8, Math.min(64, Number(process.env.RECENT_CHOICE_HISTORY_LIMIT || 24)));
const CHOICE_REPEAT_ACTION_COOLDOWN_TURNS = Math.max(1, Math.min(8, Number(process.env.CHOICE_REPEAT_ACTION_COOLDOWN_TURNS || 3)));
const CHOICE_REPEAT_SIMILARITY_THRESHOLD = Math.max(0.7, Math.min(0.95, Number(process.env.CHOICE_REPEAT_SIMILARITY_THRESHOLD || 0.82)));
const MENTOR_BLOCKED_SECT_PATTERN = /(暗潮議會|暗黑組織|沙盜團|馬賊團|反派|Digital|混亂|滲透|刺客|盜匪)/iu;
const STORY_DIALOGUE_MAX_QUOTE_LEN = 160;
const STORY_DIALOGUE_MAX_PER_STORY = 8;
const STORY_GENERIC_SPEAKER_PATTERN = /(女子|少女|女聲|女人|姑娘|她|某人|有人|對方|對面|其中一人|另一人|另一名|男子|男聲|男人|老年人|中年人|技師|商人|攤主|守衛|巡邏員|倉管)/u;
const STORY_DIALOGUE_PIN_LIMIT = Math.max(16, Math.min(120, Number(process.env.STORY_DIALOGUE_PIN_LIMIT || 48)));
const STORY_DIALOGUE_PIN_TTL_TURNS = Math.max(4, Math.min(40, Number(process.env.STORY_DIALOGUE_PIN_TTL_TURNS || 10)));
const MAINLINE_PIN_LIMIT = Math.max(8, Math.min(80, Number(process.env.MAINLINE_PIN_LIMIT || 32)));
const MAINLINE_PIN_TTL_TURNS = Math.max(6, Math.min(80, Number(process.env.MAINLINE_PIN_TTL_TURNS || 20)));
const MAINLINE_CUE_PATTERN = /(可疑|供應隊|帳本|來源|流向|封存艙|金屬壓印|航海羅盤|座標|傳送門|門紋|節點|神秘鑑價站|鑑價站|四巨頭|試煉|追兵|攔截|線索|不明勢力|暗潮)/u;
const MAINLINE_BRIDGE_LOCK_TTL_TURNS = Math.max(1, Math.min(8, Number(process.env.MAINLINE_BRIDGE_LOCK_TTL_TURNS || 2)));
const LOCATION_ENTRY_GATE_ENABLED = String(process.env.LOCATION_ENTRY_GATE_ENABLED || '1') !== '0';
const LOCATION_ENTRY_MIN_WINRATE = Math.max(1, Math.min(99, Number(process.env.LOCATION_ENTRY_MIN_WINRATE || 50)));
const AGGRESSIVE_CHOICE_TARGET_RATE = Math.max(0, Math.min(1, Number(process.env.AGGRESSIVE_CHOICE_TARGET_RATE || 0.9)));
const BATTLE_CADENCE_TURNS = Math.max(3, Math.min(10, Number(process.env.BATTLE_CADENCE_TURNS || 5)));
const WANTED_AMBUSH_MIN_LEVEL = Math.max(1, Math.min(10, Number(process.env.WANTED_AMBUSH_MIN_LEVEL || 1)));
const AGGRESSIVE_FOLLOWUP_MIN_TURNS = Math.max(1, Math.min(2, Number(process.env.AGGRESSIVE_FOLLOWUP_MIN_TURNS || 1)));
const AGGRESSIVE_FOLLOWUP_WINDOW_TURNS = Math.max(1, Math.min(4, Number(process.env.AGGRESSIVE_FOLLOWUP_WINDOW_TURNS || 2)));
const AGGRESSIVE_FOLLOWUP_TARGET_MAX_LEN = Math.max(8, Math.min(28, Number(process.env.AGGRESSIVE_FOLLOWUP_TARGET_MAX_LEN || 20)));
const SHOP_HEAL_CRYSTAL_COST = 200;
const SHOP_HEAL_CRYSTAL_RECOVER = Math.max(10, Number(process.env.SHOP_HEAL_CRYSTAL_RECOVER || 30));
const SHOP_ENERGY_CRYSTAL_COST = 2000;
const SHOP_ENERGY_CRYSTAL_RECOVER = Math.max(20, Number(process.env.SHOP_ENERGY_CRYSTAL_RECOVER || 100));
const TELEPORT_DEVICE_COST = Math.max(100, Number(process.env.TELEPORT_DEVICE_COST || 200));
const TELEPORT_DEVICE_DURATION_HOURS = Math.max(1, Number(process.env.TELEPORT_DEVICE_DURATION_HOURS || 6));
const TELEPORT_DEVICE_DURATION_MS = TELEPORT_DEVICE_DURATION_HOURS * 60 * 60 * 1000;
const TELEPORT_DEVICE_STOCK_LIMIT = Math.max(10, Number(process.env.TELEPORT_DEVICE_STOCK_LIMIT || 999));
const TELEPORT_DEVICE_INVENTORY_ITEM = '傳送裝置（區內）';
const DIGITAL_CRYSTAL_EFFECT_FAIL_RATE = Math.max(0, Math.min(1, Number(process.env.DIGITAL_CRYSTAL_EFFECT_FAIL_RATE || 0.5)));

function formatTeleportDeviceRemaining(ms = 0) {
  const safe = Math.max(0, Number(ms || 0));
  const totalMinutes = Math.ceil(safe / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function normalizeTeleportDeviceStock(player, options = {}) {
  if (!player || typeof player !== 'object') return [];
  const nowMs = Number(options.nowMs || Date.now());
  const existingRaw = Array.isArray(player.teleportDeviceStock) ? player.teleportDeviceStock : [];
  const existing = [];
  for (const item of existingRaw) {
    if (Number.isFinite(Number(item))) {
      existing.push(Number(item));
      continue;
    }
    if (item && typeof item === 'object' && Number.isFinite(Number(item.expiresAt))) {
      existing.push(Number(item.expiresAt));
    }
  }

  let legacyCount = 0;
  if (Boolean(player.teleportDeviceOwned)) legacyCount += 1;
  if (Array.isArray(player.inventory) && player.inventory.length > 0) {
    const kept = [];
    for (const item of player.inventory) {
      const text = String(item || '').trim();
      if (/Teleport Device/i.test(text) || /傳送裝置/u.test(text)) {
        const countMatch = text.match(/x\s*(\d+)/i) || text.match(/×\s*(\d+)/u);
        legacyCount += Math.max(1, Number(countMatch?.[1] || 1));
        continue;
      }
      kept.push(item);
    }
    if (kept.length !== player.inventory.length) {
      player.inventory = kept;
    }
  }
  if (Object.prototype.hasOwnProperty.call(player, 'teleportDeviceOwned')) {
    delete player.teleportDeviceOwned;
  }

  const normalized = existing
    .filter((expiresAt) => Number.isFinite(expiresAt) && expiresAt > nowMs)
    .sort((a, b) => a - b)
    .slice(0, TELEPORT_DEVICE_STOCK_LIMIT);

  if (legacyCount > 0 && normalized.length === 0) {
    const count = Math.max(1, Math.min(legacyCount, TELEPORT_DEVICE_STOCK_LIMIT));
    for (let i = 0; i < count; i += 1) {
      normalized.push(nowMs + TELEPORT_DEVICE_DURATION_MS);
    }
  }

  player.teleportDeviceStock = normalized;
  return normalized;
}

function getTeleportDeviceStockInfo(player, options = {}) {
  const nowMs = Number(options.nowMs || Date.now());
  const stock = normalizeTeleportDeviceStock(player, { nowMs });
  const count = stock.length;
  const soonestExpiresAt = count > 0 ? stock[0] : 0;
  const soonestRemainingMs = Math.max(0, soonestExpiresAt - nowMs);
  return {
    count,
    stock,
    soonestExpiresAt,
    soonestRemainingMs
  };
}

function playerOwnsTeleportDevice(player) {
  const info = getTeleportDeviceStockInfo(player);
  return info.count > 0;
}

function grantTeleportDevice(player, count = 1, options = {}) {
  if (!player || typeof player !== 'object') return;
  const nowMs = Number(options.nowMs || Date.now());
  const info = getTeleportDeviceStockInfo(player, { nowMs });
  const add = Math.max(1, Number(count || 1));
  const capped = Math.max(0, TELEPORT_DEVICE_STOCK_LIMIT - info.count);
  const actual = Math.min(add, capped);
  for (let i = 0; i < actual; i += 1) {
    info.stock.push(nowMs + TELEPORT_DEVICE_DURATION_MS);
  }
  info.stock.sort((a, b) => a - b);
  player.teleportDeviceStock = info.stock.slice(0, TELEPORT_DEVICE_STOCK_LIMIT);
  return actual;
}

function consumeTeleportDevice(player, options = {}) {
  if (!player || typeof player !== 'object') return null;
  const nowMs = Number(options.nowMs || Date.now());
  const stock = normalizeTeleportDeviceStock(player, { nowMs });
  if (stock.length <= 0) return null;
  const consumedExpiresAt = stock.shift();
  player.teleportDeviceStock = stock;
  return {
    consumedExpiresAt,
    remainingCount: stock.length
  };
}

function isMainPortalHubLocation(location = '') {
  const loc = String(location || '').trim();
  if (!loc || typeof getLocationPortalHub !== 'function') return false;
  return String(getLocationPortalHub(loc) || '').trim() === loc;
}

function tryAcquireStoryLock(userId, reason = 'story') {
  if (!userId) return true;
  const now = Date.now();
  const lock = STORY_GEN_LOCKS.get(userId);
  if (lock && now - lock.startedAt < STORY_GEN_LOCK_TTL_MS) {
    return false;
  }
  STORY_GEN_LOCKS.set(userId, { startedAt: now, reason });
  return true;
}

function releaseStoryLock(userId) {
  if (!userId) return;
  STORY_GEN_LOCKS.delete(userId);
}

function shuffleArray(list = []) {
  const arr = Array.isArray(list) ? [...list] : [];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function chooseRandomUnique(list = [], count = 0) {
  if (!Array.isArray(list) || list.length === 0 || count <= 0) return [];
  return shuffleArray(list).slice(0, count);
}

function pickWeightedKey(weightEntries = []) {
  const valid = weightEntries
    .filter(([_, weight]) => Number.isFinite(Number(weight)) && Number(weight) > 0)
    .map(([key, weight]) => [key, Number(weight)]);
  if (valid.length === 0) return null;
  const total = valid.reduce((sum, [_, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of valid) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return valid[valid.length - 1][0];
}

function isCombatChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  if (String(choice.action || '') === 'fight' || String(choice.action || '') === 'mentor_spar') return true;
  const hintText = [
    choice.tag || '',
    choice.name || '',
    choice.choice || '',
    choice.desc || ''
  ].join(' ');
  return /(⚔️|會戰鬥|戰鬥|對戰|決鬥|迎戰|開打|討伐|搏鬥|fight|combat)/i.test(hintText);
}

function isBuyChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  const action = String(choice.action || '');
  if (['market_renaiss', 'market_digital', 'scratch_lottery', 'shop', 'buy', 'purchase'].includes(action)) return true;
  const hintText = [
    choice.tag || '',
    choice.name || '',
    choice.choice || '',
    choice.desc || ''
  ].join(' ');
  return /(💰|購買|買入|商店|賣場|市場|市集|鑑價|交易|shop|market|store|buy|purchase)/i.test(hintText);
}

function isImmediateBattleChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  if (
    String(choice.action || '') === 'fight' ||
    String(choice.action || '') === 'mentor_spar' ||
    String(choice.action || '') === 'location_story_battle'
  ) return true;
  const text = [
    choice.tag || '',
    choice.name || '',
    choice.choice || '',
    choice.desc || ''
  ].join(' ');
  return /[（(]\s*會進入戰鬥\s*[)）]/u.test(text) || /(即時戰鬥|立刻開打|立即戰鬥)/u.test(text);
}

function isHostileImmediateBattleChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  if (String(choice.action || '') === 'mentor_spar') return false;
  if (String(choice.action || '') === 'fight' || String(choice.action || '') === 'location_story_battle') return true;
  const text = [
    choice.tag || '',
    choice.name || '',
    choice.choice || '',
    choice.desc || ''
  ].join(' ');
  if (/(友誼賽|切磋|比試)/u.test(text)) return false;
  return /[（(]\s*會進入戰鬥\s*[)）]/u.test(text) || /(即時戰鬥|立刻開打|立即戰鬥)/u.test(text);
}

function ensureBattleMarkerSuffix(text, choice) {
  const source = String(text || '').trim();
  if (!source) return source;
  if (!isImmediateBattleChoice(choice)) return source;
  if (/[（(]\s*會進入戰鬥\s*[)）]/u.test(source)) return source;
  return `${source}（會進入戰鬥）`;
}

function getChoiceRiskCategory(choice) {
  if (!choice || typeof choice !== 'object') return 'unknown';
  const action = String(choice.action || '');
  if (action === 'fight' || action === 'mentor_spar') return 'combat';
  if (['market_renaiss', 'market_digital', 'scratch_lottery', 'shop', 'buy', 'purchase'].includes(action)) return 'spend';
  if (action === 'wish_pool' || action === 'portal_intent') return 'surprise';

  const tagText = [
    choice.tag || '',
    choice.name || '',
    choice.choice || '',
    choice.desc || ''
  ].join(' ');
  if (/(🔥|高風險)/u.test(tagText)) return 'high_risk';
  if (/(💰|需花錢|花費|購買|買入)/u.test(tagText)) return 'spend';
  if (/(🤝|需社交|社交|交談|談判)/u.test(tagText)) return 'social';
  if (/(🔍|需探索|探索|搜尋|調查)/u.test(tagText)) return 'explore';
  if (/(⚔️|會戰鬥|戰鬥|對戰|決鬥)/u.test(tagText)) return 'combat';
  if (/(🎁|高回報|豐厚回報|報酬高)/u.test(tagText)) return 'high_reward';
  if (/(❓|有驚喜|未知|奇遇|傳送|許願)/u.test(tagText)) return 'surprise';
  return 'unknown';
}

function stripChoicePrefix(text) {
  let clean = String(text || '').trim();
  if (!clean) return '';
  clean = clean
    .replace(/^\[[^\]]{1,16}\]\s*/u, '')
    .replace(/^【[^】]{1,16}】\s*/u, '')
    .replace(/^（[^）]{1,16}）\s*/u, '')
    .replace(/^[\p{Extended_Pictographic}]+\s*/u, '')
    .replace(/^(探索|社交|戰鬥|購買|花錢|高風險|高回報|驚喜|傳送|許願)[：:]\s*/u, '');
  return clean.trim();
}

function stripImmediateBattleMarker(text) {
  let cleaned = String(text || '').trim();
  if (!cleaned) return cleaned;
  cleaned = cleaned
    .replace(/[（(]\s*會進入戰鬥(?:｜[^)）]+)?\s*[)）]/gu, '')
    .replace(/(?:，|、)?\s*(即時戰鬥|立刻開打|立即戰鬥)\s*/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned;
}

function extractStoryEndingFocus(story = '') {
  const text = String(story || '').trim();
  if (!text) return '';
  const chunks = text
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean);
  if (chunks.length === 0) return text.slice(-220);
  const tail = chunks.slice(-3).join('\n');
  return tail || text.slice(-220);
}

function computeStoryThreatScore(story = '') {
  const text = extractStoryEndingFocus(story);
  if (!text) return 0;

  const heavyRules = [
    /殺機|追殺|伏擊|突襲|夜襲|追兵|圍攻|獵手|刺客/gu,
    /開戰|交戰|決戰|血戰|對峙|火拼|廝殺/gu,
    /敵人|敵方|仇家|威脅升級|失控|崩潰/gu
  ];
  const mediumRules = [
    /危險|危機|警示|衝突|對抗|埋伏|不妙/gu,
    /可疑|異常|緊張|壓迫感|不安|騷動/gu
  ];
  const calmRules = [
    /補給|休整|交談|閒聊|交易|觀察|談判|勘查|巡查/gu
  ];

  let score = 0;
  for (const pattern of heavyRules) {
    const count = (text.match(pattern) || []).length;
    score += Math.min(3, count) * 18;
  }
  for (const pattern of mediumRules) {
    const count = (text.match(pattern) || []).length;
    score += Math.min(4, count) * 8;
  }
  for (const pattern of calmRules) {
    const count = (text.match(pattern) || []).length;
    score -= Math.min(3, count) * 6;
  }

  return Math.max(0, Math.min(100, score));
}

function downgradeImmediateBattleChoice(choice) {
  if (!choice || typeof choice !== 'object') return choice;
  if (!isHostileImmediateBattleChoice(choice)) return choice;
  const next = { ...choice };
  const rawChoice = String(next.choice || next.name || '').trim();
  const cleanedChoice = stripImmediateBattleMarker(rawChoice);
  next.choice = cleanedChoice || `${rawChoice}（先偵查局勢）`;
  next.desc = stripImmediateBattleMarker(String(next.desc || '').trim()) || '先觀察局勢並整備，必要時再戰。';
  if (String(next.action || '') === 'fight') {
    next.action = 'conflict';
  }
  if (/[⚔️]/u.test(String(next.tag || '')) || /會戰鬥/u.test(String(next.tag || ''))) {
    next.tag = '[🔥高風險]';
  }
  return next;
}

function applyStoryThreatGate(player, choices = []) {
  const list = Array.isArray(choices) ? choices.filter(Boolean) : [];
  if (list.length === 0) return list;
  const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
  const threatScore = computeStoryThreatScore(storyText);
  const allowImmediateBattle = threatScore >= STORY_THREAT_SCORE_THRESHOLD;
  if (allowImmediateBattle) return list;
  return list.map((choice) => {
    if (choice?.forceImmediateBattle) return choice;
    return downgradeImmediateBattleChoice(choice);
  });
}

function formatChoiceText(choice) {
  const raw = String(choice?.choice || choice?.name || '').trim();
  if (!raw || raw === 'true' || raw === 'false') return '';
  const clean = stripChoicePrefix(raw);
  return ensureBattleMarkerSuffix(clean || raw, choice);
}

function createCustomInputChoice() {
  return {
    id: `custom_input_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: '✍️ 自訂行動',
    choice: '＿＿＿＿（自行輸入接下來要做的事）',
    desc: '你可自行輸入接下來想進行的行動',
    action: 'custom_input',
    type: 'custom'
  };
}

function maybeInjectRareCustomInputChoice(choices = []) {
  const base = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
  if (base.length === 0) return base;
  if (base.some(choice => String(choice?.action || '') === 'custom_input')) return base;
  if (Math.random() >= CUSTOM_INPUT_OPTION_RATE) return base;

  const injected = [...base];
  const replaceIndex = Math.max(0, injected.length - 1);
  injected[replaceIndex] = createCustomInputChoice();
  return injected;
}

function buildBattlePreviewHint(choice, context = {}) {
  if (!isImmediateBattleChoice(choice)) return '';
  if (String(choice?.action || '') === 'mentor_spar') {
    return '友誼賽｜壓低導師血量即可通過';
  }
  const player = context?.player;
  const pet = context?.pet;
  if (!player || !pet) return '';

  const previewEnemy = buildEnemyForBattle(
    choice,
    { enemy: choice?.enemy || {} },
    player,
    { deterministicFallback: true }
  );
  const fighterType = CORE.canPetFight(pet) ? 'pet' : 'player';
  const estimate = estimateBattleOutcome(player, pet, previewEnemy, fighterType);
  return `預估:${estimate.rank} ${format1(estimate.winRate)}%`;
}

function appendBattlePreviewToChoice(text, choice, context = {}) {
  const source = String(text || '').trim();
  if (!source) return source;
  const hint = buildBattlePreviewHint(choice, context);
  if (!hint) return source;

  if (/[（(]\s*會進入戰鬥\s*[)）]/u.test(source)) {
    return source.replace(/[（(]\s*會進入戰鬥\s*[)）]/u, `（會進入戰鬥｜${hint}）`);
  }
  return `${source}（會進入戰鬥｜${hint}）`;
}

function buildChoiceOptionsText(choices = [], context = {}) {
  let optionsText = '';
  choices.slice(0, CHOICE_DISPLAY_COUNT).forEach((choice, i) => {
    const text = appendBattlePreviewToChoice(formatChoiceText(choice), choice, context);
    if (!text) return;
    optionsText += `\n${i + 1}. ${text}`;
  });
  return optionsText;
}

function buildEventChoiceButtons(choices = [], ownerId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  return choices.slice(0, CHOICE_DISPLAY_COUNT).map((choice, i) => {
    const label = (formatChoiceText(choice) || `選項${i + 1}`).substring(0, 20).trim();
    return new ButtonBuilder()
      .setCustomId(safeOwnerId ? `event_${i}_${safeOwnerId}` : `event_${i}`)
      .setLabel(label || `${i + 1}`)
      .setStyle(ButtonStyle.Primary);
  });
}

async function tryRecoverEventButtonsAfterFailure(interaction, userId) {
  const channel = interaction?.channel;
  if (!channel || !userId) return false;
  const player = CORE.loadPlayer(userId);
  if (!player) return false;

  const rawChoices = Array.isArray(player.eventChoices) ? player.eventChoices : [];
  if (rawChoices.length <= 0) return false;

  const normalizedChoices = applyChoicePolicy(player, normalizeEventChoices(player, rawChoices));
  if (!Array.isArray(normalizedChoices) || normalizedChoices.length <= 0) return false;

  const changed =
    normalizedChoices.length !== rawChoices.length ||
    normalizedChoices.some((choice, idx) => choice !== rawChoices[idx]);
  if (changed) {
    player.eventChoices = normalizedChoices;
    CORE.savePlayer(player);
  }

  const buttons = buildEventChoiceButtons(normalizedChoices, player.id);
  appendMainMenuUtilityButtons(buttons, player);
  const components = [];
  for (let i = 0; i < buttons.length; i += 5) {
    components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  if (components.length <= 0) return false;

  const sourceMsg = interaction?.message;
  if (sourceMsg && typeof sourceMsg.edit === 'function') {
    const edited = await sourceMsg.edit({ components }).then(() => true).catch(() => false);
    if (edited) {
      trackActiveGameMessage(player, channel?.id, sourceMsg.id);
      return true;
    }
  }

  const recoveryMsg = await channel
    .send({
      content: '🔁 已自動恢復選項按鈕，請再按一次。',
      components
    })
    .catch(() => null);
  if (!recoveryMsg) return false;
  trackActiveGameMessage(player, channel?.id, recoveryMsg.id);
  return true;
}

async function tryRecoverMainMenuAfterFailure(interaction, userId) {
  if (!interaction?.channel?.isThread?.()) return false;
  const playerId = String(userId || '').trim();
  if (!playerId) return false;
  const player = CORE.loadPlayer(playerId);
  if (!player) return false;
  const fallbackPet = PET.loadPet(playerId);
  const petResolved = resolvePlayerMainPet(player, { fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  if (!pet) return false;
  if (petResolved?.changed) {
    CORE.savePlayer(player);
  }
  await sendMainMenuToThread(interaction.channel, player, pet, null);
  return true;
}

function getPlayerUILang(player = null) {
  const raw = String(player?.language || CONFIG.LANGUAGE || 'zh-TW').trim();
  if (raw === 'zh-CN' || raw === 'en') return raw;
  return 'zh-TW';
}

function getUtilityButtonLabels(lang = 'zh-TW') {
  const map = {
    'zh-TW': {
      inventory: '🎒 背包',
      moves: '🐾 寵物',
      character: '👤 個人',
      settings: '⚙️ 設定',
      friends: '🤝 好友',
      codex: '📚 圖鑑',
      gacha: '🎰 抽獎',
      map: '🗺️ 地圖',
      quickShopReady: '🏪 鑑價站',
      quickShopCooldown: (remaining) => `🏪 鑑價站 ${remaining}T`
    },
    'zh-CN': {
      inventory: '🎒 背包',
      moves: '🐾 宠物',
      character: '👤 个人',
      settings: '⚙️ 设置',
      friends: '🤝 好友',
      codex: '📚 图鉴',
      gacha: '🎰 抽奖',
      map: '🗺️ 地图',
      quickShopReady: '🏪 鉴价站',
      quickShopCooldown: (remaining) => `🏪 鉴价站 ${remaining}T`
    },
    en: {
      inventory: '🎒 Bag',
      moves: '🐾 Pet',
      character: '👤 Character',
      settings: '⚙️ Settings',
      friends: '🤝 Friends',
      codex: '📚 Codex',
      gacha: '🎰 Draw',
      map: '🗺️ Map',
      quickShopReady: '🏪 Appraisal',
      quickShopCooldown: (remaining) => `🏪 Appraisal ${remaining}T`
    }
  };
  return map[lang] || map['zh-TW'];
}

function appendMainMenuUtilityButtons(buttons = [], player = null) {
  const list = Array.isArray(buttons) ? buttons : [];
  const uiLang = getPlayerUILang(player);
  const labels = getUtilityButtonLabels(uiLang);
  list.push(
    new ButtonBuilder().setCustomId('show_inventory').setLabel(labels.inventory).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_moves').setLabel(labels.moves).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_character').setLabel(labels.character).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_settings').setLabel(labels.settings).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_friends').setLabel(labels.friends).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_codex').setLabel(labels.codex).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_gacha').setLabel(labels.gacha).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_map').setLabel(labels.map).setStyle(ButtonStyle.Secondary),
    buildQuickShopButton(player)
  );
  return list;
}

function isPortalChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  const action = String(choice.action || '');
  if (action === 'portal_intent' || action === 'teleport') return true;
  const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
  return /(傳送門|傳送|躍遷|portal|teleport)/i.test(text);
}

function isWishPoolChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  const action = String(choice.action || '');
  if (action === 'wish_pool') return true;
  const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
  return /(許願池|許願|wish\s*pool)/i.test(text);
}

function pickCriticalSystemChoices(pool = [], maxCount = 2) {
  const selected = [];
  const used = new Set();
  const takeOne = (predicate) => {
    if (selected.length >= maxCount) return;
    const found = pool.find((choice) => !used.has(choice) && predicate(choice));
    if (found) {
      selected.push(found);
      used.add(found);
    }
  };

  takeOne(isPortalChoice);
  takeOne(isWishPoolChoice);
  takeOne(choice => String(choice?.action || '') === 'market_renaiss');
  takeOne(choice => String(choice?.action || '') === 'market_digital');
  takeOne(isMarketChoice);

  return selected.slice(0, maxCount);
}

function buildLocationFeatureTextForChoiceScoring(location = '') {
  const profile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
  const parts = [
    location || '',
    profile?.region || '',
    profile?.desc || '',
    ...(Array.isArray(profile?.nearby) ? profile.nearby : []),
    ...(Array.isArray(profile?.landmarks) ? profile.landmarks : []),
    ...(Array.isArray(profile?.resources) ? profile.resources : [])
  ];
  return parts.filter(Boolean).join(' ');
}

function textIncludesAnyKeyword(text = '', keywords = []) {
  const source = String(text || '');
  return keywords.some((keyword) => source.includes(keyword));
}

function normalizeChoiceFingerprintText(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildChoiceFingerprint(choice = {}) {
  const action = String(choice?.action || '').trim().toLowerCase();
  const text = normalizeChoiceFingerprintText([
    choice?.name || '',
    choice?.choice || '',
    choice?.desc || ''
  ].join(' '));
  return `${action}|${text}`.slice(0, 240);
}

function computeChoiceSimilarityByTokens(a = '', b = '') {
  const ta = normalizeChoiceFingerprintText(a).split(' ').filter(Boolean);
  const tb = normalizeChoiceFingerprintText(b).split(' ').filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  for (const token of sa) {
    if (sb.has(token)) inter += 1;
  }
  const union = new Set([...sa, ...sb]).size || 1;
  return inter / union;
}

function normalizeRecentChoiceHistory(list = []) {
  const arr = Array.isArray(list) ? list : [];
  const normalized = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const action = String(item.action || '').trim().toLowerCase();
    const choiceText = String(item.choice || '').trim().slice(0, 220);
    if (!choiceText) continue;
    const fingerprint = String(item.fingerprint || '').trim() || buildChoiceFingerprint({
      action,
      choice: choiceText,
      name: String(item.name || ''),
      desc: String(item.desc || '')
    });
    normalized.push({
      action,
      choice: choiceText,
      name: String(item.name || '').trim().slice(0, 80),
      desc: String(item.desc || '').trim().slice(0, 120),
      location: String(item.location || '').trim().slice(0, 32),
      turn: Number.isFinite(Number(item.turn)) ? Math.max(0, Math.floor(Number(item.turn))) : 0,
      at: Number.isFinite(Number(item.at)) ? Number(item.at) : Date.now(),
      fingerprint: fingerprint.slice(0, 240)
    });
  }
  return normalized.slice(-RECENT_CHOICE_HISTORY_LIMIT);
}

function ensureRecentChoiceHistory(player) {
  if (!player || typeof player !== 'object') return [];
  if (!Array.isArray(player.recentChoiceHistory)) {
    player.recentChoiceHistory = [];
  }
  const normalized = normalizeRecentChoiceHistory(player.recentChoiceHistory);
  if (JSON.stringify(player.recentChoiceHistory) !== JSON.stringify(normalized)) {
    player.recentChoiceHistory = normalized;
  }
  return player.recentChoiceHistory;
}

function getRecentChoiceHistory(player, limit = 8) {
  const list = ensureRecentChoiceHistory(player);
  const max = Math.max(1, Math.min(32, Number(limit) || 8));
  return list.slice(-max).reverse();
}

function recordPlayerChoiceHistory(player, event = {}, selectedChoice = '') {
  if (!player) return;
  const list = ensureRecentChoiceHistory(player);
  const record = {
    action: String(event?.action || '').trim().toLowerCase(),
    choice: String(selectedChoice || event?.choice || event?.name || '').trim().slice(0, 220),
    name: String(event?.name || '').trim().slice(0, 80),
    desc: String(event?.desc || '').trim().slice(0, 120),
    location: String(player?.location || '').trim().slice(0, 32),
    turn: getPlayerStoryTurns(player),
    at: Date.now()
  };
  if (!record.choice) return;
  record.fingerprint = buildChoiceFingerprint(record);
  list.push(record);
  player.recentChoiceHistory = normalizeRecentChoiceHistory(list);
}

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

function rewriteScratchChoiceToShop(choice, player = null) {
  if (!choice || typeof choice !== 'object') return choice;
  const action = String(choice.action || '').trim();
  if (action !== 'scratch_lottery') return choice;
  const rawText = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
  const preferDigital = /(digital|暗潮|黑市|流動收購|精明殺價)/iu.test(rawText);
  const marketAction = preferDigital ? 'market_digital' : 'market_renaiss';
  const location = String(player?.location || '附近據點');
  return {
    ...choice,
    action: marketAction,
    tag: marketAction === 'market_digital' ? '[🕳️神秘鑑價]' : '[🏪鑑價站]',
    name: marketAction === 'market_digital' ? '前往神秘鑑價站' : '前往附近鑑價站',
    choice: `先進入${location}附近鑑價站，再到櫃檯選擇刮刮樂`,
    desc: '刮刮樂只在鑑價站內操作，不會在主選項直接執行'
  };
}

function normalizeEventChoices(player = null, choices = []) {
  const mapped = Array.isArray(choices)
    ? choices
      .filter(Boolean)
      .slice(0, CHOICE_POOL_COUNT)
      .map((choice) => rewriteScratchChoiceToShop(choice, player))
    : [];
  // 傳送改由地圖按鈕（主傳送門/傳送裝置）處理，不再出現在劇情五選項中。
  const pool = mapped.filter((choice) => !isPortalChoice(choice));
  if (pool.length <= CHOICE_DISPLAY_COUNT) return pool;
  const maxPick = Math.min(CHOICE_DISPLAY_COUNT, pool.length);
  const signals = buildChoiceContextSignals(player);
  const scored = pool
    .map((choice, idx) => ({
      choice,
      idx,
      category: getChoiceRiskCategory(choice),
      score: computeChoiceContinuityScore(choice, signals)
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.idx - b.idx;
    });

  const selected = [];
  const categoryCount = new Map();
  const selectedFingerprints = [];
  const maxPerCategory = 2;
  const isNearDuplicate = (choice) => {
    const text = normalizeChoiceFingerprintText([
      choice?.name || '',
      choice?.choice || '',
      choice?.desc || ''
    ].join(' '));
    if (!text) return false;
    for (const prev of selectedFingerprints) {
      const sim = computeChoiceSimilarityByTokens(text, prev);
      if (sim >= CHOICE_REPEAT_SIMILARITY_THRESHOLD) return true;
    }
    return false;
  };
  const pushSelectedFingerprint = (choice) => {
    const text = normalizeChoiceFingerprintText([
      choice?.name || '',
      choice?.choice || '',
      choice?.desc || ''
    ].join(' '));
    if (text) selectedFingerprints.push(text);
  };
  const preserved = pickCriticalSystemChoices(pool, Math.min(2, maxPick));
  for (const choice of preserved) {
    if (selected.includes(choice)) continue;
    if (isNearDuplicate(choice)) continue;
    selected.push(choice);
    pushSelectedFingerprint(choice);
    const category = getChoiceRiskCategory(choice);
    categoryCount.set(category, Number(categoryCount.get(category) || 0) + 1);
    if (selected.length >= maxPick) return selected.slice(0, maxPick);
  }

  for (const item of scored) {
    const choice = item.choice;
    if (selected.includes(choice)) continue;
    if (isNearDuplicate(choice)) continue;
    const currentCount = Number(categoryCount.get(item.category) || 0);
    if (currentCount >= maxPerCategory && selected.length < Math.max(3, maxPick - 1)) continue;
    selected.push(choice);
    pushSelectedFingerprint(choice);
    categoryCount.set(item.category, currentCount + 1);
    if (selected.length >= maxPick) break;
  }

  if (selected.length < maxPick) {
    for (const item of scored) {
      if (selected.includes(item.choice)) continue;
      if (isNearDuplicate(item.choice) && selected.length >= 3) continue;
      selected.push(item.choice);
      pushSelectedFingerprint(item.choice);
      if (selected.length >= maxPick) break;
    }
  }
  return selected.slice(0, maxPick);
}

function getPlayerStoryTurns(player) {
  const turns = Number(player?.storyTurns || 0);
  return Number.isFinite(turns) ? Math.max(0, Math.floor(turns)) : 0;
}

function getQuickShopCooldownInfo(player) {
  const currentTurn = getPlayerStoryTurns(player);
  const lastTurn = Number(player?.lastQuickShopTurn || 0);
  const safeLastTurn = Number.isFinite(lastTurn) ? Math.max(0, Math.floor(lastTurn)) : 0;
  const nextReadyTurn = safeLastTurn > 0
    ? safeLastTurn + QUICK_SHOP_COOLDOWN_TURNS
    : QUICK_SHOP_COOLDOWN_TURNS;
  const remaining = Math.max(0, nextReadyTurn - currentTurn);
  return {
    currentTurn,
    lastTurn: safeLastTurn,
    nextReadyTurn,
    remaining,
    ready: remaining <= 0
  };
}

function buildQuickShopButton(player) {
  const cd = getQuickShopCooldownInfo(player);
  const uiLang = getPlayerUILang(player);
  const labels = getUtilityButtonLabels(uiLang);
  const label = cd.ready
    ? labels.quickShopReady
    : labels.quickShopCooldown(cd.remaining);
  return new ButtonBuilder()
    .setCustomId('quick_shop_entry')
    .setLabel(label.slice(0, 20))
    .setStyle(ButtonStyle.Success)
    .setDisabled(!cd.ready);
}

function extractStoryTailLine(story = '', maxChars = 70) {
  const text = String(story || '').trim();
  if (!text) return '';
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\*\*/g, '').trim())
    .filter(Boolean);
  const tail = lines.length > 0 ? lines[lines.length - 1] : text;
  return tail.length > maxChars ? `${tail.slice(0, maxChars)}...` : tail;
}

function buildQuickShopNarrativeNotice(player, marketType = 'renaiss') {
  const marketLabel = getMarketTypeLabel(marketType);
  const location = String(player?.location || '附近據點');
  const tail = extractStoryTailLine(player?.currentStory || '', 76);
  if (tail) {
    return `🧭 你在${location}暫時收束行程，沿著熟悉招牌快步走進${marketLabel}。\n📖 承接前情：${tail}`;
  }
  return `🧭 你在${location}短暫補給，決定先進入${marketLabel}處理交易，再回到原本冒險。`;
}

function incrementPlayerStoryTurns(player, amount = 1) {
  if (!player || typeof player !== 'object') return 0;
  const next = getPlayerStoryTurns(player) + Math.max(0, Number(amount) || 0);
  player.storyTurns = next;
  return next;
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

function createGuaranteedPortalChoice(player) {
  const location = String(player?.location || '附近據點');
  return {
    action: 'portal_intent',
    tag: '[❓有驚喜]',
    name: '靠近傳送門節點',
    choice: `先前往${location}附近的傳送門節點查看可前往的地點`,
    desc: '可開啟主傳送門地圖並選擇下一個區域'
  };
}

function createGuaranteedWishPoolChoice(player) {
  const location = String(player?.location || '附近據點');
  return {
    action: 'wish_pool',
    tag: '[❓有驚喜]',
    name: '前往許願池',
    choice: `循著${location}的微光指引，去許願池嘗試許願`,
    desc: '可輸入自訂願望，結果可能實現、反轉或附帶代價'
  };
}

function hasPortalTransitionCue(story = '') {
  const text = String(story || '');
  if (!text) return false;
  return /(傳送門|節點|跨區|下一站|離開此地|前往新地區|轉往|空間折疊|航道)/u.test(text);
}

function hasMainStoryTravelGateCue(story = '') {
  const text = String(story || '');
  if (!text) return false;
  return /(主線線索|跨區追查|靠近傳送門前往新地區|需要跨區|下一章需要跨區)/u.test(text);
}

function markPortalChoiceShown(player, exposure = null) {
  if (!player) return;
  const target = exposure || getCurrentLocationExposure(player);
  if (!target) return;
  target.portalShown = true;
  target.portalLastShownTurn = getPlayerStoryTurns(player);
}

function ensurePortalChoiceAvailability(player, choices = []) {
  const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
  if (!player || list.length === 0) return list;
  const forceByIslandCompletion = Boolean(player?.forcePortalChoice);
  if (list.some(isPortalChoice)) {
    if (forceByIslandCompletion) player.forcePortalChoice = false;
    markPortalChoiceShown(player);
    return list;
  }

  const destinations = typeof getPortalDestinations === 'function'
    ? getPortalDestinations(player.location || '')
    : [];
  if (!Array.isArray(destinations) || destinations.length === 0) return list;

  const state = syncLocationArcLocation(player);
  const turnsInLocation = Number(state?.turnsInLocation || 0);
  const exposure = getCurrentLocationExposure(player);
  const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
  const portalCue = hasPortalTransitionCue(storyText);
  const travelGateCue = hasMainStoryTravelGateCue(storyText);
  const nearCompletion = turnsInLocation >= Math.max(2, LOCATION_ARC_COMPLETE_TURNS - 1);
  const hardCompletion = turnsInLocation >= LOCATION_ARC_COMPLETE_TURNS;
  const currentTurn = getPlayerStoryTurns(player);
  const lastShownTurn = Number(exposure?.portalLastShownTurn || 0);
  const turnsSinceShown = Math.max(0, currentTurn - lastShownTurn);
  const canReshow = turnsSinceShown >= PORTAL_RESHOW_COOLDOWN_TURNS;

  const shouldGuidePortal = !exposure?.portalShown &&
    turnsInLocation >= PORTAL_GUIDE_MIN_TURNS &&
    (portalCue || travelGateCue || nearCompletion);
  const forcePortal = (travelGateCue && canReshow) || (hardCompletion && (portalCue || canReshow));

  if (!forcePortal && !shouldGuidePortal && !forceByIslandCompletion) return list;

  const injected = createGuaranteedPortalChoice(player);
  const protectedActions = new Set(['wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery', 'custom_input', 'mentor_spar']);
  let replaceIdx = list.length - 1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!protectedActions.has(String(list[i]?.action || ''))) {
      replaceIdx = i;
      break;
    }
  }
  list[replaceIdx] = injected;
  if (forceByIslandCompletion) player.forcePortalChoice = false;
  markPortalChoiceShown(player, exposure);
  return list.slice(0, CHOICE_DISPLAY_COUNT);
}

function ensureWishPoolChoiceAvailability(player, choices = []) {
  const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
  if (!player || list.length === 0) return list;
  if (list.some(isWishPoolChoice)) return list;

  const state = syncLocationArcLocation(player);
  const turnsInLocation = Number(state?.turnsInLocation || 0);
  const exposure = getCurrentLocationExposure(player);
  const shouldGuide = !exposure?.wishPoolShown && turnsInLocation >= WISH_POOL_GUIDE_MIN_TURNS;
  const forceWishPool = !exposure?.wishPoolShown && turnsInLocation >= Math.max(2, LOCATION_ARC_COMPLETE_TURNS - 2);
  if (!shouldGuide && !forceWishPool) return list;

  const injected = createGuaranteedWishPoolChoice(player);
  const protectedActions = new Set(['portal_intent', 'market_renaiss', 'market_digital', 'scratch_lottery', 'custom_input', 'mentor_spar']);
  let replaceIdx = list.length - 1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!protectedActions.has(String(list[i]?.action || ''))) {
      replaceIdx = i;
      break;
    }
  }
  list[replaceIdx] = injected;
  return list.slice(0, CHOICE_DISPLAY_COUNT);
}

function isMarketChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  const action = String(choice.action || '');
  if (action === 'market_renaiss' || action === 'market_digital') return true;
  const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
  return /(鑑價|賣場|市場|收購|估價)/.test(text);
}

function hasMarketNarrativeCue(story = '') {
  const text = String(story || '');
  if (!text) return false;
  return /(市集|攤位|商店|商家|交易|收購|鑑價|鑑定|封存艙|修復臺|修復台|倉管|商人|老闆|貨艙|臨時艙)/u.test(text);
}

function createGuaranteedMarketChoice(player) {
  const location = String(player?.location || '附近據點');
  const newbieMask = isDigitalMaskPhaseForPlayer(player);
  const profile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
  const difficulty = Number(profile?.difficulty || 3);
  const preferRenaiss = newbieMask || difficulty <= 3;
  if (preferRenaiss) {
    return {
      action: 'market_renaiss',
      tag: '[🏪鑑價站]',
      name: '前往附近鑑價站',
      choice: `帶著手邊素材到${location}附近鑑價站先做真偽檢測`,
      desc: '先看檢測結果與行情，再決定是否出售'
    };
  }
  return {
    action: 'market_digital',
    tag: newbieMask ? '[🧩友善鑑價]' : '[🕳️神秘鑑價]',
    name: '前往神秘鑑價站',
    choice: `在${location}附近找一間神秘鑑價站，先做檢測再議價`,
    desc: '表面條件看似優惠，簽之前先看細節'
  };
}

function ensureMarketChoiceAvailability(player, choices = []) {
  const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
  if (!player || list.length === 0) return list;
  if (list.some(isMarketChoice)) return list;

  const state = syncLocationArcLocation(player);
  const turnsInLocation = Number(state?.turnsInLocation || 0);
  const exposure = getCurrentLocationExposure(player);
  const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
  const marketCue = hasMarketNarrativeCue(storyText);
  const nearby = getNearbySystemAvailabilityForChoiceScoring(String(player?.location || ''));
  const forceByLocationArc = marketCue && !exposure?.marketShown && turnsInLocation >= 1;
  if (!marketCue && !nearby.nearMarket) return list;

  const currentTurn = getPlayerStoryTurns(player);
  const lastMarketTurn = Number(player.lastMarketTurn || 0);
  const turnsSinceMarket = Math.max(0, currentTurn - lastMarketTurn);
  const hardGap = Math.max(2, MARKET_GUARANTEE_GAP_TURNS * 2);
  if (!marketCue && turnsSinceMarket < hardGap) return list;
  if (marketCue && !forceByLocationArc && turnsSinceMarket < MARKET_GUARANTEE_GAP_TURNS) return list;

  const injected = createGuaranteedMarketChoice(player);
  const protectedActions = new Set(['portal_intent', 'wish_pool', 'scratch_lottery', 'custom_input']);
  let replaceIdx = list.length - 1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!protectedActions.has(String(list[i]?.action || ''))) {
      replaceIdx = i;
      break;
    }
  }
  list[replaceIdx] = injected;
  return list.slice(0, CHOICE_DISPLAY_COUNT);
}

function isGoldMakingChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  const action = String(choice.action || '');
  if (['fight', 'forage', 'hunt', 'treasure', 'market_renaiss', 'market_digital', 'scratch_lottery'].includes(action)) {
    return true;
  }
  const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
  return /(Rns(?:\s*代幣)?|RNS|金幣|賺錢|收入|鑑價|交易|戰利品|寶藏|採集|狩獵|刮刮樂|中獎)/i.test(text);
}

function createGuaranteedIncomeChoice(player) {
  const location = String(player?.location || '附近');
  const templates = [
    {
      tag: '[🎁高回報]',
      action: 'forage',
      name: '搜索路邊素材',
      choice: `沿著${location}邊緣採集可出售的草藥與素材`,
      desc: '穩定取得可交易物，適合前期快速累積資金'
    },
    {
      tag: '[🔍需探索]',
      action: 'treasure',
      name: '勘查碎礦脈',
      choice: `檢查${location}附近裂隙，嘗試撿到可賣碎晶`,
      desc: '有機會直接撿到高價素材，回報高於一般探索'
    },
    {
      tag: '[⚔️會戰鬥]',
      action: 'hunt',
      name: '追蹤可賣獵物',
      choice: `追蹤附近小型野獸，取得可出售獵物素材`,
      desc: '風險可控，能累積可換現金的獵物資源'
    }
  ];
  const pick = templates[Math.floor(Math.random() * templates.length)];
  return { ...pick };
}

function stableHashCode(source = '') {
  const text = String(source || '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

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
  const playerId = String(player?.id || '').trim();
  let worldWanted = 0;
  if (playerId && CORE && typeof CORE.getPlayerWantedLevel === 'function') {
    worldWanted = Math.max(0, Number(CORE.getPlayerWantedLevel(playerId) || 0));
  }
  return Math.max(localWanted, worldWanted);
}

function getWantedEscalationProfile(wantedLevel = 0) {
  const level = Math.max(0, Number(wantedLevel || 0));
  const clamped = Math.min(10, Math.floor(level));
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
      tag: '[🤝需社交]',
      name: '整理導師筆記',
      choice: `在${location}整理剛獲得的導師筆記，向在地人確認實戰用法`,
      desc: '先把新知識消化後再挑戰更高難度'
    };
  }
  return {
    action: 'explore',
    tag: '[🔍需探索]',
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
  source.tag = '[🤝友誼賽]';
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

function buildStoryBattleEnemyFromNpc(npc = null, player = null, options = {}) {
  if (!npc || typeof npc !== 'object') return null;
  const wantedLevel = Math.max(0, Number(options?.wantedLevel || 0));
  const escalation = getWantedEscalationProfile(wantedLevel);
  const difficulty = getLocationDifficultyForPlayer(player);
  const battle = Math.max(12, Number(npc?.stats?.戰力 || 24));
  const hpBase = Math.max(72, Number(npc?.stats?.生命 || 86));
  const energy = Math.max(10, Number(npc?.stats?.能量 || 24));
  const baselineByDifficulty = {
    1: { hp: 96, attack: 17, defense: 7 },
    2: { hp: 132, attack: 23, defense: 10 },
    3: { hp: 186, attack: 30, defense: 14 },
    4: { hp: 248, attack: 39, defense: 19 },
    5: { hp: 324, attack: 48, defense: 24 }
  };
  const curve = baselineByDifficulty[difficulty] || baselineByDifficulty[3];
  const hpDelta = Math.max(-18, Math.min(34, Math.floor((hpBase - 90) * 0.26)));
  const atkDelta = Math.max(-4, Math.min(10, Math.floor((battle - 26) * 0.12)));
  const defDelta = Math.max(-3, Math.min(8, Math.floor((energy - 26) * 0.1)));
  const baseHp = Math.max(72, Math.min(420, curve.hp + hpDelta));
  const baseAttack = Math.max(14, Math.min(95, curve.attack + atkDelta));
  const baseDefense = Math.max(6, Math.min(52, curve.defense + defDelta));
  const scaledHp = escalation.active ? Math.floor(baseHp * escalation.enemyScale) : baseHp;
  const scaledAttack = escalation.active ? Math.floor(baseAttack * (1 + (escalation.level * 0.06))) : baseAttack;
  const scaledDefense = escalation.active ? Math.floor(baseDefense * (1 + (escalation.level * 0.04))) : baseDefense;
  const hp = Math.max(72, Math.min(520, scaledHp));
  const attack = Math.max(14, Math.min(120, scaledAttack));
  const defense = Math.max(6, Math.min(72, scaledDefense));
  const moveIds = Array.isArray(npc?.battleMoveIds) ? npc.battleMoveIds : [];
  const moveNamesFromIds = moveIds
    .map((id) => (PET && typeof PET.getMoveById === 'function' ? PET.getMoveById(id) : null))
    .map((tpl) => String(tpl?.name || '').trim())
    .filter(Boolean);
  const skillNames = moveNamesFromIds.length > 0
    ? moveNamesFromIds.slice(0, 4)
    : Object.keys(npc?.skills || {}).filter(Boolean).slice(0, 4);
  const npcPet = npc?.petTemplate && typeof npc.petTemplate === 'object'
    ? {
        name: String(npc.petTemplate.name || `${npc.name || '在地勢力'}伴寵`),
        element: normalizePetElementCode(npc.petTemplate.element || npc.petElement || '水'),
        attack: Math.max(8, Number(npc.petTemplate.attack || 16)),
        hp: Math.max(24, Number(npc.petTemplate.hp || npc.petTemplate.maxHp || 58)),
        maxHp: Math.max(24, Number(npc.petTemplate.maxHp || npc.petTemplate.hp || 58))
      }
    : false;
  const villain = isNpcHostileByProfile(npc);
  const rewardMin = Math.max(36, 22 + difficulty * 18 + Math.floor((curve.attack + attack) * 1.4) + (escalation.active ? escalation.level * 14 : 0));
  const rewardMax = rewardMin + 80 + difficulty * 8 + (escalation.active ? escalation.level * 12 : 0);
  const companionPet = npcPet || (escalation.active && escalation.level >= 3 ? true : false);
  return {
    id: String(npc.id || npc.name || 'local_story_enemy').trim(),
    name: String(npc.name || '可疑敵手').trim(),
    hp,
    maxHp: hp,
    attack,
    defense,
    moves: skillNames.length > 0 ? skillNames : ['突襲', '破綻追擊', '壓制'],
    reward: { gold: [rewardMin, rewardMax] },
    faction: villain ? 'digital' : 'neutral',
    villain,
    isMonster: false,
    companionPet,
    wantedLevel: escalation.level,
    hunterCount: escalation.hunterCount
  };
}

function getNearbyStoryBattleNpcCandidates(player) {
  if (!player) return [];
  const location = String(player.location || '').trim();
  if (!location) return [];
  const ids = typeof CORE.getNearbyNpcIds === 'function'
    ? CORE.getNearbyNpcIds(location, 8)
    : [];
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const rows = [];
  for (const npcId of ids) {
    const info = typeof CORE.getAgentFullInfo === 'function'
      ? CORE.getAgentFullInfo(npcId)
      : null;
    if (!info) continue;
    if (typeof CORE.isNPCAlive === 'function' && !CORE.isNPCAlive(info.id || npcId)) continue;
    if (String(info.loc || '').trim() !== location) continue;
    rows.push(info);
  }
  return rows;
}

function scoreStoryBattleNpcCandidate(npc = null) {
  if (!npc || typeof npc !== 'object') return -999;
  const align = normalizeNpcAlignTag(npc);
  const battle = Number(npc?.stats?.戰力 || 0);
  const sect = [npc.sect || '', npc.title || '', npc.name || ''].join(' ');
  let score = battle;
  if (align === 'evil') score += 120;
  else if (align === 'neutral') score += 26;
  else score += 10;
  if (/digital|暗潮|黑市|滲透|叛徒|賊|匪|殺手|刺客/u.test(sect)) score += 85;
  if (npc.roaming) score += 40;
  return score;
}

function collectRecentStorySpeakerHints(player = null, storyText = '') {
  const hints = new Set();
  const dialogues = extractStoryDialogues(storyText);
  for (const row of dialogues) {
    const speaker = String(row?.speaker || '').trim();
    if (speaker) hints.add(speaker);
  }

  const pins = Array.isArray(player?.storyDialoguePins) ? player.storyDialoguePins : [];
  pins
    .slice(-8)
    .forEach((row) => {
      const speaker = String(row?.speaker || '').trim();
      if (speaker) hints.add(speaker);
    });

  const npcLog = Array.isArray(player?.npcDialogueLog) ? player.npcDialogueLog : [];
  npcLog
    .slice(-8)
    .forEach((row) => {
      const speaker = String(row?.speaker || row?.npcName || '').trim();
      if (speaker) hints.add(speaker);
    });

  return hints;
}

function normalizeConflictTargetName(name = '') {
  let text = String(name || '')
    .replace(/[「」『』"'`“”‘’\[\]{}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  text = text
    .replace(/^(?:那名|那位|剛才那名|剛才那位|刚才那名|刚才那位|一名|一位)\s*/u, '')
    .replace(/^(?:對方|对方)\s*/u, '')
    .trim();
  if (!text) return '';
  return text.slice(0, AGGRESSIVE_FOLLOWUP_TARGET_MAX_LEN);
}

function pickStoryConflictDisplayName(player = null, storyText = '', selectedChoice = '') {
  const story = String(storyText || '').trim();
  const sourceChoice = String(selectedChoice || '').trim();
  const playerName = String(player?.name || '').trim();

  const dialogues = extractStoryDialogues(story);
  for (let i = dialogues.length - 1; i >= 0; i--) {
    const speaker = normalizeConflictTargetName(dialogues[i]?.speaker || '');
    if (!speaker) continue;
    if (playerName && (speaker === playerName || speaker.includes(playerName))) continue;
    if (/^(冒險者|冒险者|你|我|主角|旁白)$/u.test(speaker)) continue;
    return speaker;
  }

  const speakerHints = collectRecentStorySpeakerHints(player, story);
  const nearbyRows = getNearbyStoryBattleNpcCandidates(player)
    .map((npc) => ({
      npc,
      score: scoreStoryBindingForNpc(npc, story, speakerHints)
    }))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const boundNpc = nearbyRows.find((row) => Number(row?.score || 0) > 0)?.npc;
  if (boundNpc?.name) return normalizeConflictTargetName(boundNpc.name);

  const tailSource = `${extractStoryEndingFocus(story)}\n${sourceChoice}`;
  const directPhrase = tailSource.match(/(?:那名|那位|剛才那名|剛才那位|刚才那名|刚才那位)([^，。；、\n]{1,14})/u);
  if (directPhrase && directPhrase[1]) {
    const normalized = normalizeConflictTargetName(directPhrase[1]);
    if (normalized) return normalized;
  }
  if (/(女子|少女|女聲|女声|女人|姑娘|她)/u.test(tailSource)) return '神秘女子';
  if (/(男子|男聲|男声|男人|他)/u.test(tailSource)) return '神秘男子';
  return '可疑人士';
}

function normalizePendingConflictFollowupState(raw = null, currentTurn = 0) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.active) return null;
  const sourceTurn = Math.max(0, Math.floor(Number(raw.sourceTurn || 0)));
  const triggerTurn = Math.max(sourceTurn + AGGRESSIVE_FOLLOWUP_MIN_TURNS, Math.floor(Number(raw.triggerTurn || sourceTurn + AGGRESSIVE_FOLLOWUP_MIN_TURNS)));
  const expireTurn = Math.max(triggerTurn, Math.floor(Number(raw.expireTurn || (sourceTurn + AGGRESSIVE_FOLLOWUP_WINDOW_TURNS))));
  if (Math.max(0, Math.floor(Number(currentTurn || 0))) > expireTurn) return null;
  const displayName = normalizeConflictTargetName(raw.displayName || '') || '可疑人士';
  return {
    active: true,
    sourceTurn,
    triggerTurn,
    expireTurn,
    location: String(raw.location || '').trim().slice(0, 32),
    sourceChoice: String(raw.sourceChoice || '').trim().slice(0, 220),
    displayName,
    injectedTurn: Math.max(0, Math.floor(Number(raw.injectedTurn || 0))),
    noNpcRetry: Math.max(0, Math.min(3, Math.floor(Number(raw.noNpcRetry || 0))))
  };
}

function getPendingConflictFollowup(player = null) {
  if (!player || typeof player !== 'object') return null;
  const normalized = normalizePendingConflictFollowupState(
    player.pendingConflictFollowup,
    getPlayerStoryTurns(player)
  );
  if (!normalized) {
    if (Object.prototype.hasOwnProperty.call(player, 'pendingConflictFollowup')) {
      delete player.pendingConflictFollowup;
    }
    return null;
  }
  if (JSON.stringify(player.pendingConflictFollowup || {}) !== JSON.stringify(normalized)) {
    player.pendingConflictFollowup = normalized;
  }
  return normalized;
}

function clearPendingConflictFollowup(player = null) {
  if (!player || typeof player !== 'object') return;
  if (Object.prototype.hasOwnProperty.call(player, 'pendingConflictFollowup')) {
    delete player.pendingConflictFollowup;
  }
}

function setPendingConflictFollowup(player = null, payload = {}) {
  if (!player || typeof player !== 'object') return null;
  const currentTurn = getPlayerStoryTurns(player);
  const displayName = normalizeConflictTargetName(payload.displayName || '') || '可疑人士';
  const state = {
    active: true,
    sourceTurn: currentTurn,
    triggerTurn: currentTurn + AGGRESSIVE_FOLLOWUP_MIN_TURNS,
    expireTurn: currentTurn + AGGRESSIVE_FOLLOWUP_WINDOW_TURNS,
    location: String(payload.location || player.location || '').trim().slice(0, 32),
    sourceChoice: String(payload.sourceChoice || '').trim().slice(0, 220),
    displayName,
    injectedTurn: 0,
    noNpcRetry: 0
  };
  player.pendingConflictFollowup = state;
  return state;
}

function scoreStoryBindingForNpc(npc = null, storyText = '', speakerHints = new Set()) {
  if (!npc || typeof npc !== 'object') return 0;
  const fullText = String(storyText || '').trim();
  if (!fullText) return 0;
  const focus = `${extractStoryEndingFocus(fullText)}\n${fullText.slice(-900)}`;
  const name = String(npc.name || '').trim();
  const title = String(npc.title || '').trim();
  const sect = String(npc.sect || '').trim();
  const identityText = [name, title, sect].filter(Boolean).join(' ');
  let score = 0;

  if (name && fullText.includes(name)) score += 240;
  if (title && fullText.includes(title)) score += 140;
  if (sect && fullText.includes(sect)) score += 90;
  if (name && focus.includes(name)) score += 80;
  if (title && focus.includes(title)) score += 50;

  if (speakerHints instanceof Set && speakerHints.size > 0) {
    if (name && speakerHints.has(name)) score += 180;
    if (title && speakerHints.has(title)) score += 90;
  }

  if (/新手友善供應|友善供應|供應隊/u.test(fullText) && /(供應|商隊|議價|暗潮|digital|滲透)/iu.test(identityText)) {
    score += 110;
  }
  if (/情報販子|黑影|披風商人/u.test(fullText) && /(商人|販子|情報|中介)/u.test(identityText)) {
    score += 85;
  }
  if (/茶師|工坊|修復臺|檢測/u.test(fullText) && /(茶|工坊|修復|工程|機械)/u.test(identityText)) {
    score += 65;
  }

  return score;
}

function resolveLocationStoryBattleTarget(player, storyText = '', options = {}) {
  const allowLooseSelection = options?.allowLooseSelection === true;
  const wantedLevel = Math.max(0, Number(options?.wantedLevel || 0));
  const escalation = getWantedEscalationProfile(wantedLevel);
  const preferVillain = Boolean(options?.preferVillain) || wantedLevel >= WANTED_AMBUSH_MIN_LEVEL;
  const speakerHints = collectRecentStorySpeakerHints(player, storyText);
  const baseCandidates = getNearbyStoryBattleNpcCandidates(player)
    .map((npc) => {
      const baseScore = scoreStoryBattleNpcCandidate(npc);
      const bindScore = scoreStoryBindingForNpc(npc, storyText, speakerHints);
      const hostileBoost = isNpcHostileByProfile(npc) && wantedLevel > 0
        ? Math.min(120, wantedLevel * 18)
        : 0;
      return { npc, baseScore, bindScore, total: baseScore + bindScore + hostileBoost };
    })
    .sort((a, b) => {
      const bindGap = Number(b.bindScore || 0) - Number(a.bindScore || 0);
      if (bindGap !== 0) return bindGap;
      const totalGap = Number(b.total || 0) - Number(a.total || 0);
      if (totalGap !== 0) return totalGap;
      return String(a?.npc?.id || '').localeCompare(String(b?.npc?.id || ''));
    });
  let candidates = baseCandidates;
  if (preferVillain) {
    const villains = candidates.filter((row) => isNpcHostileByProfile(row?.npc));
    if (villains.length > 0) {
      candidates = villains;
    } else if (wantedLevel >= WANTED_AMBUSH_MIN_LEVEL) {
      return null;
    }
  }
  const pickedRow = candidates[0];
  if (!pickedRow) return null;

  const hasBoundCandidate = candidates.some((row) => Number(row.bindScore || 0) > 0);
  const threatScore = computeStoryThreatScore(storyText);
  const allowThreatDrivenSelection = threatScore >= Math.max(18, STORY_THREAT_SCORE_THRESHOLD - 8) || wantedLevel >= WANTED_AMBUSH_MIN_LEVEL;
  if (!hasBoundCandidate && !allowLooseSelection && !allowThreatDrivenSelection) {
    return null;
  }

  const picked = hasBoundCandidate
    ? pickedRow.npc
    : (candidates.find((row) => !row?.npc?.roaming)?.npc || pickedRow.npc);

  if (picked) {
    return {
      npcId: String(picked.id || '').trim(),
      npcName: String(picked.name || '在地勢力').trim(),
      npcTitle: String(picked.title || '').trim(),
      enemy: buildStoryBattleEnemyFromNpc(picked, player, {
        wantedLevel,
        hunterCount: escalation.hunterCount
      })
    };
  }
  return null;
}

function createGuaranteedLocationStoryBattleChoice(player, storyText = '', options = {}) {
  const wantedLevel = Math.max(0, Number(options?.wantedLevel || getPlayerWantedPressure(player) || 0));
  const escalation = getWantedEscalationProfile(wantedLevel);
  const target = resolveLocationStoryBattleTarget(player, storyText, {
    allowLooseSelection: Boolean(options?.allowLooseSelection),
    preferVillain: Boolean(options?.preferVillain),
    wantedLevel
  });
  if (!target?.enemy) return null;
  const location = String(player?.location || '附近據點').trim() || '附近據點';
  const forcedDisplayName = normalizeConflictTargetName(options?.displayName || '');
  const displayNpcName = forcedDisplayName || (
    /匿名滲透者/u.test(String(target.npcName || ''))
      ? '可疑尾隨者'
      : String(target.npcName || '可疑敵手')
  );
  const reason = String(options?.reason || 'story').trim();
  const hunterText = escalation.active && escalation.hunterCount > 1
    ? `${escalation.hunterCount} 組追兵`
    : '追兵';
  const choiceText = reason === 'wanted'
    ? `察覺${location}周邊有${hunterText}盯上你，鎖定${displayNpcName}先發制人（會進入戰鬥）`
    : (reason === 'aggressive_followup'
      ? `攔下剛才出現在${location}的${displayNpcName}，正面逼問來源（會進入戰鬥）`
      : `察覺${location}氣氛不對勁，鎖定${displayNpcName}動向先發制人（會進入戰鬥）`);
  const descText = reason === 'wanted'
    ? `通緝熱度 Lv.${wantedLevel}｜敵對勢力主動接近：${displayNpcName}`
    : (reason === 'aggressive_followup'
      ? '你選擇把剛才的衝突升級為正面交鋒，對方可能當場反擊'
      : `地區篇章關鍵戰：對手來自${location}在地勢力`);
  const enemy = target?.enemy && typeof target.enemy === 'object'
    ? { ...target.enemy, name: displayNpcName, storyPersonaName: displayNpcName }
    : target.enemy;
  return {
    action: 'location_story_battle',
    tag: '[⚔️會戰鬥]',
    name: `攔截 ${displayNpcName}`,
    choice: choiceText,
    desc: descText,
    npcId: target.npcId,
    npcName: displayNpcName,
    enemy,
    locationStoryBattle: true
  };
}

function ensureLocationStoryBattleChoiceAvailability(player, choices = []) {
  const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
  if (!player || list.length === 0) return list;
  if (hasCurrentLocationStoryBattleDone(player)) return list;

  const state = syncLocationArcLocation(player);
  const turnsInLocation = Number(state?.turnsInLocation || 0);
  const cadence = getBattleCadenceInfo(player);
  const wantedPressure = getPlayerWantedPressure(player);
  const wantedEscalation = getWantedEscalationProfile(wantedPressure);
  const wantedDriven = wantedEscalation.active;
  if (!wantedDriven && turnsInLocation < LOCATION_STORY_BATTLE_MIN_TURNS) return list;
  if (list.some((choice) => String(choice?.action || '').trim() === 'location_story_battle')) return list;

  const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
  const threatScore = computeStoryThreatScore(storyText);
  if (!wantedDriven && threatScore < Math.max(14, STORY_THREAT_SCORE_THRESHOLD - 12)) return list;
  if (wantedDriven) {
    const allowWantedImmediateBattle =
      cadence.dueConflict ||
      threatScore >= Math.max(20, STORY_THREAT_SCORE_THRESHOLD - 6) ||
      Math.random() < wantedEscalation.ambushChance;
    // 高通緝不代表每回合都立刻開戰：僅在節奏點/高威脅時才注入即時戰鬥
    if (!allowWantedImmediateBattle) return list;
  }
  const injected = createGuaranteedLocationStoryBattleChoice(player, storyText, {
    allowLooseSelection: wantedDriven,
    preferVillain: wantedDriven,
    wantedLevel: wantedPressure,
    reason: wantedDriven ? 'wanted' : 'story'
  });
  if (!injected) return list;

  const protectedActions = new Set(['portal_intent', 'wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery', 'custom_input']);
  let replaceIdx = list.length - 1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!protectedActions.has(String(list[i]?.action || ''))) {
      replaceIdx = i;
      break;
    }
  }
  list[replaceIdx] = injected;
  return list.slice(0, CHOICE_DISPLAY_COUNT);
}

function isAggressiveChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  const action = String(choice.action || '').trim();
  if (action === 'fight' || action === 'location_story_battle') return true;
  if (isImmediateBattleChoice(choice)) return true;
  const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
  return /(🔥|高風險|會戰鬥|強攻|突襲|追擊|攔截|硬闖|正面交鋒|死鬥|搏命)/u.test(text);
}

function createGuaranteedAggressiveChoice(player) {
  const location = String(player?.location || '附近區域').trim() || '附近區域';
  return {
    action: 'location_story_battle',
    tag: '[⚔️會戰鬥]',
    name: '強奪可疑鑑價品',
    choice: `攔下剛在${location}兜售可疑鑑價品的人，直接打倒並奪下貨樣（會進入戰鬥）`,
    desc: '高風險：你選擇正面開打，嘗試奪取對方攜帶的可疑貨樣',
    forceImmediateBattle: true
  };
}

function createCadenceConflictPrepChoice(player) {
  const location = String(player?.location || '附近區域').trim() || '附近區域';
  return {
    action: 'conflict',
    tag: '[⚔️會戰鬥]',
    name: '先行佈防追蹤',
    choice: `在${location}提前布置觀測點，追蹤可疑勢力下一步動向`,
    desc: '衝突節奏升溫中：先備戰，必要時再立刻交戰'
  };
}

function ensureBattleCadenceChoiceAvailability(player, choices = []) {
  const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
  if (!player || list.length === 0) return list;
  if (list.some(isAggressiveChoice)) return list;

  const cadence = getBattleCadenceInfo(player);
  if (!cadence.nearConflict) return list;

  const wantedPressure = getPlayerWantedPressure(player);
  const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
  let injected = null;
  if (cadence.dueConflict) {
    injected = createGuaranteedLocationStoryBattleChoice(player, storyText, {
      allowLooseSelection: true,
      preferVillain: wantedPressure >= WANTED_AMBUSH_MIN_LEVEL,
      wantedLevel: wantedPressure,
      reason: 'cadence'
    });
    if (!injected) {
      const location = String(player?.location || '附近區域').trim() || '附近區域';
      injected = {
        action: 'fight',
        tag: '[⚔️會戰鬥]',
        name: '主動迎擊可疑勢力',
        choice: `在${location}主動攔截尾隨你的可疑勢力（會進入戰鬥）`,
        desc: `戰鬥節奏點 ${cadence.step}/${cadence.span}：將衝突拉到正面對決`
      };
    }
  } else {
    injected = createCadenceConflictPrepChoice(player);
  }
  if (!injected) return list;

  const protectedActions = new Set(['portal_intent', 'wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery', 'custom_input', 'mentor_spar']);
  let replaceIdx = list.length - 1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!protectedActions.has(String(list[i]?.action || ''))) {
      replaceIdx = i;
      break;
    }
  }
  list[replaceIdx] = injected;
  return list.slice(0, CHOICE_DISPLAY_COUNT);
}

function ensureAggressiveChoiceAvailability(player, choices = []) {
  const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
  if (!player || list.length === 0) return list;
  if (list.some(isAggressiveChoice)) return list;
  const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
  const threatScore = computeStoryThreatScore(storyText);
  if (threatScore < Math.max(16, STORY_THREAT_SCORE_THRESHOLD - 10)) return list;
  if (Math.random() > AGGRESSIVE_CHOICE_TARGET_RATE) return list;

  const injected = createGuaranteedAggressiveChoice(player);
  const protectedActions = new Set(['portal_intent', 'wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery', 'custom_input', 'mentor_spar']);
  let replaceIdx = list.length - 1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!protectedActions.has(String(list[i]?.action || ''))) {
      replaceIdx = i;
      break;
    }
  }
  list[replaceIdx] = injected;
  return list.slice(0, CHOICE_DISPLAY_COUNT);
}

function ensurePendingConflictImmediateBattleChoice(player, choices = []) {
  const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
  if (!player || list.length === 0) return list;

  const pending = getPendingConflictFollowup(player);
  if (!pending?.active) return list;

  const currentTurn = getPlayerStoryTurns(player);
  if (currentTurn < Number(pending.triggerTurn || 0)) return list;
  if (pending.injectedTurn > 0 && pending.injectedTurn === currentTurn) return list;

  const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
  const forcedChoice = createGuaranteedLocationStoryBattleChoice(player, storyText, {
    allowLooseSelection: true,
    preferVillain: true,
    wantedLevel: getPlayerWantedPressure(player),
    reason: 'aggressive_followup',
    displayName: pending.displayName
  });

  if (!forcedChoice) {
    pending.noNpcRetry = Math.max(0, Number(pending.noNpcRetry || 0)) + 1;
    pending.triggerTurn = currentTurn + 1;
    pending.expireTurn = Math.max(Number(pending.expireTurn || currentTurn + 1), currentTurn + 1);
    if (pending.noNpcRetry >= 2) {
      clearPendingConflictFollowup(player);
    } else {
      player.pendingConflictFollowup = pending;
    }
    return list;
  }

  const injected = {
    ...forcedChoice,
    forceImmediateBattle: true,
    action: 'location_story_battle'
  };

  const existingImmediateIdx = list.findIndex((choice) => isImmediateBattleChoice(choice));
  const protectedActions = new Set([
    'portal_intent',
    'wish_pool',
    'market_renaiss',
    'market_digital',
    'scratch_lottery',
    'custom_input',
    'mentor_spar'
  ]);
  let replaceIdx = existingImmediateIdx;
  if (replaceIdx < 0) {
    replaceIdx = list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!protectedActions.has(String(list[i]?.action || '').trim())) {
        replaceIdx = i;
        break;
      }
    }
  }
  list[replaceIdx] = injected;

  clearPendingConflictFollowup(player);
  return list.slice(0, CHOICE_DISPLAY_COUNT);
}

function shouldCountCombatForLocationStory(event = {}, result = {}, enemy = null) {
  const action = String(event?.action || '').trim();
  if (action === 'mentor_spar') return false;
  if (action === 'location_story_battle') return true;
  if (Boolean(event?.locationStoryBattle || result?.locationStoryBattle)) return true;
  if (event?.npcId || result?.npcId) return true;
  if (enemy && enemy.isMonster === false) return true;
  return false;
}

function ensureEarlyGameIncomeChoice(player, choices = []) {
  const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
  if (!player || list.length === 0) return list;
  if (getPlayerStoryTurns(player) >= EARLY_GAME_GOLD_GUARANTEE_TURNS) return list;
  if (list.some(isGoldMakingChoice)) return list;

  const injected = createGuaranteedIncomeChoice(player);
  const protectedActions = new Set(['portal_intent', 'wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery', 'custom_input']);
  let replaceIdx = list.length - 1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!protectedActions.has(String(list[i]?.action || ''))) {
      replaceIdx = i;
      break;
    }
  }
  list[replaceIdx] = injected;
  return list.slice(0, CHOICE_DISPLAY_COUNT);
}

function applyChoicePolicy(player, choices = []) {
  let list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
  if (!player || list.length === 0) return list;
  // Prompt-only 選項策略：
  // 只做安全性修正（如威脅場景下的即時戰鬥降級），不再本地注入模板選項。
  // 所有可玩性/主線/系統可用性由 AI 提示詞直接產生。
  list = ensurePendingConflictImmediateBattleChoice(player, list);
  list = applyStoryThreatGate(player, list);
  markSystemChoiceExposure(player, list);
  return list.slice(0, CHOICE_DISPLAY_COUNT);
}

function ensureStarterRewardState(player) {
  if (!player || typeof player !== 'object') return;
  if (!player.starterRewards || typeof player.starterRewards !== 'object') {
    player.starterRewards = { fivePullClaimed: false, claimedAt: 0 };
  }
  if (typeof player.starterRewards.fivePullClaimed !== 'boolean') {
    player.starterRewards.fivePullClaimed = false;
  }
  if (!Number.isFinite(Number(player.starterRewards.claimedAt))) {
    player.starterRewards.claimedAt = 0;
  }
}

function grantStarterFivePullIfNeeded(playerId) {
  const player = CORE.loadPlayer(playerId);
  if (!player) return null;
  ensureStarterRewardState(player);
  if (player.starterRewards.fivePullClaimed) return null;

  const drawResult = GACHA.drawMoveFree(player, STARTER_FIVE_PULL_COUNT, { grantPoints: false });
  if (!drawResult?.success) return null;

  const grantedChips = [];
  const failedMoves = [];

  for (const draw of drawResult.draws || []) {
    const move = draw?.move;
    if (!move?.name) continue;
    const added = addSkillChipToInventory(player, move.name);
    if (added) {
      grantedChips.push({
        name: move.name,
        tier: draw?.tier || move.tier || 1,
        emoji: draw?.tierEmoji || (move.tier === 3 ? '🔮' : move.tier === 2 ? '💠' : '⚪')
      });
      continue;
    }
    failedMoves.push(`${move.name}（發放失敗）`);
  }

  ensureStarterRewardState(player);
  player.starterRewards.fivePullClaimed = true;
  player.starterRewards.claimedAt = Date.now();
  CORE.savePlayer(player);

  return {
    draws: drawResult.draws || [],
    grantedChips,
    learnedMoves: grantedChips,
    duplicateMoves: [],
    failedMoves
  };
}

function cloneChoiceSnapshot(choices = []) {
  if (!Array.isArray(choices)) return [];
  return choices
    .filter(choice => choice && typeof choice === 'object')
    .slice(0, CHOICE_DISPLAY_COUNT)
    .map(choice => ({ ...choice }));
}

function normalizeGenerationStatus(status) {
  const value = String(status || 'idle');
  if (value === 'pending' || value === 'done' || value === 'failed' || value === 'idle') {
    return value;
  }
  return 'idle';
}

function normalizeNpcDialogueLog(logs = []) {
  const list = Array.isArray(logs) ? logs : [];
  const normalized = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const speaker = String(item.speaker || '').trim().slice(0, 24);
    const text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    if (!speaker || !text) continue;
    normalized.push({
      speaker,
      text,
      location: String(item.location || '').trim().slice(0, 24),
      source: String(item.source || 'npc').trim().slice(0, 24),
      at: Number.isFinite(Number(item.at)) ? Number(item.at) : Date.now()
    });
  }
  return normalized.slice(-NPC_DIALOGUE_LOG_LIMIT);
}

function appendNpcDialogueLog(player, payload = {}) {
  if (!player || typeof player !== 'object') return;
  ensurePlayerGenerationSchema(player);
  const speaker = String(payload.speaker || '').trim().slice(0, 24);
  const text = String(payload.text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  if (!speaker || !text) return;
  const logs = Array.isArray(player.npcDialogueLog) ? player.npcDialogueLog : [];
  logs.push({
    speaker,
    text,
    location: String(payload.location || player.location || '').trim().slice(0, 24),
    source: String(payload.source || 'npc').trim().slice(0, 24),
    at: Date.now()
  });
  player.npcDialogueLog = normalizeNpcDialogueLog(logs);
}

function ensurePlayerCodexSchema(player) {
  if (!player || typeof player !== 'object') return false;
  let mutated = false;
  if (!player.codex || typeof player.codex !== 'object') {
    player.codex = {};
    mutated = true;
  }
  if (!player.codex.npcEncountered || typeof player.codex.npcEncountered !== 'object') {
    player.codex.npcEncountered = {};
    mutated = true;
  }
  if (!player.codex.drawnMoves || typeof player.codex.drawnMoves !== 'object') {
    player.codex.drawnMoves = {};
    mutated = true;
  }
  if (!Number.isFinite(Number(player.codex.npcEncounterTotal))) {
    player.codex.npcEncounterTotal = 0;
    mutated = true;
  }
  if (!Number.isFinite(Number(player.codex.drawTotalCount))) {
    player.codex.drawTotalCount = 0;
    mutated = true;
  }
  if (!Number.isFinite(Number(player.codex.lastNpcEncounterAt))) {
    player.codex.lastNpcEncounterAt = 0;
    mutated = true;
  }
  if (!Number.isFinite(Number(player.codex.lastDrawAt))) {
    player.codex.lastDrawAt = 0;
    mutated = true;
  }

  const sanitizeEntries = (obj = {}, kind = 'npc') => {
    const rows = [];
    for (const [rawId, rawEntry] of Object.entries(obj || {})) {
      const id = String(rawId || '').trim();
      if (!id || !rawEntry || typeof rawEntry !== 'object') continue;
      const base = {
        id,
        name: String(rawEntry.name || id).trim().slice(0, 40),
        count: Math.max(1, Number(rawEntry.count || 1)),
        firstAt: Number(rawEntry.firstAt || rawEntry.lastAt || Date.now()),
        lastAt: Number(rawEntry.lastAt || rawEntry.firstAt || Date.now())
      };
      if (kind === 'npc') {
        rows.push({
          ...base,
          title: String(rawEntry.title || '').trim().slice(0, 24),
          firstLocation: String(rawEntry.firstLocation || '').trim().slice(0, 24),
          lastLocation: String(rawEntry.lastLocation || '').trim().slice(0, 24),
          lastSeenTurn: Math.max(0, Number(rawEntry.lastSeenTurn || 0))
        });
      } else {
        rows.push({
          ...base,
          tier: Math.max(1, Math.min(3, Number(rawEntry.tier || 1))),
          element: String(rawEntry.element || '未知').trim().slice(0, 16)
        });
      }
    }
    rows.sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0));
    const cap = kind === 'npc' ? PLAYER_CODEX_NPC_LIMIT : PLAYER_CODEX_DRAW_LIMIT;
    return rows.slice(0, cap);
  };

  const normalizedNpcEntries = sanitizeEntries(player.codex.npcEncountered, 'npc');
  const normalizedNpcMap = Object.fromEntries(normalizedNpcEntries.map((entry) => [entry.id, entry]));
  if (JSON.stringify(player.codex.npcEncountered || {}) !== JSON.stringify(normalizedNpcMap)) {
    player.codex.npcEncountered = normalizedNpcMap;
    mutated = true;
  }

  const normalizedDrawEntries = sanitizeEntries(player.codex.drawnMoves, 'draw');
  const normalizedDrawMap = Object.fromEntries(normalizedDrawEntries.map((entry) => [entry.id, entry]));
  if (JSON.stringify(player.codex.drawnMoves || {}) !== JSON.stringify(normalizedDrawMap)) {
    player.codex.drawnMoves = normalizedDrawMap;
    mutated = true;
  }

  const drawTotalFromEntries = normalizedDrawEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.count || 0)), 0);
  if (Number(player.codex.drawTotalCount || 0) < drawTotalFromEntries) {
    player.codex.drawTotalCount = drawTotalFromEntries;
    mutated = true;
  }

  return mutated;
}

function recordNpcEncounter(player, npc = null, location = '') {
  if (!player || !npc || typeof npc !== 'object') return false;
  ensurePlayerCodexSchema(player);
  const npcId = String(npc.id || '').trim();
  if (!npcId) return false;
  const now = Date.now();
  const turn = Math.max(0, Number(player.storyTurns || 0));
  const loc = String(location || player.location || npc.loc || '').trim();
  const bucket = player.codex.npcEncountered;
  const prev = bucket[npcId] && typeof bucket[npcId] === 'object' ? bucket[npcId] : null;
  if (prev && Number(prev.lastSeenTurn || 0) === turn && String(prev.lastLocation || '') === loc) {
    return false;
  }

  const nextCount = Math.max(0, Number(prev?.count || 0)) + 1;
  bucket[npcId] = {
    id: npcId,
    name: String(npc.name || prev?.name || npcId).trim().slice(0, 40),
    title: String(npc.title || prev?.title || '').trim().slice(0, 24),
    count: nextCount,
    firstAt: prev ? Number(prev.firstAt || now) : now,
    lastAt: now,
    firstLocation: prev ? String(prev.firstLocation || loc).trim().slice(0, 24) : loc.slice(0, 24),
    lastLocation: loc.slice(0, 24),
    lastSeenTurn: turn
  };
  player.codex.npcEncounterTotal = Math.max(0, Number(player.codex.npcEncounterTotal || 0)) + 1;
  player.codex.lastNpcEncounterAt = now;
  return true;
}

function recordNearbyNpcEncounters(player, limit = 8) {
  if (!player) return false;
  ensurePlayerCodexSchema(player);
  const location = String(player.location || '').trim();
  if (!location) return false;
  const nearbyIds = typeof CORE.getNearbyNpcIds === 'function'
    ? CORE.getNearbyNpcIds(location, Math.max(1, Number(limit || 8)))
    : [];
  let mutated = false;
  for (const npcId of Array.isArray(nearbyIds) ? nearbyIds : []) {
    if (typeof CORE.isNPCAlive === 'function' && !CORE.isNPCAlive(npcId)) continue;
    const npc = typeof CORE.getAgentFullInfo === 'function'
      ? CORE.getAgentFullInfo(npcId)
      : (Array.isArray(CORE.getAgents?.()) ? CORE.getAgents().find((a) => String(a?.id || '') === String(npcId)) : null);
    if (!npc) continue;
    if (recordNpcEncounter(player, npc, location)) mutated = true;
  }
  return mutated;
}

function formatCodexLines(lines = [], maxLen = 1000, emptyText = '（尚無）') {
  if (!Array.isArray(lines) || lines.length === 0) return emptyText;
  const picked = [];
  let size = 0;
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;
    const next = size + line.length + 1;
    if (next > maxLen) break;
    picked.push(line);
    size = next;
  }
  return picked.length > 0 ? picked.join('\n') : emptyText;
}

function normalizeStorySpeakerText(raw = '') {
  let text = String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/[「」『』"“”]/g, '')
    .trim();
  if (!text) return '';
  const chunks = text.split(/[，。！？!?：:]/).map((s) => s.trim()).filter(Boolean);
  if (chunks.length > 0) text = chunks[chunks.length - 1];
  text = text.replace(/^(一名|一位|某位|某個|那位|這位|該名|那名)/u, '').trim();
  text = text.replace(/(突然|輕聲|低聲|沙啞地|微笑著|笑著|開口|轉身|回頭)$/u, '').trim();
  if (!text) return '';
  return text.slice(0, 24);
}

function normalizeComparableStoryText(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[「」『』"'`“”‘’\s，。！？!?；;：:、（）()\[\]【】\-]/g, '')
    .trim();
}

function detectSpeakerGroup(speaker = '') {
  const text = String(speaker || '');
  if (/(女子|少女|女聲|女人|姑娘|姊|她)/u.test(text)) return 'female';
  if (/(男子|男聲|男人|叔|伯|他)/u.test(text)) return 'male';
  return 'neutral';
}

function isGenericSpeaker(speaker = '') {
  const text = String(speaker || '').trim();
  if (!text) return true;
  if (text.length <= 2) return true;
  return STORY_GENERIC_SPEAKER_PATTERN.test(text);
}

function toAlphaIndex(index = 1) {
  const n = Math.max(1, Number(index) || 1);
  return String.fromCharCode(64 + Math.min(26, n));
}

function aliasGenericSpeaker(speaker = '', state = {}) {
  const key = String(speaker || '').toLowerCase();
  state.aliasByKey = state.aliasByKey || new Map();
  state.counts = state.counts || { female: 0, male: 0, neutral: 0 };
  if (state.aliasByKey.has(key)) return state.aliasByKey.get(key);
  const group = detectSpeakerGroup(speaker);
  state.counts[group] = Number(state.counts[group] || 0) + 1;
  const suffix = toAlphaIndex(state.counts[group]);
  const alias = group === 'female'
    ? `神秘女子${suffix}`
    : (group === 'male' ? `神秘男子${suffix}` : `神秘人物${suffix}`);
  state.aliasByKey.set(key, alias);
  return alias;
}

function extractStoryDialogues(storyText = '') {
  const text = String(storyText || '');
  if (!text) return [];
  const out = [];
  const seen = new Set();
  const aliasState = { aliasByKey: new Map(), counts: { female: 0, male: 0, neutral: 0 } };

  const pushRow = (speakerRaw, quoteRaw, source = 'story_quote') => {
    const quote = String(quoteRaw || '').replace(/\s+/g, ' ').trim().slice(0, STORY_DIALOGUE_MAX_QUOTE_LEN);
    if (!quote || quote.length < 2) return;
    let speaker = normalizeStorySpeakerText(speakerRaw);
    if (!speaker) return;
    if (isGenericSpeaker(speaker)) {
      speaker = aliasGenericSpeaker(speaker, aliasState);
    }
    const key = `${speaker}|${quote}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ speaker, text: quote, source });
  };

  // 型態一：人物說：「台詞」
  const preQuotePattern = /([^\n「」]{1,32}?)(?:說道|說|問道|問|回道|回應|提醒|補充|低語|喊道|表示|開口|答道|笑道|低聲道)?[:：]\s*「([^」\n]{2,220})」/gu;
  let match = preQuotePattern.exec(text);
  while (match && out.length < STORY_DIALOGUE_MAX_PER_STORY) {
    pushRow(match[1], match[2], 'story_quote_pre');
    match = preQuotePattern.exec(text);
  }

  // 型態二：💬 角色：台詞
  const markerPattern = /💬\s*([^：:\n]{1,24})\s*[：:]\s*([^\n]{2,220})/gu;
  match = markerPattern.exec(text);
  while (match && out.length < STORY_DIALOGUE_MAX_PER_STORY) {
    pushRow(match[1], match[2], 'story_quote_marker');
    match = markerPattern.exec(text);
  }

  return out.slice(0, STORY_DIALOGUE_MAX_PER_STORY);
}

function normalizeStoryDialoguePins(pins = [], currentTurn = 0) {
  const list = Array.isArray(pins) ? pins : [];
  const nowTurn = Math.max(0, Math.floor(Number(currentTurn) || 0));
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const speaker = String(item.speaker || '').trim().slice(0, 24);
    const text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, STORY_DIALOGUE_MAX_QUOTE_LEN);
    if (!speaker || !text) continue;
    const expiresTurn = Math.max(nowTurn, Math.floor(Number(item.expiresTurn || 0)));
    if (expiresTurn < nowTurn) continue;
    const key = `${speaker}|${normalizeComparableStoryText(text)}`;
    if (!normalizeComparableStoryText(text) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      speaker,
      text,
      location: String(item.location || '').trim().slice(0, 24),
      source: String(item.source || 'story_quote').trim().slice(0, 24),
      firstTurn: Math.max(0, Math.floor(Number(item.firstTurn || nowTurn))),
      lastSeenTurn: Math.max(0, Math.floor(Number(item.lastSeenTurn || nowTurn))),
      expiresTurn
    });
  }
  out.sort((a, b) => {
    if (b.expiresTurn !== a.expiresTurn) return b.expiresTurn - a.expiresTurn;
    return b.lastSeenTurn - a.lastSeenTurn;
  });
  return out.slice(0, STORY_DIALOGUE_PIN_LIMIT);
}

function upsertStoryDialoguePins(player, rows = []) {
  if (!player || typeof player !== 'object') return 0;
  const entries = Array.isArray(rows) ? rows : [];
  if (entries.length === 0) return 0;
  const currentTurn = Math.max(0, Math.floor(Number(player.storyTurns || 0)));
  const list = normalizeStoryDialoguePins(player.storyDialoguePins, currentTurn);
  const index = new Map();
  for (const item of list) {
    const key = `${item.speaker}|${normalizeComparableStoryText(item.text)}`;
    if (key) index.set(key, item);
  }

  let changed = 0;
  for (const row of entries) {
    const speaker = String(row?.speaker || '').trim().slice(0, 24);
    const text = String(row?.text || '').replace(/\s+/g, ' ').trim().slice(0, STORY_DIALOGUE_MAX_QUOTE_LEN);
    if (!speaker || !text) continue;
    const cmp = normalizeComparableStoryText(text);
    if (!cmp) continue;
    const key = `${speaker}|${cmp}`;
    const existing = index.get(key);
    if (existing) {
      existing.lastSeenTurn = currentTurn;
      existing.expiresTurn = Math.max(existing.expiresTurn, currentTurn + STORY_DIALOGUE_PIN_TTL_TURNS);
      if (!existing.location && player.location) existing.location = String(player.location).slice(0, 24);
      changed += 1;
      continue;
    }
    const item = {
      speaker,
      text,
      location: String(player.location || '').trim().slice(0, 24),
      source: String(row?.source || 'story_quote').trim().slice(0, 24),
      firstTurn: currentTurn,
      lastSeenTurn: currentTurn,
      expiresTurn: currentTurn + STORY_DIALOGUE_PIN_TTL_TURNS
    };
    list.push(item);
    index.set(key, item);
    changed += 1;
  }

  player.storyDialoguePins = normalizeStoryDialoguePins(list, currentTurn);
  return changed;
}

function extractMainlineForeshadowClues(storyText = '') {
  const text = String(storyText || '');
  if (!text) return [];
  const chunks = text
    .split(/\n+/)
    .flatMap((line) => line.split(/[。！？!?]/))
    .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 10 && line.length <= 140);
  const out = [];
  const seen = new Set();
  for (const line of chunks) {
    if (!MAINLINE_CUE_PATTERN.test(line)) continue;
    const cmp = normalizeComparableStoryText(line);
    if (!cmp || seen.has(cmp)) continue;
    seen.add(cmp);
    out.push(line);
    if (out.length >= 6) break;
  }
  return out;
}

function normalizeMainlineForeshadowPins(pins = [], currentTurn = 0) {
  const list = Array.isArray(pins) ? pins : [];
  const nowTurn = Math.max(0, Math.floor(Number(currentTurn) || 0));
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    if (!text) continue;
    const expiresTurn = Math.max(nowTurn, Math.floor(Number(item.expiresTurn || 0)));
    if (expiresTurn < nowTurn) continue;
    const cmp = normalizeComparableStoryText(text);
    if (!cmp || seen.has(cmp)) continue;
    seen.add(cmp);
    out.push({
      text,
      location: String(item.location || '').trim().slice(0, 24),
      source: String(item.source || 'mainline').trim().slice(0, 24),
      firstTurn: Math.max(0, Math.floor(Number(item.firstTurn || nowTurn))),
      lastSeenTurn: Math.max(0, Math.floor(Number(item.lastSeenTurn || nowTurn))),
      expiresTurn
    });
  }
  out.sort((a, b) => {
    if (b.expiresTurn !== a.expiresTurn) return b.expiresTurn - a.expiresTurn;
    return b.lastSeenTurn - a.lastSeenTurn;
  });
  return out.slice(0, MAINLINE_PIN_LIMIT);
}

function upsertMainlineForeshadowPins(player, clues = []) {
  if (!player || typeof player !== 'object') return 0;
  const lines = Array.isArray(clues) ? clues : [];
  if (lines.length === 0) return 0;
  const currentTurn = Math.max(0, Math.floor(Number(player.storyTurns || 0)));
  const list = normalizeMainlineForeshadowPins(player.mainlineForeshadowPins, currentTurn);
  const index = new Map();
  for (const item of list) {
    const key = normalizeComparableStoryText(item.text);
    if (key) index.set(key, item);
  }

  let changed = 0;
  for (const line of lines) {
    const text = String(line || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    const key = normalizeComparableStoryText(text);
    if (!text || !key) continue;
    const existing = index.get(key);
    if (existing) {
      existing.lastSeenTurn = currentTurn;
      existing.expiresTurn = Math.max(existing.expiresTurn, currentTurn + MAINLINE_PIN_TTL_TURNS);
      if (!existing.location && player.location) existing.location = String(player.location).slice(0, 24);
      changed += 1;
      continue;
    }
    const item = {
      text,
      location: String(player.location || '').trim().slice(0, 24),
      source: 'mainline',
      firstTurn: currentTurn,
      lastSeenTurn: currentTurn,
      expiresTurn: currentTurn + MAINLINE_PIN_TTL_TURNS
    };
    list.push(item);
    index.set(key, item);
    changed += 1;
  }

  player.mainlineForeshadowPins = normalizeMainlineForeshadowPins(list, currentTurn);
  return changed;
}

function rememberStoryDialogues(player, storyText = '') {
  if (!player || !player.id) return 0;
  const rows = extractStoryDialogues(storyText);
  const clues = extractMainlineForeshadowClues(storyText);
  if ((!Array.isArray(rows) || rows.length === 0) && (!Array.isArray(clues) || clues.length === 0)) {
    return { quotes: 0, mainline: 0 };
  }
  let added = 0;
  for (const row of rows) {
    appendNpcDialogueLog(player, {
      speaker: row.speaker,
      text: row.text,
      location: player.location,
      source: row.source || 'story_quote'
    });
    if (typeof CORE.appendNpcQuoteMemory === 'function') {
      try {
        CORE.appendNpcQuoteMemory(player.id, {
          npcId: row.speaker,
          npcName: row.speaker,
          speaker: row.speaker,
          text: row.text,
          location: player.location || '',
          source: row.source || 'story_quote'
        });
      } catch (e) {
        console.log('[StoryQuote] appendNpcQuoteMemory failed:', e?.message || e);
      }
    }
    added += 1;
  }
  const pinCount = upsertStoryDialoguePins(player, rows);
  const mainlineCount = upsertMainlineForeshadowPins(player, clues);
  if (typeof CORE.appendPlayerMemoryAudit === 'function') {
    if (added > 0 || pinCount > 0) {
      const quotePreview = rows.slice(0, 2).map((row) => `${row.speaker}：「${String(row.text || '').slice(0, 24)}」`).join('、');
      CORE.appendPlayerMemoryAudit(player, {
        layer: 'npc_quote_pin',
        category: '對話記憶',
        reason: `從故事抽取可驗證對話 ${added} 條；寫入對話釘選 ${pinCount} 條`,
        content: quotePreview || '本回合抽取到可驗證對話',
        source: 'story_quote_extract',
        tags: ['npc_quote', 'dialogue_pin']
      });
    }
    if (mainlineCount > 0) {
      const cluePreview = clues.slice(0, 2).join('、');
      CORE.appendPlayerMemoryAudit(player, {
        layer: 'mainline_pin',
        category: '主線記憶',
        reason: `命中主線鋪陳線索，保留 ${mainlineCount} 條供後續延續`,
        content: cluePreview || '本回合新增主線鋪陳',
        source: 'story_mainline_extract',
        tags: ['main_story', 'mainline_pin']
      });
    }
  }
  return { quotes: added, dialoguePins: pinCount, mainline: mainlineCount };
}

function triggerMainlineForeshadowAIInBackground(player, options = {}) {
  const playerId = String(player?.id || '').trim();
  const storyText = String(options.storyText || '').trim();
  if (!playerId || !storyText) return;
  if (!STORY || typeof STORY.analyzeMainlineForeshadowCandidates !== 'function') return;

  const location = String(options.location || player?.location || '').trim();
  const previousAction = String(options.previousAction || '').trim();
  const playerLang = String(options.playerLang || player?.language || 'zh-TW').trim();
  const phase = String(options.phase || 'story').trim();

  Promise.resolve()
    .then(async () => {
      const lines = await STORY.analyzeMainlineForeshadowCandidates({
        storyText,
        location,
        previousAction,
        playerLang
      });
      if (!Array.isArray(lines) || lines.length === 0) return;
      const fresh = CORE.loadPlayer(playerId);
      if (!fresh) return;
      ensurePlayerGenerationSchema(fresh);
      const inserted = upsertMainlineForeshadowPins(fresh, lines);
      if (inserted > 0) {
        if (typeof CORE.appendPlayerMemoryAudit === 'function') {
          CORE.appendPlayerMemoryAudit(fresh, {
            layer: 'mainline_ai',
            category: '主線記憶',
            reason: `背景AI判定為長期鋪陳，寫入 ${inserted} 條主線釘選`,
            content: lines.slice(0, 2).join('、') || '背景AI補充主線鋪陳',
            source: `mainline_ai_${phase}`,
            tags: ['main_story', 'mainline_ai']
          });
        }
        CORE.savePlayer(fresh);
        console.log(`[MainlineAI] phase=${phase} player=${playerId} inserted=${inserted}`);
      }
    })
    .catch((e) => {
      console.log('[MainlineAI] background error:', e?.message || e);
    });
}

function ensurePlayerGenerationSchema(player) {
  if (!player || typeof player !== 'object') return false;
  let mutated = false;

  if (ensurePlayerCodexSchema(player)) {
    mutated = true;
  }

  if (typeof player.currentStory !== 'string') {
    player.currentStory = player.currentStory ? String(player.currentStory) : '';
    mutated = true;
  }
  if (!Array.isArray(player.eventChoices)) {
    player.eventChoices = [];
    mutated = true;
  }
  if (!Array.isArray(player.generationHistory)) {
    player.generationHistory = [];
    mutated = true;
  }
  const normalizedMapViewMode = normalizeMapViewMode(player.mapViewMode);
  if (player.mapViewMode !== normalizedMapViewMode) {
    player.mapViewMode = normalizedMapViewMode;
    mutated = true;
  }
  if (!Number.isFinite(Number(player.lastQuickShopTurn))) {
    player.lastQuickShopTurn = 0;
    mutated = true;
  } else {
    const normalizedLastQuickShopTurn = Math.max(0, Math.floor(Number(player.lastQuickShopTurn)));
    if (normalizedLastQuickShopTurn !== Number(player.lastQuickShopTurn)) {
      player.lastQuickShopTurn = normalizedLastQuickShopTurn;
      mutated = true;
    }
  }
  const normalizedNpcLog = normalizeNpcDialogueLog(player.npcDialogueLog);
  if (JSON.stringify(player.npcDialogueLog || []) !== JSON.stringify(normalizedNpcLog)) {
    player.npcDialogueLog = normalizedNpcLog;
    mutated = true;
  }
  const currentTurn = Math.max(0, Math.floor(Number(player.storyTurns || 0)));
  const normalizedStoryPins = normalizeStoryDialoguePins(player.storyDialoguePins, currentTurn);
  if (JSON.stringify(player.storyDialoguePins || []) !== JSON.stringify(normalizedStoryPins)) {
    player.storyDialoguePins = normalizedStoryPins;
    mutated = true;
  }
  const normalizedMainlinePins = normalizeMainlineForeshadowPins(player.mainlineForeshadowPins, currentTurn);
  if (JSON.stringify(player.mainlineForeshadowPins || []) !== JSON.stringify(normalizedMainlinePins)) {
    player.mainlineForeshadowPins = normalizedMainlinePins;
    mutated = true;
  }
  const normalizedPendingConflict = normalizePendingConflictFollowupState(player.pendingConflictFollowup, currentTurn);
  if (normalizedPendingConflict) {
    if (JSON.stringify(player.pendingConflictFollowup || {}) !== JSON.stringify(normalizedPendingConflict)) {
      player.pendingConflictFollowup = normalizedPendingConflict;
      mutated = true;
    }
  } else if (Object.prototype.hasOwnProperty.call(player, 'pendingConflictFollowup')) {
    delete player.pendingConflictFollowup;
    mutated = true;
  }
  const normalizedRecentChoices = normalizeRecentChoiceHistory(player.recentChoiceHistory);
  if (JSON.stringify(player.recentChoiceHistory || []) !== JSON.stringify(normalizedRecentChoices)) {
    player.recentChoiceHistory = normalizedRecentChoices;
    mutated = true;
  }
  const normalizedMainlineBridge = normalizeMainlineBridgeLock(player.mainlineBridgeLock, player);
  const activeMainlineBridge = normalizedMainlineBridge && currentTurn <= Number(normalizedMainlineBridge.expireTurn || 0)
    ? normalizedMainlineBridge
    : null;
  if (activeMainlineBridge) {
    if (JSON.stringify(player.mainlineBridgeLock || {}) !== JSON.stringify(activeMainlineBridge)) {
      player.mainlineBridgeLock = activeMainlineBridge;
      mutated = true;
    }
  } else if (Object.prototype.hasOwnProperty.call(player, 'mainlineBridgeLock')) {
    delete player.mainlineBridgeLock;
    mutated = true;
  }

  const rawState = player.generationState && typeof player.generationState === 'object'
    ? player.generationState
    : {};
  if (player.generationState !== rawState) mutated = true;

  const normalizedState = {
    id: rawState.id ? String(rawState.id) : null,
    source: rawState.source ? String(rawState.source) : 'none',
    status: normalizeGenerationStatus(rawState.status),
    phase: rawState.phase ? String(rawState.phase) : 'idle',
    startedAt: Number(rawState.startedAt) || 0,
    updatedAt: Number(rawState.updatedAt) || 0,
    sourceChoice: rawState.sourceChoice ? String(rawState.sourceChoice) : '',
    lastError: rawState.lastError || null,
    storySnapshot: rawState.storySnapshot ? String(rawState.storySnapshot) : '',
    choicesSnapshot: cloneChoiceSnapshot(rawState.choicesSnapshot),
    loadingMessageId: rawState.loadingMessageId ? String(rawState.loadingMessageId) : null,
    attempts: Math.max(0, Number(rawState.attempts) || 0)
  };

  if (normalizedState.status === 'pending') {
    const now = Date.now();
    const staleBase = Math.max(0, Number(normalizedState.updatedAt || normalizedState.startedAt || 0));
    const elapsed = staleBase > 0 ? now - staleBase : 0;
    if (elapsed > GENERATION_PENDING_STALE_MS) {
      normalizedState.status = 'failed';
      normalizedState.phase = 'stale_pending_recovered';
      normalizedState.loadingMessageId = null;
      normalizedState.lastError = {
        message: `generation pending stale timeout (${elapsed}ms)`,
        at: now,
        phase: 'stale_pending_recovered'
      };
      normalizedState.updatedAt = now;
      normalizedState.storySnapshot = normalizedState.storySnapshot || String(player.currentStory || '');
      normalizedState.choicesSnapshot = cloneChoiceSnapshot(normalizedState.choicesSnapshot);
      mutated = true;
    }
  }

  if (JSON.stringify(player.generationState || {}) !== JSON.stringify(normalizedState)) {
    player.generationState = normalizedState;
    mutated = true;
  }

  const history = [];
  for (const item of player.generationHistory) {
    if (!item || typeof item !== 'object') continue;
    history.push({
      id: item.id ? String(item.id) : null,
      source: item.source ? String(item.source) : 'unknown',
      status: normalizeGenerationStatus(item.status),
      phase: item.phase ? String(item.phase) : '',
      startedAt: Number(item.startedAt) || 0,
      endedAt: Number(item.endedAt) || 0,
      sourceChoice: item.sourceChoice ? String(item.sourceChoice) : '',
      story: item.story ? String(item.story) : '',
      choices: cloneChoiceSnapshot(item.choices),
      error: item.error ? String(item.error) : '',
      location: item.location ? String(item.location) : ''
    });
  }

  const trimmed = history.slice(-GENERATION_HISTORY_LIMIT);
  if (JSON.stringify(player.generationHistory) !== JSON.stringify(trimmed)) {
    player.generationHistory = trimmed;
    mutated = true;
  }

  if (!player.generationState || typeof player.generationState !== 'object') {
    player.generationState = normalizedState;
    mutated = true;
  }

  return mutated;
}

function pushGenerationHistory(player, record = {}) {
  ensurePlayerGenerationSchema(player);
  const history = Array.isArray(player.generationHistory) ? player.generationHistory : [];
  history.push({
    id: record.id ? String(record.id) : null,
    source: record.source ? String(record.source) : 'unknown',
    status: normalizeGenerationStatus(record.status),
    phase: record.phase ? String(record.phase) : '',
    startedAt: Number(record.startedAt) || 0,
    endedAt: Number(record.endedAt) || Date.now(),
    sourceChoice: record.sourceChoice ? String(record.sourceChoice) : '',
    story: record.story ? String(record.story) : '',
    choices: cloneChoiceSnapshot(record.choices),
    error: record.error ? String(record.error) : '',
    location: record.location ? String(record.location) : ''
  });
  player.generationHistory = history.slice(-GENERATION_HISTORY_LIMIT);
}

function startGenerationState(player, metadata = {}) {
  ensurePlayerGenerationSchema(player);
  const now = Date.now();
  const nextAttempt = Math.max(1, Number(metadata.attempts) || Number(player.generationState?.attempts || 0) + 1);
  const nextId = `${player?.id || 'player'}-${now}-${Math.random().toString(36).slice(2, 7)}`;
  player.generationState = {
    id: nextId,
    source: metadata.source ? String(metadata.source) : 'unknown',
    status: 'pending',
    phase: metadata.phase ? String(metadata.phase) : 'init',
    startedAt: now,
    updatedAt: now,
    sourceChoice: metadata.sourceChoice ? String(metadata.sourceChoice) : '',
    lastError: null,
    storySnapshot: metadata.storySnapshot ? String(metadata.storySnapshot) : '',
    choicesSnapshot: cloneChoiceSnapshot(metadata.choicesSnapshot),
    loadingMessageId: metadata.loadingMessageId ? String(metadata.loadingMessageId) : null,
    attempts: nextAttempt
  };
  return player.generationState;
}

function updateGenerationState(player, patch = {}) {
  ensurePlayerGenerationSchema(player);
  const state = player.generationState || {};
  if (patch.source !== undefined) state.source = patch.source ? String(patch.source) : state.source;
  if (patch.phase !== undefined) state.phase = patch.phase ? String(patch.phase) : state.phase;
  if (patch.status !== undefined) state.status = normalizeGenerationStatus(patch.status);
  if (patch.sourceChoice !== undefined) state.sourceChoice = patch.sourceChoice ? String(patch.sourceChoice) : '';
  if (patch.loadingMessageId !== undefined) {
    state.loadingMessageId = patch.loadingMessageId ? String(patch.loadingMessageId) : null;
  }
  if (patch.storySnapshot !== undefined) {
    state.storySnapshot = patch.storySnapshot ? String(patch.storySnapshot) : '';
  }
  if (patch.choicesSnapshot !== undefined) {
    state.choicesSnapshot = cloneChoiceSnapshot(patch.choicesSnapshot);
  }
  if (patch.lastError !== undefined) {
    state.lastError = patch.lastError || null;
  }
  state.updatedAt = Date.now();
  player.generationState = state;
  return state;
}

function finishGenerationState(player, status, extras = {}) {
  ensurePlayerGenerationSchema(player);
  const state = player.generationState || {};
  const endedAt = Date.now();
  const finalStatus = normalizeGenerationStatus(status);
  state.status = finalStatus;
  state.phase = extras.phase ? String(extras.phase) : state.phase || 'done';
  state.updatedAt = endedAt;

  if (extras.storySnapshot !== undefined) {
    state.storySnapshot = extras.storySnapshot ? String(extras.storySnapshot) : '';
  } else if (String(player.currentStory || '').trim()) {
    state.storySnapshot = String(player.currentStory || '');
  }
  if (extras.choicesSnapshot !== undefined) {
    state.choicesSnapshot = cloneChoiceSnapshot(extras.choicesSnapshot);
  } else if (Array.isArray(player.eventChoices) && player.eventChoices.length > 0) {
    state.choicesSnapshot = cloneChoiceSnapshot(player.eventChoices);
  }

  if (finalStatus === 'failed') {
    const message = extras.error ? String(extras.error) : 'unknown error';
    state.lastError = {
      message,
      at: endedAt,
      phase: state.phase || ''
    };
  } else {
    state.lastError = null;
  }

  player.generationState = state;
  pushGenerationHistory(player, {
    id: state.id,
    source: state.source,
    status: finalStatus,
    phase: state.phase,
    startedAt: Number(state.startedAt) || endedAt,
    endedAt,
    sourceChoice: state.sourceChoice || '',
    story: state.storySnapshot || '',
    choices: state.choicesSnapshot || [],
    error: finalStatus === 'failed' ? (state.lastError?.message || '') : '',
    location: player?.location || ''
  });
  return state;
}

function restoreStoryFromGenerationState(player) {
  ensurePlayerGenerationSchema(player);
  const existingStory = String(player.currentStory || '').trim();
  if (existingStory) return false;

  const fromState = String(player.generationState?.storySnapshot || '').trim();
  if (fromState) {
    player.currentStory = fromState;
    return true;
  }

  const history = Array.isArray(player.generationHistory) ? player.generationHistory : [];
  for (let i = history.length - 1; i >= 0; i--) {
    const story = String(history[i]?.story || '').trim();
    if (!story) continue;
    player.currentStory = story;
    return true;
  }

  return false;
}

function restoreChoicesFromGenerationState(player) {
  ensurePlayerGenerationSchema(player);
  if (Array.isArray(player.eventChoices) && player.eventChoices.length > 0) return false;
  const story = String(player.currentStory || '').trim();
  if (!story) return false;

  const state = player.generationState || {};
  const stateChoices = cloneChoiceSnapshot(state.choicesSnapshot);
  if (stateChoices.length > 0 && String(state.storySnapshot || '').trim() === story) {
    player.eventChoices = stateChoices;
    return true;
  }

  const history = Array.isArray(player.generationHistory) ? player.generationHistory : [];
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (String(item?.story || '').trim() !== story) continue;
    const choices = cloneChoiceSnapshot(item?.choices);
    if (choices.length === 0) continue;
    player.eventChoices = choices;
    return true;
  }

  return false;
}

function rememberPlayer(player, memory) {
  if (!player || !memory || !memory.content) return;
  const tags = Array.isArray(memory.tags) ? memory.tags.map((t) => String(t || '').trim().toLowerCase()) : [];
  const type = String(memory.type || '').trim();
  const content = String(memory.content || '').trim();
  const outcome = String(memory.outcome || '').trim();
  const merged = `${type} ${content} ${outcome}`.toLowerCase();
  if (tags.includes('friend_duel') || type.includes('好友友誼戰') || merged.includes('friend_duel') || merged.includes('好友友誼戰')) {
    return;
  }
  CORE.appendPlayerMemory(player, memory);
}

function applyMainStoryCombatProgress(player, enemyName, victory = false) {
  if (!player || typeof MAIN_STORY.recordCombatOutcome !== 'function') return '';
  const progress = MAIN_STORY.recordCombatOutcome(player, { enemyName, victory });
  if (!progress) return '';
  if (progress.announcement) {
    EVENTS.addWorldEvent(progress.announcement, 'main_story');
  }
  if (progress.memory) {
    rememberPlayer(player, {
      type: '主線',
      content: progress.memory,
      importance: 3,
      tags: ['main_story', 'combat_progress']
    });
  }
  return String(progress.appendText || '').trim();
}

async function notifyStoryBusy(interaction) {
  if (!interaction) return;
  const msg = '⏳ 正在生成故事中，請等這一輪完成再操作。';
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
  } else {
    await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
}

function shouldTriggerBattle(event, result) {
  if (!event) return false;
  if (result?.type === 'combat') return true;
  if (String(event?.action || '') === 'mentor_spar') return false;
  return isImmediateBattleChoice(event);
}

function applyPassivePetRecovery(pet, amount = PET_PASSIVE_HEAL_PER_STORY_TURN) {
  if (!pet || typeof pet !== 'object') return 0;
  const heal = Math.max(0, Math.floor(Number(amount) || 0));
  if (heal <= 0) return 0;
  const status = String(pet.status || '').trim();
  if (status === '蛋' || status === '死亡' || status === '休眠') return 0;
  const maxHp = Math.max(1, Number(pet.maxHp || 0));
  const currentHp = Math.max(0, Number(pet.hp || 0));
  if (maxHp <= 0 || currentHp <= 0 || currentHp >= maxHp) return 0;
  const nextHp = Math.min(maxHp, currentHp + heal);
  const gained = Math.max(0, nextHp - currentHp);
  if (gained > 0) pet.hp = nextHp;
  return gained;
}

function applyPetRecoveryTurnTick(pet, turns = 1) {
  if (!pet || typeof pet !== 'object') {
    return { revived: false, changed: false, remainingTurns: 0 };
  }
  if (typeof PET.advancePetRecoveryTurns === 'function') {
    const result = PET.advancePetRecoveryTurns(pet, turns) || {};
    return {
      revived: Boolean(result.revived),
      changed: Boolean(result.changed),
      remainingTurns: Math.max(0, Number(result.remainingTurns || 0))
    };
  }
  if (typeof PET.syncPetRecovery === 'function') {
    const synced = PET.syncPetRecovery(pet) || {};
    return {
      revived: Boolean(synced.revived),
      changed: Boolean(synced.changed),
      remainingTurns: 0
    };
  }
  return { revived: false, changed: false, remainingTurns: 0 };
}

function getLocationDifficultyForPlayer(player) {
  const profile = typeof getLocationProfile === 'function'
    ? getLocationProfile(player?.location)
    : null;
  const difficulty = Number(profile?.difficulty || 3);
  return Number.isFinite(difficulty) ? difficulty : 3;
}

function isLikelyHumanoidEnemyName(name = '') {
  const n = String(name || '').trim();
  if (!n) return false;
  const explicitMonster = /(哥布林|狼人|殭屍|飛龍|地精|鼠王|怪|獸|骸骨|魔|鬼|龍|鳳)/u;
  if (explicitMonster.test(n)) return false;
  const humanoid = /(人物|斥候|刺客|巡行|商人|學徒|伏擊者|旅人|隊長|試煉者|護衛|士兵|盜匪|殺手)/u;
  return humanoid.test(n);
}

function resolveEnemyIsMonster(sourceEnemy, fallbackName = '') {
  if (typeof sourceEnemy?.isMonster === 'boolean') return sourceEnemy.isMonster;
  const inferredHuman = isLikelyHumanoidEnemyName(sourceEnemy?.name || fallbackName);
  return !inferredHuman;
}

function buildNpcCompanionPet(enemy, player) {
  const existing = enemy?.companionPet;
  const difficulty = getLocationDifficultyForPlayer(player);
  const newbieZone = difficulty <= 2;
  const petNamePool = newbieZone
    ? ['街貓', '灰羽雀', '小山犬', '竹影狸']
    : ['影牙獵犬', '鐵羽鷹', '霧爪豹', '赤瞳狼'];
  const fallbackName = petNamePool[Math.floor(Math.random() * petNamePool.length)];

  const baseAttack = Number(existing?.attack || enemy?.attack || 10);
  const baseHp = Number(existing?.hp || existing?.maxHp || enemy?.maxHp || enemy?.hp || 50);

  const petAttack = newbieZone
    ? Math.max(7, Math.floor(baseAttack * 0.45))
    : Math.max(10, Math.floor(baseAttack * 0.52));
  const petHp = newbieZone
    ? Math.max(26, Math.floor(baseHp * 0.42))
    : Math.max(36, Math.floor(baseHp * 0.52));

  return {
    name: String(existing?.name || fallbackName),
    element: normalizePetElementCode(existing?.element || '水'),
    attack: petAttack,
    hp: petHp,
    maxHp: petHp,
    newbieScaled: newbieZone
  };
}

function applyNpcCompanionPet(enemy, player) {
  if (!enemy || enemy.isMonster) return enemy;
  if (enemy.companionPet === false) return enemy;
  if (enemy.name === '哥布林' || enemy.name === '狼人') return enemy;

  const npcPet = buildNpcCompanionPet(enemy, player);
  const newbieZone = getLocationDifficultyForPlayer(player) <= 2;
  const atkGain = Math.max(1, Math.floor(npcPet.attack * (newbieZone ? 0.6 : 0.68)));
  const hpGain = Math.max(1, Math.floor(npcPet.maxHp * (newbieZone ? 0.45 : 0.5)));
  const defGain = Math.max(1, Math.floor(npcPet.attack * (newbieZone ? 0.1 : 0.14)));

  enemy.npcPet = npcPet;
  enemy.attack = Math.max(1, Number(enemy.attack || 0) + atkGain);
  enemy.defense = Math.max(1, Number(enemy.defense || 0) + defGain);
  enemy.hp = Math.max(1, Number(enemy.hp || 1) + hpGain);
  enemy.maxHp = Math.max(enemy.hp, Number(enemy.maxHp || enemy.hp || 1) + hpGain);

  const petMoveName = `${npcPet.name} 協同攻擊`;
  const petMoveDamage = Math.max(1, Math.floor(npcPet.attack * 0.8));
  const hasPetMove = Array.isArray(enemy.moves) && enemy.moves.some(m => {
    const name = typeof m === 'string' ? m : m?.name;
    return name === petMoveName;
  });
  if (!Array.isArray(enemy.moves)) enemy.moves = [];
  if (!hasPetMove) {
    enemy.moves.push({ name: petMoveName, damage: petMoveDamage, effect: {} });
  }

  return enemy;
}

function pickFallbackEnemyNamesByDifficulty(player) {
  const difficulty = getLocationDifficultyForPlayer(player);
  if (difficulty <= 1) return ['哥布林', '哥布林', '哥布林', '狼人'];
  if (difficulty === 2) return ['哥布林', '哥布林', '狼人', '狼人', '巫師學徒'];
  if (difficulty === 3) return ['狼人', '巫師學徒'];
  if (difficulty === 4) return ['巫師學徒', '殭屍'];
  return ['殭屍'];
}

function sanitizeInferredEnemyName(raw = '') {
  let name = String(raw || '').trim();
  if (!name) return '';
  name = name
    .replace(/[「」『』《》【】\[\]()（）]/g, '')
    .replace(/^(?:一名|一位|一個|一群|兩名|三名|四名|數名|多名|那名|這名|該名|那些|這些)/u, '')
    .replace(/(?:們|等人|之人|角色)$/u, '')
    .trim();
  if (!name) return '';
  if (name.length > 12) name = name.slice(0, 12);
  return name;
}

function inferEnemyNameFromText(text = '') {
  const source = String(text || '');
  if (!source) return '';

  const directPriority = [
    '覆面獵手',
    '蒙面殺手',
    '低價刺客',
    'Digital 斥候',
    '伏擊者',
    '可疑人物',
    '巫師學徒',
    '狼人',
    '哥布林',
    '殭屍'
  ];
  for (const keyword of directPriority) {
    if (source.includes(keyword)) return keyword;
  }

  const rolePattern = /([^\s，。；、（）()「」『』《》]{1,8}(?:殺手|獵手|斥候|伏擊者|可疑人物|刺客|盜匪|護衛|隊長|頭目|學徒|狼人|哥布林|殭屍))/gu;
  const roleMatches = Array.from(source.matchAll(rolePattern));
  if (roleMatches.length > 0) {
    const picked = roleMatches[roleMatches.length - 1]?.[1] || roleMatches[0]?.[1];
    const clean = sanitizeInferredEnemyName(picked);
    if (clean) return clean;
  }

  const actionPattern = /(?:對上|迎戰|衝向|攻擊|挑戰|攔下|追擊|阻止|擊退|對決|與)\s*([^\s，。；、（）()「」『』《》]{2,10})/gu;
  const actionMatches = Array.from(source.matchAll(actionPattern));
  if (actionMatches.length > 0) {
    const picked = actionMatches[actionMatches.length - 1]?.[1] || actionMatches[0]?.[1];
    const clean = sanitizeInferredEnemyName(picked);
    if (clean) return clean;
  }

  return '';
}

function inferEnemyNameFromContext(event, result, player) {
  const parts = [
    event?.name,
    event?.choice,
    event?.desc,
    result?.message
  ];
  for (const text of parts) {
    const inferred = inferEnemyNameFromText(text);
    if (inferred) return inferred;
  }
  return '';
}

function getBattleEnemyName(event, result, player = null, options = {}) {
  const explicit = result?.enemy?.name || event?.enemy?.name;
  if (explicit) return explicit;
  const inferred = inferEnemyNameFromContext(event, result, player);
  if (inferred) return inferred;
  const fallback = pickFallbackEnemyNamesByDifficulty(player);
  if (options?.deterministicFallback) return fallback[0];
  return fallback[Math.floor(Math.random() * fallback.length)];
}

function applyBeginnerZoneEnemyBalance(enemy, player) {
  if (!enemy || !player) return enemy;
  const difficulty = getLocationDifficultyForPlayer(player);
  const playerLevel = Math.max(1, Number(player?.level || 1));
  if (difficulty > 2 || playerLevel > 6) return enemy;

  // 新手區保護保留，但避免過弱導致「幾乎 100% 勝率」
  const hpScale = difficulty <= 1 ? 0.98 : 1.0;
  const atkScale = difficulty <= 1 ? 0.96 : 1.0;
  const defScale = difficulty <= 1 ? 0.96 : 1.0;
  const minHp = Math.max(44, 54 + playerLevel * 11 + difficulty * 6);
  const minAtk = Math.max(14, 18 + playerLevel * 2 + (difficulty - 1) * 2);
  const minDef = Math.max(5, 5 + Math.floor(playerLevel * 1.2));
  const maxHp = difficulty <= 1
    ? Math.max(86, 104 + playerLevel * 13)
    : Math.max(120, 132 + playerLevel * 15);
  const maxAtk = difficulty <= 1
    ? Math.max(24, 30 + playerLevel * 2)
    : Math.max(30, 34 + playerLevel * 2);
  const maxDef = difficulty <= 1
    ? Math.max(14, 14 + Math.floor(playerLevel))
    : Math.max(18, 18 + Math.floor(playerLevel * 1.1));

  const scaledHp = Math.max(minHp, Math.floor((enemy.hp || 1) * hpScale));
  enemy.hp = Math.min(maxHp, scaledHp);
  enemy.maxHp = Math.min(maxHp, Math.max(enemy.hp, Math.floor((enemy.maxHp || scaledHp) * hpScale)));
  enemy.attack = Math.min(maxAtk, Math.max(minAtk, Math.floor((enemy.attack || 1) * atkScale)));
  enemy.defense = Math.min(maxDef, Math.max(minDef, Math.floor((enemy.defense || 0) * defScale)));
  enemy.beginnerBalanced = true;
  return enemy;
}

function applyBeginnerZoneDangerVariant(enemy, player) {
  if (!enemy || !player) return enemy;
  const difficulty = getLocationDifficultyForPlayer(player);
  const playerLevel = Math.max(1, Number(player?.level || 1));
  if (difficulty > 2 || playerLevel > 8) return enemy;
  if (Math.random() > 0.42) return enemy; // 約 42% 出現偏強敵

  const powerScale = difficulty <= 1 ? 1.26 : 1.3;
  enemy.hp = Math.max(1, Math.floor((enemy.hp || 1) * powerScale));
  enemy.maxHp = Math.max(enemy.hp, Math.floor((enemy.maxHp || enemy.hp || 1) * powerScale));
  enemy.attack = Math.max(1, Math.floor((enemy.attack || 1) * (powerScale + 0.05)));
  enemy.defense = Math.max(1, Math.floor((enemy.defense || 1) * (powerScale - 0.01)));
  enemy.beginnerDanger = true;
  return enemy;
}

function buildEnemyForBattle(event, result, player, options = {}) {
  const level = Math.max(1, player?.level || 1);
  const requestedEnemyName = getBattleEnemyName(event, result, player, options);
  const base = BATTLE.createEnemy(requestedEnemyName, level);
  const sourceEnemy = result?.enemy || event?.enemy || {};
  const factionText = String(sourceEnemy?.faction || sourceEnemy?.side || '').toLowerCase();
  const explicitVillain = Boolean(
    sourceEnemy?.villain === true ||
    sourceEnemy?.isVillain === true ||
    /digital|chaos|dark|暗潮|反派|機變/u.test(factionText)
  );
  const enemyName = sourceEnemy.name || requestedEnemyName || base.name;
  const resolvedIsMonster = resolveEnemyIsMonster(sourceEnemy, enemyName);
  const hp = sourceEnemy.hp || sourceEnemy.maxHp || base.hp;
  const reward = sourceEnemy.reward || base.reward || { gold: [20, 40] };
  const rewardGold = Array.isArray(reward.gold) ? reward.gold : [20, 40];
  const enemy = {
    ...base,
    ...sourceEnemy,
    id: sourceEnemy.id || enemyName || base.name,
    name: enemyName,
    hp: hp,
    maxHp: sourceEnemy.maxHp || hp,
    attack: sourceEnemy.attack || base.attack,
    defense: sourceEnemy.defense ?? base.defense,
    moves: BATTLE.buildEnemyMoveLoadout(
      enemyName,
      level,
      sourceEnemy.moves || base.moves || [],
      {
        villain: explicitVillain,
        attack: sourceEnemy.attack || base.attack || 12
      }
    ),
    reward: { ...reward, gold: rewardGold },
    isMonster: resolvedIsMonster,
    companionPet: sourceEnemy.companionPet,
    ignoreBeginnerBalance: Boolean(sourceEnemy.ignoreBeginnerBalance || base.ignoreBeginnerBalance),
    ignoreBeginnerDanger: Boolean(sourceEnemy.ignoreBeginnerDanger || base.ignoreBeginnerDanger)
  };
  applyNpcCompanionPet(enemy, player);
  const skipBalance = options?.skipBeginnerBalance || enemy.ignoreBeginnerBalance;
  const skipDanger = options?.skipBeginnerDanger || enemy.ignoreBeginnerDanger;
  if (!skipBalance) applyBeginnerZoneEnemyBalance(enemy, player);
  if (!skipDanger) applyBeginnerZoneDangerVariant(enemy, player);
  return enemy;
}

const MENTOR_SPAR_WIN_HP_RATIO = 0.35;

function cloneMoveTemplateForBattle(move = {}) {
  return {
    ...move,
    effect: { ...(move?.effect || {}) }
  };
}

function buildMoveTemplateByNameMap() {
  const list = [
    ...getAllPetSkillMoves(),
    ...(Array.isArray(PET.INITIAL_MOVES) ? PET.INITIAL_MOVES : [])
  ];
  const map = new Map();
  for (const move of list) {
    const key = String(move?.name || '').trim();
    if (!key || map.has(key)) continue;
    map.set(key, move);
  }
  return map;
}

const MOVE_TEMPLATE_BY_NAME = buildMoveTemplateByNameMap();

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
  const templates = teaches
    .map((name) => MOVE_TEMPLATE_BY_NAME.get(String(name || '').trim()))
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
  const petDef = Math.max(8, Number(pet?.defense || 15));
  const enemyMaxHp = Math.max(95, Math.floor(petMaxHp * (1.12 + difficulty * 0.04)));
  const enemyAttack = Math.max(14, Math.floor(petAtk * (0.9 + difficulty * 0.04)));
  const enemyDefense = Math.max(7, Math.floor(petDef * (0.85 + difficulty * 0.03)));
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

const HUMAN_COMBAT_MOVE = {
  id: 'human_strike',
  name: '徒手猛擊',
  element: '普通',
  tier: 1,
  baseDamage: 10,
  effect: {},
  desc: '你親自出手，硬碰硬地壓制對手'
};

const WAIT_COMBAT_MOVE = {
  id: 'battle_wait',
  name: '蓄能待機',
  element: '策略',
  tier: 1,
  baseDamage: 0,
  effect: { wait: true },
  desc: '本回合不攻擊，保留節奏與能量'
};
const MANUAL_ENEMY_RESPONSE_DELAY_MS = 1000;
const FRIEND_DUEL_ONLINE_TURN_MS = Math.max(20000, Number(process.env.FRIEND_DUEL_ONLINE_TURN_MS || 20000));
const ONLINE_FRIEND_DUEL_TIMERS = new Map();

function summarizeBattleDetailForStory(detail = '', maxLen = 260) {
  const text = String(detail || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

function composePostBattleStory(player, outcomeLine, detail = '', epilogue = '', triggerChoice = '', baseStory = '') {
  const prev = String(baseStory || player?.battleState?.preBattleStory || player?.currentStory || '').trim();
  const trigger = String(triggerChoice || '').trim();
  const summary = summarizeBattleDetailForStory(detail);
  const parts = [];
  if (prev) parts.push(prev);
  if (trigger) parts.push(`你先前的決定：${trigger}`);
  if (outcomeLine) parts.push(outcomeLine);
  if (summary) parts.push(`戰況摘要：${summary}`);
  if (epilogue) parts.push(epilogue);
  const merged = parts.filter(Boolean).join('\n\n');
  if (merged.length <= 2200) return merged;
  return merged.slice(merged.length - 2200);
}

function composeActionBridgeStory(player, triggerChoice = '', resultText = '') {
  const prev = String(player?.currentStory || '').trim();
  const trigger = String(triggerChoice || '').trim();
  const summary = summarizeBattleDetailForStory(resultText, 420);
  const parts = [];
  if (prev) parts.push(prev);
  if (trigger) parts.push(`你剛做出的行動：${trigger}`);
  if (summary) parts.push(`現場結果：${summary}`);
  const merged = parts.filter(Boolean).join('\n\n');
  if (!merged) return prev;
  if (merged.length <= 2200) return merged;
  return merged.slice(merged.length - 2200);
}

function maybeResolveMentorSparResult(player, enemy, roundResult) {
  const spar = player?.battleState?.mentorSpar;
  if (!spar || !enemy || !roundResult) return roundResult;
  const threshold = Math.max(
    1,
    Number(spar.acceptHpThreshold || Math.floor(Number(enemy?.maxHp || enemy?.hp || 1) * MENTOR_SPAR_WIN_HP_RATIO))
  );
  const mentorName = String(spar.mentorName || enemy?.name || '導師');
  if (roundResult.victory === null && Number(enemy?.hp || 0) <= threshold) {
    return {
      ...roundResult,
      victory: true,
      gold: 0,
      wantedLevel: 0,
      message: `${roundResult.message || ''}\n🤝 ${mentorName}抬手示意停戰：你已通過試煉。`.trim()
    };
  }
  if (roundResult.victory === true) {
    return {
      ...roundResult,
      gold: 0,
      wantedLevel: 0,
      message: `${roundResult.message || ''}\n🤝 ${mentorName}點頭：這場友誼賽到此為止。`.trim()
    };
  }
  return roundResult;
}

function recordMentorSparCompletion(player, spar = {}, result = 'done') {
  if (!player || typeof player !== 'object') return;
  const mentorId = String(spar?.mentorId || '').trim();
  const mentorName = String(spar?.mentorName || mentorId || '導師').trim();
  if (!mentorId) return;

  const record = ensureMentorSparRecord(player);
  const now = Date.now();
  const turn = getPlayerStoryTurns(player);
  record.completedByMentor[mentorId] = {
    mentorId,
    mentorName,
    mentorTitle: String(spar?.mentorTitle || '').trim(),
    mentorLoc: String(spar?.mentorLoc || player?.location || '').trim(),
    result: String(result || 'done'),
    completedAt: now,
    completedTurn: turn
  };
  if (!record.completedOrder.includes(mentorId)) {
    record.completedOrder.push(mentorId);
  }
  record.totalCompleted = Object.keys(record.completedByMentor).length;

  player.lastMentorSparTurn = turn;

  if (!Array.isArray(player.achievements)) player.achievements = [];
  const achievementId = `mentor_spar:${mentorId}`;
  if (!player.achievements.some((row) => String(row?.id || '') === achievementId)) {
    player.achievements.push({
      id: achievementId,
      type: 'mentor_spar',
      title: `友誼賽成就｜${mentorName}`,
      summary: '已完成一次性友誼賽，無法再次挑戰同導師',
      at: now
    });
  }
}

function finalizeMentorSparVictory(player, pet, detailText = '') {
  const battleState = player?.battleState || {};
  const spar = battleState?.mentorSpar || {};
  const mentorName = String(spar.mentorName || '導師');
  const teachMoveIds = Array.isArray(spar.teachMoveIds) ? spar.teachMoveIds : [];
  let learnedMove = null;
  let learnReason = '';
  for (const moveId of teachMoveIds) {
    const result = PET.learnMove(pet, moveId);
    if (result?.success) {
      learnedMove = result.move;
      break;
    }
    if (!learnReason && result?.reason) learnReason = result.reason;
  }
  PET.savePet(pet);

  const sourceChoice = String(battleState?.sourceChoice || '').trim();
  const baseStory = String(battleState?.preBattleStory || player?.currentStory || '').trim();
  recordMentorSparCompletion(player, spar, 'victory');
  const learnLine = learnedMove
    ? `📜 ${mentorName}收你為徒，傳授了「${learnedMove.name}」。`
    : `📜 ${mentorName}願意收你為徒，但本次未新增招式（${learnReason || '你已掌握其核心招式'}）。`;
  rememberPlayer(player, {
    type: '友誼賽',
    content: `與${mentorName}完成友誼賽`,
    outcome: learnedMove ? `學會 ${learnedMove.name}` : `收徒成功｜${learnReason || '無新招式'}`,
    importance: 3,
    tags: ['mentor_spar', 'apprentice']
  });
  player.currentStory = composePostBattleStory(
    player,
    `🤝 你在友誼賽中獲得 ${mentorName} 認可。`,
    detailText,
    `${learnLine}\n你把這份指導記在心裡，準備帶往下一段冒險。\n🔒 你已完成與 ${mentorName} 的一次性友誼賽，之後不可重複挑戰。`,
    sourceChoice,
    baseStory
  );
  queuePendingStoryTrigger(player, {
    name: '友誼賽結果',
    choice: sourceChoice || `與${mentorName}友誼賽`,
    desc: `${mentorName} 的試煉已告一段落`,
    action: 'mentor_spar_result',
    outcome: `${learnLine}\n${String(detailText || '').trim()}`
  });
  player.battleState = null;
  player.eventChoices = [];
  CORE.savePlayer(player);
  return { mentorName, learnedMove, learnReason, learnLine };
}

function finalizeMentorSparDefeat(player, pet, combatant, detailText = '') {
  const battleState = player?.battleState || {};
  const spar = battleState?.mentorSpar || {};
  const mentorName = String(spar.mentorName || '導師');
  if (pet) {
    pet.hp = pet.maxHp || 100;
    pet.status = '正常';
    pet.reviveAt = null;
    pet.reviveTurnsRemaining = 0;
    pet.lastDownReason = '友誼賽落敗後由導師治療';
    pet.lastRevivedAt = Date.now();
    PET.savePet(pet);
  }
  if (combatant?.isHuman) {
    player.stats.生命 = Math.max(1, Number(player?.maxStats?.生命 || 100));
  }
  const sourceChoice = String(battleState?.sourceChoice || '').trim();
  const baseStory = String(battleState?.preBattleStory || player?.currentStory || '').trim();
  recordMentorSparCompletion(player, spar, 'defeat');
  rememberPlayer(player, {
    type: '友誼賽',
    content: `在與${mentorName}的友誼賽中落敗`,
    outcome: '導師當場治療我方，並給予戰術建議',
    importance: 2,
    tags: ['mentor_spar', 'defeat', 'healed']
  });
  player.currentStory = composePostBattleStory(
    player,
    `🤝 你在友誼賽中敗給了 ${mentorName}。`,
    detailText,
    `${mentorName}沒有追擊，反而立刻替你的夥伴做緊急修復，並提醒你下次該如何調整節奏。\n🔒 這場友誼賽已列入紀錄，同一位導師不會再重複切磋。`,
    sourceChoice,
    baseStory
  );
  queuePendingStoryTrigger(player, {
    name: '友誼賽結果',
    choice: sourceChoice || `與${mentorName}友誼賽`,
    desc: `${mentorName} 指導你調整戰術節奏`,
    action: 'mentor_spar_result',
    outcome: String(detailText || '').trim()
  });
  player.battleState = null;
  player.eventChoices = [];
  CORE.savePlayer(player);
  return { mentorName };
}

function formatRecoveryTurnsShort(turns = 0) {
  const safe = Math.max(0, Math.floor(Number(turns) || 0));
  return `${safe}回合`;
}

function normalizePendingStoryTrigger(raw = null) {
  if (!raw || typeof raw !== 'object') return null;
  const choice = String(raw.choice || '').trim().slice(0, 220);
  const desc = String(raw.desc || '').trim().slice(0, 320);
  const outcome = String(raw.outcome || '').trim().slice(0, 1200);
  const name = String(raw.name || '').trim().slice(0, 120);
  const action = String(raw.action || '').trim().slice(0, 80);
  const source = String(raw.source || '').trim().slice(0, 80);
  const forceFreshStory = Boolean(raw.forceFreshStory);
  if (!choice && !desc && !outcome && !name && !action) return null;
  return {
    name: name || '後續推進',
    choice,
    desc,
    action: action || 'followup',
    outcome,
    source: source || 'system',
    forceFreshStory,
    createdAt: Number(raw.createdAt || Date.now()) || Date.now()
  };
}

function queuePendingStoryTrigger(player, trigger = {}) {
  if (!player || typeof player !== 'object') return;
  const normalized = normalizePendingStoryTrigger({
    ...trigger,
    forceFreshStory: true,
    createdAt: Date.now()
  });
  if (!normalized) return;
  player.pendingStoryTrigger = normalized;
}

function getPendingStoryTrigger(player) {
  return normalizePendingStoryTrigger(player?.pendingStoryTrigger || null);
}

function clearPendingStoryTrigger(player) {
  if (!player || typeof player !== 'object') return;
  if (Object.prototype.hasOwnProperty.call(player, 'pendingStoryTrigger')) {
    delete player.pendingStoryTrigger;
  }
}

function normalizeMainlineBridgeLock(raw = null, player = null) {
  if (!raw || typeof raw !== 'object') return null;
  const goal = String(raw.goal || raw.mainlineGoal || '').trim().slice(0, 220);
  if (!goal) return null;
  const location = String(raw.location || player?.location || '').trim().slice(0, 40);
  const stage = Math.max(1, Math.floor(Number(raw.stage || raw.mainlineStage || 1) || 1));
  const stageCount = Math.max(stage, Math.floor(Number(raw.stageCount || raw.mainlineStageCount || 8) || 8));
  const progress = String(raw.progress || raw.mainlineProgress || `地區進度 ${stage}/${stageCount}`).trim().slice(0, 80);
  const sourceChoice = String(raw.sourceChoice || '').trim().slice(0, 220);
  const createdAt = Number(raw.createdAt || Date.now()) || Date.now();
  const currentTurn = Math.max(0, Math.floor(Number(player?.storyTurns || 0)));
  const expireRaw = Number(raw.expireTurn);
  const expireTurn = Number.isFinite(expireRaw)
    ? Math.max(currentTurn, Math.floor(expireRaw))
    : (currentTurn + MAINLINE_BRIDGE_LOCK_TTL_TURNS);
  return {
    goal,
    location,
    stage,
    stageCount,
    progress,
    sourceChoice,
    createdAt,
    expireTurn
  };
}

function getMainlineBridgeLock(player, options = {}) {
  if (!player || typeof player !== 'object') return null;
  const autoClear = options?.autoClear !== false;
  const normalized = normalizeMainlineBridgeLock(player.mainlineBridgeLock, player);
  if (!normalized) {
    if (autoClear && Object.prototype.hasOwnProperty.call(player, 'mainlineBridgeLock')) {
      delete player.mainlineBridgeLock;
    }
    return null;
  }
  const currentTurn = Math.max(0, Math.floor(Number(player?.storyTurns || 0)));
  if (currentTurn > Number(normalized.expireTurn || 0)) {
    if (autoClear && Object.prototype.hasOwnProperty.call(player, 'mainlineBridgeLock')) {
      delete player.mainlineBridgeLock;
    }
    return null;
  }
  if (autoClear && JSON.stringify(player.mainlineBridgeLock || {}) !== JSON.stringify(normalized)) {
    player.mainlineBridgeLock = normalized;
  }
  return normalized;
}

function setMainlineBridgeLock(player, payload = {}) {
  if (!player || typeof player !== 'object') return null;
  const currentTurn = Math.max(0, Math.floor(Number(player?.storyTurns || 0)));
  const normalized = normalizeMainlineBridgeLock({
    ...payload,
    createdAt: Date.now(),
    expireTurn: currentTurn + MAINLINE_BRIDGE_LOCK_TTL_TURNS
  }, player);
  if (!normalized) return null;
  player.mainlineBridgeLock = normalized;
  return normalized;
}

function clearMainlineBridgeLock(player) {
  if (!player || typeof player !== 'object') return;
  if (Object.prototype.hasOwnProperty.call(player, 'mainlineBridgeLock')) {
    delete player.mainlineBridgeLock;
  }
}

function consumeMainlineBridgeLock(player) {
  const lock = getMainlineBridgeLock(player, { autoClear: false });
  clearMainlineBridgeLock(player);
  return lock;
}

function formatPetHpWithRecovery(pet) {
  const hp = `${Number(pet?.hp || 0)}/${Number(pet?.maxHp || 0)}`;
  const remain = typeof PET.getPetRecoveryRemainingTurns === 'function'
    ? Number(PET.getPetRecoveryRemainingTurns(pet) || 0)
    : 0;
  if (remain > 0) return `${hp}（復活倒數 ${formatRecoveryTurnsShort(remain)}）`;
  return hp;
}

function getAdventureText(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const map = {
    'zh-TW': {
      statusLabel: '狀態',
      statusHp: '氣血',
      statusEnergy: '能量',
      statusCurrency: 'Rns 代幣',
      mainlineDone: (location) => `📖 本區主線：已完成（${location}）`,
      mainlineProgress: (location) => `📖 本區主線：進行中（${location}）`,
      missionBoss: (done) => `｜關鍵任務：擊敗四巨頭全員（${done ? '已完成' : '未完成'}）`,
      missionNpc: (name, location, done) => `｜關鍵NPC：${name}@${location}（${done ? '已完成' : '未完成'}）`,
      sectionChoices: '🆕 選項',
      sectionNewChoices: '🆕 新選項',
      chooseNumber: (max) => `請選擇編號（1-${max}）`,
      sectionWorldEvents: '📢 世界事件',
      lastChoice: '📍 上個選擇',
      sectionPrevStory: '📜 前情提要',
      sectionUpcomingChoices: '🆕 即將更新選項'
    },
    'zh-CN': {
      statusLabel: '状态',
      statusHp: '气血',
      statusEnergy: '能量',
      statusCurrency: 'Rns 代币',
      mainlineDone: (location) => `📖 本区主线：已完成（${location}）`,
      mainlineProgress: (location) => `📖 本区主线：进行中（${location}）`,
      missionBoss: (done) => `｜关键任务：击败四巨头全员（${done ? '已完成' : '未完成'}）`,
      missionNpc: (name, location, done) => `｜关键NPC：${name}@${location}（${done ? '已完成' : '未完成'}）`,
      sectionChoices: '🆕 选项',
      sectionNewChoices: '🆕 新选项',
      chooseNumber: (max) => `请选择编号（1-${max}）`,
      sectionWorldEvents: '📢 世界事件',
      lastChoice: '📍 上个选择',
      sectionPrevStory: '📜 前情提要',
      sectionUpcomingChoices: '🆕 即将更新选项'
    },
    en: {
      statusLabel: 'Status',
      statusHp: 'HP',
      statusEnergy: 'Energy',
      statusCurrency: 'Rns Tokens',
      mainlineDone: (location) => `📖 Local Mainline: Completed (${location})`,
      mainlineProgress: (location) => `📖 Local Mainline: In Progress (${location})`,
      missionBoss: (done) => ` | Key Mission: Defeat all Four Commanders (${done ? 'Done' : 'Pending'})`,
      missionNpc: (name, location, done) => ` | Key NPC: ${name}@${location} (${done ? 'Done' : 'Pending'})`,
      sectionChoices: '🆕 Choices',
      sectionNewChoices: '🆕 New Choices',
      chooseNumber: (max) => `Choose a number (1-${max})`,
      sectionWorldEvents: '📢 World Events',
      lastChoice: '📍 Previous Choice',
      sectionPrevStory: '📜 Previous Context',
      sectionUpcomingChoices: '🆕 Incoming Choices'
    }
  };
  return map[code] || map['zh-TW'];
}

function buildMainStatusBar(player, pet, lang = '') {
  const tx = getAdventureText(lang || player?.language || 'zh-TW');
  const hpText = formatPetHpWithRecovery(pet);
  return `${tx.statusHp} ${hpText} | ${tx.statusEnergy} ${player.stats.能量 || 10}/${player.maxStats.能量 || 10} | ${tx.statusCurrency} ${player.stats.財富} | ${player.location}`;
}

function getIslandMainlineProgressMeta(player) {
  const location = String(player?.location || '').trim();
  if (!location) return null;
  const islandState = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
    ? ISLAND_STORY.getIslandStoryState(player, location)
    : null;
  if (!islandState) return null;
  const stage = Math.max(1, Number(islandState?.stage || 1));
  const stageCount = Math.max(8, Number(islandState?.stageCount || 8));
  return {
    location,
    stage,
    stageCount,
    completed: Boolean(islandState?.completed),
    progressText: `地區進度 ${stage}/${stageCount}`
  };
}

function buildMainlineProgressLine(player, lang = '') {
  const tx = getAdventureText(lang || player?.language || 'zh-TW');
  const meta = getIslandMainlineProgressMeta(player);
  if (!meta) return '';
  const mission = (MAIN_STORY && typeof MAIN_STORY.getCurrentRegionMission === 'function')
    ? MAIN_STORY.getCurrentRegionMission(player, meta.location)
    : null;
  const missionLine = mission
    ? (mission.regionId === 'island_routes'
      ? tx.missionBoss(Boolean(mission.keyFound))
      : tx.missionNpc(String(mission.npcName || 'Unknown'), String(mission.npcLocation || 'Unknown'), Boolean(mission.keyFound)))
    : '';
  if (meta.completed) {
    return `${tx.mainlineDone(meta.location)}${missionLine}`;
  }
  return `${tx.mainlineProgress(meta.location)}${missionLine}`;
}

function detectStitchedBattleStory(story = '') {
  const text = String(story || '').trim();
  if (!text) return false;
  const patterns = [
    /你先前的決定[:：]/u,
    /你剛做出的行動[:：]/u,
    /現場結果[:：]/u,
    /戰況摘要[:：]/u,
    /戰場餘波未散/u
  ];
  let hits = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) hits += 1;
  }
  return hits >= 3;
}

function extractBattleChoiceHintFromStory(story = '') {
  const text = String(story || '');
  const matched =
    text.match(/你先前的決定[:：]\s*([^\n]{2,160})/u) ||
    text.match(/你剛做出的行動[:：]\s*([^\n]{2,160})/u);
  const choice = String(matched?.[1] || '').trim();
  return choice.slice(0, 160);
}

function normalizeWorldEventEntry(entry, source) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { message: entry, timestamp: 0, source };
  }
  if (typeof entry !== 'object') return null;
  return {
    message: String(entry.message || '').trim(),
    timestamp: Number.isFinite(Number(entry.timestamp)) ? Number(entry.timestamp) : 0,
    source
  };
}

function getMergedWorldEvents(limit = 5) {
  const targetLimit = Math.max(1, Math.min(5, Number(limit) || 5));
  const coreEvents = (CORE.getRecentWorldEvents(targetLimit * 2) || [])
    .map(e => normalizeWorldEventEntry(e, 'core'))
    .filter(e => e && e.message);

  let boardEvents = [];
  try {
    const raw = EVENTS.getWorldEvents();
    boardEvents = (raw?.events || [])
      .slice(0, targetLimit * 2)
      .map(e => normalizeWorldEventEntry(e, 'board'))
      .filter(e => e && e.message);
  } catch {
    boardEvents = [];
  }

  const merged = [...boardEvents, ...coreEvents].sort((a, b) => b.timestamp - a.timestamp);
  const uniq = [];
  const seen = new Set();
  for (const item of merged) {
    if (seen.has(item.message)) continue;
    seen.add(item.message);
    uniq.push(item);
    if (uniq.length >= targetLimit) break;
  }
  return uniq;
}

function publishWorldEvent(message, type = 'player_action', extra = null) {
  const text = String(message || '').trim();
  if (!text) return;
  try {
    if (typeof CORE.recordWorldEvent === 'function') {
      CORE.recordWorldEvent(text, type, extra || {});
    }
  } catch (e) {
    console.log('[WorldEvent] core publish failed:', e?.message || e);
  }
  try {
    if (typeof EVENTS.addWorldEvent === 'function') {
      EVENTS.addWorldEvent(text, type);
    }
  } catch (e) {
    console.log('[WorldEvent] board publish failed:', e?.message || e);
  }
}

function publishBattleWorldEvent(player, enemyName, kind = 'battle', impact = '') {
  const actor = String(player?.name || '冒險者').trim() || '冒險者';
  const location = String(player?.location || '未知地點').trim() || '未知地點';
  const target = String(enemyName || '未知敵人').trim() || '未知敵人';
  const impactText = String(impact || '').trim();
  let message = '';
  if (kind === 'battle_start') {
    message = `⚔️ ${actor} 在${location}與 ${target} 爆發交鋒。`;
  } else if (kind === 'battle_win') {
    message = `🏆 ${actor} 在${location}擊敗了 ${target}。`;
  } else if (kind === 'battle_flee') {
    message = `🏃 ${actor} 在${location}成功脫離 ${target} 的追擊。`;
  } else if (kind === 'battle_flee_fail') {
    message = `🩸 ${actor} 在${location}嘗試逃離 ${target} 失敗，局勢惡化。`;
  } else if (kind === 'pet_down') {
    message = `💥 ${actor} 的夥伴在${location}被 ${target} 重創倒下。`;
  } else if (kind === 'player_down') {
    message = `☠️ ${actor} 在${location}與 ${target} 一戰中敗亡。`;
  } else {
    message = `⚔️ ${actor} 在${location}與 ${target} 的衝突升級。`;
  }
  if (impactText) message += ` ${impactText.slice(0, 80)}`;
  publishWorldEvent(message, kind, { actor, target, location, impact: impactText });
}

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

function cloneStatusState(status) {
  if (!status || typeof status !== 'object') return {};
  try {
    return JSON.parse(JSON.stringify(status));
  } catch {
    return { ...status };
  }
}

function buildHumanCombatant(player) {
  const saved = player?.battleState?.humanState || {};
  const hpFromState = Number(saved?.hp);
  const hpFromPlayer = Number(player?.stats?.生命 || 0);
  const resolvedHp = Number.isFinite(hpFromState) ? hpFromState : hpFromPlayer;
  return {
    id: `human_${player.id}`,
    name: player.name || '冒險者',
    isHuman: true,
    level: player.level || 1,
    hp: Math.max(0, resolvedHp),
    maxHp: Math.max(1, player?.maxStats?.生命 || 100),
    attack: 10,
    defense: Math.max(5, Math.floor((player?.stats?.戰力 || 30) * 0.12)),
    moves: [HUMAN_COMBAT_MOVE],
    status: cloneStatusState(saved?.status)
  };
}

function resolvePlayerMainPet(player, options = {}) {
  if (!player || typeof player !== 'object') return { pet: null, changed: false };
  const ownedPets = getPlayerOwnedPets(player.id);
  if (ownedPets.length <= 0) return { pet: null, changed: false };

  const fallbackPet = options?.fallbackPet && typeof options.fallbackPet === 'object'
    ? options.fallbackPet
    : null;
  const desiredIds = [
    String(options?.preferBattle ? (player?.battleState?.activePetId || '') : '').trim(),
    String(player?.activePetId || '').trim(),
    String(fallbackPet?.id || '').trim()
  ].filter(Boolean);

  let selected = null;
  for (const id of desiredIds) {
    const found = ownedPets.find((p) => String(p?.id || '') === id);
    if (found) {
      selected = found;
      break;
    }
  }
  if (!selected) selected = ownedPets[0];

  let changed = false;
  if (String(player?.activePetId || '').trim() !== String(selected?.id || '').trim()) {
    player.activePetId = selected.id;
    changed = true;
  }
  if (options?.preferBattle && player?.battleState && String(player.battleState.activePetId || '').trim() !== String(selected?.id || '').trim()) {
    player.battleState.activePetId = selected.id;
    changed = true;
  }
  return { pet: selected, changed };
}

function getBattlePetStateSnapshot(player, petId = '') {
  const battle = player?.battleState || {};
  const id = String(petId || '').trim();
  const map = (battle.petStates && typeof battle.petStates === 'object' && !Array.isArray(battle.petStates))
    ? battle.petStates
    : {};
  if (id && map[id] && typeof map[id] === 'object') return map[id];
  return (battle.petState && typeof battle.petState === 'object') ? battle.petState : {};
}

function setBattlePetStateSnapshot(player, petId = '', snapshot = {}) {
  if (!player?.battleState) return;
  if (!player.battleState.petStates || typeof player.battleState.petStates !== 'object' || Array.isArray(player.battleState.petStates)) {
    player.battleState.petStates = {};
  }
  const id = String(petId || '').trim();
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  if (id) {
    player.battleState.petStates[id] = safeSnapshot;
    player.battleState.activePetId = id;
  }
  player.battleState.petState = safeSnapshot;
}

const PET_SWAP_LOCK_KEYS = Object.freeze([
  'burn', 'poison', 'trap', 'bleed', 'dot',
  'stun', 'freeze', 'bind', 'slow',
  'fear', 'confuse', 'blind', 'missNext'
]);

function hasPetSwapBlockingStatus(status = {}) {
  if (!status || typeof status !== 'object') return false;
  return PET_SWAP_LOCK_KEYS.some((key) => Number(status?.[key] || 0) > 0);
}

function getBattleSwitchCandidates(player, currentPetId = '') {
  const owned = getPlayerOwnedPets(player?.id);
  const currentId = String(currentPetId || '').trim();
  const petStates = (player?.battleState?.petStates && typeof player.battleState.petStates === 'object')
    ? player.battleState.petStates
    : {};
  const isFriendDuel = Boolean(player?.battleState?.friendDuel);
  return owned.filter((pet) => {
    const id = String(pet?.id || '').trim();
    if (!id || id === currentId) return false;
    if (isFriendDuel) {
      if (!Object.prototype.hasOwnProperty.call(petStates, id)) return false;
      const snapHp = Number(petStates?.[id]?.hp);
      if (Number.isFinite(snapHp)) return snapHp > 0;
      return false;
    }
    return CORE.canPetFight(pet);
  });
}

function getActiveCombatant(player, pet) {
  const fighterType = getBattleFighterType(player, pet);
  if (fighterType === 'player') return buildHumanCombatant(player);
  const preferred = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet: pet }).pet || pet;
  if (!preferred) return null;
  const saved = getBattlePetStateSnapshot(player, preferred.id);
  const hpFromState = Number(saved?.hp);
  const hpFromPet = Number(preferred?.hp || 0);
  const resolvedHp = Number.isFinite(hpFromState) ? hpFromState : hpFromPet;
  return {
    ...preferred,
    hp: Math.max(0, resolvedHp),
    isHuman: false,
    status: cloneStatusState(saved?.status)
  };
}

function getPlayerOwnedPets(ownerId) {
  const allPets = PET.loadAllPets();
  return Object.values(allPets)
    .filter((p) => p?.ownerId === ownerId)
    .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
}

function getPetCapacityForUser(userId = '') {
  const walletData = WALLET.getWalletData(String(userId || '').trim()) || {};
  const cardFMV = Math.max(0, Number(walletData.cardFMV || 0));
  const cardCount = Math.max(0, Number(walletData.cardCount || 0));
  const maxPets = Math.max(1, Number(WALLET.getMaxPetsByFMV(cardFMV) || 1));
  const ownedPets = getPlayerOwnedPets(String(userId || '').trim());
  const currentPets = ownedPets.length;
  const availableSlots = Math.max(0, maxPets - currentPets);
  return {
    cardFMV,
    cardCount,
    maxPets,
    currentPets,
    availableSlots
  };
}

function createAdditionalPetForPlayer(userId = '', element = '水', petName = '') {
  const player = CORE.loadPlayer(String(userId || '').trim());
  if (!player) return { success: false, reason: '找不到角色。' };

  const capacity = getPetCapacityForUser(userId);
  if (capacity.availableSlots <= 0) {
    return {
      success: false,
      reason: `寵物欄位已滿（${capacity.currentPets}/${capacity.maxPets}）。請先提升卡片 FMV。`
    };
  }

  const normalizedElement = normalizePetElementCode(element || '水');
  const finalPetName = normalizePetName(petName || '', normalizedElement);
  const selectedMove = rollStarterMoveForElement(normalizedElement);
  if (!selectedMove) {
    return { success: false, reason: '目前找不到可用招式池，請稍後再試。' };
  }

  const pet = PET.createPetEgg(userId, normalizedElement);
  pet.hatched = true;
  pet.status = '正常';
  pet.waitingForName = false;
  pet.name = finalPetName;
  pet.reviveAt = null;
  pet.reviveTurnsRemaining = 0;
  pet.moves = [
    { ...PET.INITIAL_MOVES[0], currentProficiency: 0 },
    { ...PET.INITIAL_MOVES[1], currentProficiency: 0 },
    {
      id: selectedMove.id,
      name: selectedMove.name,
      element: selectedMove.element,
      tier: selectedMove.tier,
      type: 'elemental',
      baseDamage: selectedMove.baseDamage,
      effect: selectedMove.effect,
      desc: selectedMove.desc,
      currentProficiency: 0
    }
  ];
  PET.updateAppearance(pet);
  PET.savePet(pet);

  player.petElement = player.petElement || normalizedElement;
  CORE.savePlayer(player);

  const latest = getPetCapacityForUser(userId);
  return {
    success: true,
    pet,
    selectedMove,
    capacity: latest
  };
}

async function showClaimPetElementPanel(interaction, user, notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', embeds: [], components: [] }).catch(() => {});
    return;
  }

  const capacity = getPetCapacityForUser(user.id);
  const embed = new EmbedBuilder()
    .setTitle('🐾 領取新寵物')
    .setColor(0x22c55e)
    .setDescription(
      `${notice ? `${notice}\n\n` : ''}` +
      `請先選擇要領取的寵物屬性。\n` +
      `目前欄位：${capacity.currentPets}/${capacity.maxPets}（可再領取 ${capacity.availableSlots} 隻）\n` +
      `卡片 FMV：$${capacity.cardFMV.toFixed(2)} USD（${capacity.cardCount} 張）`
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('claim_new_pet_element_water').setLabel('💧 水屬性').setStyle(ButtonStyle.Primary).setDisabled(capacity.availableSlots <= 0),
    new ButtonBuilder().setCustomId('claim_new_pet_element_fire').setLabel('🔥 火屬性').setStyle(ButtonStyle.Danger).setDisabled(capacity.availableSlots <= 0),
    new ButtonBuilder().setCustomId('claim_new_pet_element_grass').setLabel('🌿 草屬性').setStyle(ButtonStyle.Success).setDisabled(capacity.availableSlots <= 0)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_profile').setLabel('💳 返回檔案').setStyle(ButtonStyle.Secondary)
  );
  const payload = { embeds: [embed], content: null, components: [row1, row2] };
  try {
    await updateInteractionMessage(interaction, payload);
  } catch (err) {
    console.error('[ClaimPet] show panel update failed:', err?.message || err);
    if (interaction?.message?.edit) {
      const edited = await interaction.message.edit(payload).then(() => true).catch(() => false);
      if (edited) return;
    }
    if (interaction?.channel?.send) {
      await interaction.channel.send(payload).catch(() => {});
    }
  }
}

async function showClaimPetNameModal(interaction, element = '水') {
  const modal = new ModalBuilder()
    .setCustomId('claim_new_pet_name_modal')
    .setTitle(`🐾 新寵物命名（${getPetElementDisplayName(element)}）`);

  const input = new TextInputBuilder()
    .setCustomId('claim_pet_name')
    .setLabel('寵物名字（可留空）')
    .setPlaceholder('例如：潮光、烈芯、森紋')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(20);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

function isFleeLikeMove(move = null) {
  if (!move || typeof move !== 'object') return false;
  if (move?.effect && move.effect.flee) return true;
  const id = String(move?.id || '').trim().toLowerCase();
  const name = String(move?.name || '').trim().toLowerCase();
  const desc = String(move?.desc || '').trim().toLowerCase();
  if (id === 'flee' || id.includes('flee') || id.includes('escape')) return true;
  if (name === '逃跑' || name.includes('逃跑') || name.includes('flee') || name.includes('escape')) return true;
  if (desc.includes('逃脫') || desc.includes('逃跑') || desc.includes('flee') || desc.includes('escape')) return true;
  return false;
}

function getPetAttackMoves(pet) {
  return (pet?.moves || []).filter((m) => !isFleeLikeMove(m));
}

const SKILL_CHIP_PREFIX = '技能晶片：';
const PROTECTED_MOVE_IDS = new Set(
  (Array.isArray(PET?.INITIAL_MOVES) ? PET.INITIAL_MOVES : [])
    .map((m) => String(m?.id || '').trim())
    .filter(Boolean)
);

function getAllPetSkillMoves() {
  const merged = [];
  const seen = new Set();
  const pools = PET?.ELEMENT_MOVE_POOLS && typeof PET.ELEMENT_MOVE_POOLS === 'object'
    ? Object.values(PET.ELEMENT_MOVE_POOLS)
    : [];
  for (const pool of pools) {
    for (const move of Array.isArray(pool) ? pool : []) {
      const id = String(move?.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(move);
    }
  }
  if (merged.length > 0) return merged;

  return [
    ...(Array.isArray(PET?.POSITIVE_MOVES) ? PET.POSITIVE_MOVES : []),
    ...(Array.isArray(PET?.NEGATIVE_MOVES) ? PET.NEGATIVE_MOVES : [])
  ];
}

function getPetMovePool(petType = '') {
  if (PET && typeof PET.getMovesByElement === 'function') {
    const pool = PET.getMovesByElement(petType);
    if (Array.isArray(pool) && pool.length > 0) return pool;
  }
  const normalized = normalizePetElementCode(petType);
  if (normalized === '火') return getAllPetSkillMoves().filter((m) => /火|焰|雷|熱|爆|熾|灼|炎/.test(String(m?.name || '')));
  if (normalized === '草') return getAllPetSkillMoves().filter((m) => /草|藤|孢|毒|根|棘|網|森/.test(String(m?.name || '')));
  return getAllPetSkillMoves().filter((m) => /水|潮|霧|冰|淨|流|凍|波/.test(String(m?.name || '')));
}

function extractSkillChipMoveName(rawItem = null) {
  const name = getDraftItemName(rawItem);
  if (!name.startsWith(SKILL_CHIP_PREFIX)) return '';
  return name.slice(SKILL_CHIP_PREFIX.length).trim();
}

function addSkillChipToInventory(player, moveName = '') {
  const normalized = String(moveName || '').trim();
  if (!normalized) return false;
  if (!Array.isArray(player.inventory)) player.inventory = [];
  player.inventory.unshift(`${SKILL_CHIP_PREFIX}${normalized}`);
  return true;
}

function consumeSkillChipFromInventory(player, moveName = '') {
  const normalized = String(moveName || '').trim();
  if (!normalized || !Array.isArray(player?.inventory)) return false;
  const target = `${SKILL_CHIP_PREFIX}${normalized}`;
  for (let i = 0; i < player.inventory.length; i++) {
    if (getDraftItemName(player.inventory[i]) !== target) continue;
    player.inventory.splice(i, 1);
    return true;
  }
  return false;
}

function getLearnableSkillChipEntries(player, pet) {
  const allPool = getAllPetSkillMoves();
  const byName = new Map(allPool.map((m) => [String(m?.name || '').trim(), m]));
  const petPoolIds = new Set(getPetMovePool(pet?.type).map((m) => String(m?.id || '').trim()).filter(Boolean));
  const learnedIds = new Set((Array.isArray(pet?.moves) ? pet.moves : []).map((m) => String(m?.id || '').trim()));
  const stats = new Map();
  for (const raw of Array.isArray(player?.inventory) ? player.inventory : []) {
    const moveName = extractSkillChipMoveName(raw);
    if (!moveName) continue;
    const move = byName.get(moveName);
    const key = move?.id ? String(move.id || '').trim() : `name::${moveName}`;
    const prev = stats.get(key) || {
      move: move || { id: '', name: moveName, element: '未知', tier: 0 },
      count: 0,
      canLearn: false,
      reason: '未知技能',
      learned: false
    };
    prev.count += 1;
    if (move?.id) {
      const moveId = String(move.id || '').trim();
      const learned = learnedIds.has(moveId);
      const sameFaction = petPoolIds.has(moveId);
      if (learned) {
        prev.canLearn = false;
        prev.reason = '已學會';
        prev.learned = true;
      } else if (!sameFaction) {
        prev.canLearn = false;
        prev.reason = '屬性不符';
        prev.learned = false;
      } else {
        prev.canLearn = true;
        prev.reason = '可學習';
        prev.learned = false;
      }
    }
    stats.set(key, prev);
  }
  return Array.from(stats.values()).sort((a, b) => {
    const canLearnDiff = Number(Boolean(b?.canLearn)) - Number(Boolean(a?.canLearn));
    if (canLearnDiff !== 0) return canLearnDiff;
    const tierDiff = Number(b?.move?.tier || 0) - Number(a?.move?.tier || 0);
    if (tierDiff !== 0) return tierDiff;
    return String(a?.move?.name || '').localeCompare(String(b?.move?.name || ''), 'zh-Hant');
  });
}

function getForgettablePetMoves(pet) {
  return (Array.isArray(pet?.moves) ? pet.moves : []).filter((m) => {
    const moveId = String(m?.id || '').trim();
    if (!moveId) return false;
    return !PROTECTED_MOVE_IDS.has(moveId);
  });
}

function learnMoveFromChipForPet(pet, moveTemplate) {
  if (!pet) return { success: false, reason: '找不到寵物資料。' };
  if (!moveTemplate || typeof moveTemplate !== 'object') {
    return { success: false, reason: '技能資料錯誤。' };
  }
  const moveId = String(moveTemplate.id || '').trim();
  if (!moveId) return { success: false, reason: '技能缺少 ID。' };
  if (!Array.isArray(pet.moves)) pet.moves = [];
  if (pet.moves.some((m) => String(m?.id || '').trim() === moveId)) {
    return { success: false, reason: '這招已經學過了，請直接到上陣欄勾選。' };
  }

  const learned = typeof PET.learnMove === 'function' ? PET.learnMove(pet, moveId) : null;
  if (!learned?.success) {
    return { success: false, reason: learned?.reason || '學習失敗' };
  }

  const attackMoves = getPetAttackMoves(pet);
  const attackIds = new Set(attackMoves.map((m) => String(m?.id || '').trim()).filter(Boolean));
  if (!attackIds.has(moveId)) {
    return {
      success: true,
      move: learned.move || moveTemplate,
      equipped: false,
      newlyLearned: true,
      replacedMoveName: ''
    };
  }

  const selected = [];
  for (const rawId of Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds : []) {
    const id = String(rawId || '').trim();
    if (!id || selected.includes(id) || !attackIds.has(id)) continue;
    selected.push(id);
    if (selected.length >= PET_MOVE_LOADOUT_LIMIT) break;
  }

  let replacedMoveName = '';
  if (!selected.includes(moveId)) {
    if (selected.length < PET_MOVE_LOADOUT_LIMIT) {
      selected.push(moveId);
    } else {
      const replacedId = String(selected[0] || '').trim();
      selected[0] = moveId;
      const replacedMove = attackMoves.find((m) => String(m?.id || '').trim() === replacedId);
      replacedMoveName = String(replacedMove?.name || '').trim();
    }
  }

  pet.activeMoveIds = selected.slice(0, PET_MOVE_LOADOUT_LIMIT);
  return {
    success: true,
    move: learned.move || moveTemplate,
    equipped: true,
    newlyLearned: true,
    replacedMoveName
  };
}

function normalizePetMoveLoadout(pet, persist = false) {
  if (!pet || !Array.isArray(pet.moves)) {
    return { activeMoveIds: [], activeMoves: [], changed: false };
  }

  let moveIdMutated = false;
  for (let i = 0; i < pet.moves.length; i++) {
    const move = pet.moves[i];
    if (!move || typeof move !== 'object') continue;
    const id = String(move.id || '').trim();
    if (id) continue;
    const seed = `${move.name || 'move'}_${i}`.replace(/\s+/g, '_').replace(/[^\w\u4e00-\u9fff-]/g, '');
    move.id = `legacy_${seed}_${i}`;
    moveIdMutated = true;
  }

  const attackMoves = getPetAttackMoves(pet);
  const attackIds = new Set(attackMoves.map((m) => String(m.id || '')));
  const rawSelected = Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds : [];
  const selected = [];
  for (const rawId of rawSelected) {
    const id = String(rawId || '').trim();
    if (!id || selected.includes(id) || !attackIds.has(id)) continue;
    selected.push(id);
    if (selected.length >= PET_MOVE_LOADOUT_LIMIT) break;
  }

  if (selected.length === 0) {
    for (const move of attackMoves) {
      const id = String(move.id || '').trim();
      if (!id || selected.includes(id)) continue;
      selected.push(id);
      if (selected.length >= PET_MOVE_LOADOUT_LIMIT) break;
    }
  }

  const before = JSON.stringify(Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds : []);
  const after = JSON.stringify(selected);
  const changed = before !== after || moveIdMutated;
  if (changed) {
    pet.activeMoveIds = selected;
    if (persist) PET.savePet(pet);
  }

  const lookup = new Map(attackMoves.map((m) => [String(m.id || ''), m]));
  const activeMoves = selected.map((id) => lookup.get(id)).filter(Boolean);
  return { activeMoveIds: selected, activeMoves, changed };
}

function getCombatantMoves(combatant, pet) {
  if (!combatant) return [];
  if (combatant.isHuman) return [HUMAN_COMBAT_MOVE];
  const normalized = normalizePetMoveLoadout(pet, false);
  if (normalized.activeMoves.length > 0) return normalized.activeMoves;
  return getPetAttackMoves(pet);
}

function persistCombatantState(player, pet, combatant) {
  if (!player || !combatant) return;
  const statusSnapshot = cloneStatusState(combatant.status);
  if (combatant.isHuman) {
    const maxHp = Math.max(1, player?.maxStats?.生命 || 100);
    player.stats.生命 = Math.max(0, Math.min(maxHp, combatant.hp));
    if (player.battleState) {
      player.battleState.humanState = {
        hp: player.stats.生命,
        status: statusSnapshot
      };
    }
    return;
  }
  const combatantPetId = String(combatant?.id || '').trim();
  let targetPet = null;
  if (combatantPetId && typeof PET.getPetById === 'function') {
    const found = PET.getPetById(combatantPetId);
    if (found && String(found.ownerId || '') === String(player.id || '')) targetPet = found;
  }
  if (!targetPet && pet && String(pet?.ownerId || '') === String(player.id || '')) {
    targetPet = pet;
  }
  if (!targetPet) return;

  targetPet.hp = Math.max(0, combatant.hp);
  if (player.battleState) {
    setBattlePetStateSnapshot(player, targetPet.id, {
      hp: targetPet.hp,
      status: statusSnapshot
    });
  }
  return targetPet;
}

function cloneCombatantForEstimate(combatant) {
  if (!combatant) return null;
  return {
    ...combatant,
    hp: Number(combatant.hp || 1),
    maxHp: Number(combatant.maxHp || combatant.hp || 1),
    defense: Number(combatant.defense || 0),
    attack: Number(combatant.attack || 0),
    status: cloneStatusState(combatant.status)
  };
}

function cloneEnemyForEstimate(enemy) {
  if (!enemy) return null;
  return {
    ...enemy,
    hp: Number(enemy.hp || 1),
    maxHp: Number(enemy.maxHp || enemy.hp || 1),
    defense: Number(enemy.defense || 0),
    attack: Number(enemy.attack || 10),
    moves: Array.isArray(enemy.moves) ? [...enemy.moves] : [],
    status: cloneStatusState(enemy.status)
  };
}

function simulateBattleOnceForEstimate(player, pet, enemy, fighterType = null) {
  const resolvedType = fighterType || getBattleFighterType(player, pet);
  const baseCombatant = resolvedType === 'player' ? buildHumanCombatant(player) : getActiveCombatant(player, pet);
  const combatant = cloneCombatantForEstimate(baseCombatant);
  const targetEnemy = cloneEnemyForEstimate(enemy);
  if (!combatant || !targetEnemy) {
    return { win: false, rounds: 0, totalPlayerDamage: 0, totalEnemyDamage: 0 };
  }

  const simulationPlayer = {
    ...player,
    id: `sim_${player?.id || 'player'}`,
    stats: { ...(player?.stats || {}) }
  };

  let rounds = 0;
  let totalPlayerDamage = 0;
  let totalEnemyDamage = 0;
  let energy = 2;

  for (let turn = 1; turn <= BATTLE_ESTIMATE_MAX_TURNS; turn++) {
    rounds = turn;
    const bestMove = pickBestMoveForAI(player, pet, targetEnemy, combatant, energy);
    const selectedMove = bestMove || WAIT_COMBAT_MOVE;
    const moveCost = bestMove ? BATTLE.getMoveEnergyCost(bestMove) : 0;
    const enemyMove = BATTLE.enemyChooseMove(targetEnemy);
    const enemyHpBefore = targetEnemy.hp;
    const playerHpBefore = combatant.hp;

    const roundResult = BATTLE.executeBattleRound(
      simulationPlayer,
      combatant,
      targetEnemy,
      selectedMove,
      enemyMove,
      { dryRun: true }
    );

    totalPlayerDamage += Math.max(0, enemyHpBefore - targetEnemy.hp);
    totalEnemyDamage += Math.max(0, playerHpBefore - combatant.hp);
    energy = Math.max(0, energy - moveCost) + 2;

    if (roundResult.victory === true || targetEnemy.hp <= 0) {
      return { win: true, rounds, totalPlayerDamage, totalEnemyDamage };
    }
    if (roundResult.victory === false || combatant.hp <= 0) {
      return { win: false, rounds, totalPlayerDamage, totalEnemyDamage };
    }
  }

  return {
    win: combatant.hp >= targetEnemy.hp,
    rounds,
    totalPlayerDamage,
    totalEnemyDamage
  };
}

function estimateBattleOutcome(player, pet, enemy, fighterType = null) {
  const resolvedType = fighterType || getBattleFighterType(player, pet);
  const combatant = resolvedType === 'player' ? buildHumanCombatant(player) : getActiveCombatant(player, pet);
  const moves = getCombatantMoves(combatant, pet);
  if (moves.length === 0) {
    return {
      fighterName: combatant?.name || '冒險者',
      fighterType: resolvedType,
      avgPlayerDamage: 0,
      enemyDamage: Math.max(1, (enemy?.attack || 10) - (combatant?.defense || 5)),
      turnsToWin: BATTLE_ESTIMATE_MAX_TURNS,
      turnsToLose: 2,
      winRate: 0,
      rank: '高風險',
      simulations: 0
    };
  }

  const simulationCount = BATTLE_ESTIMATE_SIMULATIONS;
  let wins = 0;
  let totalPlayerDamage = 0;
  let totalEnemyDamage = 0;
  let totalRounds = 0;
  let winTurnsTotal = 0;
  let loseTurnsTotal = 0;
  let lossCount = 0;

  for (let i = 0; i < simulationCount; i++) {
    const sim = simulateBattleOnceForEstimate(player, pet, enemy, resolvedType);
    totalPlayerDamage += sim.totalPlayerDamage;
    totalEnemyDamage += sim.totalEnemyDamage;
    totalRounds += Math.max(1, sim.rounds || 1);
    if (sim.win) {
      wins += 1;
      winTurnsTotal += Math.max(1, sim.rounds || 1);
    } else {
      lossCount += 1;
      loseTurnsTotal += Math.max(1, sim.rounds || 1);
    }
  }

  const winRate = Math.max(0, Math.min(100, Math.round((wins / simulationCount) * 100)));
  const avgPlayerDamage = Math.max(1, Math.floor(totalPlayerDamage / Math.max(1, totalRounds)));
  const enemyDamage = Math.max(1, Math.floor(totalEnemyDamage / Math.max(1, totalRounds)));
  const turnsToWin = wins > 0
    ? Math.max(1, Math.round(winTurnsTotal / wins))
    : BATTLE_ESTIMATE_MAX_TURNS;
  const turnsToLose = lossCount > 0
    ? Math.max(1, Math.round(loseTurnsTotal / lossCount))
    : BATTLE_ESTIMATE_MAX_TURNS + 1;

  let rank = '高風險';
  if (winRate >= 75) rank = '高機率獲勝';
  else if (winRate >= 55) rank = '五五開';

  return {
    fighterName: combatant.name,
    fighterType: resolvedType,
    avgPlayerDamage,
    enemyDamage,
    turnsToWin,
    turnsToLose,
    winRate,
    rank,
    simulations: simulationCount
  };
}

const LOCATION_ENTRY_BASELINE_CURVE = Object.freeze({
  1: { hp: 56, attack: 10, defense: 3 },
  2: { hp: 72, attack: 12, defense: 4 },
  3: { hp: 94, attack: 15, defense: 5 },
  4: { hp: 122, attack: 18, defense: 7 },
  5: { hp: 154, attack: 22, defense: 9 }
});

function getPlayerProgressDifficultyTier(player) {
  const currentProfile = typeof getLocationProfile === 'function'
    ? getLocationProfile(player?.location || '')
    : null;
  let tier = Math.max(1, Math.min(5, Number(currentProfile?.difficulty || 1)));

  if (ISLAND_STORY && typeof ISLAND_STORY.getUnlockedLocations === 'function') {
    const unlocked = ISLAND_STORY.getUnlockedLocations(player);
    for (const loc of unlocked) {
      const profile = typeof getLocationProfile === 'function' ? getLocationProfile(loc) : null;
      const diff = Math.max(1, Math.min(5, Number(profile?.difficulty || 1)));
      if (diff > tier) tier = diff;
    }
  }
  return tier;
}

function ensureEntryGateProgressState(player) {
  if (!player || typeof player !== 'object') return null;
  if (!player.entryGateProgress || typeof player.entryGateProgress !== 'object' || Array.isArray(player.entryGateProgress)) {
    player.entryGateProgress = {
      entryPowerByTier: {}
    };
  }
  if (!player.entryGateProgress.entryPowerByTier || typeof player.entryGateProgress.entryPowerByTier !== 'object') {
    player.entryGateProgress.entryPowerByTier = {};
  }
  return player.entryGateProgress;
}

function calculateCurrentCombatPower(player, pet = null) {
  if (!player) return 0;
  const safePet = pet || PET.loadPet(player.id);
  const fighterType = CORE.canPetFight(safePet) ? 'pet' : 'player';
  const combatant = fighterType === 'player'
    ? buildHumanCombatant(player)
    : getActiveCombatant(player, safePet);
  if (!combatant) return 0;

  const level = Math.max(1, Number(player?.level || 1));
  const moves = getCombatantMoves(combatant, safePet);
  let avgMovePressure = Math.max(1, Number(combatant.attack || 10) * 0.8);
  if (moves.length > 0) {
    const total = moves.reduce((sum, move) => {
      const dmg = BATTLE.calculatePlayerMoveDamage(move, player, combatant);
      return sum + Math.max(1, Number(dmg?.total || dmg?.base || 0));
    }, 0);
    avgMovePressure = Math.max(1, total / moves.length);
  }

  const score =
    Number(combatant.attack || 0) * 2.4 +
    Number(combatant.defense || 0) * 1.6 +
    Number(combatant.maxHp || combatant.hp || 0) * 0.45 +
    avgMovePressure * 1.3 +
    level * 4;
  return Math.max(1, Math.round(score));
}

function getEntryTierBaselinePower(player, tier, currentPower) {
  const safeTier = Math.max(1, Math.min(5, Number(tier || 1)));
  const state = ensureEntryGateProgressState(player);
  if (!state) return Math.max(1, Number(currentPower || 1));
  if (!Number.isFinite(Number(state.entryPowerByTier[safeTier]))) {
    state.entryPowerByTier[safeTier] = Math.max(1, Number(currentPower || 1));
  }
  return Math.max(1, Number(state.entryPowerByTier[safeTier] || currentPower || 1));
}

function ensurePlayerIslandState(player) {
  if (!player || typeof player !== 'object') return;
  ensureEntryGateProgressState(player);
  if (ISLAND_STORY && typeof ISLAND_STORY.ensureIslandStoryState === 'function') {
    ISLAND_STORY.ensureIslandStoryState(player);
  }
  if (ISLAND_STORY && typeof ISLAND_STORY.ensureUnlockedLocations === 'function') {
    ISLAND_STORY.ensureUnlockedLocations(player);
  }
  const currentLoc = String(player.location || player.spawnLocation || '').trim();
  if (currentLoc && ISLAND_STORY && typeof ISLAND_STORY.unlockLocation === 'function') {
    ISLAND_STORY.unlockLocation(player, currentLoc);
  }
  const tier = getPlayerProgressDifficultyTier(player);
  const power = calculateCurrentCombatPower(player);
  getEntryTierBaselinePower(player, tier, power);
}

function syncCurrentIslandStoryProgress(player) {
  if (!player || typeof player !== 'object') return null;
  ensurePlayerIslandState(player);
  const location = String(player.location || '').trim();
  if (!location) return null;
  const state = syncLocationArcLocation(player);
  const turnsInLocation = Math.max(0, Number(state?.turnsInLocation || 0));
  const storyProgress = getCurrentLocationStoryProgress(player);
  const battleDone = Boolean(storyProgress?.battleDone);
  if (!ISLAND_STORY || typeof ISLAND_STORY.updateIslandStoryProgress !== 'function') return null;
  return ISLAND_STORY.updateIslandStoryProgress(player, {
    location,
    turnsInLocation,
    targetTurns: LOCATION_ARC_COMPLETE_TURNS,
    battleDone
  });
}

function buildLocationEntryBaselineEnemy(targetLocation, player = null) {
  const profile = typeof getLocationProfile === 'function' ? getLocationProfile(targetLocation) : null;
  const difficulty = Math.max(1, Math.min(5, Number(profile?.difficulty || 3)));
  const progressTier = getPlayerProgressDifficultyTier(player);
  const gap = difficulty - progressTier;
  const curve = LOCATION_ENTRY_BASELINE_CURVE[difficulty] || LOCATION_ENTRY_BASELINE_CURVE[3];
  const name = `D${difficulty} 守門者`;
  const scale =
    gap <= 0
      ? { hp: 1.0, attack: 1.0, defense: 1.0 }
      : gap === 1
        ? { hp: 1.1, attack: 1.1, defense: 1.1 }
        : gap === 2
          ? { hp: 1.25, attack: 1.25, defense: 1.25 }
          : { hp: 1.4, attack: 1.4, defense: 1.35 };
  const hp = Math.max(1, Math.floor(Number(curve.hp || 140) * scale.hp));
  const attack = Math.max(1, Math.floor(Number(curve.attack || 24) * scale.attack));
  const defense = Math.max(0, Math.floor(Number(curve.defense || 10) * scale.defense));
  const levelRef = Math.max(1, Number(player?.level || 1) + difficulty * 2);
  return {
    id: `entry_gate_d${difficulty}`,
    name,
    hp,
    maxHp: hp,
    attack,
    defense,
    moves: BATTLE.buildEnemyMoveLoadout(name, levelRef, ['壓制斬', '試探突進', '破勢重擊'], {
      villain: false,
      attack
    }),
    reward: { gold: [0, 0] },
    isMonster: false,
    companionPet: false,
    ignoreBeginnerBalance: true,
    ignoreBeginnerDanger: true,
    entryGap: gap,
    progressTier
  };
}

function canEnterLocation(player, targetLocation) {
  if (!LOCATION_ENTRY_GATE_ENABLED) {
    return { allowed: true, winRate: 100, rank: '關閉', reason: 'entry_gate_disabled' };
  }
  if (!player || !targetLocation) {
    return { allowed: false, winRate: 0, rank: '資料不足', reason: 'missing_player_or_location' };
  }
  const target = String(targetLocation || '').trim();
  if (!target) return { allowed: false, winRate: 0, rank: '資料不足', reason: 'empty_target' };
  if (String(player.location || '').trim() === target) {
    return { allowed: true, winRate: 80, rawWinRate: 80, rank: '同地點', reason: 'same_location' };
  }

  ensurePlayerIslandState(player);
  const gateEnemy = buildLocationEntryBaselineEnemy(target, player);
  const pet = PET.loadPet(player.id);
  const fighterType = CORE.canPetFight(pet) ? 'pet' : 'player';
  const profile = typeof getLocationProfile === 'function' ? getLocationProfile(target) : null;
  const targetDifficulty = Math.max(1, Math.min(5, Number(profile?.difficulty || 3)));
  const progressTier = getPlayerProgressDifficultyTier(player);
  const gap = targetDifficulty - progressTier;
  const currentPower = calculateCurrentCombatPower(player, pet);
  const tierBaselinePower = getEntryTierBaselinePower(player, progressTier, currentPower);
  const powerDelta = currentPower - tierBaselinePower;
  const progressRatio = tierBaselinePower > 0 ? powerDelta / tierBaselinePower : 0;

  const baseWinRate =
    gap <= 0
      ? 80
      : gap === 1
        ? 30
        : gap === 2
          ? 16
          : 8;
  const growthGain =
    gap <= 0
      ? 24
      : gap === 1
        ? 260
        : gap === 2
          ? 210
          : 170;

  const rawWinRate = Math.max(0, Math.min(100, baseWinRate + progressRatio * growthGain));
  const winRate = Math.max(1, Math.min(99, Math.round(rawWinRate)));
  const allowed = winRate > LOCATION_ENTRY_MIN_WINRATE;
  const rank = winRate >= 75 ? '高機率' : winRate >= 55 ? '可一戰' : winRate >= 35 ? '偏低' : '高風險';
  return {
    allowed,
    targetLocation: target,
    difficulty: targetDifficulty,
    winRate,
    rawWinRate,
    rank,
    fighterType,
    progressTier,
    powerDelta: Math.round(powerDelta),
    reason: allowed ? 'ok' : 'winrate_too_low',
    gateEnemy
  };
}

function pickBestMoveForAI(player, pet, enemy, combatant = null, availableEnergy = Number.POSITIVE_INFINITY) {
  const activeCombatant = combatant || getActiveCombatant(player, pet);
  const candidateMoves = getCombatantMoves(activeCombatant, pet).filter((move) => !isFleeLikeMove(move));
  if (candidateMoves.length === 0) return null;

  const affordableMoves = candidateMoves.filter((move) => BATTLE.getMoveEnergyCost(move) <= availableEnergy);
  if (affordableMoves.length === 0) return null;

  let best = affordableMoves[0];
  let bestScore = -1;
  for (const move of affordableMoves) {
    const cost = BATTLE.getMoveEnergyCost(move);
    const moveSpeed = getMoveSpeedValue(move);
    const dmg = BATTLE.calculatePlayerMoveDamage(move, player, activeCombatant);
    const netDamage = Math.max(1, (dmg.total || 0) - (enemy?.defense || 0));
    const killBonus = (enemy?.hp || 0) <= netDamage ? 120 : 0;
    const efficiencyBonus = Math.max(0, 4 - cost) * 2;
    const speedBonus = (moveSpeed - 10) * 0.4;
    const score = netDamage + killBonus + efficiencyBonus + speedBonus;
    if (score > bestScore) {
      best = move;
      bestScore = score;
    }
  }
  return best;
}

function startLoadingAnimation(message, label = 'AI 說書人正在構思故事') {
  if (!message) return () => {};

  const frames = ['⏳', '⌛', '🌀'];
  const phases = ['鋪陳場景', '安排角色互動', '生成分支選項', '補完世界細節'];
  const startAt = Date.now();
  let tick = 0;

  message.edit({ content: `⏳ ${label}...（鋪陳場景）` }).catch(() => {});

  const timer = setInterval(() => {
    tick += 1;
    const icon = frames[tick % frames.length];
    const dots = '.'.repeat((tick % 3) + 1);
    const elapsed = Math.floor((Date.now() - startAt) / 1000);
    const phase = phases[tick % phases.length];
    message.edit({ content: `${icon} ${label}${dots}（${phase}｜${elapsed}s）` }).catch(() => {});
  }, 1500);

  return () => clearInterval(timer);
}

function startTypingIndicator(channel, intervalMs = 6500) {
  if (!channel || typeof channel.sendTyping !== 'function') return () => {};
  const ping = () => channel.sendTyping().catch(() => {});
  ping();
  const timer = setInterval(ping, intervalMs);
  return () => clearInterval(timer);
}

const MAP_PAGE_SIZE = 8;

function normalizeMapViewMode(mode, fallback = (MAP_ENABLE_WIDE_ANSI ? 'ascii' : 'text')) {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === 'ascii' || raw === 'text') return raw;
  return fallback === 'ascii' ? 'ascii' : 'text';
}

function getPlayerMapViewMode(player) {
  return normalizeMapViewMode(player?.mapViewMode);
}

function getRegionMapRendererScriptPath() {
  return path.join(__dirname, 'tools', 'render_region_map.py');
}

function summarizeMapRenderFailure(runner = '', run = null) {
  const tag = String(runner || 'python').trim();
  const signal = String(run?.signal || '').trim();
  const status = Number(run?.status);
  const stderr = String(run?.stderr || '').trim();
  const stdout = String(run?.stdout || '').trim();
  const errMsg = String(run?.error?.message || '').trim();
  const mixed = [stderr, stdout, errMsg].filter(Boolean).join('\n');

  if (/No module named ['"]?PIL['"]?/i.test(mixed)) return `${tag} 缺少 Pillow（PIL）套件`;
  if (/ENOENT/i.test(errMsg)) return `${tag} 指令不存在`;
  if (/timed out/i.test(errMsg) || signal === 'SIGTERM' || signal === 'SIGKILL') return `${tag} 渲染逾時`;
  if (/cannot open resource/i.test(mixed) || /OSError:.*resource/i.test(mixed)) return `${tag} 字型資源不可用`;
  if (/can't open file|No such file or directory/i.test(mixed) && /render_region_map\.py/i.test(mixed)) {
    return `${tag} 找不到地圖渲染腳本`;
  }

  const firstLine = (stderr || stdout || errMsg || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
  if (firstLine) return `${tag} 失敗：${firstLine.slice(0, 120)}`;
  if (Number.isFinite(status)) return `${tag} 失敗（exit ${status}）`;
  return `${tag} 渲染失敗`;
}

function renderRegionMapImageBuffer(snapshot, statusText = '') {
  if (!snapshot || !Array.isArray(snapshot.mapRows) || snapshot.mapRows.length === 0) {
    return { buffer: null, error: '地圖資料為空' };
  }
  const scriptPath = getRegionMapRendererScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return { buffer: null, error: '找不到地圖渲染腳本 tools/render_region_map.py' };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renaiss-map-'));
  const inPath = path.join(tempDir, 'map-input.json');
  const outPath = path.join(tempDir, 'map-output.png');
  const fontPath = path.join(__dirname, 'NotoSansMonoCJKtc-Regular.otf');
  const payload = {
    map_rows: snapshot.mapRows,
    labels: Array.isArray(snapshot.locations)
      ? snapshot.locations.map((row) => ({
        location: String(row.location || ''),
        x: Number(row.x) + 1,
        y: Number(row.y) + 1,
        name: String(row.location || ''),
        is_current: Boolean(row.isCurrent),
        is_portal_hub: Boolean(row.isPortalHub),
        marker: row.isCurrent && row.isPortalHub
          ? '◎'
          : (row.isCurrent ? '' : (row.isPortalHub ? '◎' : '')),
        npc_count: 0
      }))
      : [],
    zone_name: `${snapshot.regionName} ${snapshot.difficultyRange ? `(${snapshot.difficultyRange})` : ''}`.trim(),
    status: statusText
  };

  try {
    fs.writeFileSync(inPath, JSON.stringify(payload), 'utf8');
    const args = [scriptPath, '--input', inPath, '--output', outPath];
    if (fs.existsSync(fontPath)) args.push('--font', fontPath);
    const runners = ['python3', 'python'];
    let run = null;
    const failReasons = [];
    for (const runner of runners) {
      run = spawnSync(runner, args, { cwd: __dirname, encoding: 'utf8', timeout: 12000 });
      if (run.status === 0) {
        if (fs.existsSync(outPath)) {
          return { buffer: fs.readFileSync(outPath), error: '' };
        }
        failReasons.push(`${runner} 執行成功但未產生 PNG`);
        continue;
      }
      failReasons.push(summarizeMapRenderFailure(runner, run));
    }
    if (!run || run.status !== 0) {
      console.log('[MapRender] python render failed:', {
        status: run?.status,
        signal: run?.signal,
        error: run?.error ? String(run.error.message || run.error) : '',
        stdout: String(run?.stdout || '').slice(0, 600),
        stderr: String(run?.stderr || '').slice(0, 600)
      });
      return { buffer: null, error: (failReasons.join('｜') || 'Python 渲染失敗').slice(0, 220) };
    }
    return { buffer: null, error: (failReasons.join('｜') || '渲染失敗（未知原因）').slice(0, 220) };
  } catch (e) {
    console.log('[MapRender] exception:', e?.message || e);
    return { buffer: null, error: `程式例外：${String(e?.message || e).slice(0, 140)}` };
  } finally {
    try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath); } catch {}
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
    try { fs.rmdirSync(tempDir); } catch {}
  }
}

function buildRegionMoveSelectRow(player, snapshot, islandCompleted, lang = 'zh-TW') {
  const tx = getMapText(lang);
  const locations = Array.isArray(snapshot?.locations) ? snapshot.locations : [];
  const current = String(player?.location || '').trim();
  const freeRoamUnlocked = canFreeRoamCurrentRegion(player);
  const canMoveInRegion = Boolean(islandCompleted || freeRoamUnlocked);
  const options = locations
    .filter((row) => String(row?.location || '').trim() && String(row.location) !== current)
    .slice(0, 25)
    .map((row) => ({
      label: String(row.location).slice(0, 100),
      description: row.isPortalHub ? tx.regionMovePortalHub : tx.regionMoveInRegion,
      value: String(row.location)
    }));

  const placeholder = canMoveInRegion
    ? (options.length > 0 ? tx.regionMovePlaceholderOpen : tx.regionMovePlaceholderEmpty)
    : tx.regionMovePlaceholderLocked;

  const select = new StringSelectMenuBuilder()
    .setCustomId('map_region_move_select')
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(!canMoveInRegion || options.length === 0)
    .addOptions(options.length > 0 ? options : [{
      label: tx.regionMoveLockedLabel,
      description: tx.regionMoveLockedDesc,
      value: '__locked__'
    }]);

  return new ActionRowBuilder().addComponents(select);
}

function saveMapReturnSnapshot(player, message) {
  if (!player || !message) return;
  const embeds = Array.isArray(message.embeds) ? message.embeds.map(e => e.toJSON()) : [];
  const components = Array.isArray(message.components) ? message.components.map(r => r.toJSON()) : [];
  const hasAnyButtons = components.some((row) => Array.isArray(row?.components) && row.components.length > 0);
  if (!hasAnyButtons) {
    return;
  }
  player.mapReturnSnapshot = {
    messageId: message.id || null,
    content: message.content || null,
    embeds,
    components,
    savedAt: Date.now()
  };
  CORE.savePlayer(player);
}

function consumeMapReturnSnapshot(player, messageId) {
  if (!player?.mapReturnSnapshot) return null;
  const snapshot = player.mapReturnSnapshot;
  if (snapshot.messageId && messageId && snapshot.messageId !== messageId) {
    return null;
  }
  delete player.mapReturnSnapshot;
  CORE.savePlayer(player);
  return snapshot;
}

function snapshotHasUsableComponents(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.components)) return false;
  for (const row of snapshot.components) {
    const components = Array.isArray(row?.components) ? row.components : [];
    for (const component of components) {
      const customId = String(component?.custom_id || '');
      if (!customId) continue;
      if (customId === 'map_back_main') continue;
      if (customId.startsWith('map_')) continue;
      if (customId.startsWith('portal_')) continue;
      if (customId.startsWith('device_')) continue;
      return true;
    }
  }
  return false;
}

function joinByLang(items = [], lang = 'zh-TW') {
  const list = Array.isArray(items) ? items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean) : [];
  if (list.length === 0) return '';
  return list.join(lang === 'en' ? ', ' : '、');
}

function getMapText(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const map = {
    'zh-TW': {
      regionMovePortalHub: '主傳送門地點',
      regionMoveInRegion: '區內可探索地點',
      regionMovePlaceholderOpen: '選擇區內移動目標（會導向下一段劇情）',
      regionMovePlaceholderEmpty: '本區暫無其他可移動座標',
      regionMovePlaceholderLocked: `本地劇情未完成；請先到鑑價站/商店購買傳送裝置（${TELEPORT_DEVICE_COST} Rns）`,
      regionMoveLockedLabel: '尚未開放',
      regionMoveLockedDesc: '先完成本地劇情，或先購買傳送裝置',
      mapBtnPrev: '⬅️ 上一頁',
      mapBtnNext: '下一頁 ➡️',
      mapBtnBackStory: '📖 返回故事',
      mapBtnPortal: '🌀 傳送門',
      mapBtnDevice: '🧭 傳送裝置',
      mapBtnText: '📄 文字版',
      mapBtnAscii: '🧩 ASCII版',
      mapTitle: '🗺️ Renaiss 群島海圖',
      mapDisplayImage: 'Pillow 圖像版',
      mapDisplayAsciiFallback: 'ASCII 版（圖像渲染失敗，回退）',
      mapDisplayTextFallback: '文字版（圖像渲染失敗，回退）',
      mapLegendImage: '圖例：@你、◎主傳送門、●城市、▲森林（@若有橘色外框代表你正站在主傳送門）',
      mapLegendText: '@黃色=你｜◎橘色=主傳送門｜●紫色=城市｜▲綠色=森林',
      mapNoProfile: '未知',
      mapNoRegion: '未知區域',
      mapNoNearby: '未知',
      mapNoPortal: '附近無可用傳送門',
      mapNoNavTarget: '（未設定）',
      mapNoPortalHub: '未知',
      mapNoCities: '（本頁無地點）',
      mapSectionPageMap: '本頁地圖（手機友善）',
      mapSectionRegionCities: '分區城市',
      mapSectionRegionInfo: '本頁地區情報',
      mapSectionAreaIntel: '當前地區情報',
      mapFieldMapDisplay: '地圖顯示',
      mapFieldRenderError: '渲染失敗原因',
      mapFieldCurrentLocation: '目前位置',
      mapFieldCurrentRegion: '當前分區',
      mapFieldDifficulty: '區域難度',
      mapFieldNavTarget: '導航目標',
      mapFieldCurrentPortalHub: '當前主傳送門',
      mapFieldMainPortalHubs: '六大區主傳送門',
      mapFieldFreeExplore: '自由探索',
      mapFieldLegend: '圖例',
      mapFieldNearbyInteractive: '附近可互動內容',
      mapFieldNearbyScenes: '周邊場景',
      mapFieldLandmarks: '地標',
      mapFieldResources: '資源/商機',
      mapFieldPortalTo: '傳送門可往',
      mapFieldMapPages: '地圖頁數',
      mapFreeExploreOpen: '已開放（可用下拉選單設定區內目的地）',
      mapFreeExploreLocked: `未開放（先完成本地劇情，或先到鑑價站/商店購買傳送裝置 ${TELEPORT_DEVICE_COST} Rns）`,
      mapHintMoveRule: '_區內可用「🧭 傳送裝置」即時移動；跨區請站在主傳送門使用「🌀 傳送門」。_',
      mapCurrentLocationSuffix: '（地圖中已高亮）',
      mapInfoNearbyPrefix: '附近',
      mapPortalGuide: (preview) => `🌀 **主傳送門操作：** 先移動到「主傳送門地點」→ 按「🌀 傳送門」→ 選目的地（如：${preview}）。`,
      mapPortalGuideLocked: '🌀 **主傳送門操作：** 先完成本區主線，再到主傳送門跨島。',
      mapDeviceGuide: (preview, count, ttlText) => `🧭 **傳送裝置操作：** 按「🧭 傳送裝置」→ 選同島目的地（如：${preview}）。目前可用 ${count} 顆（最早到期：${ttlText}）。`,
      mapNotFoundPlayer: '❌ 找不到角色資料，請先 /start',
      mapUseInThread: '⚠️ 請回到遊戲討論串使用。',
      portalTitle: '🌀 傳送門目的地',
      portalDesc1: '你已啟動',
      portalDesc2: '附近的傳送門網路。',
      portalDesc3Open: '（已完成本區主線，可跨島傳送）',
      portalDesc3Locked: '（本區主線未完成，跨島尚未開放）',
      portalDesc4: '請點選要傳送到的目的地：',
      portalBackMap: '🗺️ 返回地圖',
      portalBackStory: '📖 返回故事',
      portalNotReady: '⚠️ 你目前不在主傳送門地點。請先在島內移動到主傳送門所在城市。',
      portalStoryLocked: '⚠️ 你尚未完成本區主線，暫時不能跨島傳送。請先完成本區關鍵劇情。',
      portalNoDestination: '⚠️ 目前沒有可用的跨島目的地。',
      deviceTitle: '🧭 傳送裝置｜同島目的地',
      deviceNotOwned: `⚠️ 你目前沒有可用的傳送裝置。請先在鑑價站購買（${TELEPORT_DEVICE_COST} Rns，單顆效期 ${TELEPORT_DEVICE_DURATION_HOURS} 小時）。`,
      deviceDesc: (count, ttlText) => `你啟動了隨身傳送裝置。此裝置僅支援同島（同大區）內瞬間位移。\n可用數量：${count} 顆｜最早到期：${ttlText}\n每次傳送會消耗 1 顆。`,
      deviceBackMap: '🗺️ 返回地圖',
      deviceBackStory: '📖 返回故事',
      deviceInvalidDestination: '⚠️ 無效的傳送裝置目的地。',
      deviceAlreadyHere: (target) => `✅ 你已經在 ${target}。`,
      deviceTeleportStory: (from, to, tail = '') => {
        const carry = String(tail || '').trim();
        const intro = carry ? `📖 承接前情：${carry}\n` : '';
        return `${intro}🧭 你在${from}迅速啟動隨身傳送裝置，藍白光紋包覆全身後瞬間折返定位。\n你已從 **${from}** 抵達 **${to}**，現場張力被你強行切換到新地點。`;
      },
      deviceDoneTitle: '✅ 傳送裝置完成定位',
      deviceDoneDesc: (from, to, remaining) => `你已使用傳送裝置由 **${from}** 抵達 **${to}**。\n剩餘可用：${remaining} 顆。\n\n按「📖 返回故事」可在新地點承接前情繼續冒險。`,
      mapModeSwitchText: '✅ 已切換為文字地圖',
      mapModeSwitchAscii: '✅ 已切換為 ASCII 地圖',
      mapExploreLockedNotice: `🧭 本地劇情尚未完成，還不能自由探索。先推進本島故事，或先到鑑價站/商店購買傳送裝置（${TELEPORT_DEVICE_COST} Rns）。`,
      mapInvalidDestination: '⚠️ 請選擇有效目的地。',
      mapCrossRegionBlocked: '⚠️ 區內移動只能選同一大區地點；跨區請使用主傳送門。',
      mapAlreadyHereNotice: (target) => `✅ 你已在 ${target}`,
      mapDestinationSetNotice: (target) => `✅ 已設定目的地：${target}。下一段故事會朝這裡推進。`,
      mapAutoTravelLocked: (target) => `🧭 你想前往 **${target}**，但本地劇情尚未完成，只能先沿主線推進。`,
      mapAutoTravelCrossRegion: '🧭 區內移動僅限同一大區；跨區請使用主傳送門。',
      mapAutoTravelGateBlocked: (target, from, winRate) => `🛑 你朝 **${target}** 推進時感到壓力失衡（預估勝率 ${format1(winRate)}%），只好先在 **${from}** 整備。`,
      mapAutoTravelMoved: (from, target) => `🧭 你依照地圖座標離開 **${from}**，一路推進到 **${target}**。`,
      portalInvalidDestination: '⚠️ 無效的傳送目的地。',
      portalGateDenied: (target, winRate) => `🛑 無法前往 **${target}**：目前勝率 ${format1(winRate)}%（需要 > ${format1(LOCATION_ENTRY_MIN_WINRATE)}%）。`,
      portalTeleportStory: (from, to, tail = '') => {
        const carry = String(tail || '').trim();
        const intro = carry ? `📖 承接前情：${carry}\n` : '';
        return `${intro}🌀 傳送門正在開啟，空間折疊完成。\n你已由 **${from}** 抵達 **${to}**，周遭場景與人流在光紋散去後迅速重組。`;
      },
      portalDoneTitle: '✅ 傳送完成',
      portalDoneDesc: (from, to) => `你已由 **${from}** 傳送至 **${to}**。\n\n接下來按「📖 返回故事」，系統會以新地點生成新的故事與選項。`,
      mapGotoHint: '🗺️ 地圖按鈕僅供查看，移動請透過劇情中的「前往傳送門」選項。'
    },
    'zh-CN': {
      regionMovePortalHub: '主传送门地点',
      regionMoveInRegion: '区内可探索地点',
      regionMovePlaceholderOpen: '选择区内移动目标（会导向下一段剧情）',
      regionMovePlaceholderEmpty: '本区暂无其他可移动坐标',
      regionMovePlaceholderLocked: `本地剧情未完成；请先到鉴价站/商店购买传送装置（${TELEPORT_DEVICE_COST} Rns）`,
      regionMoveLockedLabel: '尚未开放',
      regionMoveLockedDesc: '先完成本地剧情，或先购买传送装置',
      mapBtnPrev: '⬅️ 上一页',
      mapBtnNext: '下一页 ➡️',
      mapBtnBackStory: '📖 返回故事',
      mapBtnPortal: '🌀 传送门',
      mapBtnDevice: '🧭 传送装置',
      mapBtnText: '📄 文字版',
      mapBtnAscii: '🧩 ASCII版',
      mapTitle: '🗺️ Renaiss 群岛海图',
      mapDisplayImage: 'Pillow 图像版',
      mapDisplayAsciiFallback: 'ASCII 版（图像渲染失败，回退）',
      mapDisplayTextFallback: '文字版（图像渲染失败，回退）',
      mapLegendImage: '图例：@你、◎主传送门、●城市、▲森林（@若有橘色外框代表你正站在主传送门）',
      mapLegendText: '@黄色=你｜◎橘色=主传送门｜●紫色=城市｜▲绿色=森林',
      mapNoProfile: '未知',
      mapNoRegion: '未知区域',
      mapNoNearby: '未知',
      mapNoPortal: '附近无可用传送门',
      mapNoNavTarget: '（未设置）',
      mapNoPortalHub: '未知',
      mapNoCities: '（本页无地点）',
      mapSectionPageMap: '本页地图（手机友善）',
      mapSectionRegionCities: '分区城市',
      mapSectionRegionInfo: '本页地区情报',
      mapSectionAreaIntel: '当前地区情报',
      mapFieldMapDisplay: '地图显示',
      mapFieldRenderError: '渲染失败原因',
      mapFieldCurrentLocation: '目前位置',
      mapFieldCurrentRegion: '当前分区',
      mapFieldDifficulty: '区域难度',
      mapFieldNavTarget: '导航目标',
      mapFieldCurrentPortalHub: '当前主传送门',
      mapFieldMainPortalHubs: '六大区主传送门',
      mapFieldFreeExplore: '自由探索',
      mapFieldLegend: '图例',
      mapFieldNearbyInteractive: '附近可互动内容',
      mapFieldNearbyScenes: '周边场景',
      mapFieldLandmarks: '地标',
      mapFieldResources: '资源/商机',
      mapFieldPortalTo: '传送门可往',
      mapFieldMapPages: '地图页数',
      mapFreeExploreOpen: '已开放（可用下拉选单设置区内目的地）',
      mapFreeExploreLocked: `未开放（先完成本地剧情，或先到鉴价站/商店购买传送装置 ${TELEPORT_DEVICE_COST} Rns）`,
      mapHintMoveRule: '_区内可用「🧭 传送装置」即时移动；跨区请站在主传送门使用「🌀 传送门」。_',
      mapCurrentLocationSuffix: '（地图中已高亮）',
      mapInfoNearbyPrefix: '附近',
      mapPortalGuide: (preview) => `🌀 **主传送门操作：** 先移动到「主传送门地点」→ 按「🌀 传送门」→ 选目的地（如：${preview}）。`,
      mapPortalGuideLocked: '🌀 **主传送门操作：** 先完成本区主线，再到主传送门跨岛。',
      mapDeviceGuide: (preview, count, ttlText) => `🧭 **传送装置操作：** 按「🧭 传送装置」→ 选同岛目的地（如：${preview}）。目前可用 ${count} 个（最早到期：${ttlText}）。`,
      mapNotFoundPlayer: '❌ 找不到角色资料，请先 /start',
      mapUseInThread: '⚠️ 请回到游戏讨论串使用。',
      portalTitle: '🌀 传送门目的地',
      portalDesc1: '你已启动',
      portalDesc2: '附近的传送门网络。',
      portalDesc3Open: '（已完成本区主线，可跨岛传送）',
      portalDesc3Locked: '（本区主线未完成，跨岛尚未开放）',
      portalDesc4: '请点选要传送到的目的地：',
      portalBackMap: '🗺️ 返回地图',
      portalBackStory: '📖 返回故事',
      portalNotReady: '⚠️ 你目前不在主传送门地点。请先在岛内移动到主传送门所在城市。',
      portalStoryLocked: '⚠️ 你尚未完成本区主线，暂时不能跨岛传送。请先完成本区关键剧情。',
      portalNoDestination: '⚠️ 目前没有可用的跨岛目的地。',
      deviceTitle: '🧭 传送装置｜同岛目的地',
      deviceNotOwned: `⚠️ 你目前没有可用的传送装置。请先在鉴价站购买（${TELEPORT_DEVICE_COST} Rns，单个有效期 ${TELEPORT_DEVICE_DURATION_HOURS} 小时）。`,
      deviceDesc: (count, ttlText) => `你启动了随身传送装置。此装置仅支持同岛（同大区）内瞬间位移。\n可用数量：${count} 个｜最早到期：${ttlText}\n每次传送会消耗 1 个。`,
      deviceBackMap: '🗺️ 返回地图',
      deviceBackStory: '📖 返回故事',
      deviceInvalidDestination: '⚠️ 无效的传送装置目的地。',
      deviceAlreadyHere: (target) => `✅ 你已经在 ${target}。`,
      deviceTeleportStory: (from, to, tail = '') => {
        const carry = String(tail || '').trim();
        const intro = carry ? `📖 承接前情：${carry}\n` : '';
        return `${intro}🧭 你在${from}迅速启动随身传送装置，蓝白光纹包覆全身后瞬间折返定位。\n你已从 **${from}** 抵达 **${to}**，现场张力被你强行切换到新地点。`;
      },
      deviceDoneTitle: '✅ 传送装置完成定位',
      deviceDoneDesc: (from, to, remaining) => `你已使用传送装置由 **${from}** 抵达 **${to}**。\n剩余可用：${remaining} 个。\n\n按「📖 返回故事」可在新地点承接前情继续冒险。`,
      mapModeSwitchText: '✅ 已切换为文字地图',
      mapModeSwitchAscii: '✅ 已切换为 ASCII 地图',
      mapExploreLockedNotice: `🧭 本地剧情尚未完成，还不能自由探索。先推进本岛故事，或先到鉴价站/商店购买传送装置（${TELEPORT_DEVICE_COST} Rns）。`,
      mapInvalidDestination: '⚠️ 请选择有效目的地。',
      mapCrossRegionBlocked: '⚠️ 区内移动只能选同一大区地点；跨区请使用主传送门。',
      mapAlreadyHereNotice: (target) => `✅ 你已在 ${target}`,
      mapDestinationSetNotice: (target) => `✅ 已设置目的地：${target}。下一段故事会朝这里推进。`,
      mapAutoTravelLocked: (target) => `🧭 你想前往 **${target}**，但本地剧情尚未完成，只能先沿主线推进。`,
      mapAutoTravelCrossRegion: '🧭 区内移动仅限同一大区；跨区请使用主传送门。',
      mapAutoTravelGateBlocked: (target, from, winRate) => `🛑 你朝 **${target}** 推进时感到压力失衡（预估胜率 ${format1(winRate)}%），只好先在 **${from}** 整备。`,
      mapAutoTravelMoved: (from, target) => `🧭 你依照地图坐标离开 **${from}**，一路推进到 **${target}**。`,
      portalInvalidDestination: '⚠️ 无效的传送目的地。',
      portalGateDenied: (target, winRate) => `🛑 无法前往 **${target}**：当前胜率 ${format1(winRate)}%（需要 > ${format1(LOCATION_ENTRY_MIN_WINRATE)}%）。`,
      portalTeleportStory: (from, to, tail = '') => {
        const carry = String(tail || '').trim();
        const intro = carry ? `📖 承接前情：${carry}\n` : '';
        return `${intro}🌀 传送门正在开启，空间折叠完成。\n你已由 **${from}** 抵达 **${to}**，周遭场景与人流在光纹散去后迅速重组。`;
      },
      portalDoneTitle: '✅ 传送完成',
      portalDoneDesc: (from, to) => `你已由 **${from}** 传送至 **${to}**。\n\n接下来按「📖 返回故事」，系统会以新地点生成新的故事与选项。`,
      mapGotoHint: '🗺️ 地图按钮仅供查看，移动请通过剧情中的「前往传送门」选项。'
    },
    en: {
      regionMovePortalHub: 'Portal hub location',
      regionMoveInRegion: 'Explorable location in this region',
      regionMovePlaceholderOpen: 'Pick an in-region destination (used for next story step)',
      regionMovePlaceholderEmpty: 'No other movable nodes in this region',
      regionMovePlaceholderLocked: `Local arc not completed. Buy a Teleport Device at appraisal station/shop first (${TELEPORT_DEVICE_COST} Rns).`,
      regionMoveLockedLabel: 'Locked',
      regionMoveLockedDesc: 'Finish local story first, or buy a Teleport Device',
      mapBtnPrev: '⬅️ Prev',
      mapBtnNext: 'Next ➡️',
      mapBtnBackStory: '📖 Back to Story',
      mapBtnPortal: '🌀 Portal',
      mapBtnDevice: '🧭 Teleport Device',
      mapBtnText: '📄 Text',
      mapBtnAscii: '🧩 ASCII',
      mapTitle: '🗺️ Renaiss Archipelago Map',
      mapDisplayImage: 'Pillow image mode',
      mapDisplayAsciiFallback: 'ASCII mode (image render failed, fallback)',
      mapDisplayTextFallback: 'Text mode (image render failed, fallback)',
      mapLegendImage: 'Legend: @You, ◎Portal hub, ●City, ▲Forest (@ with orange outline means you are standing on a portal hub)',
      mapLegendText: '@yellow=you | ◎orange=portal hub | ●purple=city | ▲green=forest',
      mapNoProfile: 'Unknown',
      mapNoRegion: 'Unknown Region',
      mapNoNearby: 'Unknown',
      mapNoPortal: 'No available nearby portals',
      mapNoNavTarget: '(Not set)',
      mapNoPortalHub: 'Unknown',
      mapNoCities: '(No locations on this page)',
      mapSectionPageMap: 'Page Map (mobile-friendly)',
      mapSectionRegionCities: 'Region Cities',
      mapSectionRegionInfo: 'Page Region Intel',
      mapSectionAreaIntel: 'Current Region Intel',
      mapFieldMapDisplay: 'Map Display',
      mapFieldRenderError: 'Render Failure Reason',
      mapFieldCurrentLocation: 'Current Location',
      mapFieldCurrentRegion: 'Current Region',
      mapFieldDifficulty: 'Region Difficulty',
      mapFieldNavTarget: 'Navigation Target',
      mapFieldCurrentPortalHub: 'Current Portal Hub',
      mapFieldMainPortalHubs: 'Six Main Portal Hubs',
      mapFieldFreeExplore: 'Free Exploration',
      mapFieldLegend: 'Legend',
      mapFieldNearbyInteractive: 'Nearby Interactions',
      mapFieldNearbyScenes: 'Nearby Scenes',
      mapFieldLandmarks: 'Landmarks',
      mapFieldResources: 'Resources / Opportunities',
      mapFieldPortalTo: 'Portal Destinations',
      mapFieldMapPages: 'Map Pages',
      mapFreeExploreOpen: 'Unlocked (set in-region destination via dropdown)',
      mapFreeExploreLocked: `Locked (finish local story, or buy Teleport Device at appraisal station/shop: ${TELEPORT_DEVICE_COST} Rns)`,
      mapHintMoveRule: '_Use "🧭 Teleport Device" for instant in-island movement. For cross-region travel, stand at the main portal hub and use "🌀 Portal"._',
      mapCurrentLocationSuffix: '(highlighted on map)',
      mapInfoNearbyPrefix: 'Nearby',
      mapPortalGuide: (preview) => `🌀 **Main Portal Guide:** Move to the portal-hub city first -> press "🌀 Portal" -> choose destination (e.g. ${preview}).`,
      mapPortalGuideLocked: '🌀 **Main Portal Guide:** Finish this region mainline first, then use the main portal for cross-island travel.',
      mapDeviceGuide: (preview, count, ttlText) => `🧭 **Teleport Device Guide:** Press "🧭 Teleport Device" -> choose in-island destination (e.g. ${preview}). Usable: ${count} (soonest expiry: ${ttlText}).`,
      mapNotFoundPlayer: '❌ Character not found. Please run /start first.',
      mapUseInThread: '⚠️ Please use this in your game thread.',
      portalTitle: '🌀 Portal Destinations',
      portalDesc1: 'You have activated the portal network near',
      portalDesc2: '.',
      portalDesc3Open: '(This region mainline is complete. Cross-island travel is unlocked.)',
      portalDesc3Locked: '(This region mainline is not complete. Cross-island travel is locked.)',
      portalDesc4: 'Choose a destination:',
      portalBackMap: '🗺️ Back to Map',
      portalBackStory: '📖 Back to Story',
      portalNotReady: '⚠️ You are not standing at the main portal hub. Move to the hub city first.',
      portalStoryLocked: '⚠️ You have not completed this region mainline yet, so cross-island portal travel is locked.',
      portalNoDestination: '⚠️ No cross-island portal destination is currently available.',
      deviceTitle: '🧭 Teleport Device | In-Island Destinations',
      deviceNotOwned: `⚠️ You currently have no usable teleport devices. Buy one at an appraisal station (${TELEPORT_DEVICE_COST} Rns, each expires in ${TELEPORT_DEVICE_DURATION_HOURS}h).`,
      deviceDesc: (count, ttlText) => `You activated a portable teleport device. It only supports instant travel within the same island (same region).\nUsable stock: ${count} | Soonest expiry: ${ttlText}\nEach teleport consumes 1 device.`,
      deviceBackMap: '🗺️ Back to Map',
      deviceBackStory: '📖 Back to Story',
      deviceInvalidDestination: '⚠️ Invalid teleport-device destination.',
      deviceAlreadyHere: (target) => `✅ You are already at ${target}.`,
      deviceTeleportStory: (from, to, tail = '') => {
        const carry = String(tail || '').trim();
        const intro = carry ? `📖 Carry-over: ${carry}\n` : '';
        return `${intro}🧭 You trigger the portable teleport device at ${from}. Blue-white vectors wrap around you and snap to a new local coordinate.\nYou moved from **${from}** to **${to}**, forcing the scene tension to continue at the new location.`;
      },
      deviceDoneTitle: '✅ Teleport Device Relocation Complete',
      deviceDoneDesc: (from, to, remaining) => `You used the teleport device from **${from}** to **${to}**.\nRemaining usable stock: ${remaining}.\n\nPress "📖 Back to Story" to continue from the new location with carry-over context.`,
      mapModeSwitchText: '✅ Switched to Text Map',
      mapModeSwitchAscii: '✅ Switched to ASCII Map',
      mapExploreLockedNotice: `🧭 Local story arc not finished. Free exploration is locked. Progress local story, or buy a Teleport Device at appraisal station/shop (${TELEPORT_DEVICE_COST} Rns).`,
      mapInvalidDestination: '⚠️ Please choose a valid destination.',
      mapCrossRegionBlocked: '⚠️ In-region movement only allows locations in the same region. Use portal for cross-region travel.',
      mapAlreadyHereNotice: (target) => `✅ You are already at ${target}`,
      mapDestinationSetNotice: (target) => `✅ Destination set: ${target}. The next story step will move toward it.`,
      mapAutoTravelLocked: (target) => `🧭 You want to go to **${target}**, but local story is not completed yet. Continue the main arc first.`,
      mapAutoTravelCrossRegion: '🧭 In-region movement only supports same-region nodes; use portal for cross-region travel.',
      mapAutoTravelGateBlocked: (target, from, winRate) => `🛑 You felt unstable pressure while advancing to **${target}** (estimated win rate ${format1(winRate)}%), so you regrouped at **${from}**.`,
      mapAutoTravelMoved: (from, target) => `🧭 Following map coordinates, you moved from **${from}** to **${target}**.`,
      portalInvalidDestination: '⚠️ Invalid portal destination.',
      portalGateDenied: (target, winRate) => `🛑 Cannot travel to **${target}**: current win rate ${format1(winRate)}% (required > ${format1(LOCATION_ENTRY_MIN_WINRATE)}%).`,
      portalTeleportStory: (from, to, tail = '') => {
        const carry = String(tail || '').trim();
        const intro = carry ? `📖 Carry-over: ${carry}\n` : '';
        return `${intro}🌀 Portal activated. Spatial fold complete.\nYou moved from **${from}** to **${to}**, and the local scene rapidly re-anchors around your arrival.`;
      },
      portalDoneTitle: '✅ Teleport Complete',
      portalDoneDesc: (from, to) => `You teleported from **${from}** to **${to}**.\n\nNow press "📖 Back to Story" to generate new story and choices at the new location.`,
      mapGotoHint: '🗺️ Map buttons are for viewing only. For movement, use the story option "Go to nearby portal".'
    }
  };
  return map[code] || map['zh-TW'];
}

function getSettingsText(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const map = {
    'zh-TW': {
      title: '⚙️ 設定',
      desc: '遊戲設置（可在此查看世界導讀）',
      fieldLanguage: '🌐 語言 / Language',
      fieldWallet: '💳 錢包',
      fieldWorldIntro: '📖 世界導讀',
      currentPrefix: '目前：',
      langNameZhTw: '中文（繁體）',
      langNameZhCn: '中文（簡體）',
      langNameEn: 'English',
      walletBound: (addr) => `已綁定：\`${addr || 'unknown'}\``,
      walletUnbound: '未綁定（可中途綁定，立即入帳）',
      btnSyncWallet: '🔄 同步資產',
      btnBindWallet: '💳 綁定錢包',
      btnBack: '🔙 返回',
      btnWorld: '🌍 Renaiss世界',
      worldTitle: '🌍 Renaiss 世界',
      worldDescSuffix: '主線會由你的行動被動觸發。',
      btnBackSettings: '⚙️ 返回設定',
      btnBackAdventure: '🔙 返回冒險'
    },
    'zh-CN': {
      title: '⚙️ 设置',
      desc: '游戏设置（可在此查看世界导读）',
      fieldLanguage: '🌐 语言 / Language',
      fieldWallet: '💳 钱包',
      fieldWorldIntro: '📖 世界导读',
      currentPrefix: '当前：',
      langNameZhTw: '中文（繁体）',
      langNameZhCn: '中文（简体）',
      langNameEn: 'English',
      walletBound: (addr) => `已绑定：\`${addr || 'unknown'}\``,
      walletUnbound: '未绑定（可中途绑定，立即入账）',
      btnSyncWallet: '🔄 同步资产',
      btnBindWallet: '💳 绑定钱包',
      btnBack: '🔙 返回',
      btnWorld: '🌍 Renaiss世界',
      worldTitle: '🌍 Renaiss 世界',
      worldDescSuffix: '主线会由你的行动被动触发。',
      btnBackSettings: '⚙️ 返回设置',
      btnBackAdventure: '🔙 返回冒险'
    },
    en: {
      title: '⚙️ Settings',
      desc: 'Game settings (world primer available here)',
      fieldLanguage: '🌐 Language',
      fieldWallet: '💳 Wallet',
      fieldWorldIntro: '📖 World Primer',
      currentPrefix: 'Current:',
      langNameZhTw: 'Traditional Chinese',
      langNameZhCn: 'Simplified Chinese',
      langNameEn: 'English',
      walletBound: (addr) => `Bound: \`${addr || 'unknown'}\``,
      walletUnbound: 'Not bound (you can bind anytime and sync instantly)',
      btnSyncWallet: '🔄 Sync Assets',
      btnBindWallet: '💳 Bind Wallet',
      btnBack: '🔙 Back',
      btnWorld: '🌍 Renaiss World',
      worldTitle: '🌍 Renaiss World',
      worldDescSuffix: 'Main story is passively triggered by your actions.',
      btnBackSettings: '⚙️ Back to Settings',
      btnBackAdventure: '🔙 Back to Adventure'
    }
  };
  return map[code] || map['zh-TW'];
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
  return uiLang === 'en' ? `${name} (${region})` : `${name}（${region}）`;
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
  const crossRegionUnlocked = Boolean(islandCompleted || regionUnlocked);
  return {
    from,
    atPortalHub,
    islandCompleted,
    regionUnlocked,
    crossRegionUnlocked,
    destinations: atPortalHub && crossRegionUnlocked ? cleaned : []
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
  const ttlText = info.count > 0 ? formatTeleportDeviceRemaining(info.soonestRemainingMs) : (uiLang === 'en' ? 'N/A' : '無');
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
  const rawCandidates = typeof getPortalDestinations === 'function'
    ? getPortalDestinations(from)
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

  const entryGate = canEnterLocation(player, targetLocation);
  if (!entryGate.allowed) {
    player.navigationTarget = '';
    const blockedLine = tx.mapAutoTravelGateBlocked(targetLocation, fromLocation, entryGate.winRate);
    result.message = `${String(result.message || '').trim()}\n\n${blockedLine}`.trim();
    result.autoTravel = {
      fromLocation,
      targetLocation,
      blocked: true,
      winRate: entryGate.winRate,
      reason: 'entry_gate'
    };
    if (typeof queueMemory === 'function') {
      queueMemory({
        type: '移動',
        content: `嘗試探索前往${targetLocation}`,
        outcome: `受阻｜勝率 ${format1(entryGate.winRate)}%`,
        importance: 1,
        tags: ['travel', 'wander', 'blocked', 'entry_gate']
      });
    }
    return result.autoTravel;
  }

  player.location = targetLocation;
  syncLocationArcLocation(player);
  ensurePlayerIslandState(player);
  player.portalMenuOpen = false;
  player.navigationTarget = '';

  const moveLine = tx.mapAutoTravelMoved(fromLocation, targetLocation);
  result.message = `${String(result.message || '').trim()}\n\n${moveLine}`.trim();
  result.autoTravel = { fromLocation, targetLocation, reason: 'manual_navigation' };

  if (typeof queueMemory === 'function') {
    queueMemory({
      type: '移動',
      content: `依座標導航從${fromLocation}前往${targetLocation}`,
      outcome: '區內自由探索移動',
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

async function maybeGenerateTradeGoodFromChoice(event, player, result, selectedChoice) {
  if (!player || !event || !result || result.success === false) return null;
  const text = [
    event.tag || '',
    event.name || '',
    selectedChoice || '',
    event.choice || '',
    event.desc || ''
  ].join(' ');
  const luck = Number(player?.stats?.運氣 || 50);
  const location = player.location || '未知地點';
  const action = String(event.action || '');

  const herbHint = /採|草藥|藥草|靈草|植物|香氣|花/.test(text);
  const huntHint = /狩獵|打獵|追獵|獵物|野獸|捕捉|河魚|野兔|野雞|野豬|鹿/.test(text);
  const treasureHint = /礦|晶|寶|遺跡|寶藏|洞窟|礦洞|遺物|尋寶|探勘/.test(text);
  const investigateHint = /追查|線索|來源|流向|訪談|口供|追蹤|觀察|比對|複核|鑑識|查驗/.test(text);
  const appraisalHint = /鑑價|鑑定|真偽|攤位|商人|低價|可疑貨|贗品|封存艙|鑑價品|貨樣/.test(text);
  const plunderHint = /搶|搶奪|強奪|奪取|打倒|擊敗|搜刮|劫走|逼問|先發制人/.test(text);

  if (action === 'forage' || herbHint) {
    if (Math.random() < (action === 'forage' ? 0.92 : 0.68)) {
      return ECON.createForageLoot(location, luck, { lang: player?.language || 'zh-TW' });
    }
  }
  if (action === 'hunt' || huntHint) {
    if (Math.random() < (action === 'hunt' ? 0.9 : 0.66)) {
      const animalName = result?.item || event?.animal?.name || '獵物';
      return ECON.createHuntLoot(animalName, location, luck, { lang: player?.language || 'zh-TW' });
    }
  }
  if (action === 'treasure' || treasureHint) {
    if (Math.random() < (action === 'treasure' ? 0.78 : 0.45)) {
      return ECON.createTreasureLoot(location, luck, { lang: player?.language || 'zh-TW' });
    }
  }
  if (action === 'fight' || action === 'location_story_battle' || plunderHint) {
    if (Math.random() < 0.58) {
      return Math.random() < 0.62
        ? ECON.createTreasureLoot(location, luck, { lang: player?.language || 'zh-TW' })
        : ECON.createHuntLoot(result?.item || event?.name || '可疑貨樣', location, luck, { lang: player?.language || 'zh-TW' });
    }
  }
  if ((action === 'main_story' || action === 'social' || action === 'trade' || investigateHint || appraisalHint) && Math.random() < 0.42) {
    return Math.random() < 0.55
      ? ECON.createTreasureLoot(location, luck, { lang: player?.language || 'zh-TW' })
      : ECON.createForageLoot(location, luck, { lang: player?.language || 'zh-TW' });
  }
  if (action === 'explore' && Math.random() < 0.36) {
    return Math.random() < 0.7
      ? ECON.createForageLoot(location, luck, { lang: player?.language || 'zh-TW' })
      : ECON.createTreasureLoot(location, luck, { lang: player?.language || 'zh-TW' });
  }
  return null;
}

function buildMapComponents(page, currentLocation, canOpenPortal = false, canOpenDevice = false, mapViewMode = 'text', regionLocations = [], lang = 'zh-TW') {
  const tx = getMapText(lang);
  const sourceLocations = Array.isArray(regionLocations) && regionLocations.length > 0
    ? regionLocations
    : MAP_LOCATIONS;
  const maxPage = Math.max(0, Math.ceil(sourceLocations.length / MAP_PAGE_SIZE) - 1);
  const safePage = Math.max(0, Math.min(page, maxPage));
  const start = safePage * MAP_PAGE_SIZE;
  const pageLocations = sourceLocations.slice(start, start + MAP_PAGE_SIZE);
  const safeMapViewMode = normalizeMapViewMode(mapViewMode);

  const rows = [];
  for (let i = 0; i < pageLocations.length; i += 4) {
    const slice = pageLocations.slice(i, i + 4);
    const buttons = slice.map((loc, idx) => {
      const absoluteIdx = start + i + idx;
      return new ButtonBuilder()
        .setCustomId(`map_loc_${absoluteIdx}`)
        .setLabel(loc.substring(0, 10))
        .setStyle(loc === currentLocation ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(true);
    });
    rows.push(new ActionRowBuilder().addComponents(buttons));
  }

  const navButtons = [
      new ButtonBuilder()
        .setCustomId(`map_page_${safePage - 1}`)
        .setLabel(tx.mapBtnPrev)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`map_page_${safePage + 1}`)
        .setLabel(tx.mapBtnNext)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= maxPage),
      new ButtonBuilder().setCustomId('map_back_main').setLabel(tx.mapBtnBackStory).setStyle(ButtonStyle.Success)
  ];
  if (canOpenPortal) {
    navButtons.splice(2, 0, new ButtonBuilder()
      .setCustomId('map_open_portal')
      .setLabel(tx.mapBtnPortal)
      .setStyle(ButtonStyle.Primary));
  }
  if (canOpenDevice) {
    navButtons.splice(Math.min(3, navButtons.length - 1), 0, new ButtonBuilder()
      .setCustomId('map_open_device')
      .setLabel(tx.mapBtnDevice)
      .setStyle(ButtonStyle.Primary));
  }
  rows.push(new ActionRowBuilder().addComponents(navButtons));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`map_view_text_${safePage}`)
      .setLabel(tx.mapBtnText)
      .setStyle(safeMapViewMode === 'text' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(safeMapViewMode === 'text'),
    new ButtonBuilder()
      .setCustomId(`map_view_ascii_${safePage}`)
      .setLabel(tx.mapBtnAscii)
      .setStyle(safeMapViewMode === 'ascii' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(safeMapViewMode === 'ascii')
  ));

  return { rows, safePage, maxPage, pageLocations };
}

async function showIslandMap(interaction, user, page = 0, notice = '') {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const tx = getMapText(uiLang);
  if (!player) {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
    }
    return;
  }
  ensurePlayerIslandState(player);
  CORE.savePlayer(player);
  const currentIslandState = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
    ? ISLAND_STORY.getIslandStoryState(player, player.location)
    : null;
  const islandCompleted = Boolean(currentIslandState?.completed);
  const regionSnapshot = typeof buildRegionMapSnapshot === 'function'
    ? buildRegionMapSnapshot(player.location || '')
    : null;
  const regionLocations = typeof getRegionLocationsByLocation === 'function'
    ? getRegionLocationsByLocation(player.location || '')
    : [];

  const nearbyPortals = typeof getPortalDestinations === 'function'
    ? getPortalDestinations(player.location || '')
    : [];
  const portalAccess = getPortalAccessContext(player);
  const atPortalHub = isMainPortalHubLocation(player.location || '');
  const canOpenPortal = Boolean(atPortalHub && Array.isArray(nearbyPortals) && nearbyPortals.length > 0);
  const canOpenDevice = playerOwnsTeleportDevice(player);
  const mapViewMode = getPlayerMapViewMode(player);
  const { rows, safePage, maxPage, pageLocations } = buildMapComponents(
    page,
    player.location,
    canOpenPortal,
    canOpenDevice,
    mapViewMode,
    regionLocations,
    uiLang
  );
  rows.push(buildRegionMoveSelectRow(player, regionSnapshot, islandCompleted, uiLang));
  const useWideAnsiMap = mapViewMode === 'ascii';
  const renderedMap = useWideAnsiMap && !regionSnapshot
    ? (typeof buildIslandMapAnsi === 'function'
      ? buildIslandMapAnsi(player.location)
      : ISLAND_MAP_TEXT)
    : '';
  const currentProfile = typeof getLocationProfile === 'function'
    ? getLocationProfile(player.location)
    : null;
  const locationContext = typeof getLocationStoryContext === 'function'
    ? getLocationStoryContext(player.location)
    : '';
  const pageSummary = pageLocations.map((loc) => {
    const profile = typeof getLocationProfile === 'function' ? getLocationProfile(loc) : null;
    const region = profile?.region || tx.mapNoRegion;
    const difficulty = Number(profile?.difficulty || 3);
    const marker = loc === player.location ? '◉' : '•';
    if (!useWideAnsiMap) {
      return `${marker} ${loc}（${region}｜D${difficulty}）`;
    }
    const nearby = Array.isArray(profile?.nearby) && profile.nearby.length > 0
      ? joinByLang(profile.nearby.slice(0, 2), uiLang)
      : tx.mapNoNearby;
    return `${marker} ${loc}（${region}｜D${difficulty}）${tx.mapInfoNearbyPrefix}：${nearby}`;
  }).join('\n');
  const compactMap = useWideAnsiMap
    ? ''
    : `**${tx.mapSectionPageMap}**\n${pageSummary || tx.mapNoCities}`;
  const locationSummary = Array.isArray(regionSnapshot?.locations)
    ? regionSnapshot.locations
      .map((row) => `${row.isCurrent ? '◉' : (row.isPortalHub ? '◎' : '●')} ${row.location}`)
      .join(uiLang === 'en' ? ', ' : '、')
    : '';
  const mapBlock = useWideAnsiMap
    ? (regionSnapshot
      ? '```' + regionSnapshot.mapRows.join('\n') + '\n```'
      : ('```ansi\n' + renderedMap + '\n```'))
    : compactMap;
  const mapImageStatus = tx.mapLegendImage;
  const mapRenderResult = regionSnapshot
    ? renderRegionMapImageBuffer(regionSnapshot, mapImageStatus)
    : { buffer: null, error: '缺少區域地圖資料' };
  const renderedMapImage = mapRenderResult?.buffer || null;
  const hasRenderedMapImage = Boolean(renderedMapImage);
  const renderErrorText = !hasRenderedMapImage ? String(mapRenderResult?.error || '').trim() : '';
  const visibleMapBlock = hasRenderedMapImage ? '' : mapBlock;
  const mapDisplayLabel = hasRenderedMapImage
    ? tx.mapDisplayImage
    : (useWideAnsiMap ? tx.mapDisplayAsciiFallback : tx.mapDisplayTextFallback);
  const nearbyPlaces = Array.isArray(currentProfile?.nearby) && currentProfile.nearby.length > 0
    ? joinByLang(currentProfile.nearby.slice(0, 4), uiLang)
    : tx.mapNoNearby;
  const nearbyLandmarks = Array.isArray(currentProfile?.landmarks) && currentProfile.landmarks.length > 0
    ? joinByLang(currentProfile.landmarks.slice(0, 3), uiLang)
    : tx.mapNoNearby;
  const nearbyResources = Array.isArray(currentProfile?.resources) && currentProfile.resources.length > 0
    ? joinByLang(currentProfile.resources.slice(0, 4), uiLang)
    : tx.mapNoNearby;
  const nearbyPortalsText = portalAccess.crossRegionUnlocked
    ? (
      Array.isArray(portalAccess.destinations) && portalAccess.destinations.length > 0
        ? joinByLang(portalAccess.destinations.slice(0, 6).map((loc) => formatPortalDestinationDisplay(loc, uiLang)), uiLang)
        : tx.mapNoPortal
    )
    : tx.portalDesc3Locked;
  const navTargetText = String(player.navigationTarget || '').trim() || tx.mapNoNavTarget;
  const currentLocationText = player.location || tx.mapNoProfile;
  const regionNameText = regionSnapshot?.regionName || currentProfile?.region || tx.mapNoRegion;
  const difficultyText = currentProfile ? `D${currentProfile.difficulty}` : tx.mapNoProfile;
  const portalHubText = typeof getLocationPortalHub === 'function'
    ? (getLocationPortalHub(player.location || '') || tx.mapNoPortalHub)
    : tx.mapNoPortalHub;
  const mainPortalHubList = typeof getRegionPortalHubs === 'function' ? getRegionPortalHubs() : [];
  const mainPortalHubText = joinByLang(mainPortalHubList, uiLang) || tx.mapNoPortalHub;
  const freeExploreText = islandCompleted ? tx.mapFreeExploreOpen : tx.mapFreeExploreLocked;
  const mapDesc = hasRenderedMapImage
    ? (
      `**${tx.mapFieldMapDisplay}：** ${mapDisplayLabel}` +
      `\n**${tx.mapFieldNavTarget}：** ${navTargetText}` +
      `\n**${tx.mapFieldFreeExplore}：** ${freeExploreText}` +
      `\n**${tx.mapFieldNearbyInteractive}：**` +
      `\n- ${tx.mapFieldNearbyScenes}：${nearbyPlaces}` +
      `\n- ${tx.mapFieldLandmarks}：${nearbyLandmarks}` +
      `\n- ${tx.mapFieldResources}：${nearbyResources}` +
      `\n- ${tx.mapFieldPortalTo}：${nearbyPortalsText}` +
      `\n**${tx.mapFieldMapPages}：** ${safePage + 1}/${maxPage + 1}` +
      (canOpenPortal ? `\n\n${buildPortalUsageGuide(player, uiLang)}` : '') +
      (canOpenDevice ? `\n${buildDeviceUsageGuide(player, uiLang)}` : '') +
      `\n${tx.mapHintMoveRule}` +
      (notice ? `\n${notice}` : '')
    )
    : (
      visibleMapBlock +
      `\n**${tx.mapFieldCurrentLocation}：** ◉${currentLocationText}◉ ${tx.mapCurrentLocationSuffix}` +
      `\n**${tx.mapFieldMapDisplay}：** ${mapDisplayLabel}` +
      `\n**${tx.mapFieldCurrentRegion}：** ${regionNameText}` +
      `\n**${tx.mapFieldDifficulty}：** ${difficultyText}` +
      `\n**${tx.mapFieldNavTarget}：** ${navTargetText}` +
      `\n**${tx.mapFieldCurrentPortalHub}：** ${portalHubText}` +
      `\n**${tx.mapFieldMainPortalHubs}：** ${mainPortalHubText}` +
      `\n**${tx.mapFieldFreeExplore}：** ${freeExploreText}` +
      (renderErrorText ? `\n**${tx.mapFieldRenderError}：** ${renderErrorText}` : '') +
      `\n**${tx.mapFieldLegend}：** ${tx.mapLegendText}` +
      `\n**${tx.mapFieldNearbyInteractive}：**` +
      `\n- ${tx.mapFieldNearbyScenes}：${nearbyPlaces}` +
      `\n- ${tx.mapFieldLandmarks}：${nearbyLandmarks}` +
      `\n- ${tx.mapFieldResources}：${nearbyResources}` +
      `\n- ${tx.mapFieldPortalTo}：${nearbyPortalsText}` +
      (locationContext ? `\n**${tx.mapSectionAreaIntel}：** ${locationContext}` : '') +
      `\n**${tx.mapFieldMapPages}：** ${safePage + 1}/${maxPage + 1}` +
      (locationSummary ? `\n\n**${tx.mapSectionRegionCities}**\n${locationSummary}` : '') +
      (!hasRenderedMapImage && useWideAnsiMap && pageSummary ? `\n\n**${tx.mapSectionRegionInfo}**\n${pageSummary}` : '') +
      (canOpenPortal ? `\n\n${buildPortalUsageGuide(player, uiLang)}` : '') +
      (canOpenDevice ? `\n${buildDeviceUsageGuide(player, uiLang)}` : '') +
      `\n${tx.mapHintMoveRule}` +
      (notice ? `\n${notice}` : '')
    );

  const embed = new EmbedBuilder()
    .setTitle(tx.mapTitle)
    .setColor(0x4da6ff)
    .setDescription(mapDesc);
  if (renderedMapImage) {
    embed.setImage('attachment://region-map.png');
  }
  const files = renderedMapImage
    ? [new AttachmentBuilder(renderedMapImage, { name: 'region-map.png' })]
    : [];
  const payload = { embeds: [embed], components: rows, files };

  if ((interaction.isButton && interaction.isButton()) || (interaction.isStringSelectMenu && interaction.isStringSelectMenu())) {
    await interaction.update(payload).catch(() => {});
    if (interaction.message?.id) {
      trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
    }
    return;
  }

  if (interaction.deferred || interaction.replied) {
    const msg = await interaction.followUp(payload).catch(() => null);
    if (msg) trackActiveGameMessage(player, interaction.channel?.id, msg.id);
  } else {
    const msg = await interaction.reply(payload).catch(() => null);
    if (msg) trackActiveGameMessage(player, interaction.channel?.id, msg.id);
  }
}

async function showPortalSelection(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const tx = getMapText(uiLang);
  if (!player) {
    await interaction.reply({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
    return;
  }
  ensurePlayerIslandState(player);

  const access = getPortalAccessContext(player);
  if (!access.atPortalHub) {
    await interaction.reply({
      content: tx.portalNotReady,
      ephemeral: true
    }).catch(() => {});
    return;
  }
  if (!access.crossRegionUnlocked) {
    await interaction.reply({
      content: tx.portalStoryLocked,
      ephemeral: true
    }).catch(() => {});
    return;
  }
  const destinations = Array.isArray(access.destinations) ? access.destinations : [];
  if (destinations.length === 0) {
    await interaction.reply({
      content: tx.portalNoDestination,
      ephemeral: true
    }).catch(() => {});
    return;
  }
  const rows = [];
  for (let i = 0; i < destinations.length; i += 4) {
    const buttons = destinations.slice(i, i + 4).map((loc, idx) => {
      const absoluteIdx = i + idx;
      return new ButtonBuilder()
        .setCustomId(`portal_jump_${absoluteIdx}`)
        .setLabel(loc.substring(0, 12))
        .setStyle(ButtonStyle.Primary);
    });
    rows.push(new ActionRowBuilder().addComponents(buttons));
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('map_page_0').setLabel(tx.portalBackMap).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('map_back_main').setLabel(tx.portalBackStory).setStyle(ButtonStyle.Success)
    )
  );

  const embed = new EmbedBuilder()
    .setTitle(tx.portalTitle)
    .setColor(0x7b68ee)
    .setDescription(
      `${tx.portalDesc1} ${player.location} ${tx.portalDesc2}\n` +
      `${tx.portalDesc3Open}\n` +
      `${tx.portalDesc4}\n\n` +
      destinations.map((loc, idx) => `${idx + 1}. ${formatPortalDestinationDisplay(loc, uiLang)}`).join('\n')
    );

  await interaction.update({ embeds: [embed], components: rows }).catch(() => {});
  if (interaction.message?.id) {
    trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
  }
}

async function showTeleportDeviceSelection(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const tx = getMapText(uiLang);
  if (!player) {
    await interaction.reply({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
    return;
  }
  const stockInfo = getTeleportDeviceStockInfo(player);
  if (stockInfo.count <= 0) {
    await interaction.reply({
      content: tx.deviceNotOwned,
      ephemeral: true
    }).catch(() => {});
    return;
  }
  const rawDestinations = typeof getRegionLocationsByLocation === 'function'
    ? getRegionLocationsByLocation(player.location || '')
    : [];
  const destinations = Array.isArray(rawDestinations) ? rawDestinations.filter(Boolean) : [];
  if (destinations.length === 0) {
    await interaction.reply({
      content: tx.mapInvalidDestination,
      ephemeral: true
    }).catch(() => {});
    return;
  }

  const rows = [];
  for (let i = 0; i < destinations.length; i += 4) {
    const buttons = destinations.slice(i, i + 4).map((loc, idx) => {
      const absoluteIdx = i + idx;
      const isCurrent = String(loc || '').trim() === String(player.location || '').trim();
      return new ButtonBuilder()
        .setCustomId(`device_jump_${absoluteIdx}`)
        .setLabel(String(loc || '').substring(0, 12))
        .setStyle(isCurrent ? ButtonStyle.Success : ButtonStyle.Primary);
    });
    rows.push(new ActionRowBuilder().addComponents(buttons));
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('map_page_0').setLabel(tx.deviceBackMap).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('map_back_main').setLabel(tx.deviceBackStory).setStyle(ButtonStyle.Success)
    )
  );

  const embed = new EmbedBuilder()
    .setTitle(tx.deviceTitle)
    .setColor(0x22c55e)
    .setDescription(
      `${tx.deviceDesc(stockInfo.count, formatTeleportDeviceRemaining(stockInfo.soonestRemainingMs))}\n\n` +
      destinations.map((loc, idx) => `${idx + 1}. ${loc}`).join('\n')
    );

  await interaction.update({ embeds: [embed], components: rows }).catch(() => {});
  if (interaction.message?.id) {
    trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
  }
}

function buildRetryGenerationComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('retry_story_generation').setLabel('🔄 重新生成').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('main_menu').setLabel('🏠 主選單').setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function editOrSendFallback(channel, targetMessage, payload, context = 'story_update') {
  if (targetMessage && typeof targetMessage.edit === 'function') {
    try {
      const edited = await targetMessage.edit(payload);
      return edited || targetMessage;
    } catch (e) {
      console.log(`[UI][${context}] message edit failed, fallback send:`, e?.message || e);
    }
  }
  if (!channel || typeof channel.send !== 'function') return null;
  try {
    return await channel.send(payload);
  } catch (e) {
    console.log(`[UI][${context}] fallback send failed:`, e?.message || e);
    return null;
  }
}

// ============== 語言文字取得 ==============
function getLanguageText(lang) {
  const texts = {
    'zh-TW': {
      welcome: '歡迎來到 Renaiss 星球！',
      welcomeDesc: '在這個世界，你需要：\n• 選擇你的角色性別並先命名角色\n• 選擇夥伴寵物屬性（水/火/草）並命名寵物\n• 完成開局抽獎後開始探索事件、戰鬥與任務',
      chooseGenderHint: '請先選擇你的角色性別：',
      onboardingFooter: '選完性別先命名角色，再選寵物屬性與寵物名字即可開局',
      male: '男生角色',
      maleDesc: '主角為男性形象，劇情稱謂會對應調整',
      female: '女生角色',
      femaleDesc: '主角為女性形象，劇情稱謂會對應調整',
      chooseElementHint: '請選擇你的起始寵物屬性：',
      water: '水屬性',
      waterDesc: '控制 + 回復 + 持續干擾，節奏穩健',
      fire: '火屬性',
      fireDesc: '爆發 + 壓制 + 反制，節奏強攻',
      grass: '草屬性',
      grassDesc: '防禦 + 毒蝕 + 回復，續戰能力強',
      charNameModalTitle: '📛 為你的角色取個名字',
      charNameLabel: '角色名字',
      charNamePlaceholder: '輸入你在 Renaiss 星球的名字',
      petNameModalTitle: '🐾 為你的寵物取名',
      petNameLabel: '寵物名字',
      petNamePlaceholder: '輸入名字（1-6個字）',
      elementChoiceInvalid: '⚠️ 屬性選擇資料錯誤，請重新操作。'
    },
    'zh-CN': {
      welcome: '欢迎来到 Renaiss 星球！',
      welcomeDesc: '在这个世界，你需要：\n• 选择你的角色性别并先命名角色\n• 选择伙伴宠物属性（水/火/草）并命名宠物\n• 完成开局抽奖后开始探索事件、战斗与任务',
      chooseGenderHint: '请先选择你的角色性别：',
      onboardingFooter: '选完性别先命名角色，再选宠物属性与宠物名字即可开局',
      male: '男生角色',
      maleDesc: '主角为男性形象，剧情称谓会对应调整',
      female: '女生角色',
      femaleDesc: '主角为女性形象，剧情称谓会对应调整',
      chooseElementHint: '请选择你的起始宠物属性：',
      water: '水属性',
      waterDesc: '控制 + 回复 + 持续干扰，节奏稳健',
      fire: '火属性',
      fireDesc: '爆发 + 压制 + 反制，节奏强攻',
      grass: '草属性',
      grassDesc: '防御 + 毒蚀 + 回复，续战能力强',
      charNameModalTitle: '📛 为你的角色取个名字',
      charNameLabel: '角色名字',
      charNamePlaceholder: '输入你在 Renaiss 星球的名字',
      petNameModalTitle: '🐾 为你的宠物取名',
      petNameLabel: '宠物名字',
      petNamePlaceholder: '输入名字（1-6个字）',
      elementChoiceInvalid: '⚠️ 属性选择资料错误，请重新操作。'
    },
    'en': {
      welcome: 'Welcome to Renaiss Planet!',
      welcomeDesc: 'In this world, you need to:\n• Choose character gender and name your character first\n• Choose starter pet element (Water / Fire / Grass) and name your pet\n• Finish the starter draw, then begin exploration, battles, and quests',
      chooseGenderHint: 'Choose your character gender first:',
      onboardingFooter: 'Choose gender, name your character, then pick pet element and pet name to start.',
      male: 'Male',
      maleDesc: 'Story pronouns and role narration follow male profile',
      female: 'Female',
      femaleDesc: 'Story pronouns and role narration follow female profile',
      chooseElementHint: 'Choose your starter pet element:',
      water: 'Water',
      waterDesc: 'Control + sustain + chip damage',
      fire: 'Fire',
      fireDesc: 'Burst + pressure + counterattack',
      grass: 'Grass',
      grassDesc: 'Defense + poison + recovery',
      charNameModalTitle: '📛 Name Your Character',
      charNameLabel: 'Character Name',
      charNamePlaceholder: 'Enter your name on Renaiss',
      petNameModalTitle: '🐾 Name Your Pet',
      petNameLabel: 'Pet Name',
      petNamePlaceholder: 'Enter a name (1-6 chars)',
      elementChoiceInvalid: '⚠️ Invalid element selection. Please try again.'
    }
  };
  return texts[lang] || texts['zh-TW'];
}

function getWorldIntroTemplate(lang = 'zh-TW') {
  const templates = {
    'zh-TW': [
      '你身在 Renaiss 海域。這片星域由 Renaiss 長年維運，是航道、交易與居住秩序的核心。',
      '但在明面秩序之外，另一股勢力正與既有體系長期角力，雙方在各區節點不斷拉鋸。',
      '主角群由你與你的夥伴寵物展開；你每一次探索、交易、戰鬥、撤退，都會改寫下一段劇情。',
      'Renaiss 的前線核心由 Winchman、Tom、Harry、Kathy、Ryan 協同維持，重點是守住航道與民生據點。',
      '這是開放世界，沒有固定主線按鈕；章節、流言、戰況與角色命運都由你的選擇被動推進。',
      '世界會記住你做過的事，並把後果擴散成所有玩家可見的長期傳聞。'
    ].join('\n'),
    'zh-CN': [
      '你身在 Renaiss 海域。这片星域长期由 Renaiss 维运，是航道、交易与居住秩序的核心。',
      '但在明面秩序之外，另一股势力正与既有体系长期角力，双方在各区节点持续拉锯。',
      '主角群由你与伙伴宠物展开；你每一次探索、交易、战斗、撤退，都会改写下一段剧情。',
      'Renaiss 前线核心由 Winchman、Tom、Harry、Kathy、Ryan 协同维持，重点是守住航道与民生据点。',
      '这是开放世界，没有固定主线按钮；章节、流言、战况与角色命运都由你的选择被动推进。',
      '世界会记住你做过的事，并把后果扩散成所有玩家可见的长期传闻。'
    ].join('\n'),
    'en': [
      'You are in the Renaiss Sea, a star region long maintained by Renaiss as the backbone of routes, trade, and civil order.',
      'Beyond the visible order, a rival force keeps contesting that system across multiple regional nodes.',
      'The protagonists are you and your partner creature; each exploration, trade, battle, or retreat rewrites your next chapter.',
      'Renaiss frontline operations are coordinated by Winchman, Tom, Harry, Kathy, and Ryan to keep routes and civilian hubs stable.',
      'This is an open world with no fixed main-story button; chapters, rumors, and outcomes are passively triggered by your choices.',
      'The world remembers your actions and propagates the consequences as shared long-term rumors.'
    ].join('\n')
  };
  return templates[lang] || templates['zh-TW'];
}

function consumeWorldIntroOnce(player) {
  if (!player) return '';
  if (player.worldIntroShown) return '';
  player.worldIntroShown = true;
  CORE.savePlayer(player);
  return getWorldIntroTemplate(player.language || 'zh-TW');
}

function normalizeCharacterGender(raw = '') {
  const text = String(raw || '').trim().toLowerCase();
  if (text === 'male' || text === 'm' || text === '男') return '男';
  if (text === 'female' || text === 'f' || text === '女') return '女';
  return '男';
}

function normalizePetElementCode(raw = '') {
  if (PET && typeof PET.normalizePetElement === 'function') {
    return PET.normalizePetElement(raw);
  }
  const text = String(raw || '').trim();
  if (text === '水' || text === 'water') return '水';
  if (text === '火' || text === 'fire') return '火';
  if (text === '草' || text === 'grass') return '草';
  return '水';
}

function getPetElementColor(element = '') {
  const normalized = normalizePetElementCode(element);
  if (normalized === '火') return 0xef4444;
  if (normalized === '草') return 0x22c55e;
  return 0x0ea5e9;
}

function getPetElementDisplayName(element = '') {
  const normalized = normalizePetElementCode(element);
  if (normalized === '火') return '火屬性';
  if (normalized === '草') return '草屬性';
  return '水屬性';
}

function normalizeKnownBattleElement(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text === '水' || /^water$/i.test(text) || /水屬性/u.test(text)) return '水';
  if (text === '火' || /^fire$/i.test(text) || /火屬性/u.test(text)) return '火';
  if (text === '草' || /^grass$/i.test(text) || /草屬性/u.test(text)) return '草';
  return '';
}

function getBattleElementEmoji(raw = '') {
  const normalized = normalizeKnownBattleElement(raw);
  if (normalized === '水') return '💧';
  if (normalized === '火') return '🔥';
  if (normalized === '草') return '🌿';
  return '🧪';
}

function formatBattleElementDisplay(raw = '', fallback = '未知屬性') {
  const text = String(raw || '').trim();
  if (!text) return `❔ ${fallback}`;
  const normalized = normalizeKnownBattleElement(text);
  if (normalized) return `${getBattleElementEmoji(normalized)} ${getPetElementDisplayName(normalized)}`;
  const cleaned = text.replace(/屬性$/u, '').trim();
  const label = cleaned ? `${cleaned}屬性` : fallback;
  return `${getBattleElementEmoji(text)} ${label}`;
}

function resolveEnemyBattleElement(enemy = {}) {
  const candidates = [
    enemy?.type,
    enemy?.element,
    enemy?.petElement,
    enemy?.npcPet?.element,
    enemy?.companionPet?.element
  ];
  for (const raw of candidates) {
    const text = String(raw || '').trim();
    if (text) return text;
  }
  return '';
}

function getBattleElementRelation(allyRaw = '', enemyRaw = '') {
  const ally = normalizeKnownBattleElement(allyRaw);
  const enemy = normalizeKnownBattleElement(enemyRaw);
  const counter = { 水: '火', 火: '草', 草: '水' };
  if (!ally || !enemy) {
    return {
      state: 'unknown',
      text: '⚖️ 屬性克制：無明確克制（未知屬性）'
    };
  }
  if (counter[ally] === enemy) {
    return {
      state: 'ally_advantage',
      text: '🌟 屬性克制：我方克制敵方（傷害 +20%）'
    };
  }
  if (counter[enemy] === ally) {
    return {
      state: 'enemy_advantage',
      text: '⚠️ 屬性克制：敵方克制我方（對手傷害 +20%）'
    };
  }
  return {
    state: 'neutral',
    text: '⚖️ 屬性克制：互不克制'
  };
}

function pickDefaultPetNameByElement(element = '') {
  const normalized = normalizePetElementCode(element);
  const pools = {
    水: ['小潮', '霧霧', '波波', '阿泉', '海璃'],
    火: ['焰焰', '赤星', '小炎', '烬羽', '火仔'],
    草: ['芽芽', '藤藤', '青苔', '小森', '葉寶']
  };
  const list = pools[normalized] || pools['水'];
  return list[Math.floor(Math.random() * list.length)];
}

function normalizeCharacterName(raw = '', fallback = '旅人') {
  const text = String(raw || '').trim().slice(0, 20);
  return text || String(fallback || '旅人').slice(0, 20);
}

function normalizePetName(raw = '', element = '水') {
  const text = String(raw || '').trim().slice(0, 6);
  return text || pickDefaultPetNameByElement(element);
}

function getMoveTierMeta(tier = 1) {
  const safeTier = Math.max(1, Number(tier) || 1);
  if (safeTier >= 3) return { emoji: '🔮', name: '史詩', color: 0x9932cc, rate: '5%' };
  if (safeTier >= 2) return { emoji: '💠', name: '稀有', color: 0x1e90ff, rate: '15%' };
  return { emoji: '⚪', name: '普通', color: 0x808080, rate: '80%' };
}

function rollStarterMoveForElement(element = '水') {
  const allMoves = getPetMovePool(element);
  if (!Array.isArray(allMoves) || allMoves.length <= 0) return null;
  const shuffled = [...allMoves].sort(() => Math.random() - 0.5);
  const choices = shuffled.slice(0, 3);
  const roll = Math.random();
  const tierIndex = roll < 0.80 ? 0 : roll < 0.95 ? 1 : 2;
  const tierMoves = choices.filter((m) => Number(m?.tier || 1) === tierIndex + 1);
  const selected = tierMoves.length > 0 ? tierMoves[0] : choices.find((m) => Number(m?.tier || 1) === 1) || choices[0] || null;
  return selected || null;
}

function buildGenderSelectionPayload(lang = 'zh-TW', username = '') {
  const langText = getLanguageText(lang);
  const embed = new EmbedBuilder()
    .setTitle(`🌟 ${langText.welcome}`)
    .setColor(0x00ff00)
    .setDescription(`${langText.welcomeDesc}\n\n${langText.chooseGenderHint}`)
    .addFields(
      { name: `♂️ ${langText.male}`, value: langText.maleDesc, inline: true },
      { name: `♀️ ${langText.female}`, value: langText.femaleDesc, inline: true }
    );
  if (username) {
    embed.setFooter({ text: `${username}，${langText.onboardingFooter}` });
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('choose_gender_male').setLabel(`♂️ ${langText.male}`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('choose_gender_female').setLabel(`♀️ ${langText.female}`).setStyle(ButtonStyle.Secondary)
  );
  return { embed, row };
}

function buildElementSelectionPayload(lang = 'zh-TW', gender = '男') {
  const langText = getLanguageText(lang);
  const safeGender = normalizeCharacterGender(gender);
  const roleText = safeGender === '女' ? langText.female : langText.male;
  const embed = new EmbedBuilder()
    .setTitle(`🐾 ${langText.welcome}`)
    .setColor(0x38bdf8)
    .setDescription(`${roleText}\n\n${langText.chooseElementHint}`)
    .addFields(
      { name: `💧 ${langText.water}`, value: langText.waterDesc, inline: true },
      { name: `🔥 ${langText.fire}`, value: langText.fireDesc, inline: true },
      { name: `🌿 ${langText.grass}`, value: langText.grassDesc, inline: true }
    );
  const genderCode = safeGender === '女' ? 'female' : 'male';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`choose_element_${genderCode}_water`).setLabel(`💧 ${langText.water}`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`choose_element_${genderCode}_fire`).setLabel(`🔥 ${langText.fire}`).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`choose_element_${genderCode}_grass`).setLabel(`🌿 ${langText.grass}`).setStyle(ButtonStyle.Success)
  );
  return { embed, row };
}

async function showCharacterNameModal(interaction, gender = '男', lang = 'zh-TW') {
  const safeGender = normalizeCharacterGender(gender);
  const genderCode = safeGender === '女' ? 'female' : 'male';
  const langText = getLanguageText(lang);
  const modal = new ModalBuilder()
    .setCustomId(`char_name_submit_${genderCode}`)
    .setTitle(langText.charNameModalTitle);

  const nameInput = new TextInputBuilder()
    .setCustomId('player_name')
    .setLabel(langText.charNameLabel)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(langText.charNamePlaceholder)
    .setRequired(true)
    .setMaxLength(20);

  modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
  await interaction.showModal(modal);
}

async function showOnboardingPetNameModal(interaction, lang = 'zh-TW') {
  const langText = getLanguageText(lang);
  const modal = new ModalBuilder()
    .setCustomId('pet_onboard_name_submit')
    .setTitle(langText.petNameModalTitle);

  const nameInput = new TextInputBuilder()
    .setCustomId('pet_name')
    .setLabel(langText.petNameLabel)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(langText.petNamePlaceholder)
    .setMinLength(1)
    .setMaxLength(6)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
  await interaction.showModal(modal);
}

function parseNameSubmitProfileFromCustomId(customId = '') {
  const text = String(customId || '').trim();
  const match = text.match(/^name_submit_profile_(male|female)_(water|fire|grass)$/);
  if (match) {
    const gender = match[1] === 'female' ? '女' : '男';
    const element = match[2] === 'fire' ? '火' : match[2] === 'grass' ? '草' : '水';
    return { gender, element, alignment: '正派' };
  }

  const legacyAlignment = normalizePlayerAlignment(text.replace('name_submit_', ''));
  return {
    gender: '男',
    element: '水',
    alignment: legacyAlignment
  };
}

function normalizePlayerAlignment(alignment) {
  const text = String(alignment || '').trim();
  if (!text) return '正派';
  if (text === '反派') return '機變派';
  if (text === '信標聯盟' || text === 'Beacon Union') return '正派';
  if (text === '灰域協定' || text === 'Gray Accord') return '機變派';
  if (text === '正派' || text === '機變派') return text;
  return text;
}

function formatAlignmentLabel(alignment) {
  const normalized = normalizePlayerAlignment(alignment);
  if (normalized === '正派') return '信標聯盟';
  if (normalized === '機變派') return '灰域協定';
  return normalized;
}

function getAlignmentColor(alignment) {
  return normalizePlayerAlignment(alignment) === '正派' ? 0x00ff00 : 0x3b82f6;
}

// ============== 關閉舊 thread ==============
async function closeOldThread(userId) {
  const oldThreadId = getPlayerThread(userId);
  
  if (oldThreadId) {
    const oldThread = CLIENT.channels.cache.get(oldThreadId);
    
    if (oldThread && oldThread.isThread()) {
      try {
        // 發送告別訊息
        await oldThread.send({
          content: `👋 這個討論串即將被關閉。\n使用 /start 會開啟新的討論串。`
        });
        
        // 歸檔 thread（變成唯讀）
        await oldThread.setArchived(true, '開啟新討論串');
        console.log(`[遊戲] 已歸檔舊 thread: ${oldThreadId}`);
      } catch (e) {
        console.log(`[遊戲] 歸檔舊 thread 失敗: ${e.message}`);
      }
    }
    
    // 清除記錄
    setPlayerThread(userId, null);
  }
}

// ============== 創建新 thread 並關閉舊的 ==============
async function createNewThread(channel, user) {
  // 先關閉舊 thread
  await closeOldThread(user.id);

  // 建立公開討論串（可見），操作權由按鈕權限檢查控制
  const thread = await channel.threads.create({
    name: `🎮 ${user.username}的Renaiss之旅`,
    autoArchiveDuration: 60 * 24,
    type: ChannelType.GuildPublicThread,
    reason: '玩家開始遊戲'
  });

  await thread.join();
  setPlayerThread(user.id, thread.id);

  return thread;
}

// ============== 啟動完成 ==============
CLIENT.once('ready', () => {
  console.log('[Bot] 🌟 Renaiss World 上線！');
  console.log('[系統] 模組：pet, battle, event, food');
  startAutoTick();
});

// ============== 自動結算 ==============
function startAutoTick() {
  console.log('[自動] 世界結算啟動（每24小時）');
  
  setInterval(async () => {
    if (!isRunning) return;
    
    let tickResult = null;
    try {
      tickResult = await CORE.worldTick(false, process.env.MINIMAX_API_KEY || null);
    } catch (e) {
      console.error('[自動] worldTick 失敗:', e?.message || e);
      return;
    }
    const world = tickResult?.world || CORE.getWorld();
    const faction = tickResult?.factionUpdate || null;
    
    const embed = new EmbedBuilder()
      .setTitle(`🌍 Day ${world.day} - ${world.season} ${world.weather}`)
      .setColor(0x0099ff)
      .setFooter({ text: '🤖 自動運行 | 每24小時' });

    if (faction?.triggered) {
      embed.setDescription(
        `⚔️ **派系衝突更新**\n` +
        `${faction.headline}\n` +
        `${faction.story}\n\n` +
        `正派勢力：${faction.orderPower}｜Digital勢力：${faction.chaosPower}｜緊張度：${faction.tension}\n` +
        `下次衝突預估日：Day ${faction.nextSkirmishDay}`
      );
      EVENTS.addWorldEvent(faction.headline, 'faction_skirmish');
    }

    // 廣播到目前有活躍玩家 thread 的頻道，避免綁定單一 CHANNEL_ID
    const threadIds = Object.values(loadPlayerThreads()).filter(Boolean);
    const targetThreadIds = Array.from(new Set(threadIds));
    for (const threadId of targetThreadIds) {
      try {
        let ch = CLIENT.channels.cache.get(threadId) || null;
        if (!ch) ch = await CLIENT.channels.fetch(threadId);
        if (!ch || typeof ch.send !== 'function') continue;
        await ch.send({ embeds: [embed] }).catch(() => {});
      } catch {
        // 忽略單一 thread 失敗，繼續其他頻道
      }
    }
  }, 86400000);
}

// ============== 斜線指令 ==============
CLIENT.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName, user } = interaction;

  try {
    if (commandName === 'start') await handleStart(interaction, user);
    if (commandName === 'warstatus') await handleWarStatus(interaction);
    if (commandName === 'resetdata') await handleResetData(interaction, user);
    if (commandName === 'resetplayerhistory') await handleResetPlayerHistory(interaction);
    if (commandName === 'resetworld') await handleResetWorld(interaction);
    if (commandName === 'backupworld') await handleBackupWorld(interaction, user);
    if (commandName === 'backupcheck') await handleBackupCheck(interaction);
  } catch (err) {
    console.error(`[Slash] 指令處理失敗 ${commandName}:`, err?.message || err);
    const msg = `❌ 指令執行失敗：${err?.message || err}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

async function handleResetData(interaction, user) {
  const scope = String(interaction.options.getString('scope') || 'self').trim().toLowerCase();
  const password = String(interaction.options.getString('password') || '').trim();

  if (password !== RESETDATA_PASSWORD) {
    await interaction.reply({ content: '❌ 密碼錯誤，無法清空資料。', ephemeral: true });
    return;
  }

  if (scope !== 'self' && scope !== 'all') {
    await interaction.reply({ content: '❌ scope 只能是 self 或 all。', ephemeral: true });
    return;
  }

  if (scope === 'all') {
    const report = clearAllCharacterData({ clearWorld: true, worldMode: 'all' });
    await interaction.reply({
      content:
        `✅ 已清空【所有人】角色資料。\n` +
        `- 玩家檔：${report.removedPlayerFiles} 筆\n` +
        `- 舊記憶檔：${report.removedLegacyMemoryFiles} 筆\n` +
        `- 向量記憶刪除：${report.clearedSemanticMemory} 筆\n` +
        `- NPC 引言記憶刪除：${report.clearedNpcQuotes} 筆\n` +
        `- pets/player_threads/user_wallets/scratch_lottery 已重置\n` +
        `- 世界重置：core=${report.resetWorldCore ? '已清空' : '略過'}｜公告板=${report.resetWorldBoard ? '已清空' : '略過'}`,
      ephemeral: true
    });
    return;
  }

  const report = clearSelfCharacterData(user.id);
  await interaction.reply({
    content:
      `✅ 已清空你自己的角色資料。\n` +
      `- 玩家檔：${report.removedPlayerFile ? '已刪除' : '無'}\n` +
      `- 寵物：${report.removedPet ? '已刪除' : '無'}\n` +
      `- 討論串綁定：${report.removedThread ? '已清除' : '無'}\n` +
      `- 錢包綁定：${report.removedWallet ? '已清除' : '無'}\n` +
      `- 向量記憶刪除：${report.clearedSemanticMemory} 筆\n` +
      `- NPC 引言記憶刪除：${report.clearedNpcQuotes} 筆\n` +
      `- 其他玩家好友殘留清理：${report.purgedFriendRefsPlayers} 人（移除 ${report.purgedFriendRefsLinks} 筆）`,
    ephemeral: true
  });
}

async function handleResetPlayerHistory(interaction) {
  const playerId = String(interaction.options.getString('player_id') || '').trim();
  const password = String(interaction.options.getString('password') || '').trim();

  if (password !== RESETDATA_PASSWORD) {
    await interaction.reply({ content: '❌ 密碼錯誤，無法清空玩家資料。', ephemeral: true });
    return;
  }

  if (!playerId) {
    await interaction.reply({ content: '❌ 請提供 player_id。', ephemeral: true });
    return;
  }

  const report = clearTargetPlayerAllData(playerId);
  await interaction.reply({
    content:
      `✅ 已清空指定玩家資料：${playerId}\n` +
      `- 玩家檔：${report.removedPlayerFile ? '已刪除' : '無'}\n` +
      `- 寵物：${report.removedPet ? '已刪除' : '無'}\n` +
      `- 討論串綁定：${report.removedThread ? '已清除' : '無'}\n` +
      `- 錢包綁定：${report.removedWallet ? '已清除' : '無'}\n` +
      `- 向量記憶刪除：${report.clearedSemanticMemory} 筆\n` +
      `- NPC 引言記憶刪除：${report.clearedNpcQuotes} 筆\n` +
      `- 其他玩家好友殘留清理：${report.purgedFriendRefsPlayers} 人（移除 ${report.purgedFriendRefsLinks} 筆）`,
    ephemeral: true
  });
}

async function handleResetWorld(interaction) {
  const mode = String(interaction.options.getString('mode') || 'events').trim().toLowerCase();
  const password = String(interaction.options.getString('password') || '').trim();

  if (password !== RESETDATA_PASSWORD) {
    await interaction.reply({ content: '❌ 密碼錯誤，無法清空世界資料。', ephemeral: true });
    return;
  }

  if (mode !== 'events' && mode !== 'all') {
    await interaction.reply({ content: '❌ mode 只能是 events 或 all。', ephemeral: true });
    return;
  }

  const result = clearWorldRuntimeData(mode);
  const modeLabel = mode === 'all' ? '世界完整狀態（含天數/天氣/傳聞）' : '世界事件與傳聞';
  await interaction.reply({
    content:
      `✅ 已清空【${modeLabel}】。\n` +
      `- core world：${result.core ? '已清空' : '略過'}\n` +
      `- world_events 公告板：${result.board ? '已清空' : '略過'}`,
    ephemeral: true
  });
}

function normalizeBackupNote(note = '') {
  return String(note || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .slice(0, 36);
}

async function handleBackupWorld(interaction, user) {
  const password = String(interaction.options.getString('password') || '').trim();
  const noteRaw = String(interaction.options.getString('note') || '').trim();

  if (password !== RESETDATA_PASSWORD) {
    await interaction.reply({ content: '❌ 密碼錯誤，無法執行手動備份。', ephemeral: true });
    return;
  }

  await interaction.reply({ content: '⏳ 正在執行手動備份（含玩家、世界、記憶資料）...', ephemeral: true });

  try {
    if (typeof CORE.saveWorld === 'function') CORE.saveWorld();
  } catch (e) {
    console.log('[Backup] 手動備份前 saveWorld 失敗:', e?.message || e);
  }

  const note = normalizeBackupNote(noteRaw);
  const reason = note ? `manual:${user.id}:${note}` : `manual:${user.id}`;
  const result = await runWorldBackup(reason);

  if (result?.ok) {
    const changedText = result.changed ? '有新變更並已推送' : '沒有新變更（僅完成檢查）';
    await interaction.followUp({
      content:
        `✅ 手動備份完成\n` +
        `- 狀態：${changedText}\n` +
        `- 分支：${String(result.branch || 'main')}\n` +
        `- 原因標記：${String(result.reason || reason)}`,
      ephemeral: true
    });
    return;
  }

  const failReason = result?.error || result?.reason || 'unknown';
  const hint =
    failReason === 'disabled'
      ? '\n請檢查伺服器環境變數 WORLD_BACKUP_ENABLED=1（修改後需重啟機器人）。'
      : (failReason === 'missing_repo'
        ? '\n請檢查 WORLD_BACKUP_REPO 是否已設定可寫入的 Git 倉庫。'
        : '');
  await interaction.followUp({
    content: `❌ 手動備份失敗：${failReason}${hint}`,
    ephemeral: true
  });
}

async function handleBackupCheck(interaction) {
  const password = String(interaction.options.getString('password') || '').trim();
  if (password !== RESETDATA_PASSWORD) {
    await interaction.reply({ content: '❌ 密碼錯誤，無法查看備份狀態。', ephemeral: true });
    return;
  }

  const status = typeof getBackupDebugStatus === 'function'
    ? getBackupDebugStatus()
    : {};
  const worldRoot = STORAGE?.worldDataRoot || '(unknown)';
  const schedule = `${String(Number(status.hour || 0)).padStart(2, '0')}:${String(Number(status.minute || 0)).padStart(2, '0')}`;

  await interaction.reply({
    content:
      `🧪 備份設定檢查\n` +
      `- WORLD_BACKUP_ENABLED：${status.enabled ? '1' : '0'}\n` +
      `- WORLD_BACKUP_REPO：${status.hasRepo ? '已設定' : '未設定'}\n` +
      `- WORLD_BACKUP_PAT：${status.hasPat ? '已設定' : '未設定'}\n` +
      `- repo 解析：${status.hasResolvedRepo ? '成功' : '失敗'}\n` +
      `- repo host：${status.repoHost || '(unknown)'}\n` +
      `- repo path：${status.repoPath || '(unknown)'}\n` +
      `- branch：${status.branch || '(unknown)'}\n` +
      `- subdir：${status.subdir || '(unknown)'}\n` +
      `- 排程：${schedule} (${status.timezone || 'Asia/Taipei'})\n` +
      `- 開機即跑：${status.runOnStartup ? '是' : '否'}\n` +
      `- WORLD_DATA_ROOT(實際)：${worldRoot}`,
    ephemeral: true
  });
}

function formatFactionWinnerLabel(winner) {
  if (winner === 'order') return '正派';
  if (winner === 'chaos') return 'Digital';
  return '未知';
}

async function handleWarStatus(interaction) {
  const world = CORE.getWorld() || {};
  const war = CORE.getFactionWarStatus() || {};
  const presence = typeof CORE.getFactionPresenceStatus === 'function'
    ? CORE.getFactionPresenceStatus()
    : null;

  const today = Number(world.day || 1);
  const nextDay = Number(war.nextSkirmishDay || today);
  const remain = Math.max(0, nextDay - today);

  const recent = Array.isArray(war.history) ? war.history.slice(0, 3) : [];
  const recentText = recent.length > 0
    ? recent.map((item, idx) => {
      const day = Number(item.day || 0);
      const location = item.location || '未知地點';
      const winner = formatFactionWinnerLabel(item.winner);
      const headline = item.headline || '衝突交火';
      return `${idx + 1}. Day ${day}｜${location}｜勝方：${winner}\n${headline}`;
    }).join('\n')
    : '目前尚無衝突紀錄。';

  const orderLocations = Array.isArray(presence?.orderLocations) ? presence.orderLocations : [];
  const chaosLocations = Array.isArray(presence?.chaosLocations) ? presence.chaosLocations : [];
  const orderText = orderLocations.length > 0 ? orderLocations.join('、') : '尚無目擊';
  const chaosText = chaosLocations.length > 0 ? chaosLocations.join('、') : '尚無目擊';

  const embed = new EmbedBuilder()
    .setTitle('⚔️ 正派 vs Digital 戰況 /warstatus')
    .setColor(0xff8c00)
    .setDescription(
      `Day ${today}\n` +
      `正派勢力：${Number(war.orderPower || 50)}\n` +
      `Digital勢力：${Number(war.chaosPower || 50)}\n` +
      `張力：${Number(war.tension || 55)}\n` +
      `下一次大衝突：Day ${nextDay}${remain > 0 ? `（約 ${remain} 天後）` : '（隨時可能爆發）'}`
    )
    .addFields(
      {
        name: '📍 今日勢力出沒',
        value:
          `正派巡行：${orderText}\n` +
          `Digital 蹤跡（高難區限定）：${chaosText}`
      },
      {
        name: '🧾 最近三次衝突',
        value: recentText
      }
    )
    .setFooter({ text: '規則：Digital 僅高難區；正派可全圖但低難區出現頻率已下調' });

  await interaction.reply({ embeds: [embed] }).catch(async () => {
    await interaction.followUp({ embeds: [embed] }).catch(() => {});
  });
}

// ============== 開始遊戲（統一入口）=============
async function handleStart(interaction, user) {
  // 先回覆用戶說正在準備（ephemeral，不會出現在頻道）
  await interaction.reply({ 
    content: '🎮 正在開啟新討論串...', 
    ephemeral: true 
  }).catch(() => {});
  
  // 在使用者目前所在頻道（或其母頻道）創建新 thread
  const interactionChannel = interaction.channel;
  const channel = interactionChannel?.isThread?.() ? interactionChannel.parent : interactionChannel;
  if (!channel) {
    await interaction.followUp({ content: '❌ 找不到可用頻道，請在伺服器文字頻道再試一次。', ephemeral: true }).catch(() => {});
    return;
  }
  if (typeof channel.threads?.create !== 'function') {
    await interaction.followUp({ content: '❌ 這個地方不能開遊戲討論串，請到一般文字頻道使用 /start。', ephemeral: true }).catch(() => {});
    return;
  }
  
  // 關閉舊 thread 並創建新的
  let thread = null;
  try {
    thread = await createNewThread(channel, user);
  } catch (err) {
    console.error('[start] createNewThread 失敗:', err?.message || err);
    const reason = String(err?.message || err || '未知錯誤');
    await interaction.followUp({
      content:
        `❌ 無法建立遊戲討論串：${reason}\n` +
        '請確認機器人在此頻道有「檢視頻道 / 發送訊息 / 建立公開討論串 / 傳送訊息於討論串」權限。',
      ephemeral: true
    }).catch(() => {});
    return;
  }
  
  // 檢查是否有存檔
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { fallbackPet });
  const pet = petResolved?.pet || fallbackPet;

  // Bug Fix: 新 thread 啟動時清除舊的 activeMessageId，避免新按鈕被判斷為過期
  if (player) {
    MAIN_STORY.ensureMainStoryState(player);
    ensurePlayerGenerationSchema(player);
    player.activeMessageId = null;
    player.activeThreadId = null;
    CORE.savePlayer(player);
  }

  if (player && pet && pet.hatched) {
    // 舊存檔沒有 language 欄位，自動補上繁體中文
    if (!player.language) {
      player.language = 'zh-TW';
      CORE.savePlayer(player);
    }
    
    // 有存檔 → 在 thread 繼續遊戲
    await thread.send({
      content: `👋 <@${user.id}> ${t('welcomeBack', player.language || 'zh-TW')}`
    });
    await sendMainMenuToThread(thread, player, pet, null);
    return;
  }
  
  // 有存檔但寵物還沒孵化 → 繼續孵化流程
  if (player && pet && !pet.hatched) {
    const embed = new EmbedBuilder()
      .setTitle('🐾 你的寵物蛋還沒孵化！')
      .setColor(0xffd700)
      .setDescription('讓我們繼續孵化你的寵物吧！');
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hatch_egg').setLabel('🔨 敲開寵物蛋！').setStyle(ButtonStyle.Primary)
    );
    
    // 保存 thread ID 到內存，这样按钮回调可以发送到同一个 thread
    setPlayerThread(user.id, thread.id);
    await thread.send({ embeds: [embed], components: [row] });
    return;
  }
  
  // 有存檔但寵物還沒取名 → 取名流程
  if (player && pet && pet.hatched && pet.waitingForName) {
    const embed = new EmbedBuilder()
      .setTitle(`🎰 恭喜獲得：${pet.moves[2]?.name || '天賦招式'}！`)
      .setColor(0xffd700)
      .setDescription('你的寵物天賦覺醒！')
      .addFields({ name: '⚔️ 招式', value: pet.moves[2]?.name || '未知', inline: true });
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('enter_pet_name').setLabel('✏️ 輸入名字').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('skip_name').setLabel('🔨 隨機').setStyle(ButtonStyle.Secondary)
    );
    
    setPlayerThread(user.id, thread.id);
    await thread.send({ embeds: [embed], components: [row] });
    return;
  }
  
  // 沒有存檔：不強制綁錢包，可先開始遊戲、稍後再綁並即時入帳
  const walletBound = WALLET.isWalletBound(user.id);
  const walletNote = walletBound
    ? '✅ 已綁定錢包：建立角色時會帶入目前錢包資產。'
    : 'ℹ️ 尚未綁定錢包：你可以先玩，之後到設定綁定並即時入帳。';
  
  try {
    // 第一步：語言選擇
    const langEmbed = new EmbedBuilder()
      .setTitle('🌍 選擇你的語言 / Choose Your Language')
      .setColor(0xffd700)
      .setDescription(`**${user.username}**，歡迎來到 Renaiss 星球！\n\nPlease select your language first / 請先選擇語言：\n\n支援的語言：`)
      .addFields(
        { name: '🇹🇼 繁體中文', value: '繁體中文（台灣、香港）', inline: true },
        { name: '🇨🇳 簡體中文', value: '简体中文（中国）', inline: true },
        { name: '🇺🇸 English', value: 'English (US/EU)', inline: true },
        { name: '💳 錢包狀態', value: walletNote, inline: false }
      );
    
    const langRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('select_lang_zh-TW').setLabel('🇹🇼 繁體中文').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('select_lang_zh-CN').setLabel('🇨🇳 簡體中文').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('select_lang_en').setLabel('🇺🇸 English').setStyle(ButtonStyle.Secondary)
    );
    
    // 發送到已創建的 thread
    await thread.send({ 
      content: `👋 <@${user.id}> 這是你的專屬討論串！開始你的Renaiss探險之旅！`,
      embeds: [langEmbed], 
      components: [langRow] 
    });
    
    // 儲存 thread ID
    setPlayerThread(user.id, thread.id);
    
  } catch (err) {
    console.error('[錯誤] 創建討論串失敗:', err.message);
    await interaction.followUp({ content: '❌ 創建討論串失敗', ephemeral: true }).catch(() => {});
  }
}

// ============== 主選單 ==============
async function handlePlay(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  
  if (!player) {
    await interaction.reply({ content: '❌ 請先 /start 創建角色！', ephemeral: true });
    return;
  }
  
  if (!pet || !pet.hatched) {
    await interaction.reply({ content: '❌ 請先完成寵物孵化！', ephemeral: true });
    return;
  }
  
  if (pet.waitingForName) {
    // 寵物還沒取名，進入取名流程
    const embed = new EmbedBuilder()
      .setTitle(`🎰 恭喜獲得：${pet.moves[2]?.name || '天賦招式'}！`)
      .setColor(0xffd700)
      .setDescription('你的寵物天賦覺醒！')
      .addFields(
        { name: '⚔️ 招式', value: pet.moves[2]?.name || '未知', inline: true }
      );
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('enter_pet_name').setLabel('✏️ 輸入名字').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('skip_name').setLabel('🔨 隨機').setStyle(ButtonStyle.Secondary)
    );
    
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    return;
  }
  
  await showMainMenu(interaction, player, pet);
}

// ============== 寵物資訊 ==============
async function handlePet(interaction, user) {
  const pet = PET.loadPet(user.id);
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  
  if (!pet) {
    await interaction.reply({ content: '❌ 你還沒有寵物！', ephemeral: true });
    return;
  }
  
  const dmgInfo = pet.moves.map((m, i) => {
    const d = BATTLE.calculatePlayerMoveDamage(m, {}, pet);
    const speed = getMoveSpeedValue(m);
    return `${i+1}. **${m.name}** (${m.element}): ${format1(d.total)}dmg｜🚀速度${format1(speed)}`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle(`🐾 ${pet.name || '寵物'}`)
    .setColor(getPetElementColor(pet.type))
    .setDescription(pet.appearance)
    .addFields(
      { name: t('hp', uiLang), value: formatPetHpWithRecovery(pet), inline: true },
      { name: t('atk', uiLang), value: String(pet.attack), inline: true },
      { name: t('def', uiLang), value: String(pet.defense), inline: true },
      { name: '📊 等級', value: String(pet.level), inline: true },
      { name: '🏷️ 屬性', value: getPetElementDisplayName(pet.type), inline: true }
    )
    .addFields({ name: '📜 招式', value: dmgInfo, inline: false });
  
  if (player) {
    embed.addFields(
      { name: t('hp', uiLang), value: `${player.stats.生命}/${player.maxStats.生命}`, inline: true },
      { name: t('gold', uiLang), value: String(player.stats.財富), inline: true },
      { name: '📍 位置', value: player.location, inline: true }
    );
  }
  
  await interaction.reply({ embeds: [embed] });
}

// ============== 按鈕互動 ==============
CLIENT.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return;
  
  const { customId, user } = interaction;
  let buttonTemplateContext = null;
  try {
    if (String(customId || '').startsWith('event_')) {
      console.log(
        `[Interaction] event button received cid=${customId} user=${String(user?.id || '')} ` +
        `channel=${String(interaction.channelId || '')} msg=${String(interaction.message?.id || '')}`
      );
    }

  if (await rejectIfNotThreadOwner(interaction, user.id)) {
    return;
  }

  if (await rejectIfNotLatestThread(interaction, user.id)) {
    return;
  }

  // 地圖返回需要保留原故事按鈕快照：進地圖前先保存
  if (interaction.isButton() && customId === 'open_map') {
    const player = CORE.loadPlayer(user.id);
    if (player && interaction.message) {
      saveMapReturnSnapshot(player, interaction.message);
    }
  }

  // 全域按鈕模板：按下先隱藏；若失敗由 catch 自動回補原按鈕。
  if (interaction.isButton()) {
    buttonTemplateContext = createButtonInteractionTemplateContext(interaction, customId);
    attachButtonTemplateReplyAutoRestore(interaction, buttonTemplateContext);
    // 不阻塞互動回應，避免 3 秒逾時造成「互動處理失敗」。
    buttonTemplateContext?.hidePromise?.catch(() => {});
  }

  // ===== 招式配置下拉 =====
  if (interaction.isStringSelectMenu()) {
    if (customId === 'battle_switch_select') {
      const targetPetId = String(interaction.values?.[0] || '').trim();
      await handleBattleSwitchSelect(interaction, user, targetPetId);
      return;
    }

    if (customId === 'map_region_move_select') {
      const player = CORE.loadPlayer(user.id);
      const uiLang = getPlayerUILang(player);
      const tx = getMapText(uiLang);
      if (!player) {
        await interaction.reply({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
        return;
      }
      ensurePlayerIslandState(player);
      const islandState = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
        ? ISLAND_STORY.getIslandStoryState(player, player.location)
        : null;
      if (!islandState?.completed && !canFreeRoamCurrentRegion(player)) {
        await interaction.reply({
          content: tx.mapExploreLockedNotice,
          ephemeral: true
        }).catch(() => {});
        return;
      }
      const target = String(interaction.values?.[0] || '').trim();
      if (!target || target === '__locked__') {
        await interaction.reply({ content: tx.mapInvalidDestination, ephemeral: true }).catch(() => {});
        return;
      }
      const currentProfile = typeof getLocationProfile === 'function' ? getLocationProfile(player.location || '') : null;
      const targetProfile = typeof getLocationProfile === 'function' ? getLocationProfile(target) : null;
      if (!currentProfile || !targetProfile || String(currentProfile.region || '') !== String(targetProfile.region || '')) {
        await interaction.reply({
          content: tx.mapCrossRegionBlocked,
          ephemeral: true
        }).catch(() => {});
        return;
      }
      if (target === String(player.location || '')) {
        await showIslandMap(interaction, user, 0, tx.mapAlreadyHereNotice(target));
        return;
      }
      player.navigationTarget = target;
      CORE.savePlayer(player);
      await showIslandMap(interaction, user, 0, tx.mapDestinationSetNotice(target));
      return;
    }

    if (customId === 'moves_pet_select') {
      const petId = String(interaction.values?.[0] || '');
      await showMovesList(interaction, user, petId);
      return;
    }

    if (customId === 'moves_learn_chip') {
      const raw = String(interaction.values?.[0] || '').trim();
      const idx = raw.indexOf('::');
      const petId = idx >= 0 ? raw.slice(0, idx) : '';
      const moveId = idx >= 0 ? raw.slice(idx + 2) : '';
      if (!petId || !moveId) {
        await interaction.reply({ content: '⚠️ 技能晶片資料錯誤，請重新選擇。', ephemeral: true }).catch(() => {});
        return;
      }

      const player = CORE.loadPlayer(user.id);
      const pet = PET.getPetById(petId);
      if (!player || !pet || pet.ownerId !== user.id) {
        await interaction.reply({ content: '⚠️ 找不到要操作的寵物或角色。', ephemeral: true }).catch(() => {});
        return;
      }

      const moveTemplate = getPetMovePool(pet.type).find((m) => String(m?.id || '').trim() === moveId) || null;
      if (!moveTemplate?.name) {
        await interaction.reply({ content: '⚠️ 找不到該技能模板，可能與寵物類型不符。', ephemeral: true }).catch(() => {});
        return;
      }

      const consumed = consumeSkillChipFromInventory(player, moveTemplate.name);
      if (!consumed) {
        await interaction.reply({ content: `⚠️ 背包內找不到「${SKILL_CHIP_PREFIX}${moveTemplate.name}」。`, ephemeral: true }).catch(() => {});
        return;
      }

      const learned = learnMoveFromChipForPet(pet, moveTemplate);
      if (!learned?.success) {
        addSkillChipToInventory(player, moveTemplate.name);
        CORE.savePlayer(player);
        await interaction.reply({ content: `❌ ${learned?.reason || '學習失敗'}（已退回晶片）`, ephemeral: true }).catch(() => {});
        return;
      }

      PET.savePet(pet);
      CORE.savePlayer(player);
      const note = learned.replacedMoveName
        ? `（上陣名額已滿，已替換「${learned.replacedMoveName}」）`
        : '';
      await showMovesList(interaction, user, pet.id, `已學習並上陣：${moveTemplate.name} ${note}`.trim());
      return;
    }

    if (customId === 'moves_unlearn_chip') {
      const raw = String(interaction.values?.[0] || '').trim();
      const idx = raw.indexOf('::');
      const petId = idx >= 0 ? raw.slice(0, idx) : '';
      const moveId = idx >= 0 ? raw.slice(idx + 2) : '';
      if (!petId || !moveId) {
        await interaction.reply({ content: '⚠️ 取消學習資料錯誤，請重新選擇。', ephemeral: true }).catch(() => {});
        return;
      }

      const player = CORE.loadPlayer(user.id);
      const pet = PET.getPetById(petId);
      if (!player || !pet || pet.ownerId !== user.id) {
        await interaction.reply({ content: '⚠️ 找不到要操作的寵物或角色。', ephemeral: true }).catch(() => {});
        return;
      }

      const move = (Array.isArray(pet.moves) ? pet.moves : []).find((m) => String(m?.id || '').trim() === moveId) || null;
      if (!move) {
        await interaction.reply({ content: '⚠️ 這招不存在或已被移除。', ephemeral: true }).catch(() => {});
        return;
      }
      if (PROTECTED_MOVE_IDS.has(String(move.id || '').trim())) {
        await interaction.reply({ content: '⚠️ 基礎招式不能取消學習。', ephemeral: true }).catch(() => {});
        return;
      }

      const forgotten = typeof PET.forgetMove === 'function' ? PET.forgetMove(pet, moveId) : null;
      if (!forgotten?.success) {
        await interaction.reply({ content: `❌ ${forgotten?.reason || '取消學習失敗'}`, ephemeral: true }).catch(() => {});
        return;
      }

      pet.activeMoveIds = (Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds : [])
        .map((id) => String(id || '').trim())
        .filter((id) => id && id !== moveId);
      normalizePetMoveLoadout(pet, false);
      PET.savePet(pet);
      addSkillChipToInventory(player, forgotten?.move?.name || move.name);
      CORE.savePlayer(player);
      await showMovesList(interaction, user, pet.id, `已取消學習：${forgotten?.move?.name || move.name}（已退回技能晶片）`);
      return;
    }

    if (customId === 'moves_assign') {
      const values = Array.isArray(interaction.values) ? interaction.values : [];
      if (values.length === 0) {
        await interaction.reply({ content: '⚠️ 請至少選擇 1 個招式。', ephemeral: true }).catch(() => {});
        return;
      }

      const parsed = values.map((v) => {
        const idx = v.indexOf('::');
        if (idx < 0) return { petId: '', moveId: '' };
        return { petId: v.slice(0, idx), moveId: v.slice(idx + 2) };
      });
      const petId = String(parsed[0]?.petId || '');
      const moveIds = parsed.map((x) => String(x.moveId || '').trim()).filter(Boolean);
      if (!petId || moveIds.length === 0 || parsed.some((x) => x.petId !== petId)) {
        await interaction.reply({ content: '⚠️ 招式配置資料錯誤，請重新選擇。', ephemeral: true }).catch(() => {});
        return;
      }

      const pet = PET.getPetById(petId);
      if (!pet || pet.ownerId !== user.id) {
        await interaction.reply({ content: '⚠️ 找不到要設定的寵物。', ephemeral: true }).catch(() => {});
        return;
      }

      const attackMoves = getPetAttackMoves(pet);
      const allowedIds = new Set(attackMoves.map((m) => String(m.id || '')));
      const selected = [];
      for (const id of moveIds) {
        if (!allowedIds.has(id) || selected.includes(id)) continue;
        selected.push(id);
        if (selected.length >= PET_MOVE_LOADOUT_LIMIT) break;
      }
      if (selected.length === 0) {
        await interaction.reply({ content: '⚠️ 請至少選擇 1 個可用攻擊招式。', ephemeral: true }).catch(() => {});
        return;
      }

      pet.activeMoveIds = selected;
      PET.savePet(pet);
      const selectedNames = selected
        .map((id) => attackMoves.find((m) => String(m.id || '') === id)?.name || id)
        .join('、');
      await showMovesList(interaction, user, pet.id, `已為 ${pet.name} 設定上陣招式：${selectedNames}`);
      return;
    }

    if (customId.startsWith('pmkt_buy_select_')) {
      const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
      const raw = String(interaction.values?.[0] || '').trim();
      const listingId = raw.startsWith('pmktbuy_') ? raw.slice('pmktbuy_'.length) : raw;
      if (!listingId) {
        await interaction.reply({ content: '⚠️ 請先選擇要購買的商品。', ephemeral: true }).catch(() => {});
        return;
      }
      const buyer = CORE.loadPlayer(user.id);
      if (!buyer) {
        await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
        return;
      }
      ECON.ensurePlayerEconomy(buyer);
      const outcome = ECON.buyFromSellListing(buyer, listingId, {
        loadPlayerById: (id) => CORE.loadPlayer(id),
        savePlayerById: (p) => CORE.savePlayer(p)
      });
      if (!outcome?.success) {
        await interaction.reply({ content: `❌ 成交失敗：${outcome?.reason || '未知錯誤'}`, ephemeral: true }).catch(() => {});
        return;
      }
      CORE.savePlayer(buyer);
      const deliveryText = Array.isArray(outcome.deliveryNotes) && outcome.deliveryNotes.length > 0
        ? `｜${outcome.deliveryNotes.join('；')}`
        : '';
      await showPlayerMarketMenu(
        interaction,
        user,
        outcome.marketType || marketType || 'renaiss',
        `成交成功：買入 ${outcome.itemName} x${outcome.quantity}，支出 ${outcome.totalPrice} Rns${deliveryText}`
      );
      return;
    }

    if (customId.startsWith('shop_buy_select_')) {
      const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
      const raw = String(interaction.values?.[0] || '').trim();
      const listingId = raw.startsWith('shopbuy_') ? raw.slice('shopbuy_'.length) : raw;
      if (!listingId) {
        await interaction.reply({ content: '⚠️ 請先選擇要購買的商品。', ephemeral: true }).catch(() => {});
        return;
      }
      const buyer = CORE.loadPlayer(user.id);
      if (!buyer) {
        await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
        return;
      }
      ECON.ensurePlayerEconomy(buyer);
      const outcome = ECON.buyFromSellListing(buyer, listingId, {
        loadPlayerById: (id) => CORE.loadPlayer(id),
        savePlayerById: (p) => CORE.savePlayer(p)
      });
      if (!outcome?.success) {
        await interaction.reply({ content: `❌ 購買失敗：${outcome?.reason || '未知錯誤'}`, ephemeral: true }).catch(() => {});
        return;
      }
      CORE.savePlayer(buyer);
      const deliveryText = Array.isArray(outcome.deliveryNotes) && outcome.deliveryNotes.length > 0
        ? `｜${outcome.deliveryNotes.join('；')}`
        : '';
      await showWorldShopBuyPanel(
        interaction,
        user,
        outcome.marketType || marketType || 'renaiss',
        `成交成功：${outcome.itemName} x${outcome.quantity}（-${outcome.totalPrice} Rns）${deliveryText}`
      );
      return;
    }

    if (customId.startsWith('shop_sell_select_')) {
      const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
      const player = CORE.loadPlayer(user.id);
      if (!player) {
        await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
        return;
      }
      if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || 'renaiss')) {
        await interaction.reply({ content: '⚠️ 請先在商店內操作掛賣。', ephemeral: true }).catch(() => {});
        return;
      }
      const options = Array.isArray(player.shopSession.sellDraftOptions) ? player.shopSession.sellDraftOptions : [];
      const raw = String(interaction.values?.[0] || '');
      const idx = Number(raw.replace('sellidx_', ''));
      if (!Number.isFinite(idx) || idx < 0 || idx >= options.length) {
        await interaction.reply({ content: '⚠️ 掛賣選項已失效，請重新打開掛賣選單。', ephemeral: true }).catch(() => {});
        return;
      }
      const spec = options[idx];
      if (!spec || typeof spec !== 'object') {
        await interaction.reply({ content: '⚠️ 掛賣選項資料錯誤，請重新選擇。', ephemeral: true }).catch(() => {});
        return;
      }
      player.shopSession.pendingSellSpec = spec;
      CORE.savePlayer(player);
      await showWorldShopSellModal(interaction, marketType, spec);
      return;
    }

    if (customId.startsWith('shop_haggle_select_')) {
      const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
      const player = CORE.loadPlayer(user.id);
      if (!player) {
        await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
        return;
      }
      if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || 'renaiss')) {
        await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
        return;
      }
      const options = Array.isArray(player.shopSession.haggleDraftOptions) ? player.shopSession.haggleDraftOptions : [];
      const raw = String(interaction.values?.[0] || '');
      const idx = Number(raw.replace('haggleidx_', ''));
      if (!Number.isFinite(idx) || idx < 0 || idx >= options.length) {
        await interaction.reply({ content: '⚠️ 議價選項已失效，請重新打開議價選單。', ephemeral: true }).catch(() => {});
        return;
      }
      const spec = options[idx];
      if (!spec || typeof spec !== 'object') {
        await interaction.reply({ content: '⚠️ 議價選項資料錯誤，請重新選擇。', ephemeral: true }).catch(() => {});
        return;
      }
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => {});
      }
      await showWorldShopHaggleOffer(interaction, user, marketType, spec);
      return;
    }

    if (customId.startsWith('shop_haggle_bulk_select_')) {
      const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
      const player = CORE.loadPlayer(user.id);
      if (!player) {
        await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
        return;
      }
      if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || 'renaiss')) {
        await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
        return;
      }
      const options = Array.isArray(player.shopSession.haggleDraftOptions) ? player.shopSession.haggleDraftOptions : [];
      const rawValues = Array.isArray(interaction.values) ? interaction.values : [];
      const selectedSpecs = [];
      const used = new Set();
      for (const raw of rawValues) {
        const idx = Number(String(raw || '').replace('bulkidx_', ''));
        if (!Number.isFinite(idx) || idx < 0 || idx >= options.length) continue;
        const spec = options[idx];
        const key = `${String(spec?.itemName || '').trim()}::${String(spec?.itemRef?.source || '')}`;
        if (!spec || typeof spec !== 'object' || !String(spec?.itemName || '').trim() || used.has(key)) continue;
        used.add(key);
        selectedSpecs.push(spec);
      }
      if (selectedSpecs.length <= 0) {
        await interaction.reply({ content: '⚠️ 請至少選擇 1 件商品。', ephemeral: true }).catch(() => {});
        return;
      }
      player.shopSession.haggleBulkSelectedSpecs = selectedSpecs.map((spec) => JSON.parse(JSON.stringify(spec)));
      CORE.savePlayer(player);
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => {});
      }
      await showWorldShopHaggleAllOffer(interaction, user, marketType, selectedSpecs);
      return;
    }
  }
  
  // ===== 錢包 Modal 按鈕 =====
  if (customId === 'open_wallet_modal') {
    await showWalletBindModal(interaction);
    return;
  }

  if (customId === 'sync_wallet_now') {
    await handleWalletSyncNow(interaction, user);
    return;
  }

  if (customId === 'claim_new_pet_start') {
    await showClaimPetElementPanel(interaction, user);
    return;
  }

  if (customId.startsWith('claim_new_pet_element_')) {
    const key = String(customId || '').replace('claim_new_pet_element_', '').trim();
    const element = key === 'fire' ? '火' : key === 'grass' ? '草' : '水';
    const capacity = getPetCapacityForUser(user.id);
    if (capacity.availableSlots <= 0) {
      await interaction.reply({
        content: `⚠️ 目前寵物欄位已滿（${capacity.currentPets}/${capacity.maxPets}）。`,
        ephemeral: true
      }).catch(() => {});
      return;
    }
    setPlayerTempData(user.id, 'claimPetElement', element);
    await showClaimPetNameModal(interaction, element);
    return;
  }
  
  // ===== 錢包綁定 Modal =====
  if (customId === 'wallet_bind_modal') {
    await handleWalletBind(interaction, user);
    return;
  }

  if (customId === 'claim_new_pet_name_modal') {
    const element = normalizePetElementCode(getPlayerTempData(user.id, 'claimPetElement') || '水');
    const petName = normalizePetName(interaction.fields.getTextInputValue('claim_pet_name') || '', element);
    const outcome = createAdditionalPetForPlayer(user.id, element, petName);
    if (!outcome?.success) {
      await interaction.reply({ content: `❌ ${outcome?.reason || '領取失敗。'}`, ephemeral: true }).catch(() => {});
      return;
    }
    setPlayerTempData(user.id, 'claimPetElement', null);
    const pet = outcome.pet;
    const move = outcome.selectedMove;
    const cap = outcome.capacity || getPetCapacityForUser(user.id);
    const msg =
      `✅ 已領取新寵物：**${pet.name}**（${getPetElementDisplayName(pet.type)}）\n` +
      `✨ 初始天賦：${move?.name || '未知'}\n` +
      `📦 目前寵物額度：${cap.currentPets}/${cap.maxPets}`;
    await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    return;
  }

  if (customId === 'friend_add_modal') {
    const targetIdRaw = interaction.fields.getTextInputValue('friend_target_id');
    const targetId = normalizeFriendId(targetIdRaw);
    if (!targetId) {
      await interaction.reply({ content: '❌ ID 格式錯誤，請輸入有效的 Discord User ID。', ephemeral: true }).catch(() => {});
      return;
    }

    const result = createFriendRequest(user.id, targetId);
    let notice = '處理失敗。';
    if (result.ok && result.code === 'requested') {
      notice = `已送出好友申請給 ${result.targetName}。`;
    } else if (result.ok && result.code === 'auto_accepted') {
      notice = `${result.targetName} 也曾送出申請，已自動互加成功。`;
    } else if (result.code === 'already_friends') {
      notice = `你和 ${result.targetName} 已是好友。`;
    } else if (result.code === 'already_requested') {
      notice = `你已經送出申請給 ${result.targetName}，等待對方同意。`;
    } else if (result.code === 'target_not_found') {
      notice = '找不到該玩家（對方可能尚未建立角色）。';
    } else if (result.code === 'self') {
      notice = '不能把自己加為好友。';
    } else if (result.code === 'invalid_id') {
      notice = 'ID 格式不正確。';
    }

    const base = CORE.loadPlayer(user.id);
    if (!base) {
      await interaction.reply({ content: `⚠️ ${notice}`, ephemeral: true }).catch(() => {});
      return;
    }
    const social = ensurePlayerFriendState(base);
    CORE.savePlayer(base);
    const friends = social.friends
      .slice(0, 6)
      .map((id) => `• ${getPlayerDisplayNameById(id)}`)
      .join('\n') || '目前沒有好友';
    await interaction.reply({
      content: `✅ ${notice}\n\n目前好友：\n${friends}\n\n回到面板請按「🤝 好友」。`,
      ephemeral: true
    }).catch(() => {});
    return;
  }

  if (customId.startsWith('pmkt_modal_sell_') || customId.startsWith('pmkt_modal_buy_')) {
    const listingType = customId.startsWith('pmkt_modal_buy_') ? 'buy' : 'sell';
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await handleMarketPostModal(interaction, user, listingType, marketType);
    return;
  }

  if (customId.startsWith('shop_sell_modal_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await handleWorldShopSellModal(interaction, user, marketType);
    return;
  }
  
  // ===== 新手：角色命名 Modal（性別後）=====
  if (customId.startsWith('char_name_submit_')) {
    const selectedGender = customId.endsWith('_female') ? '女' : '男';
    const playerNameInput = interaction.fields.getTextInputValue('player_name');
    const finalName = normalizeCharacterName(playerNameInput, user.username);
    const lang = getPlayerTempData(user.id, 'language') || 'zh-TW';
    setPlayerTempData(user.id, 'gender', selectedGender);
    setPlayerTempData(user.id, 'charName', finalName);
    const payload = buildElementSelectionPayload(lang, selectedGender);
    await interaction.reply({ embeds: [payload.embed], components: [payload.row] }).catch(async () => {
      await interaction.channel.send({ embeds: [payload.embed], components: [payload.row] }).catch(() => {});
    });
    return;
  }

  // ===== 新手：寵物命名 Modal（屬性後）=====
  if (customId === 'pet_onboard_name_submit') {
    const gender = normalizeCharacterGender(getPlayerTempData(user.id, 'gender') || '男');
    const element = normalizePetElementCode(getPlayerTempData(user.id, 'petElement') || '水');
    const charName = normalizeCharacterName(getPlayerTempData(user.id, 'charName') || user.username, user.username);
    const petName = normalizePetName(interaction.fields.getTextInputValue('pet_name'), element);
    await createCharacterWithName(interaction, user, { gender, element, alignment: '正派' }, charName, { petName });
    return;
  }

  // ===== 舊版相容：名字輸入 Modal =====
  if (customId.startsWith('name_submit_')) {
    const profile = parseNameSubmitProfileFromCustomId(customId);
    const charName = interaction.fields.getTextInputValue('player_name').trim();
    const finalName = charName || user.username;
    await createCharacterWithName(interaction, user, profile, finalName, {});
    return;
  }

  // ===== 許願池 Modal =====
  if (customId.startsWith('wish_pool_submit_')) {
    const idx = parseInt(customId.replace('wish_pool_submit_', ''), 10);
    const wishText = interaction.fields.getTextInputValue('wish_text')?.trim() || '';
    if (!wishText) {
      await interaction.reply({ content: '⚠️ 請輸入願望內容。', ephemeral: true }).catch(() => {});
      return;
    }
    await handleEvent(interaction, user, Number.isNaN(idx) ? 0 : idx, { wishText });
    return;
  }

  if (customId.startsWith('custom_action_submit_')) {
    const idx = parseInt(customId.replace('custom_action_submit_', ''), 10);
    const customActionText = interaction.fields.getTextInputValue('custom_action_text')?.trim() || '';
    if (!customActionText) {
      await interaction.reply({ content: '⚠️ 請輸入你想做的行動。', ephemeral: true }).catch(() => {});
      return;
    }
    await handleEvent(interaction, user, Number.isNaN(idx) ? 0 : idx, { customActionText });
    return;
  }
  
  // ===== 新手建立：性別 =====
  if (customId === 'choose_gender_male' || customId === 'choose_gender_female') {
    await handleChooseGender(interaction, user, customId);
    return;
  }

  // ===== 新手建立：寵物屬性 =====
  if (customId.startsWith('choose_element_')) {
    await handleChoosePetElement(interaction, user, customId);
    return;
  }

  // ===== 舊版相容：正派/機變派按鈕 =====
  if (customId === 'choose_positive' || customId === 'choose_negative') {
    await handleLegacyAlignmentChoice(interaction, user, customId);
    return;
  }

  if (customId === 'restart_onboarding') {
    await sendOnboardingLanguageSelection(interaction, user, { replaceCurrent: true });
    return;
  }
  
  // ===== 敲蛋孵化 =====
  if (customId === 'hatch_egg') {
    await handleHatchEgg(interaction, user);
    return;
  }
  
  // ===== 抽招式（真正的隨機）=====
  if (customId.startsWith('draw_move_')) {
    await handleDrawMove(interaction, user);
    return;
  }
  
  // ===== 主選單 =====
  if (customId === 'main_menu') {
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (player && pet) {
      if (player.pendingFriendDuelReturn) {
        player.pendingFriendDuelReturn = false;
        CORE.savePlayer(player);
        await showFriendsMenu(interaction, user, '已結束友誼戰，先返回好友頁。');
        return;
      }
      if (player.battleState) {
        const enemyName = player.battleState?.enemy?.name || '敵人';
        const sourceChoice = String(player.battleState?.sourceChoice || '').trim();
        const preBattleStory = String(player.battleState?.preBattleStory || player.currentStory || '').trim();
        player.currentStory = composePostBattleStory(
          player,
          `⚠️ 你暫時脫離與 **${enemyName}** 的交戰，先拉開距離重整節奏。`,
          '',
          '你決定先觀察局勢，再選擇下一步行動。',
          sourceChoice,
          preBattleStory
        );
        queuePendingStoryTrigger(player, {
          name: '撤離交戰',
          choice: sourceChoice || `與${enemyName}交戰`,
          desc: `你從 ${enemyName} 戰線暫退`,
          action: 'battle_retreat',
          outcome: '你先觀察局勢，再決定下一步。'
        });
        player.eventChoices = [];
        rememberPlayer(player, {
          type: '戰鬥',
          content: `從 ${enemyName} 戰線撤離`,
          outcome: '回到冒險流程',
          importance: 2,
          tags: ['battle', 'retreat']
        });
        publishBattleWorldEvent(player, enemyName, 'battle_flee', '主動脫離當前戰線');
        player.battleState = null;
        CORE.savePlayer(player);
      }
      // 在 thread 裡用 sendMainMenuToThread，在外面用 showMainMenu
      if (interaction.channel?.isThread()) {
        await interaction.deferUpdate().catch(() => {});
        await sendMainMenuToThread(interaction.channel, player, pet, interaction);
      } else {
        await showMainMenu(interaction, player, pet);
      }
    }
    return;
  }

  if (customId === 'retry_story_generation') {
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (!player || !pet || !interaction.channel?.isThread()) {
      await interaction.reply({ content: '⚠️ 請在遊戲討論串中使用此按鈕。', ephemeral: true }).catch(() => {});
      return;
    }

    await interaction.deferUpdate().catch(() => {});
    await sendMainMenuToThread(interaction.channel, player, pet, interaction);
    return;
  }
  
  // ===== 設置 =====
  if (customId === 'open_settings') {
    const player = CORE.loadPlayer(user.id);
    if (player?.activeMessageId) {
      await disableMessageComponents(interaction.channel, player.activeMessageId);
    }
    await showSettingsHub(interaction, user);
    return;
  }

  if (customId === 'open_settings_system') {
    await showSettings(interaction, user);
    return;
  }

  if (customId === 'open_renaiss_world') {
    await showRenaissWorldGuide(interaction, user);
    return;
  }

  if (customId === 'world_back_settings') {
    await showSettings(interaction, user);
    return;
  }
  
  // ===== 選擇語言（首次）=====
  if (customId.startsWith('select_lang_')) {
    if (CORE.loadPlayer(user.id) && PET.loadPet(user.id)) {
      await interaction.message?.edit({ components: [] }).catch(() => {});
      await resumeExistingOnboardingOrGame(interaction, user);
      return;
    }

    const lang = customId.replace('select_lang_', '');
    // 儲存語言到內存，等創建角色後寫入
    setPlayerTempData(user.id, 'language', lang);
    
    // 立即鎖住本則語言按鈕，避免重複觸發
    await interaction.update({ components: [] }).catch(async () => {
      await interaction.deferUpdate().catch(() => {});
    });
    
    const payload = buildGenderSelectionPayload(lang, user.username);
    await interaction.channel.send({ embeds: [payload.embed], components: [payload.row] });
    return;
  }
  
  // ===== 設置頁面切換語言 =====
  if (customId === 'lang_zh' || customId === 'lang_en' || customId === 'lang_zh-CN' || customId === 'lang_zh-TW') {
    const player = CORE.loadPlayer(user.id);
    if (player) {
      const langMap = { 'lang_zh': 'zh-TW', 'lang_en': 'en', 'lang_zh-CN': 'zh-CN', 'lang_zh-TW': 'zh-TW' };
      player.language = langMap[customId] || 'zh-TW';
      CORE.savePlayer(player);
    }
    await showSettings(interaction, user);
    return;
  }

  // ===== Bug 2 Fix: Settings back button - restore game message =====
  if (customId === 'settings_back') {
    await showSettingsHub(interaction, user);
    return;
  }
  
  // ===== 角色資訊 =====
  if (customId === 'open_character') {
    await showCharacter(interaction, user);
    return;
  }

  if (customId === 'open_friends') {
    const player = CORE.loadPlayer(user.id);
    if (player?.pendingFriendDuelReturn) {
      player.pendingFriendDuelReturn = false;
      CORE.savePlayer(player);
    }
    await showFriendsMenu(interaction, user);
    return;
  }

  if (customId === 'friend_refresh') {
    await showFriendsMenu(interaction, user);
    return;
  }

  if (customId === 'open_friend_add_modal') {
    await showFriendAddModal(interaction);
    return;
  }

  if (customId.startsWith('friend_accept_')) {
    const requesterId = customId.replace('friend_accept_', '').trim();
    const result = acceptFriendRequest(user.id, requesterId);
    const name = getPlayerDisplayNameById(requesterId);
    const notice = result.ok ? `你已與 ${name} 成為好友。` : `無法同意申請：${name}`;
    await showFriendsMenu(interaction, user, notice);
    return;
  }

  if (customId.startsWith('friend_cancel_')) {
    const targetId = customId.replace('friend_cancel_', '').trim();
    const result = cancelOutgoingFriendRequest(user.id, targetId);
    const name = getPlayerDisplayNameById(targetId);
    const notice = result.ok ? `已撤回給 ${name} 的好友申請。` : `沒有可撤回的申請：${name}`;
    await showFriendsMenu(interaction, user, notice);
    return;
  }

  if (customId.startsWith('friend_view_')) {
    const targetId = customId.replace('friend_view_', '').trim();
    await showFriendCharacter(interaction, user, targetId);
    return;
  }

  if (customId.startsWith('friend_duel_')) {
    const targetId = customId.replace('friend_duel_', '').trim();
    await startFriendDuel(interaction, user, targetId);
    return;
  }

  if (customId === 'open_map') {
    await showIslandMap(interaction, user, 0);
    return;
  }

  if (customId.startsWith('map_view_')) {
    const match = String(customId).match(/^map_view_(text|ascii)(?:_(\d+))?$/);
    const mode = normalizeMapViewMode(match?.[1] || 'text');
    const page = Number.parseInt(match?.[2] || '0', 10);
    const safePage = Number.isNaN(page) ? 0 : page;
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getMapText(uiLang);
    if (player) {
      player.mapViewMode = mode;
      CORE.savePlayer(player);
    }
    await showIslandMap(
      interaction,
      user,
      safePage,
      (mode === 'ascii' ? tx.mapModeSwitchAscii : tx.mapModeSwitchText)
    );
    return;
  }

  if (customId.startsWith('map_page_')) {
    const page = parseInt(customId.split('_')[2]);
    await showIslandMap(interaction, user, Number.isNaN(page) ? 0 : page);
    return;
  }

  if (customId === 'map_open_portal') {
    await showPortalSelection(interaction, user);
    return;
  }

  if (customId === 'map_open_device') {
    await showTeleportDeviceSelection(interaction, user);
    return;
  }

  if (customId.startsWith('portal_jump_')) {
    const idx = parseInt(customId.replace('portal_jump_', ''), 10);
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getMapText(uiLang);
    if (!player) {
      await interaction.reply({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
      return;
    }
    ensurePlayerIslandState(player);

    const access = getPortalAccessContext(player);
    if (!access.atPortalHub) {
      await interaction.reply({ content: tx.portalNotReady, ephemeral: true }).catch(() => {});
      return;
    }
    if (!access.crossRegionUnlocked) {
      await interaction.reply({ content: tx.portalStoryLocked, ephemeral: true }).catch(() => {});
      return;
    }
    const destinations = Array.isArray(access.destinations) ? access.destinations : [];
    const targetLocation = destinations[Number.isNaN(idx) ? -1 : idx];
    if (!targetLocation) {
      await interaction.reply({ content: tx.portalInvalidDestination, ephemeral: true }).catch(() => {});
      return;
    }

    const fromLocation = player.location;
    const preTeleportStory = String(player.currentStory || '').trim();
    const carryTail = extractStoryTailLine(preTeleportStory, 140);
    player.location = targetLocation;
    syncLocationArcLocation(player);
    ensurePlayerIslandState(player);
    player.portalMenuOpen = false;
    player.navigationTarget = '';
    const transferLine = tx.portalTeleportStory(fromLocation, targetLocation, carryTail);
    player.currentStory = composeActionBridgeStory(
      { currentStory: preTeleportStory },
      `啟動主傳送門由${fromLocation}前往${targetLocation}`,
      transferLine
    );
    queuePendingStoryTrigger(player, {
      name: '跨區傳送後承接',
      choice: `由${fromLocation}傳送至${targetLocation}，並延續上一段線索`,
      desc: `本回合必須先承接 ${fromLocation} 的當前情勢，再寫傳送過程，最後在 ${targetLocation} 落地接續`,
      action: 'portal_jump_followup',
      outcome: `跨區傳送完成：${fromLocation} -> ${targetLocation}｜傳送前最後情境：${carryTail || '（無）'}`
    });
    player.eventChoices = [];
    if (player.mapReturnSnapshot) delete player.mapReturnSnapshot;
    rememberPlayer(player, {
      type: '移動',
      content: `啟動傳送門由${fromLocation}前往${targetLocation}`,
      outcome: '完成傳送',
      importance: 2,
      tags: ['travel', 'portal', 'teleport']
    });
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(tx.portalDoneTitle)
      .setColor(0x7b68ee)
      .setDescription(tx.portalDoneDesc(fromLocation, targetLocation));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('map_back_main').setLabel(tx.portalBackStory).setStyle(ButtonStyle.Success)
    );
    await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
    return;
  }

  if (customId.startsWith('device_jump_')) {
    const idx = parseInt(customId.replace('device_jump_', ''), 10);
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getMapText(uiLang);
    if (!player) {
      await interaction.reply({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
      return;
    }
    const stockInfo = getTeleportDeviceStockInfo(player);
    if (stockInfo.count <= 0) {
      await interaction.reply({ content: tx.deviceNotOwned, ephemeral: true }).catch(() => {});
      return;
    }
    const destinations = typeof getRegionLocationsByLocation === 'function'
      ? getRegionLocationsByLocation(player.location || '')
      : [];
    const targetLocation = Array.isArray(destinations) ? destinations[Number.isNaN(idx) ? -1 : idx] : null;
    if (!targetLocation) {
      await interaction.reply({ content: tx.deviceInvalidDestination, ephemeral: true }).catch(() => {});
      return;
    }
    if (String(targetLocation || '').trim() === String(player.location || '').trim()) {
      await interaction.reply({ content: tx.deviceAlreadyHere(targetLocation), ephemeral: true }).catch(() => {});
      return;
    }

    const fromLocation = String(player.location || '').trim();
    const preTeleportStory = String(player.currentStory || '').trim();
    const carryTail = extractStoryTailLine(preTeleportStory, 140);
    const consumed = consumeTeleportDevice(player);
    if (!consumed) {
      await interaction.reply({ content: tx.deviceNotOwned, ephemeral: true }).catch(() => {});
      return;
    }
    player.location = targetLocation;
    syncLocationArcLocation(player);
    ensurePlayerIslandState(player);
    player.navigationTarget = '';
    const transferLine = tx.deviceTeleportStory(fromLocation, targetLocation, carryTail);
    player.currentStory = composeActionBridgeStory(
      { currentStory: preTeleportStory },
      `啟動傳送裝置由${fromLocation}前往${targetLocation}`,
      transferLine
    );
    queuePendingStoryTrigger(player, {
      name: '同島傳送後承接',
      choice: `由${fromLocation}傳送裝置移動至${targetLocation}，並延續上一段線索`,
      desc: `本回合必須先承接 ${fromLocation} 的當前情勢，再寫傳送過程，最後在 ${targetLocation} 落地接續`,
      action: 'device_jump_followup',
      outcome: `同島傳送完成：${fromLocation} -> ${targetLocation}｜傳送前最後情境：${carryTail || '（無）'}`
    });
    player.eventChoices = [];
    if (player.mapReturnSnapshot) delete player.mapReturnSnapshot;
    rememberPlayer(player, {
      type: '移動',
      content: `啟動傳送裝置由${fromLocation}前往${targetLocation}`,
      outcome: `同島瞬間位移完成（剩餘 ${consumed.remainingCount}）`,
      importance: 2,
      tags: ['travel', 'teleport_device', 'intra_region']
    });
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(tx.deviceDoneTitle)
      .setColor(0x22c55e)
      .setDescription(tx.deviceDoneDesc(fromLocation, targetLocation, consumed.remainingCount));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('map_back_main').setLabel(tx.deviceBackStory).setStyle(ButtonStyle.Success)
    );
    await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
    return;
  }

  if (customId.startsWith('map_goto_')) {
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getMapText(uiLang);
    await interaction.reply({
      content: tx.mapGotoHint,
      ephemeral: true
    }).catch(() => {});
    return;
  }

  if (customId === 'map_back_main') {
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getMapText(uiLang);
    if (!player || !pet || !interaction.channel?.isThread()) {
      await interaction.reply({ content: tx.mapUseInThread, ephemeral: true }).catch(() => {});
      return;
    }

    const snapshot = consumeMapReturnSnapshot(player, interaction.message?.id);
    if (snapshot && snapshotHasUsableComponents(snapshot)) {
      const restored = await interaction
        .update({
          content: snapshot.content,
          embeds: snapshot.embeds,
          components: snapshot.components
        })
        .then(() => true)
        .catch(() => false);
      if (restored && interaction.message?.id) {
        trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
        return;
      }
    }

    await interaction.deferUpdate().catch(() => {});
    await sendMainMenuToThread(interaction.channel, player, pet, interaction);
    await interaction.message.delete().catch(() => {});
    return;
  }
  
  // ===== 事件按鈕 =====
  if (customId.startsWith('event_')) {
    const match = String(customId || '').match(/^event_(\d+)(?:_(\d+))?$/);
    if (!match) {
      await interaction.reply({ content: '⚠️ 選項格式錯誤，請點最新選項。', ephemeral: true }).catch(() => {});
      return;
    }
    const idx = Number.parseInt(match[1], 10);
    if (Number.isNaN(idx)) {
      await interaction.reply({ content: '⚠️ 選項索引錯誤，請重試。', ephemeral: true }).catch(() => {});
      return;
    }
    const ownerIdFromButton = String(match[2] || '').trim();
    if (ownerIdFromButton && ownerIdFromButton !== String(user.id || '')) {
      await interaction.reply({ content: '⚠️ 這不是你的選項按鈕。', ephemeral: true }).catch(() => {});
      return;
    }

    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '⚠️ 找不到角色資料，請使用 /start 重新開始', ephemeral: true });
      return;
    }

    if (player.activeThreadId && interaction.channelId !== player.activeThreadId) {
      await interaction.reply({ content: '⚠️ 這是舊討論串，請到最新討論串操作。', ephemeral: true });
      return;
    }

    if (
      player.activeMessageId &&
      !player.activeMessageId.startsWith('instant_') &&
      interaction.message?.id !== player.activeMessageId
    ) {
      await interaction.reply({ content: '⚠️ 這個選項已過期，請點擊最新訊息中的選項。', ephemeral: true });
      return;
    }
    await handleEvent(interaction, user, idx);
    return;
  }

  if (customId === 'battle_mode_manual') {
    const player = CORE.loadPlayer(user.id);
    if (player?.battleState?.friendDuel) {
      await showFriendManualModePicker(interaction, user);
    } else {
      await startManualBattle(interaction, user);
    }
    return;
  }

  if (customId === 'battle_mode_manual_back') {
    const player = CORE.loadPlayer(user.id);
    if (player?.battleState?.friendDuel) {
      const fallbackPet = PET.loadPet(user.id);
      const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
      const pet = petResolved?.pet || fallbackPet;
      const duel = player?.battleState?.friendDuel || {};
      const enemy = player?.battleState?.enemy;
      if (!pet || !enemy) {
        await interaction.reply({ content: '❌ 找不到好友對戰狀態，請重新發起。', ephemeral: true }).catch(() => {});
        return;
      }
      if (petResolved?.changed) CORE.savePlayer(player);
      const estimate = estimateBattleOutcome(player, pet, enemy, player?.battleState?.fighter || 'pet');
      const enemyElementText = formatBattleElementDisplay(resolveEnemyBattleElement(enemy));
      const allyElementText = formatBattleElementDisplay(pet?.type || pet?.element || '');
      const relationText = getBattleElementRelation(
        pet?.type || pet?.element || '',
        resolveEnemyBattleElement(enemy)
      ).text;
      const embed = new EmbedBuilder()
        .setTitle(`🤝 好友友誼戰：${player.name} vs ${String(duel.friendName || '好友').trim() || '好友'}`)
        .setColor(0x8b5cf6)
        .setDescription(
          `**友誼戰即將開始！**\n\n` +
          `對手：${enemy.name}\n` +
          `🏷️ 敵方屬性：${enemyElementText}\n` +
          `❤️ 對手 HP：${formatBattleHpValue(enemy?.hp, 0)}/${formatBattleHpValue(enemy?.maxHp, 1)}\n` +
          `⚔️ 對手攻擊：${enemy.attack}\n` +
          `🐾 ${pet.name} 出戰\n` +
          `🏷️ 我方屬性：${allyElementText}\n` +
          `${relationText}\n` +
          `⚡ 戰鬥能量規則：每回合 +2，可結轉\n` +
          `🌐 線上手動模式：雙方每回合 ${Math.floor(FRIEND_DUEL_ONLINE_TURN_MS / 1000)} 秒內同時提交行動\n` +
          `🤝 友誼戰規則：不影響生死、無通緝、無金幣掉落\n` +
          `📊 勝率預估：${estimate.rank}（約 ${format1(estimate.winRate)}%）\n\n` +
          `請選擇戰鬥模式：`
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('battle_mode_manual').setLabel('⚔️ 手動模式').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('battle_mode_ai').setLabel('🤖 AI戰鬥').setStyle(ButtonStyle.Primary)
      );
      await interaction.update({ embeds: [embed], components: [row] });
    } else {
      await interaction.reply({ content: 'ℹ️ 目前不是好友對戰模式。', ephemeral: true }).catch(() => {});
    }
    return;
  }

  if (customId === 'battle_mode_manual_offline') {
    await startManualBattle(interaction, user);
    return;
  }

  if (customId === 'battle_mode_manual_online') {
    await startManualBattleOnline(interaction, user);
    return;
  }

  if (customId === 'battle_mode_ai') {
    await startAutoBattle(interaction, user);
    return;
  }

  if (customId === 'battle_continue_human') {
    await continueBattleWithHuman(interaction, user);
    return;
  }
  
  // ===== 戰鬥 =====
  if (customId.startsWith('fight_') || customId === 'fight_retry') {
    await handleFight(interaction, user);
    return;
  }
  
  // ===== 使用招式 =====
  if (customId.startsWith('use_move_')) {
    const idx = parseInt(customId.split('_')[2]);
    await handleUseMove(interaction, user, idx);
    return;
  }

  if (customId.startsWith('fdonline_')) {
    await handleOnlineFriendDuelChoice(interaction, user, customId);
    return;
  }

  if (customId === 'battle_toggle_layout') {
    const player = CORE.loadPlayer(user.id);
    const fallbackPet = PET.loadPet(user.id);
    const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
    const pet = petResolved?.pet || fallbackPet;
    if (!player?.battleState?.enemy || !pet) {
      await interaction.reply({ content: '⚠️ 目前沒有可切換的戰鬥畫面。', ephemeral: true }).catch(() => {});
      return;
    }
    const mode = toggleBattleLayoutMode(player);
    if (petResolved?.changed) CORE.savePlayer(player);
    CORE.savePlayer(player);
    await renderManualBattle(
      interaction,
      player,
      pet,
      mode === 'mobile' ? '📱 已切換為手機版戰鬥排版。' : '🖥️ 已切換為電腦版戰鬥排版。'
    );
    return;
  }

  if (customId === 'battle_wait') {
    await handleBattleWait(interaction, user);
    return;
  }

  if (customId === 'battle_switch_pet') {
    await handleBattleSwitchOpen(interaction, user);
    return;
  }

  if (customId === 'battle_switch_cancel') {
    await handleBattleSwitchCancel(interaction, user);
    return;
  }
  
  // ===== 逃跑 =====
  if (customId.startsWith('flee_')) {
    const attempt = parseInt(customId.split('_')[1]);
    await handleFlee(interaction, user, attempt);
    return;
  }
  
  // ===== 顯示招式列表 =====
  if (customId === 'show_moves') {
    await showMovesList(interaction, user);
    return;
  }

  if (customId.startsWith('moves_page_prev_') || customId.startsWith('moves_page_next_')) {
    const matched = String(customId).match(/^moves_page_(prev|next)_(.+)_(\d+)$/);
    const direction = String(matched?.[1] || '').trim();
    const petId = String(matched?.[2] || '').trim();
    const currentPage = Math.max(0, Number(matched?.[3] || 0));
    const nextPage = direction === 'prev' ? currentPage - 1 : currentPage + 1;
    await showMovesList(interaction, user, petId, '', nextPage);
    return;
  }

  if (customId.startsWith('set_main_pet_')) {
    const petId = String(customId || '').replace('set_main_pet_', '').trim();
    const player = CORE.loadPlayer(user.id);
    const pet = petId ? PET.getPetById(petId) : null;
    if (!player || !pet || String(pet.ownerId || '') !== String(user.id || '')) {
      await interaction.reply({ content: '⚠️ 找不到可設定的寵物。', ephemeral: true }).catch(() => {});
      return;
    }
    player.activePetId = pet.id;
    CORE.savePlayer(player);
    await showMovesList(interaction, user, pet.id, `已設定主上場寵物：${pet.name}`);
    return;
  }
  
  // ===== 顯示行囊 =====
  if (customId === 'show_inventory') {
    await showInventory(interaction, user, 0);
    return;
  }

  if (customId.startsWith('inv_page_prev_') || customId.startsWith('inv_page_next_')) {
    const currentPage = Math.max(0, Number(String(customId).split('_').pop() || 0));
    const nextPage = customId.startsWith('inv_page_prev_') ? currentPage - 1 : currentPage + 1;
    await showInventory(interaction, user, nextPage);
    return;
  }

  if (customId === 'show_codex') {
    await showPlayerCodex(interaction, user);
    return;
  }
  if (customId === 'show_codex_npc') {
    await showNpcCodex(interaction, user);
    return;
  }
  if (customId === 'show_codex_skill') {
    await showSkillCodex(interaction, user);
    return;
  }

  if (customId === 'show_finance_ledger') {
    await showFinanceLedger(interaction, user);
    return;
  }

  if (customId === 'show_memory_audit') {
    await showMemoryAudit(interaction, user);
    return;
  }

  if (customId === 'show_memory_recap') {
    await showMemoryRecap(interaction, user);
    return;
  }

  if (customId === 'quick_shop_entry' || customId.startsWith('quick_shop_')) {
    const explicitMarket = customId.includes('_renaiss') || customId.includes('_digital')
      ? parseMarketTypeFromCustomId(customId, 'renaiss')
      : null;
    const marketType = explicitMarket || (Math.random() < 0.5 ? 'renaiss' : 'digital');
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }

    const cd = getQuickShopCooldownInfo(player);
    if (!cd.ready) {
      const replyContent = `⏳ 快速鑑價站冷卻中，還要 **${cd.remaining} 回合** 才能再次使用。`;
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: replyContent, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: replyContent, ephemeral: true }).catch(() => {});
      }
      return;
    }

    openShopSession(player, marketType, '快速進入鑑價站');
    player.lastQuickShopTurn = cd.currentTurn;
    player.lastMarketTurn = cd.currentTurn;
    rememberPlayer(player, {
      type: '商店',
      content: `快速進入${getMarketTypeLabel(marketType)}`,
      outcome: `第${cd.currentTurn}回合觸發`,
      importance: 1,
      tags: ['market', marketType, 'quick_shop']
    });
    CORE.savePlayer(player);

    await showWorldShopScene(interaction, user, marketType, buildQuickShopNarrativeNotice(player, marketType));
    return;
  }

  if (customId === 'pmkt_open_renaiss' || customId === 'pmkt_open_digital') {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await showPlayerMarketMenu(interaction, user, marketType);
    return;
  }

  if (customId.startsWith('pmkt_view_sell_')) {
    const parsed = parseMarketAndPageFromCustomId(customId, 'pmkt_view_sell_', 'renaiss');
    await showPlayerMarketListings(interaction, user, parsed.marketType, parsed.page);
    return;
  }

  if (customId.startsWith('pmkt_my_')) {
    const parsed = parseMarketAndPageFromCustomId(customId, 'pmkt_my_', 'renaiss');
    await showMyMarketListings(interaction, user, parsed.marketType, parsed.page);
    return;
  }

  if (customId.startsWith('pmkt_post_sell_')) {
    await interaction.reply({ content: '⚠️ 背包視圖不能直接掛賣，請先在劇情中進入商店。', ephemeral: true }).catch(() => {});
    return;
  }

  if (customId.startsWith('pmkt_post_buy_')) {
    await interaction.reply({ content: '⚠️ 已停用買單功能，現在只保留賣單市場。', ephemeral: true }).catch(() => {});
    return;
  }

  if (customId.startsWith('pmkt_buy_')) {
    const listingId = customId.replace('pmkt_buy_', '').trim();
    const buyer = CORE.loadPlayer(user.id);
    if (!buyer) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(buyer);
    const outcome = ECON.buyFromSellListing(buyer, listingId, {
      loadPlayerById: (id) => CORE.loadPlayer(id),
      savePlayerById: (p) => CORE.savePlayer(p)
    });
    if (!outcome?.success) {
      await interaction.reply({ content: `❌ 成交失敗：${outcome?.reason || '未知錯誤'}`, ephemeral: true }).catch(() => {});
      return;
    }
    CORE.savePlayer(buyer);
    const deliveryText = Array.isArray(outcome.deliveryNotes) && outcome.deliveryNotes.length > 0
      ? `｜${outcome.deliveryNotes.join('；')}`
      : '';
    await showPlayerMarketMenu(
      interaction,
      user,
      outcome.marketType || 'renaiss',
      `成交成功：買入 ${outcome.itemName} x${outcome.quantity}，支出 ${outcome.totalPrice} Rns${deliveryText}`
    );
    return;
  }

  if (customId.startsWith('pmkt_fill_')) {
    await interaction.reply({ content: '⚠️ 已停用買單功能，現在只保留賣單市場。', ephemeral: true }).catch(() => {});
    return;
  }

  if (customId.startsWith('pmkt_cancel_')) {
    const listingId = customId.replace('pmkt_cancel_', '').trim();
    const owner = CORE.loadPlayer(user.id);
    if (!owner) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(owner);
    const outcome = ECON.cancelMyListing(owner, listingId);
    if (!outcome?.success) {
      await interaction.reply({ content: `❌ 取消失敗：${outcome?.reason || '未知錯誤'}`, ephemeral: true }).catch(() => {});
      return;
    }
    CORE.savePlayer(owner);
    await showPlayerMarketMenu(
      interaction,
      user,
      outcome.marketType || 'renaiss',
      `已取消掛單：${outcome.itemName} x${outcome.quantity}`
    );
    return;
  }

  if (customId.startsWith('shop_open_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await showWorldShopScene(interaction, user, marketType);
    return;
  }

  if (customId.startsWith('shop_post_sell_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await showWorldShopSellPicker(interaction, user, marketType);
    return;
  }

  if (customId.startsWith('shop_npc_haggle_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await showWorldShopHagglePicker(interaction, user, marketType);
    return;
  }

  if (customId.startsWith('shop_haggle_all_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await showWorldShopHaggleBulkPicker(interaction, user, marketType);
    return;
  }

  if (customId.startsWith('shop_haggle_cancel_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    if (player.shopSession?.pendingHaggleOffer) {
      player.shopSession.pendingHaggleOffer = null;
      CORE.savePlayer(player);
    }
    await showWorldShopScene(interaction, user, marketType, '你退出本次議價，未發生交易。');
    return;
  }

  if (customId.startsWith('shop_haggle_confirm_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(player);
    if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || 'renaiss')) {
      await interaction.reply({ content: '⚠️ 你目前不在此商店場景。', ephemeral: true }).catch(() => {});
      return;
    }
    const pending = player.shopSession?.pendingHaggleOffer;
    if (!pending || typeof pending !== 'object') {
      await showWorldShopHagglePicker(interaction, user, marketType, '議價提案已失效，請重新選擇商品。');
      return;
    }
    if (Date.now() - Number(pending.createdAt || 0) > SHOP_HAGGLE_OFFER_TTL_MS) {
      player.shopSession.pendingHaggleOffer = null;
      CORE.savePlayer(player);
      await showWorldShopHagglePicker(interaction, user, marketType, '議價提案已逾時，請重新估價。');
      return;
    }

    const npcName = String(pending.npcName || (marketType === 'digital' ? '摩爾・Digital鑑價員' : '艾洛・Renaiss鑑價員'));
    let quoted = 0;
    let soldLabel = String(pending.itemName || '商品');
    let soldCount = 1;

    if (String(pending.scope || '') === 'bulk' || String(pending.scope || '') === 'all' || String(pending.spec?.kind || '') === 'all') {
      const bulkSpecs = Array.isArray(pending.specs) ? pending.specs : [];
      if (bulkSpecs.length <= 0) {
        player.shopSession.pendingHaggleOffer = null;
        CORE.savePlayer(player);
        await showWorldShopHaggleBulkPicker(interaction, user, marketType, '批次議價資料已失效，請重新選擇商品。');
        return;
      }
      const consume = consumeHaggleBulkItemsFromPlayer(player, bulkSpecs);
      if (!consume.success) {
        player.shopSession.pendingHaggleOffer = null;
        CORE.savePlayer(player);
        await showWorldShopHaggleBulkPicker(interaction, user, marketType, consume.reason || '商品已變動，請重新議價。');
        return;
      }
      quoted = Math.max(0, Number(pending.quotedTotal || 0));
      const rawTotal = Math.max(0, Number(pending.rawQuotedTotal || 0));
      const discountLoss = Math.max(0, rawTotal - quoted);
      soldCount = Math.max(1, Number(consume.totalRemoved || pending.soldCount || 1));
      soldLabel = `批次商品（${soldCount} 件）`;

      player.stats.財富 = Math.max(0, Number(player?.stats?.財富 || 0)) + quoted;
      if (pending.marketStateAfter && typeof pending.marketStateAfter === 'object') {
        player.marketState = JSON.parse(JSON.stringify(pending.marketStateAfter));
      }
      if (quoted > 0) {
        recordCashflow(player, {
          amount: quoted,
          category: marketType === 'digital' ? 'market_digital_sell' : 'market_renaiss_sell',
          source: `${getMarketTypeLabel(marketType)} 批次議價賣出（七折）`,
          marketType
        });
      }
      if (discountLoss > 0) {
        recordCashflow(player, {
          amount: -discountLoss,
          category: 'shop_haggle_bulk_discount',
          source: `${getMarketTypeLabel(marketType)} 批次七折折讓`,
          marketType
        });
      }
    } else {
      const consume = consumeHaggleItemFromPlayer(player, pending.spec || {});
      if (!consume.success) {
        player.shopSession.pendingHaggleOffer = null;
        CORE.savePlayer(player);
        await showWorldShopHagglePicker(interaction, user, marketType, consume.reason || '商品已變動，請重新議價。');
        return;
      }
      quoted = Math.max(0, Number(pending.quotedTotal || 0));
      player.stats.財富 = Math.max(0, Number(player?.stats?.財富 || 0)) + quoted;
      if (pending.marketStateAfter && typeof pending.marketStateAfter === 'object') {
        player.marketState = JSON.parse(JSON.stringify(pending.marketStateAfter));
      }
      if (quoted > 0) {
        recordCashflow(player, {
          amount: quoted,
          category: marketType === 'digital' ? 'market_digital_sell' : 'market_renaiss_sell',
          source: `${getMarketTypeLabel(marketType)} 商店議價售出 1 件`,
          marketType
        });
      }
    }
    ECON.ensurePlayerEconomy(player);
    player.shopSession.pendingHaggleOffer = null;

    rememberPlayer(player, {
      type: '交易',
      content: `商店內與${npcName}議價`,
      outcome: `售出 ${soldLabel}，結算 ${quoted} Rns`,
      importance: 2,
      tags: ['market', marketType, 'shop_haggle']
    });
    CORE.appendNpcMemory(npcName, user.id, {
      type: '交易',
      content: `${player.name} 在商店櫃台議價並售出 ${soldLabel}`,
      outcome: `結算 ${quoted} Rns`,
      location: player.location,
      tags: ['market', marketType, 'private'],
      importance: marketType === 'digital' ? 3 : 2
    }, { scope: 'private' });
    if (typeof CORE.appendNpcQuoteMemory === 'function') {
      const pitchText = extractPitchFromHaggleMessage(pending.message || '');
      if (pitchText) {
        CORE.appendNpcQuoteMemory(user.id, {
          npcId: npcName,
          npcName,
          speaker: npcName,
          text: pitchText,
          location: player.location,
          source: marketType === 'digital' ? 'shop_haggle_digital' : 'shop_haggle_renaiss'
        });
      }
    }

    CORE.savePlayer(player);
    await showWorldShopScene(
      interaction,
      user,
      marketType,
      `${npcName} 完成議價：${soldLabel} 成交 +${quoted} Rns`
    );
    return;
  }

  if (customId.startsWith('shop_buy_item_')) {
    const listingId = customId.replace('shop_buy_item_', '').trim();
    const buyer = CORE.loadPlayer(user.id);
    if (!buyer) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(buyer);
    const outcome = ECON.buyFromSellListing(buyer, listingId, {
      loadPlayerById: (id) => CORE.loadPlayer(id),
      savePlayerById: (p) => CORE.savePlayer(p)
    });
    if (!outcome?.success) {
      await interaction.reply({ content: `❌ 購買失敗：${outcome?.reason || '未知錯誤'}`, ephemeral: true }).catch(() => {});
      return;
    }
    CORE.savePlayer(buyer);
    const deliveryText = Array.isArray(outcome.deliveryNotes) && outcome.deliveryNotes.length > 0
      ? `｜${outcome.deliveryNotes.join('；')}`
      : '';
    await showWorldShopBuyPanel(
      interaction,
      user,
      outcome.marketType || 'renaiss',
      `成交成功：${outcome.itemName} x${outcome.quantity}（-${outcome.totalPrice} Rns）${deliveryText}`
    );
    return;
  }

  if (customId.startsWith('shop_scratch_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(player);
    const scratch = ECON.playScratchLottery(player, { marketType });
    const scratchPlace = marketType === 'digital' ? '神秘鑑價站' : '鑑價站';
    rememberPlayer(player, {
      type: '經濟',
      content: `${scratchPlace}刮刮樂（投入 ${scratch.cost || 100} Rns 代幣）`,
      outcome: scratch.win
        ? `中獎 ${scratch.reward || 0} Rns 代幣｜淨 ${scratch.net >= 0 ? '+' : ''}${scratch.net}`
        : `未中獎｜獎池 ${scratch.jackpotPool || 0} Rns 代幣`,
      importance: scratch.win ? 2 : 1,
      tags: ['scratch_lottery', scratch.win ? 'win' : 'lose']
    });
    if (scratch.success) {
      recordCashflow(player, {
        amount: -Number(scratch.cost || 0),
        category: 'scratch_cost',
        source: marketType === 'digital' ? '神秘鑑價站刮刮樂投入' : '鑑價站刮刮樂投入',
        marketType
      });
      if (Number(scratch.reward || 0) > 0) {
        recordCashflow(player, {
          amount: Number(scratch.reward || 0),
          category: 'scratch_reward',
          source: marketType === 'digital' ? '神秘鑑價站刮刮樂中獎' : '鑑價站刮刮樂中獎',
          marketType
        });
      }
    }
    CORE.savePlayer(player);
    await showWorldShopScene(
      interaction,
      user,
      marketType,
      `${scratch.message}\n💰 目前獎池：${Number(scratch.jackpotPool || 0)} Rns 代幣`
    );
    return;
  }

  if (customId.startsWith('shop_buy_point_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(player);
    const cost = 200;
    const currentGold = Number(player?.stats?.財富 || 0);
    if (currentGold < cost) {
      await interaction.reply({ content: `❌ Rns 不足，購買 1 點加成需要 ${cost} Rns。`, ephemeral: true }).catch(() => {});
      return;
    }
    player.stats.財富 = Math.max(0, currentGold - cost);
    player.upgradePoints = Number(player.upgradePoints || 0) + 1;
    recordCashflow(player, {
      amount: -cost,
      category: 'shop_upgrade_point',
      source: `${getMarketTypeLabel(marketType)} 購買加成點數 +1`,
      marketType
    });
    CORE.savePlayer(player);
    await showWorldShopBuyPanel(
      interaction,
      user,
      marketType,
      `已購買加成點數 +1（花費 ${cost} Rns）。目前點數：${Number(player.upgradePoints || 0)}`
    );
    return;
  }

  if (customId.startsWith('shop_buy_device_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(player);
    const beforeStock = getTeleportDeviceStockInfo(player);
    if (beforeStock.count >= TELEPORT_DEVICE_STOCK_LIMIT) {
      await interaction.reply({ content: '❌ 傳送裝置庫存已達上限，請先使用後再購買。', ephemeral: true }).catch(() => {});
      return;
    }
    const currentGold = Number(player?.stats?.財富 || 0);
    if (currentGold < TELEPORT_DEVICE_COST) {
      await interaction.reply({ content: `❌ Rns 不足，購買傳送裝置需要 ${TELEPORT_DEVICE_COST} Rns。`, ephemeral: true }).catch(() => {});
      return;
    }
    player.stats.財富 = Math.max(0, currentGold - TELEPORT_DEVICE_COST);
    grantTeleportDevice(player, 1);
    const stockInfo = getTeleportDeviceStockInfo(player);
    recordCashflow(player, {
      amount: -TELEPORT_DEVICE_COST,
      category: 'shop_teleport_device',
      source: `${getMarketTypeLabel(marketType)} 購買傳送裝置`,
      marketType
    });
    rememberPlayer(player, {
      type: '商店',
      content: `在${getMarketTypeLabel(marketType)}購買傳送裝置`,
      outcome: `新增 1 顆（效期 ${TELEPORT_DEVICE_DURATION_HOURS}h）｜現有 ${stockInfo.count} 顆`,
      importance: 2,
      tags: ['shop', marketType, 'teleport_device']
    });
    CORE.savePlayer(player);
    await showWorldShopBuyPanel(
      interaction,
      user,
      marketType,
      `已購買傳送裝置 x1（花費 ${TELEPORT_DEVICE_COST} Rns，效期 ${TELEPORT_DEVICE_DURATION_HOURS}h）。目前可用 ${stockInfo.count} 顆（最早到期：${formatTeleportDeviceRemaining(stockInfo.soonestRemainingMs)}）。`
    );
    return;
  }

  if (customId.startsWith('shop_buy_heal_crystal_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(player);
    const result = buyShopCrystal(player, pet, marketType, 'heal');
    if (!result.success) {
      await interaction.reply({ content: result.reason || '❌ 購買失敗。', ephemeral: true }).catch(() => {});
      return;
    }
    if (pet) PET.savePet(pet);
    CORE.savePlayer(player);
    await showWorldShopBuyPanel(
      interaction,
      user,
      marketType,
      `${result.message}（花費 ${result.cost} Rns）`
    );
    return;
  }

  if (customId.startsWith('shop_buy_energy_crystal_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(player);
    const result = buyShopCrystal(player, pet, marketType, 'energy');
    if (!result.success) {
      await interaction.reply({ content: result.reason || '❌ 購買失敗。', ephemeral: true }).catch(() => {});
      return;
    }
    if (pet) PET.savePet(pet);
    CORE.savePlayer(player);
    await showWorldShopBuyPanel(
      interaction,
      user,
      marketType,
      `${result.message}（花費 ${result.cost} Rns）`
    );
    return;
  }

  if (customId.startsWith('shop_buy_')) {
    const parsed = parseMarketAndPageFromCustomId(customId, 'shop_buy_', 'renaiss');
    await showWorldShopBuyPanel(interaction, user, parsed.marketType, '', parsed.page);
    return;
  }

  if (customId === 'shop_leave') {
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (!player || !pet || !interaction.channel?.isThread()) {
      await interaction.reply({ content: '⚠️ 請回到遊戲討論串使用。', ephemeral: true }).catch(() => {});
      return;
    }
    leaveShopSession(player);
    CORE.savePlayer(player);
    await interaction.deferUpdate().catch(() => {});
    await sendMainMenuToThread(interaction.channel, player, pet, interaction);
    await interaction.message.delete().catch(() => {});
    return;
  }
  
  // ===== 顯示檔案 =====
  if (customId === 'open_profile') {
    await showProfile(interaction, user);
    return;
  }
  
  // ===== 顯示扭蛋 =====
  if (customId === 'open_gacha') {
    await showGacha(interaction, user);
    return;
  }
  
  // ===== 扭蛋按鈕 =====
  if (customId === 'gacha_single') {
    await handleGachaResult(interaction, user, 1);
    return;
  }
  
  if (customId === 'gacha_ten') {
    await handleGachaResult(interaction, user, 10);
    return;
  }
  
  // ===== 分配 HP =====
  if (customId.startsWith('alloc_hp_')) {
    const raw = String(customId || '').replace('alloc_hp_', '').trim();
    let petId = raw;
    let amountInput = 1;
    const amountMatch = raw.match(/^(.*)_(\d+|max)$/i);
    if (amountMatch) {
      petId = String(amountMatch[1] || '').trim();
      amountInput = String(amountMatch[2] || '').trim().toLowerCase();
    }
    await handleAllocateHP(interaction, user, petId, amountInput);
    return;
  }
  
  // ===== Modal 提交（名字）=====
  if (customId.startsWith('name_modal_')) {
    await handleNameSubmit(interaction, user);
    return;
  }
  } catch (err) {
    console.error(
      `[Interaction] handler failed cid=${String(customId || '')} user=${String(user?.id || '')}:`,
      err?.stack || err?.message || err
    );
    const failMsg = '❌ 互動處理失敗，請再按一次；若持續發生請回報你按的按鈕。';
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: failMsg, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: failMsg, ephemeral: true }).catch(() => {});
      }
    } catch (_) {}

    try {
      let recovered = false;
      if (interaction?.isButton?.()) {
        recovered = await restoreButtonTemplateSnapshot(interaction, buttonTemplateContext);
      }
      if (!recovered && String(customId || '').startsWith('event_')) {
        await tryRecoverEventButtonsAfterFailure(interaction, user?.id);
      } else if (!recovered && interaction?.isButton?.()) {
        await tryRecoverMainMenuAfterFailure(interaction, user?.id);
      }
    } catch (_) {}
  }
});

// ============== 錢包綁定 ==============
async function showWalletBindModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('wallet_bind_modal')
    .setTitle('💳 綁定錢包');

  const input = new TextInputBuilder()
    .setCustomId('wallet_address')
    .setLabel('BSC 錢包地址')
    .setPlaceholder('0x...')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function syncWalletAndApplyNow(discordUserId) {
  const assets = await WALLET.getPlayerWalletAssets(discordUserId);
  if (!assets?.success || !assets.assets) {
    throw new Error(assets?.reason || '無法讀取錢包資產');
  }

  const player = CORE.loadPlayer(discordUserId);
  const ledger = WALLET.applyWalletRnsDelta(discordUserId, assets.rns, {
    // 舊資料升級：如果玩家檔已存在，預設視為先前已領過一次，避免同步後重複補發
    assumeClaimedIfMissing: Boolean(player)
  });
  if (!ledger?.success) {
    throw new Error(ledger?.reason || '錢包入帳同步失敗');
  }

  WALLET.updateWalletData(discordUserId, {
    cardFMV: assets.assets.cardFMV,
    cardCount: assets.assets.cardCount,
    packTxCount: assets.assets.packTxCount,
    packSpentUSDT: assets.assets.packSpentUSDT,
    tradeSpentUSDT: assets.assets.tradeSpentUSDT,
    totalSpentUSDT: assets.assets.totalSpentUSDT
  });

  if (player) {
    const currentGold = Math.max(0, Number(player?.stats?.財富 || 0));
    player.stats.財富 = currentGold + Math.max(0, Number(ledger.delta || 0));
    CORE.savePlayer(player);
  }

  return {
    ...assets,
    walletTotalRns: ledger.walletTotalRns,
    syncDeltaRns: ledger.delta,
    pendingRns: ledger.pendingAfter,
    claimedBefore: ledger.claimedBefore
  };
}

function syncWalletInBackground(interaction, user, bindAddress = '') {
  const userId = String(user?.id || '').trim();
  if (!userId) return;

  Promise.resolve()
    .then(async () => {
      const assets = await syncWalletAndApplyNow(userId);
      const maxPets = WALLET.getMaxPetsByFMV(assets.assets.cardFMV);
      const notice =
        `✅ 錢包資料背景同步完成\n` +
        `錢包：\`${bindAddress || WALLET.getWalletAddress(userId) || 'unknown'}\`\n` +
        `🎁 錢包可領總額：${assets.walletTotalRns}\n` +
        `➕ 本次新增入帳：${assets.syncDeltaRns}\n` +
        `🐾 可擁有寵物：${maxPets} 隻`;
      if (interaction && typeof interaction.followUp === 'function') {
        await interaction.followUp({ content: notice, ephemeral: true }).catch(() => {});
      }
    })
    .catch((e) => {
      console.error(`[錢包] 背景同步失敗 user=${userId}:`, e?.message || e);
    });
}

async function handleWalletBind(interaction, user) {
  const walletAddress = interaction.fields.getTextInputValue('wallet_address').trim();
  
  const result = WALLET.bindWallet(user.id, walletAddress);
  
  if (!result.success) {
    await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
    return;
  }

  const hasPlayer = Boolean(CORE.loadPlayer(user.id));
  const embed = new EmbedBuilder()
    .setTitle('✅ 已接收錢包綁定請求')
    .setColor(0x00ff00)
    .setDescription(
      `錢包地址：\`${result.address}\`\n\n` +
      `鏈上資料正在背景同步中，完成後會自動入帳到你的 Rns。\n` +
      `如果你正在遊玩，可先繼續流程，不用停在這裡等待。`
    );

  const buttons = hasPlayer
    ? new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 回到冒險').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('open_profile').setLabel('💳 查看檔案').setStyle(ButtonStyle.Secondary)
      )
    : new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('continue_with_wallet').setLabel('🚀 繼續新手流程').setStyle(ButtonStyle.Primary)
      );

  await interaction.update({ embeds: [embed], components: [buttons] });
  syncWalletInBackground(interaction, user, result.address);
}

async function handleWalletSyncNow(interaction, user) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  try {
    const assets = await syncWalletAndApplyNow(user.id);
    const maxPets = WALLET.getMaxPetsByFMV(assets.assets.cardFMV);
    const cardInfo = assets.assets.cardCount > 0
      ? `📦 卡片 FMV: $${assets.assets.cardFMV.toFixed(2)} USD (${assets.assets.cardCount} 張)\n`
      : '📦 卡片 FMV: $0.00 USD (0 張)\n';

    const embed = new EmbedBuilder()
      .setTitle('🔄 錢包資產已同步')
      .setColor(0x00c853)
      .setDescription(
        `${cardInfo}` +
        `📊 開包數量: ${assets.assets.packTxCount} 次\n` +
        `💸 總花費(開包+市場買入): $${Number(assets.assets.totalSpentUSDT || 0).toFixed(2)} USDT\n` +
        `🎁 錢包可領總額: ${assets.walletTotalRns}\n` +
        `➕ 本次新增入帳: ${assets.syncDeltaRns}\n` +
        `🐾 可擁有寵物: ${maxPets} 隻`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_profile').setLabel('💳 返回檔案').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('open_settings').setLabel('⚙️ 設定').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 回到冒險').setStyle(ButtonStyle.Success)
    );

    await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
  } catch (e) {
    await updateInteractionMessage(interaction, {
      embeds: [
        new EmbedBuilder()
          .setTitle('⚠️ 同步失敗')
          .setColor(0xffa500)
          .setDescription(`錯誤：${e.message}\n請稍後再試。`)
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_profile').setLabel('💳 返回檔案').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('open_settings').setLabel('⚙️ 設定').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 回到冒險').setStyle(ButtonStyle.Secondary)
        )
      ]
    });
  }
}

async function sendOnboardingLanguageSelection(interaction, user, options = {}) {
  const walletBound = WALLET.isWalletBound(user.id);
  const walletNote = walletBound
    ? '✅ 已綁定錢包：建立角色時會帶入目前錢包資產。'
    : 'ℹ️ 尚未綁定錢包：你可以先玩，之後到設定綁定並即時入帳。';

  const langEmbed = new EmbedBuilder()
    .setTitle('🌍 選擇你的語言 / Choose Your Language')
    .setColor(0xffd700)
    .setDescription(`**${user.username}**，歡迎來到 Renaiss 星球！\n\nPlease select your language first / 請先選擇語言：\n\n支援的語言：`)
    .addFields(
      { name: '🇹🇼 繁體中文', value: '繁體中文（台灣、香港）', inline: true },
      { name: '🇨🇳 簡體中文', value: '简体中文（中国）', inline: true },
      { name: '🇺🇸 English', value: 'English (US/EU)', inline: true },
      { name: '💳 錢包狀態', value: walletNote, inline: false }
    );
  const langRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('select_lang_zh-TW').setLabel('🇹🇼 繁體中文').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('select_lang_zh-CN').setLabel('🇨🇳 簡體中文').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('select_lang_en').setLabel('🇺🇸 English').setStyle(ButtonStyle.Secondary)
  );

  if (options.replaceCurrent) {
    await interaction.update({ embeds: [langEmbed], components: [langRow] }).catch(async () => {
      await interaction.reply({ embeds: [langEmbed], components: [langRow], ephemeral: true }).catch(() => {});
    });
    return;
  }
  await interaction.channel.send({ embeds: [langEmbed], components: [langRow] }).catch(() => {});
}

// ============== 繼續錢包流程 ==============
CLIENT.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'continue_with_wallet') return;
  if (await rejectIfNotThreadOwner(interaction, interaction.user.id)) return;
  if (await rejectIfNotLatestThread(interaction, interaction.user.id)) return;
  
  const user = interaction.user;
  const threadChannel = interaction.channel;
  
  // 檢查是否已有存檔
  const player = CORE.loadPlayer(user.id);
  if (player) {
    await interaction.deferUpdate().catch(() => {});
    await showMainMenu(interaction, player, PET.loadPet(user.id));
    return;
  }
  
  // 繼續新角色流程（在當前 thread）
  await interaction.deferUpdate().catch(() => {});
  
  try {
    const initialRns = WALLET.getPendingRNS(user.id);
    const selectedLang = getPlayerTempData(user.id, 'language') || 'zh-TW';
    const payload = buildGenderSelectionPayload(selectedLang, user.username);
    payload.embed.addFields({ name: '💰 初始 Rns', value: String(initialRns), inline: true });
    
    // 發送到當前 thread
    await threadChannel.send({ 
      embeds: [payload.embed],
      components: [payload.row]
    });
  } catch (err) {
    console.error('[錯誤] 創建角色失敗:', err.message);
  }
});

async function handleLegacyAlignmentChoice(interaction, user, customId) {
  const forcedGender = customId === 'choose_positive' ? '男' : '女';
  const lang = getPlayerTempData(user.id, 'language') || 'zh-TW';
  const payload = buildElementSelectionPayload(lang, forcedGender);
  setPlayerTempData(user.id, 'gender', forcedGender);
  await interaction.update({ embeds: [payload.embed], components: [payload.row] }).catch(() => {});
}

async function handleChooseGender(interaction, user, customId) {
  const gender = customId === 'choose_gender_female' ? '女' : '男';

  const resumed = await resumeExistingOnboardingOrGame(interaction, user);
  if (resumed) {
    await interaction.message?.edit({ components: [] }).catch(() => {});
    return;
  }

  const lang = getPlayerTempData(user.id, 'language') || 'zh-TW';
  setPlayerTempData(user.id, 'gender', gender);
  await interaction.message?.edit({ components: [] }).catch(() => {});
  await showCharacterNameModal(interaction, gender, lang).catch(async () => {
    const payload = buildElementSelectionPayload(lang, gender);
    await interaction.reply({ embeds: [payload.embed], components: [payload.row] }).catch(() => {});
  });
}

async function handleChoosePetElement(interaction, user, customId) {
  const resumed = await resumeExistingOnboardingOrGame(interaction, user);
  if (resumed) {
    await interaction.message?.edit({ components: [] }).catch(() => {});
    return;
  }

  const match = String(customId || '').match(/^choose_element_(male|female)_(water|fire|grass)$/);
  const lang = getPlayerTempData(user.id, 'language') || 'zh-TW';
  const langText = getLanguageText(lang);
  if (!match) {
    await interaction.reply({ content: langText.elementChoiceInvalid, ephemeral: true }).catch(() => {});
    return;
  }
  const gender = match[1] === 'female' ? '女' : '男';
  const element = match[2] === 'fire' ? '火' : match[2] === 'grass' ? '草' : '水';
  setPlayerTempData(user.id, 'gender', gender);
  setPlayerTempData(user.id, 'petElement', element);
  await interaction.message?.edit({ components: [] }).catch(() => {});
  await showOnboardingPetNameModal(interaction, lang).catch(async () => {
    const charName = normalizeCharacterName(getPlayerTempData(user.id, 'charName') || user.username, user.username);
    await createCharacterWithName(interaction, user, { gender, element, alignment: '正派' }, charName, {
      petName: pickDefaultPetNameByElement(element)
    });
  });
}

// 創建角色（名字輸入後調用）
async function createCharacterWithName(interaction, user, profile, charName, options = {}) {
  const existingPlayer = CORE.loadPlayer(user.id);
  const existingPet = PET.loadPet(user.id);
  if (existingPlayer && existingPet) {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: '✅ 你已建立角色，請繼續目前進度。', ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: '✅ 你已建立角色，請繼續目前進度。', ephemeral: true }).catch(() => {});
    }
    return;
  }

  // 使用暫時 RNS（背景掃描完成後會更新）
  const pendingRNS = WALLET.getPendingRNS(user.id);
  const selectedGender = normalizeCharacterGender(profile?.gender || getPlayerTempData(user.id, 'gender') || '男');
  const selectedElement = normalizePetElementCode(profile?.element || getPlayerTempData(user.id, 'petElement') || '水');
  const alignment = normalizePlayerAlignment(profile?.alignment || '正派');
  const finalCharacterName = normalizeCharacterName(charName, user.username);
  const finalPetName = normalizePetName(options?.petName || '', selectedElement);

  const player = CORE.createPlayer(user.id, finalCharacterName, selectedGender, '無門無派');
  const spawnProfile = getLocationProfile(player.location);
  player.alignment = alignment;
  player.petElement = selectedElement;
  player.wanted = 0;
  player.stats.財富 = pendingRNS; // 使用暫時 RNS（0 或上次保存的值）
  ECON.ensurePlayerEconomy(player);
  
  // 取得選擇的語言
  const selectedLang = getPlayerTempData(user.id, 'language') || 'zh-TW';
  player.language = selectedLang;
  const uiLang = getPlayerUILang(player);
  player.currentStory = '';
  player.eventChoices = [];
  CORE.savePlayer(player);
  // 建角後即視為入帳完成，避免用 pendingRNS 重複領取同一筆錢
  WALLET.updatePendingRNS(user.id, 0);
  
  // 清除臨時資料
  clearPlayerTempData(user.id);
  
  const selectedMove = rollStarterMoveForElement(selectedElement);
  if (!selectedMove) {
    const failEmbed = new EmbedBuilder()
      .setTitle('❌ 開局初始化失敗')
      .setColor(0xff4d4f)
      .setDescription('找不到可用招式池，請重新 /start。');
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ embeds: [failEmbed], components: [] }).catch(() => {});
    } else {
      await interaction.reply({ embeds: [failEmbed], components: [] }).catch(() => {});
    }
    return;
  }

  const pet = PET.createPetEgg(user.id, selectedElement);
  pet.hatched = true;
  pet.status = '正常';
  pet.waitingForName = false;
  pet.name = finalPetName;
  pet.reviveAt = null;
  pet.reviveTurnsRemaining = 0;
  pet.moves = [
    { ...PET.INITIAL_MOVES[0], currentProficiency: 0 },
    { ...PET.INITIAL_MOVES[1], currentProficiency: 0 },
    {
      id: selectedMove.id,
      name: selectedMove.name,
      element: selectedMove.element,
      tier: selectedMove.tier,
      type: 'elemental',
      baseDamage: selectedMove.baseDamage,
      effect: selectedMove.effect,
      desc: selectedMove.desc,
      currentProficiency: 0
    }
  ];
  PET.updateAppearance(pet);
  PET.savePet(pet);
  const starterPack = grantStarterFivePullIfNeeded(user.id);
  const tierMeta = getMoveTierMeta(selectedMove.tier);
  const dmgInfo = pet.moves.map((m) => {
    const d = BATTLE.calculatePlayerMoveDamage(m, {}, pet);
    const speed = getMoveSpeedValue(m);
    return `• ${m.name} (${m.element}): ${format1(d.total)}dmg｜🚀速度${format1(speed)}`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle('🎉 角色建立完成｜開局抽獎完成')
    .setColor(tierMeta.color)
    .setDescription(
      `**${player.name}**，你的 Renaiss 星球之旅開始了！\n\n` +
      `👤 角色已命名：**${player.name}**\n` +
      `🐾 寵物已命名：**${pet.name}**\n\n` +
      `🎰 開局抽獎結果：${tierMeta.emoji} **${selectedMove.name}**（${tierMeta.name}）`
    )
    .addFields(
      { name: '📍 位置', value: player.location, inline: true },
      { name: '🎚️ 出生難度', value: spawnProfile ? `D${spawnProfile.difficulty}` : 'D1', inline: true },
      { name: '👤 角色性別', value: selectedGender, inline: true },
      { name: '🐾 寵物', value: `${pet.name}（${getPetElementDisplayName(selectedElement)}）`, inline: true },
      { name: t('hp', uiLang), value: `${player.stats.生命}/${player.maxStats.生命}`, inline: true },
      { name: t('gold', uiLang), value: String(player.stats.財富), inline: true }
    )
    .addFields(
      { name: '✨ 開局天賦', value: `${tierMeta.emoji} ${selectedMove.name}｜${tierMeta.name}（機率 ${tierMeta.rate}）`, inline: false },
      { name: '📜 寵物招式', value: dmgInfo, inline: false }
    );

  if (starterPack) {
    const chips = Array.isArray(starterPack.grantedChips) ? starterPack.grantedChips : [];
    const chipLine = chips.length > 0
      ? chips
        .slice(0, 5)
        .map((m) => `${m.emoji} ${m.name}`)
        .join('、')
      : '本次技能晶片發放失敗，請稍後重試。';
    embed.addFields({
      name: '🎁 開局贈禮：免費五連抽',
      value: `已發放為技能晶片（已進背包，可販售；想學再到寵物招式頁學習）。\n本次新增：${chips.length} 張\n${chipLine}`,
      inline: false
    });
  }
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 開始冒險').setStyle(ButtonStyle.Success)
  );
  
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ embeds: [embed], components: [row] }).catch(async () => {
      await interaction.channel.send({ embeds: [embed], components: [row] });
    });
  } else {
    await interaction.reply({ embeds: [embed], components: [row] }).catch(async () => {
      await interaction.channel.send({ embeds: [embed], components: [row] });
    });
  }
}

// ============== 敲蛋孵化 - 動畫版 ==============
async function handleHatchEgg(interaction, user) {
  const egg = PET.loadPet(user.id);
  
  if (!egg || egg.hatched) {
    await interaction.update({ content: '❌ 寵物已孵化！', components: [] });
    return;
  }
  
  // ===== 階段1：敲蛋動畫 =====
  const stage1Embed = new EmbedBuilder()
    .setTitle('🔨 敲蛋中...')
    .setColor(0x8B4513)
    .setDescription(`💫 你举起手中的石块，对准那颗神秘的宠物蛋...
    
*「砰！砰砰！」*
    
蛋壳开始出现裂纹，一道光芒从裂缝中透出...
    
⏳ 寵物正在孵化中...`);
  
  const loadingRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hatch_loading').setLabel('⏳ 孵化中...').setStyle(ButtonStyle.Secondary).setDisabled(true)
  );
  
  await interaction.update({ embeds: [stage1Embed], components: [loadingRow] });
  
  // 延遲1.5秒，營造期待感
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // ===== 階段2：光芒萬丈 =====
  const stage2Embed = new EmbedBuilder()
    .setTitle('✨ 光芒萬丈！')
    .setColor(0xffd700)
    .setDescription(`一道璀璨的光芒冲天而起！
    
🌟 寵物的天賦正在覺醒...
    
*傳說中的招式即將現世...*`);
  
  await interaction.editReply({ embeds: [stage2Embed], components: [loadingRow] });
  
  // 延遲1秒
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // ===== 階段3：隨機選擇招式池（電腦選3個）=====
  const allMoves = getPetMovePool(egg.type);
  if (!Array.isArray(allMoves) || allMoves.length <= 0) {
    await interaction.editReply({ content: '❌ 找不到可用招式池，請重新孵化。', embeds: [], components: [] }).catch(() => {});
    return;
  }
  const shuffled = [...allMoves].sort(() => Math.random() - 0.5);
  const choices = shuffled.slice(0, 3);
  
  // 電腦最終選擇（80%普通/15%稀有/5%史詩，但玩家不知道）
  const roll = Math.random();
  const tierIndex = roll < 0.80 ? 0 : roll < 0.95 ? 1 : 2;
  const tierMoves = choices.filter(m => m.tier === tierIndex + 1);
  const selectedMove = tierMoves.length > 0 ? tierMoves[0] : choices.filter(m => m.tier === 1)[0] || choices[0];
  
  // ===== 階段4：揭曉！=====
  const tierEmoji = selectedMove.tier === 3 ? '🔮' : selectedMove.tier === 2 ? '💠' : '⚪';
  const tierName = selectedMove.tier === 3 ? '史詩' : selectedMove.tier === 2 ? '稀有' : '普通';
  const tierColor = selectedMove.tier === 3 ? 0x9932cc : selectedMove.tier === 2 ? 0x1e90ff : 0x808080;
  
  const stage3Embed = new EmbedBuilder()
    .setTitle(`${tierEmoji} 天賦覺醒：${selectedMove.name}`)
    .setColor(tierColor)
    .setDescription(`🎉 恭喜！你獲得了 **${tierEmoji} ${tierName}級招式**——**${selectedMove.name}**！
    
✨ *${selectedMove.desc}*

💫 寵物蛋殼完全碎裂，你的寵物終於誕生了！`);
  
  // 教學提示
  const tutorialText = selectedMove.tier === 3 
    ? '\n🌟 **運氣爆棚！這可是傳說中的史詩招式！**' 
    : selectedMove.tier === 2 
    ? '\n💠 **運氣不錯！這是稀有的招式！**' 
    : '\n⚪ **普通招式，但實用性很高！**';
  
  stage3Embed.addFields({ name: '教學', value: tutorialText, inline: false });
  
  egg.hatched = true;
  egg.status = '待命名';
  PET.savePet(egg);
  
  // 學習招式（直接學會，不給選擇）
  egg.moves = [
    { ...PET.INITIAL_MOVES[0], currentProficiency: 0 },
    { ...PET.INITIAL_MOVES[1], currentProficiency: 0 },
    {
      id: selectedMove.id,
      name: selectedMove.name,
      element: selectedMove.element,
      tier: selectedMove.tier,
      type: 'elemental',
      baseDamage: selectedMove.baseDamage,
      effect: selectedMove.effect,
      desc: selectedMove.desc,
      currentProficiency: 0
    }
  ];
  egg.waitingForName = true;
  PET.savePet(egg);
  
  // 直接公佈結果（使用電腦選定的招式）
  const resultEmbed = new EmbedBuilder()
    .setTitle(`${tierEmoji} 天賦覺醒：${selectedMove.name}`)
    .setColor(tierColor)
    .setDescription(`🎉 恭喜！你獲得了 **${tierEmoji} ${tierName}級招式**——**${selectedMove.name}**！
    
✨ *${selectedMove.desc}*

💫 寵物蛋殼完全碎裂，你的寵物終於誕生了！`);
  
  resultEmbed.addFields({ name: '稀有度', value: `${tierEmoji} ${tierName} (${selectedMove.tier === 3 ? '5%' : selectedMove.tier === 2 ? '15%' : '80%'} 機率)`, inline: true });
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('enter_pet_name').setLabel('✏️ 為寵物取名').setStyle(ButtonStyle.Success)
  );
  
  await interaction.editReply({ embeds: [resultEmbed], components: [row] });
}

// ============== 輸入名字按鈕 ==============
CLIENT.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const { customId, user } = interaction;
  if (await rejectIfNotThreadOwner(interaction, user.id)) return;
  if (await rejectIfNotLatestThread(interaction, user.id)) return;
  
  if (customId === 'enter_pet_name') {
    const pet = PET.loadPet(user.id);
    if (!pet || !pet.waitingForName) {
      await interaction.update({ content: '❌ 錯誤！', components: [] });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`name_modal_${user.id}`)
      .setTitle('📝 為寵物取名');
    
    const nameInput = new TextInputBuilder()
      .setCustomId('pet_name')
      .setLabel('寵物名字')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('輸入名字（1-6個字）')
      .setMinLength(1)
      .setMaxLength(6)
      .setRequired(true);
    
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    await interaction.showModal(modal);
    return;
  }
});

// ============== 名字提交（Modal）=============
async function handleNameSubmit(interaction, user) {
  const pet = PET.loadPet(user.id);
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  
  if (!pet || !pet.waitingForName) {
    await interaction.reply({ content: '❌ 錯誤！', components: [] });
    return;
  }
  
  let name = interaction.fields.getTextInputValue('pet_name').trim();
  
  // 如果名字太長或太短，隨機給一個
  if (!name || name.length < 1 || name.length > 6) {
    name = pickDefaultPetNameByElement(pet.type);
  }
  
  pet.name = name;
  pet.waitingForName = false;
  PET.savePet(pet);
  const starterPack = grantStarterFivePullIfNeeded(user.id);
  
  const dmgInfo = pet.moves.map(m => {
    const d = BATTLE.calculatePlayerMoveDamage(m, {}, pet);
    const speed = getMoveSpeedValue(m);
    return `• ${m.name} (${m.element}): ${format1(d.total)}dmg｜🚀速度${format1(speed)}`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle(`🐾 ${pet.name} 命名成功！`)
    .setColor(getPetElementColor(pet.type))
    .setDescription(pet.appearance)
    .addFields(
      { name: '🐾 名字', value: pet.name, inline: true },
      { name: '🏷️ 屬性', value: getPetElementDisplayName(pet.type), inline: true },
      { name: t('hp', uiLang), value: formatPetHpWithRecovery(pet), inline: true },
      { name: t('atk', uiLang), value: String(pet.attack), inline: true },
      { name: t('def', uiLang), value: String(pet.defense), inline: true },
      { name: '⚡ 速度', value: String(pet.speed), inline: true }
    )
    .addFields({ name: '📜 招式', value: dmgInfo, inline: false });

  if (starterPack) {
    const chips = Array.isArray(starterPack.grantedChips) ? starterPack.grantedChips : [];
    const chipLine = chips.length > 0
      ? chips
        .slice(0, 5)
        .map(m => `${m.emoji} ${m.name}`)
        .join('、')
      : '本次技能晶片發放失敗，請稍後重試。';
    embed.addFields({
      name: '🎁 開局贈禮：免費五連抽',
      value: `已發放為技能晶片（已進背包，可販售；想學再到寵物招式頁學習）。\n本次新增：${chips.length} 張\n${chipLine}`,
      inline: false
    });
  }
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 開始探險！').setStyle(ButtonStyle.Success)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
}

// ============== 跳過名字（隨機）==============
CLIENT.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'skip_name') return;
  if (await rejectIfNotThreadOwner(interaction, interaction.user.id)) return;
  if (await rejectIfNotLatestThread(interaction, interaction.user.id)) return;
  
  const userId = interaction.user.id;
  const pet = PET.loadPet(userId);
  const player = CORE.loadPlayer(userId);
  const uiLang = getPlayerUILang(player);
  
  if (!pet || !pet.waitingForName) return;
  
  const name = pickDefaultPetNameByElement(pet.type);
  
  pet.name = name;
  pet.waitingForName = false;
  PET.savePet(pet);
  const starterPack = grantStarterFivePullIfNeeded(userId);
  
  const dmgInfo = pet.moves.map(m => {
    const d = BATTLE.calculatePlayerMoveDamage(m, {}, pet);
    const speed = getMoveSpeedValue(m);
    return `• ${m.name} (${m.element}): ${format1(d.total)}dmg｜🚀速度${format1(speed)}`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle(`🐾 寵物命名：${pet.name}`)
    .setColor(getPetElementColor(pet.type))
    .setDescription(pet.appearance)
    .addFields(
      { name: '🐾 名字', value: pet.name, inline: true },
      { name: '🏷️ 屬性', value: getPetElementDisplayName(pet.type), inline: true },
      { name: t('hp', uiLang), value: formatPetHpWithRecovery(pet), inline: true },
      { name: '⚔️ 攻擊', value: String(pet.attack), inline: true },
      { name: '🛡️ 防禦', value: String(pet.defense), inline: true }
    )
    .addFields({ name: '📜 招式', value: dmgInfo, inline: false });

  if (starterPack) {
    const chips = Array.isArray(starterPack.grantedChips) ? starterPack.grantedChips : [];
    const chipLine = chips.length > 0
      ? chips
        .slice(0, 5)
        .map(m => `${m.emoji} ${m.name}`)
        .join('、')
      : '本次技能晶片發放失敗，請稍後重試。';
    embed.addFields({
      name: '🎁 開局贈禮：免費五連抽',
      value: `已發放為技能晶片（已進背包，可販售；想學再到寵物招式頁學習）。\n本次新增：${chips.length} 張\n${chipLine}`,
      inline: false
    });
  }
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 開始探險！').setStyle(ButtonStyle.Success)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
});

// ============== 主選單（發送到 Thread）==============
async function sendMainMenuToThread(thread, player, pet, interaction = null) {
  if (interaction && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  const fallbackPet = pet || PET.loadPet(player?.id);
  const mainPetResolved = resolvePlayerMainPet(player, { fallbackPet });
  pet = mainPetResolved?.pet || fallbackPet;
  if (!pet) {
    if (interaction && !interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: '❌ 找不到可用寵物，請重新 /start。', ephemeral: true }).catch(() => {});
    } else {
      await thread.send({ content: '❌ 找不到可用寵物，請重新 /start。' }).catch(() => {});
    }
    return;
  }

  let stateMutated = ensurePlayerGenerationSchema(player);
  if (mainPetResolved?.changed) stateMutated = true;
  if (recordNearbyNpcEncounters(player, 8)) stateMutated = true;
  syncLocationArcLocation(player);
  if (restoreStoryFromGenerationState(player)) stateMutated = true;
  if (restoreChoicesFromGenerationState(player)) stateMutated = true;
  if (
    (player.generationState?.status === 'pending' || player.generationState?.status === 'failed') &&
    String(player.currentStory || '').trim() &&
    Array.isArray(player.eventChoices) &&
    player.eventChoices.length > 0
  ) {
    finishGenerationState(player, 'done', {
      phase: 'recovered_snapshot',
      storySnapshot: player.currentStory,
      choicesSnapshot: player.eventChoices
    });
    stateMutated = true;
  }
  if (stateMutated) {
    CORE.savePlayer(player);
  }

  const worldIntro = consumeWorldIntroOnce(player);
  const worldIntroBlock = worldIntro ? `🌍 **世界背景導讀**\n${worldIntro}\n\n` : '';
  const financeNotices = typeof ECON.consumeFinanceNotices === 'function'
    ? ECON.consumeFinanceNotices(player, 3)
    : [];
  if (financeNotices.length > 0) {
    stateMutated = true;
    CORE.savePlayer(player);
  }
  const financeNoticeBlock = financeNotices.length > 0
    ? `📬 **交易通知**\n${financeNotices.map((line) => `• ${line}`).join('\n')}\n\n`
    : '';
  const portalGuideBlock = player?.portalMenuOpen ? `\n\n${buildPortalUsageGuide(player)}` : '';
  let forceFreshStory = Boolean(getPendingStoryTrigger(player)?.forceFreshStory);
  const stitchedBattleStoryDetected =
    !forceFreshStory &&
    detectStitchedBattleStory(player.currentStory) &&
    Array.isArray(player.eventChoices) &&
    player.eventChoices.length > 0;
  if (stitchedBattleStoryDetected) {
    const choiceHint = extractBattleChoiceHintFromStory(player.currentStory);
    queuePendingStoryTrigger(player, {
      name: '戰後自動續寫',
      choice: choiceHint || '承接上一場戰鬥結果',
      desc: '系統偵測到舊拼接戰後文，改為強制重生新篇章',
      action: 'battle_result_autofix',
      outcome: '請根據上一場戰鬥勝負與現場線索，延伸新的劇情正文與新選項'
    });
    player.eventChoices = [];
    CORE.savePlayer(player);
    forceFreshStory = true;
  }

  // 如果沒有暂存的事件選項，才生成新的（防止刷選項）
  // ============================================================
  //  continuity 維護：有 story+choices 就直接顯示，不重新生成
  // ============================================================
  if (!forceFreshStory && player.currentStory && player.eventChoices && player.eventChoices.length > 0) {
    // 直接顯示上次的故事 + 選項（不做任何 AI 呼叫）
    let persisted = false;
    const choices = applyChoicePolicy(player, normalizeEventChoices(player, player.eventChoices));
    if (
      choices.length !== player.eventChoices.length ||
      choices.some((choice, idx) => choice !== player.eventChoices[idx])
    ) {
      player.eventChoices = choices;
      persisted = true;
    }
    if (player.generationState?.status === 'pending' || player.generationState?.status === 'failed') {
      updateGenerationState(player, {
        phase: 'resume_cached',
        storySnapshot: player.currentStory,
        choicesSnapshot: choices
      });
      finishGenerationState(player, 'done', {
        phase: 'resume_cached',
        storySnapshot: player.currentStory,
        choicesSnapshot: choices
      });
      persisted = true;
    }
    if (persisted) {
      CORE.savePlayer(player);
    }
    const storyText = player.currentStory;
    
    const uiText = getAdventureText(player.language || 'zh-TW');
    const statusBar = buildMainStatusBar(player, pet, player.language || 'zh-TW');
    
    const optionsText = buildChoiceOptionsText(choices, { player, pet });
    
    const mainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
    const description = `${financeNoticeBlock}${worldIntroBlock}**${uiText.statusLabel}：【${statusBar}】**${mainlineLine ? `\n${mainlineLine}` : ''}\n\n${storyText}${portalGuideBlock}\n\n**${uiText.sectionChoices}：**${optionsText}\n\n_${uiText.chooseNumber(CHOICE_DISPLAY_COUNT)}_`;
    
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${player.name} - ${pet.name}`)
      .setColor(getAlignmentColor(player.alignment))
      .setDescription(description)
      .addFields(
        { name: '🐾 寵物', value: `${pet.name} (${getPetElementDisplayName(pet.type)})`, inline: true },
        { name: '⚔️ 氣血', value: formatPetHpWithRecovery(pet), inline: true },
        { name: '💰 Rns 代幣', value: String(player.stats.財富), inline: true }
      )
      .addFields(
        { name: '📍 位置', value: player.location, inline: true },
        { name: '🌟 幸運', value: String(player.stats.運氣), inline: true },
        { name: '📊 等級', value: String(player.level), inline: true }
      );
    
    const buttons = buildEventChoiceButtons(choices, player.id);
    appendMainMenuUtilityButtons(buttons, player);
    const components = [];
    for (let i = 0; i < buttons.length; i += 5) {
      components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    
    const oldActiveId = player.activeMessageId;
    if (oldActiveId) {
      await disableMessageComponents(thread, oldActiveId);
    }

    const sentMsg = await thread.send({ embeds: [embed], components }).catch(() => null);
    if (sentMsg) {
      trackActiveGameMessage(player, thread.id, sentMsg.id);
    }
    return;
  }
  
  // ============================================================
  //  沒有存 story/choices → 生成初始故事 + 選項
  // ============================================================
  const playerId = player?.id;
  if (!tryAcquireStoryLock(playerId, 'main_menu')) {
    await notifyStoryBusy(interaction);
    return;
  }

  let releaseInScope = true;
  try {
  // story-first：沒有 currentStory 時不應先產選項，避免出現「先有選項、後有故事」的錯亂
  if (!player.currentStory && Array.isArray(player.eventChoices) && player.eventChoices.length > 0) {
    player.eventChoices = [];
    CORE.savePlayer(player);
  }
  if (forceFreshStory && Array.isArray(player.eventChoices) && player.eventChoices.length > 0) {
    player.eventChoices = [];
    CORE.savePlayer(player);
  }

  const hasRecoverableStoryOnly =
    !forceFreshStory &&
    String(player.currentStory || '').trim().length > 0 &&
    (!Array.isArray(player.eventChoices) || player.eventChoices.length === 0);
  startGenerationState(player, {
    source: hasRecoverableStoryOnly
      ? 'main_menu_recover_choices'
      : (forceFreshStory ? 'main_menu_force_fresh_story' : 'main_menu'),
    phase: 'loading',
    sourceChoice: hasRecoverableStoryOnly
      ? '補齊上次中斷選項'
      : (forceFreshStory ? '承接戰鬥結果生成新劇情' : '主選單生成'),
    storySnapshot: hasRecoverableStoryOnly ? player.currentStory : '',
    choicesSnapshot: []
  });
  CORE.savePlayer(player);
  
  // ===== 狀態列 =====
  const uiText = getAdventureText(player.language || 'zh-TW');
  const statusBar = buildMainStatusBar(player, pet, player.language || 'zh-TW');
  const eventMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');

  // 先用 Loading 訊息回覆（先故事、後選項）
  const loadingHint = hasRecoverableStoryOnly
    ? 'AI 說書人正在補齊上次中斷的選項...'
    : (forceFreshStory ? 'AI 說書人正在承接戰鬥結果重塑新篇章...' : 'AI 說書人正在構思故事...');
  const loadingMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
  const loadingDesc = `${financeNoticeBlock}${worldIntroBlock}**${uiText.statusLabel}：【${statusBar}】**${loadingMainlineLine ? `\n${loadingMainlineLine}` : ''}\n\n⏳ *${loadingHint}*${portalGuideBlock}`;
  
  const loadingEmbed = new EmbedBuilder()
    .setTitle(`⚔️ ${player.name} - ${pet.name}`)
    .setColor(0x00ff00)
    .setDescription(loadingDesc);
  
  // 構建按鈕
  const buttons = [];
  appendMainMenuUtilityButtons(buttons, player);
  
  const components = [];
  for (let i = 0; i < buttons.length; i += 5) {
    components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  
  // 發送 Loading 訊息到 thread
  const loadingMsg = await thread.send({ embeds: [loadingEmbed], components });
  trackActiveGameMessage(player, thread.id, loadingMsg.id);
  updateGenerationState(player, { loadingMessageId: loadingMsg.id });
  CORE.savePlayer(player);
  const stopLoadingAnimation = startLoadingAnimation(loadingMsg, loadingHint);
  const stopTypingIndicator = startTypingIndicator(thread);

  // 如果有 interaction（按鈕觸發），立即確認避免超時
  if (interaction) {
    await interaction.deferUpdate().catch(() => {});
  }
  
  // 背景 AI 生成：先出故事，再補按鈕
  (async () => {
    try {
      updateGenerationState(player, { phase: 'memory_context' });
      CORE.savePlayer(player);
      let memoryContext = '';
      try {
        const memStartedAt = Date.now();
        const memoryQueryText = [
          `玩家:${player.name || ''}`,
          `地點:${player.location || ''}`,
          `勢力目擊:${getFactionPresenceHintForPlayer(player)}`,
          `前情:${player.currentStory || ''}`
        ].join('\n');
        const [playerMemoryContext, npcMemoryContext] = await Promise.all([
          CORE.getPlayerMemoryContextAsync(player.id, {
            location: player.location,
            queryText: memoryQueryText,
            topK: 6
          }),
          CORE.getNearbyNpcMemoryContextAsync(player.id, {
            location: player.location,
            queryText: memoryQueryText,
            limit: 1,
            topKPrivate: 3,
            topKPublic: 2,
            maxChars: 900
          })
        ]);
        memoryContext = String(playerMemoryContext || '');
        if (npcMemoryContext) {
          memoryContext = [memoryContext, npcMemoryContext].filter(Boolean).join('\n\n');
        }
        console.log(`[Perf][main_menu] memory_context ${Date.now() - memStartedAt}ms`);
      } catch (memErr) {
        stopLoadingAnimation();
        finishGenerationState(player, 'failed', {
          phase: 'memory_failed',
          error: memErr?.message || memErr,
          storySnapshot: player.currentStory,
          choicesSnapshot: player.eventChoices
        });
        CORE.savePlayer(player);
        const memoryErrMsg = await editOrSendFallback(thread, loadingMsg, {
          content: `❌ 記憶系統錯誤：${memErr.message}\n請檢查 OpenAI Embedding 設定（此模式不會自動降級）。若剛更新 .env，請重啟機器人後再試。`,
          embeds: [],
          components: buildRetryGenerationComponents()
        }, 'main_menu.memory_error');
        if (memoryErrMsg?.id) {
          trackActiveGameMessage(player, thread.id, memoryErrMsg.id);
        }
        return;
      }
      const pendingStoryTrigger = forceFreshStory ? getPendingStoryTrigger(player) : null;
      let storyText = hasRecoverableStoryOnly ? String(player.currentStory || '').trim() : '';
      if (!hasRecoverableStoryOnly) {
        updateGenerationState(player, { phase: 'generating_story' });
        CORE.savePlayer(player);
        storyText = await STORY.generateStory(null, player, pet, pendingStoryTrigger, memoryContext);
        if (!storyText) {
          stopLoadingAnimation();
          finishGenerationState(player, 'failed', {
            phase: 'story_empty',
            error: 'AI story generation failed (empty result)',
            storySnapshot: player.currentStory,
            choicesSnapshot: []
          });
          CORE.savePlayer(player);
          const failStoryMsg = await editOrSendFallback(thread, loadingMsg, {
            content: '❌ AI 故事生成失敗，請點「重新生成」再試。',
            embeds: [],
            components: buildRetryGenerationComponents()
          }, 'main_menu.story_empty');
          if (failStoryMsg?.id) {
            trackActiveGameMessage(player, thread.id, failStoryMsg.id);
          }
          return;
        }

        player.currentStory = storyText;
        if (getMainlineBridgeLock(player, { autoClear: true })) {
          consumeMainlineBridgeLock(player);
        }
        player.eventChoices = [];
        if (pendingStoryTrigger) {
          clearPendingStoryTrigger(player);
        }
        const rememberStats = rememberStoryDialogues(player, storyText);
        if ((rememberStats?.quotes || 0) > 0 || (rememberStats?.mainline || 0) > 0) {
          console.log(
            `[StoryQuote] main_menu quotes=${rememberStats?.quotes || 0} dialoguePins=${rememberStats?.dialoguePins || 0} mainlinePins=${rememberStats?.mainline || 0} player=${player.id}`
          );
        }
        updateGenerationState(player, {
          phase: 'story_ready',
          storySnapshot: storyText,
          choicesSnapshot: []
        });
        CORE.savePlayer(player);
      }

      const storyFirstMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
      const storyFirstDesc =
        `${financeNoticeBlock}${worldIntroBlock}**${uiText.statusLabel}：【${statusBar}】**${storyFirstMainlineLine ? `\n${storyFirstMainlineLine}` : ''}\n\n${storyText}${portalGuideBlock}\n\n` +
        (hasRecoverableStoryOnly
          ? '⏳ *已恢復上次故事，正在補齊選項...*'
          : '⏳ *故事已送達，正在生成選項...*');

      const storyFirstEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(0x00ff00)
        .setDescription(storyFirstDesc);

      stopLoadingAnimation();
      const storyOnlyMsg = await editOrSendFallback(
        thread,
        loadingMsg,
        { content: null, embeds: [storyFirstEmbed], components: [] },
        'main_menu.story_only'
      );
      if (storyOnlyMsg?.id) {
        trackActiveGameMessage(player, thread.id, storyOnlyMsg.id);
      }

      updateGenerationState(player, {
        phase: 'generating_choices',
        loadingMessageId: storyOnlyMsg?.id || loadingMsg?.id || null
      });
      CORE.savePlayer(player);
      const newChoices = await STORY.generateChoicesWithAI(player, pet, storyText, memoryContext);
      if (!newChoices || newChoices.length === 0) {
        finishGenerationState(player, 'failed', {
          phase: 'choice_empty',
          error: 'AI choice generation failed (empty result)',
          storySnapshot: storyText,
          choicesSnapshot: []
        });
        CORE.savePlayer(player);
        const failChoicesMsg = await editOrSendFallback(thread, storyOnlyMsg || loadingMsg, {
          content: '⚠️ 故事已生成，但選項生成失敗，請點「重新生成」。',
          embeds: [storyFirstEmbed],
          components: buildRetryGenerationComponents()
        }, 'main_menu.choice_empty');
        if (failChoicesMsg?.id) {
          trackActiveGameMessage(player, thread.id, failChoicesMsg.id);
        }
        return;
      }

      const normalizedNewChoices = applyChoicePolicy(
        player,
        maybeInjectRareCustomInputChoice(normalizeEventChoices(player, newChoices))
      );
      player.eventChoices = normalizedNewChoices;
      updateGenerationState(player, {
        phase: 'choices_ready',
        storySnapshot: storyText,
        choicesSnapshot: normalizedNewChoices
      });
      finishGenerationState(player, 'done', {
        phase: 'completed',
        storySnapshot: storyText,
        choicesSnapshot: normalizedNewChoices
      });
      CORE.savePlayer(player);

      const newOptionsText = buildChoiceOptionsText(normalizedNewChoices, { player, pet });

      const newButtons = buildEventChoiceButtons(normalizedNewChoices, player.id);
      appendMainMenuUtilityButtons(newButtons, player);

      const newComponents = [];
      for (let i = 0; i < newButtons.length; i += 5) {
        newComponents.push(new ActionRowBuilder().addComponents(newButtons.slice(i, i + 5)));
      }

      const aiMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
      const aiDesc = `${financeNoticeBlock}${worldIntroBlock}**${uiText.statusLabel}：【${statusBar}】**${aiMainlineLine ? `\n${aiMainlineLine}` : ''}\n\n${storyText}${portalGuideBlock}\n\n**${uiText.sectionNewChoices}：**${newOptionsText}\n\n_${uiText.chooseNumber(CHOICE_DISPLAY_COUNT)}_`;

      const aiEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(0x00ff00)
        .setDescription(aiDesc);

      const finalMenuMsg = await editOrSendFallback(
        thread,
        storyOnlyMsg || loadingMsg,
        { content: null, embeds: [aiEmbed], components: newComponents },
        'main_menu.final_menu'
      );
      if (finalMenuMsg?.id) {
        trackActiveGameMessage(player, thread.id, finalMenuMsg.id);
      }
      triggerMainlineForeshadowAIInBackground(player, {
        phase: 'main_menu',
        storyText,
        location: player.location,
        playerLang: player.language
      });
    } catch (err) {
      stopLoadingAnimation();
      console.log('[AI] 故事生成失敗:', err.message);
      finishGenerationState(player, 'failed', {
        phase: 'exception',
        error: err?.message || err,
        storySnapshot: player.currentStory,
        choicesSnapshot: player.eventChoices
      });
      CORE.savePlayer(player);
      const aiFailMsg = await editOrSendFallback(thread, loadingMsg, {
        content: `❌ AI 失敗：${err.message}\n請點「重新生成」再試。`,
        embeds: [],
        components: buildRetryGenerationComponents()
      }, 'main_menu.ai_fail');
      if (aiFailMsg?.id) {
        trackActiveGameMessage(player, thread.id, aiFailMsg.id);
      }
    } finally {
      stopTypingIndicator();
      releaseStoryLock(playerId);
    }
  })();
  
  releaseInScope = false;
  return;
  } catch (err) {
    console.log('[主選單] 生成失敗:', err?.message || err);
    finishGenerationState(player, 'failed', {
      phase: 'outer_exception',
      error: err?.message || err,
      storySnapshot: player.currentStory,
      choicesSnapshot: player.eventChoices
    });
    CORE.savePlayer(player);
    const failMsg = await thread.send({
      content: `❌ 主選單生成失敗：${err?.message || err}\n請點「重新生成」再試。`,
      components: buildRetryGenerationComponents()
    }).catch(() => null);
    if (failMsg) {
      trackActiveGameMessage(player, thread.id, failMsg.id);
    }
    if (interaction) {
      const notice = '⚠️ 本輪生成失敗，已在討論串送出「重新生成」按鈕。';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: notice, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: notice, ephemeral: true }).catch(() => {});
      }
    }
    return;
  } finally {
    if (releaseInScope) {
      releaseStoryLock(playerId);
    }
  }
}

// ============== 主選單 ===============
async function showMainMenu(interaction, player, pet) {
  if (interaction.channel?.isThread()) {
    await sendMainMenuToThread(interaction.channel, player, pet, interaction);
    return;
  }

  const msg = '⚠️ 請使用 /start 開啟你的遊戲討論串，再繼續冒險。';
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
  } else {
    await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
}

function getSettingsHubText(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const map = {
    'zh-TW': {
      title: '⚙️ 設定中心',
      desc: '設定語言、錢包同步與記憶檢查。',
      btnMemory: '🧠 記憶檢查',
      btnSystem: '🛠️ 系統設定',
      btnBack: '🔙 返回主選單'
    },
    'zh-CN': {
      title: '⚙️ 设置中心',
      desc: '设置语言、钱包同步与记忆检查。',
      btnMemory: '🧠 记忆检查',
      btnSystem: '🛠️ 系统设置',
      btnBack: '🔙 返回主选单'
    },
    en: {
      title: '⚙️ Settings Hub',
      desc: 'Language, wallet sync, and memory audit settings.',
      btnMemory: '🧠 Memory Audit',
      btnSystem: '🛠️ System Settings',
      btnBack: '🔙 Back to Menu'
    }
  };
  return map[code] || map['zh-TW'];
}

function getMemoryRecapText(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const map = {
    'zh-TW': {
      title: '🧠 記憶回顧',
      loading: '⏳ AI 正在整理你的角色記憶...',
      fallbackHint: '（AI 回顧暫時不可用，以下為系統濃縮）',
      noStory: '目前還沒有足夠故事可回顧，先多推進幾回合再來看。',
      backProfile: '💳 返回檔案',
      backMenu: '返回主選單'
    },
    'zh-CN': {
      title: '🧠 记忆回顾',
      loading: '⏳ AI 正在整理你的角色记忆...',
      fallbackHint: '（AI 回顾暂时不可用，以下为系统浓缩）',
      noStory: '目前还没有足够故事可回顾，先多推进几回合再来查看。',
      backProfile: '💳 返回档案',
      backMenu: '返回主选单'
    },
    en: {
      title: '🧠 Memory Recap',
      loading: '⏳ AI is compiling your character memory recap...',
      fallbackHint: '(AI recap unavailable for now; showing system digest)',
      noStory: 'Not enough story progress yet. Play a few more turns and check again.',
      backProfile: '💳 Back to Profile',
      backMenu: 'Back to Menu'
    }
  };
  return map[code] || map['zh-TW'];
}

async function showSettingsHub(interaction, user, notice = '') {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const tx = getSettingsHubText(uiLang);
  const embed = new EmbedBuilder()
    .setTitle(tx.title)
    .setColor(0x64748b)
    .setDescription(`${notice ? `${notice}\n\n` : ''}${tx.desc}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_memory_audit').setLabel(tx.btnMemory).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_settings_system').setLabel(tx.btnSystem).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(tx.btnBack).setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

// ============== 設置選單 ==============
async function showSettings(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const currentLang = getPlayerUILang(player);
  const tx = getSettingsText(currentLang);
  const introFull = getWorldIntroTemplate(currentLang);
  const introPreview = introFull.length > 900 ? `${introFull.slice(0, 900)}...` : introFull;
  const langName =
    currentLang === 'zh-TW'
      ? tx.langNameZhTw
      : currentLang === 'zh-CN'
        ? tx.langNameZhCn
        : currentLang === 'en'
          ? tx.langNameEn
          : tx.langNameZhTw;
  const walletBound = WALLET.isWalletBound(user.id);
  const walletData = WALLET.getWalletData(user.id);
  const walletStatus = walletBound
    ? tx.walletBound(walletData?.walletAddress || 'unknown')
    : tx.walletUnbound;
  
  if (player?.activeMessageId) {
    await disableMessageComponents(interaction.channel, player.activeMessageId);
  }
  
  const embed = new EmbedBuilder()
    .setTitle(tx.title)
    .setColor(0x0099ff)
    .setDescription(tx.desc)
    .addFields(
      { name: tx.fieldLanguage, value: `${tx.currentPrefix}${langName}`, inline: false },
      { name: tx.fieldWallet, value: walletStatus, inline: false },
      { name: tx.fieldWorldIntro, value: introPreview, inline: false }
    );
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lang_zh-TW').setLabel('🇹🇼 繁體中文').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('lang_zh-CN').setLabel('🇨🇳 簡體中文').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('lang_en').setLabel('🇺🇸 English').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(walletBound ? 'sync_wallet_now' : 'open_wallet_modal')
      .setLabel(walletBound ? tx.btnSyncWallet : tx.btnBindWallet)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('settings_back').setLabel(tx.btnBack).setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_renaiss_world').setLabel(tx.btnWorld).setStyle(ButtonStyle.Success)
  );

  await interaction.update({ embeds: [embed], components: [row, row2] });
}

async function showRenaissWorldGuide(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const lang = getPlayerUILang(player);
  const tx = getSettingsText(lang);
  const intro = getWorldIntroTemplate(lang);

  const title = tx.worldTitle;
  const desc = `${intro}\n\n${tx.worldDescSuffix}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x2f855a)
    .setDescription(desc);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('world_back_settings').setLabel(tx.btnBackSettings).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('settings_back').setLabel(tx.btnBackAdventure).setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

// ============== 玩家檔案 ==============
async function showProfile(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  
  const profile = GACHA.getPlayerProfile(player);
  const uiLang = getPlayerUILang(player);
  const gachaConfig = GACHA.GACHA_CONFIG;
  const petCapacity = getPetCapacityForUser(user.id);
  const walletBound = WALLET.isWalletBound(user.id);
  const walletData = WALLET.getWalletData(user.id);
  const walletStatus = walletBound
    ? `已綁定：\`${walletData?.walletAddress || 'unknown'}\``
    : '未綁定（可立即補綁並同步資產）';
  
  const petsList = profile.pets.map(p => 
    `**${p.name}** (${p.type})\n` +
    `  HP: ${p.hp}/${p.maxHp} (+0)| ATK: ${p.attack}\n` +
    `  招式: ${p.moves.join(', ')}`
  ).join('\n\n') || '無寵物';
  
  const embed = new EmbedBuilder()
    .setTitle(`💳 ${player.name} 的檔案`)
    .setColor(0x0099ff)
    .setDescription('Renaiss星球冒險者檔案')
    .addFields(
      { name: '💰 現金 Rns 代幣', value: String(profile.rns), inline: true },
      { name: '📊 總資產', value: String(profile.totalAssets), inline: true },
      { name: '⭐ 升級點數', value: `${profile.upgradePoints} 點 (每點+${gachaConfig.hpPerPoint}HP)`, inline: true }
    )
    .addFields(
      { name: '📦 已開包數', value: `${profile.totalDraws} 包`, inline: true },
      { name: '🐾 寵物', value: String(profile.currentPets), inline: true },
      { name: '📍 位置', value: player.location, inline: true }
    )
    .addFields(
      { name: '📦 卡片 FMV', value: `$${petCapacity.cardFMV.toFixed(2)} USD（${petCapacity.cardCount} 張）`, inline: true },
      { name: '🐾 寵物額度', value: `${petCapacity.currentPets}/${petCapacity.maxPets}`, inline: true },
      { name: '🆕 可領取', value: `${petCapacity.availableSlots} 隻`, inline: true }
    )
    .addFields({ name: '📏 額度規則', value: '>100U 可 2 隻｜>1000U 可 3 隻', inline: false })
    .addFields({ name: '💳 錢包', value: walletStatus, inline: false })
    .addFields({ name: '🐾 寵物列表', value: petsList, inline: false });
  
  const rows = [];
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(walletBound ? 'sync_wallet_now' : 'open_wallet_modal')
      .setLabel(walletBound ? '🔄 同步資產' : '💳 綁定錢包')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('open_friends').setLabel('🤝 好友').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_moves').setLabel('🐾 寵物').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_gacha').setLabel('🎰 去開包').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel('返回').setStyle(ButtonStyle.Secondary)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_new_pet_start')
      .setLabel(`🆕 領取新寵物（剩${petCapacity.availableSlots}）`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(petCapacity.availableSlots <= 0),
    new ButtonBuilder()
      .setCustomId('show_memory_recap')
      .setLabel(uiLang === 'en' ? '🧠 Memory Recap' : (uiLang === 'zh-CN' ? '🧠 记忆回顾' : '🧠 記憶回顧'))
      .setStyle(ButtonStyle.Secondary)
  ));
  
  await interaction.update({ embeds: [embed], components: rows });
}

// ============== 扭蛋選單 ==============
async function showGacha(interaction, user, notice = '') {
  const player = CORE.loadPlayer(user.id);
  
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  
  const config = GACHA.GACHA_CONFIG;
  const profile = GACHA.getPlayerProfile(player);
  const currentRns = Math.max(0, Number(profile?.rns || player?.stats?.財富 || 0));
  
  const embed = new EmbedBuilder()
    .setTitle('🎰 招式扭蛋機')
    .setColor(0xffd700)
    .setDescription(`${notice ? `⚠️ ${notice}\n\n` : ''}花費 Rns 代幣 抽招式！\n目前持有：**${currentRns} Rns**`)
    .addFields(
      { name: '💰 單抽', value: `${config.singleCost} Rns 代幣 (1包)`, inline: true },
      { name: '💰 十連', value: `${config.tenPullCost} Rns 代幣 (10包)`, inline: true },
      { name: '💳 目前持有', value: `${currentRns} Rns`, inline: true }
    )
    .addFields(
      { name: '⭐ 升級點數', value: `${profile.upgradePoints} 點`, inline: true },
      { name: '📊 已開包數', value: `${profile.totalDraws} 包`, inline: true },
      { name: '💡 每點可換', value: `${config.hpPerPoint} HP`, inline: true }
    )
    .addFields({ name: '💡 說明', value: '每開1包 = 1升級點數\n每點 = 0.2 HP（可分配給不同寵物）\n可分配給任何寵物，用完就沒了', inline: false });
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gacha_single').setLabel(`單抽 ${config.singleCost}｜餘額 ${currentRns}`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('gacha_ten').setLabel(`十連 ${config.tenPullCost}｜餘額 ${currentRns}`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('main_menu').setLabel('返回').setStyle(ButtonStyle.Secondary)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
}

// ============== 處理扭蛋結果 ==============
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildSlotReels(isJackpot) {
  const normalPool = ['🍒', '🍋', '🍇', '🔔', '🍀', '⭐', '🪙', '🎲'];
  const jackpotPool = ['💎', '👑', '🔮', '🌟', '7️⃣'];
  if (isJackpot) {
    const symbol = pickRandom(jackpotPool);
    return [symbol, symbol, symbol];
  }
  const reels = [pickRandom(normalPool), pickRandom(normalPool), pickRandom(normalPool)];
  // 非大獎時避免三格完全相同，讓視覺規則與 5% 大獎一致。
  while (reels[0] === reels[1] && reels[1] === reels[2]) {
    reels[2] = pickRandom(normalPool);
  }
  return reels;
}

function formatGachaSlotLine(draw, index) {
  const isJackpot = draw.tier === 3;
  const reels = buildSlotReels(isJackpot);
  const jackpotText = isJackpot ? ' → **JACKPOT!**' : '';
  return `${index + 1}. 🎰 [ ${reels[0]} | ${reels[1]} | ${reels[2]} ]${jackpotText}\n${draw.tierEmoji} **${draw.move.name}** (${draw.tierName}) - ${draw.move.desc}`;
}

function buildGachaReelLines(slotRows = [], revealCount = 0, showSkill = false) {
  return slotRows.map((row, index) => {
    const reels = Array.isArray(row?.reels) ? row.reels : ['❔', '❔', '❔'];
    const a = revealCount >= 1 ? reels[0] : '❔';
    const b = revealCount >= 2 ? reels[1] : '❔';
    const c = revealCount >= 3 ? reels[2] : '❔';
    const jackpotText = row?.draw?.tier === 3 && revealCount >= 3 ? ' → **JACKPOT!**' : '';
    const skillText = showSkill
      ? `${row.draw.tierEmoji} **${row.draw.move.name}** (${row.draw.tierName}) - ${row.draw.move.desc}`
      : '🎁 技能揭曉中...';
    return `${index + 1}. 🎰 [ ${a} | ${b} | ${c} ]${jackpotText}\n${skillText}`;
  }).join('\n\n');
}

async function handleGachaResult(interaction, user, count) {
  const player = CORE.loadPlayer(user.id);
  
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  
  const result = GACHA.drawMove(player, count);
  
  if (!result.success) {
    await showGacha(interaction, user, result.reason || '抽獎失敗');
    return;
  }

  if (Number(result.cost || 0) > 0) {
    recordCashflow(player, {
      amount: -Number(result.cost || 0),
      category: 'gacha_draw',
      source: `扭蛋 ${count === 10 ? '十連' : '單抽'}`,
      marketType: 'renaiss'
    });
  }

  const slotRows = result.draws.map((draw) => ({
    draw,
    reels: buildSlotReels(draw.tier === 3)
  }));
  const resultsText = buildGachaReelLines(slotRows, 3, true);

  // 本次抽到的招式先以「技能晶片」形式加入背包，之後可再學習上陣
  const gainedChips = [];
  for (const draw of result.draws) {
    if (!draw?.move?.name) continue;
    if (!Array.isArray(player.inventory)) player.inventory = [];
    const chipName = `技能晶片：${draw.move.name}`;
    player.inventory.unshift(chipName);
    gainedChips.push(chipName);
  }

  const makeSpinEmbed = (revealCount, showSkill, phaseText) => new EmbedBuilder()
    .setTitle(`🎰 開包中 x${count}`)
    .setColor(0xffd700)
    .setDescription(
      `💰 花費 ${result.cost} Rns 代幣\n` +
      `💡 拉霸規則：三格相同 = 5% 大獎（不改原本機率）\n\n` +
      `**${phaseText}**\n` +
      `${buildGachaReelLines(slotRows, revealCount, showSkill)}`
    );

  const chipSummary = gainedChips.length > 0
    ? gainedChips.join('、')
    : '（本次無新增）';

  const finalEmbed = new EmbedBuilder()
    .setTitle(`🎰 開包結果 x${count}`)
    .setColor(0xffd700)
    .setDescription(`💰 花費 ${result.cost} Rns 代幣\n💡 拉霸規則：三格相同 = 5% 大獎（不改原本機率）\n\n**開到以下招式：**\n${resultsText}\n\n**總價值：${result.totalValue} Rns 代幣**\n**⭐ 獲得升級點數：+${result.earnedPoints} 點**\n**📊 已開包數：${result.totalDraws} 包**`)
    .addFields(
      { name: '📚 本次獲取技能晶片', value: `${gainedChips.length} 枚\n${String(chipSummary).slice(0, 1000)}`, inline: false },
      { name: '📌 學習規則', value: '抽到的是技能晶片；請到「🐾 寵物」頁面用下拉選單學習/取消學習。', inline: false },
      { name: '📦 販賣規則', value: '商店掛賣時，會以「技能晶片」名稱販賣。', inline: false }
    );

  CORE.savePlayer(player);

  await interaction.update({ embeds: [makeSpinEmbed(0, false, '機台啟動中...')], components: [] });
  const spinMsg = interaction.message;
  const spinFrames = [
    { reveal: 1, wait: 280, text: '第一格揭曉...' },
    { reveal: 2, wait: 280, text: '第二格揭曉...' },
    { reveal: 3, wait: 280, text: '第三格揭曉...' }
  ];
  for (const frame of spinFrames) {
    await new Promise((resolve) => setTimeout(resolve, frame.wait));
    if (spinMsg?.edit) {
      await spinMsg.edit({ embeds: [makeSpinEmbed(frame.reveal, false, frame.text)], components: [] }).catch(() => {});
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const rowAction = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_gacha').setLabel('繼續抽').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_moves').setLabel('🐾 前往寵物').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel('返回主選單').setStyle(ButtonStyle.Primary)
  );
  const finalRows = [rowAction];

  if (spinMsg?.edit) {
    await spinMsg.edit({ embeds: [finalEmbed], components: finalRows }).catch(async () => {
      await interaction.followUp({ embeds: [finalEmbed], components: finalRows }).catch(() => {});
    });
    return;
  }
  await interaction.followUp({ embeds: [finalEmbed], components: finalRows }).catch(() => {});
}

// ============== 分配 HP ==============
async function handleAllocateHP(interaction, user, petId, amountInput = 1) {
  const player = CORE.loadPlayer(user.id);
  
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }

  const pet = PET.getPetById(petId);
  if (!pet || String(pet.ownerId || '') !== String(user.id || '')) {
    await showMovesList(interaction, user, petId, '⚠️ 找不到可加點的寵物。');
    return;
  }

  const remain = Math.max(0, Number(player?.upgradePoints || 0));
  let amount = 1;
  if (String(amountInput || '').toLowerCase() === 'max') {
    amount = remain;
  } else {
    const parsed = Math.floor(Number(amountInput || 1));
    amount = Number.isFinite(parsed) ? parsed : 1;
  }
  amount = Math.max(1, amount);
  if (remain <= 0) {
    await showMovesList(interaction, user, petId, '⚠️ 升級點數不足。');
    return;
  }
  amount = Math.min(amount, remain);
  
  const result = GACHA.allocateUpgradePoint(user.id, petId, amount);
  
  if (!result.success) {
    await showMovesList(interaction, user, petId, `⚠️ 升級失敗：${result.reason}`);
    return;
  }

  await showMovesList(
    interaction,
    user,
    petId,
    `✅ ${result.petName} HP +${result.hpGain}（已用 ${result.pointsUsed} 點，剩餘 ${result.remaining} 點）`
  );
}

// ============== 角色資訊 ==============
async function showCharacter(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  const uiLang = getPlayerUILang(player);
  
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  
  const mentorRecord = ensureMentorSparRecord(player);
  const mentorCompleted = Object.values(mentorRecord?.completedByMentor || {});
  const mentorCount = mentorCompleted.length;
  const mentorPreview = mentorCompleted
    .slice(-3)
    .map((row) => String(row?.mentorName || row?.mentorId || '未知導師'))
    .filter(Boolean)
    .join('、') || '尚未完成';

  const embed = new EmbedBuilder()
    .setTitle(`👤 ${player.name}`)
    .setColor(getPetElementColor(player.petElement || pet?.type || '水'))
    .setDescription(`**${player.title}**`)
    .addFields(
      { name: '👤 性別', value: String(player.gender || '男'), inline: true },
      { name: '🐾 夥伴屬性', value: getPetElementDisplayName(player.petElement || pet?.type || '水'), inline: true },
      { name: '📍 位置', value: player.location, inline: true }
    )
    .addFields(
      { name: '📊 等級', value: String(player.level), inline: true },
      { name: '🍀 幸運值', value: String(player.stats.運氣), inline: true },
      { name: t('hp', uiLang), value: `${player.stats.生命}/${player.maxStats.生命}`, inline: true },
      { name: t('gold', uiLang), value: String(player.stats.財富), inline: true },
      { name: '🎖️ 友誼賽成就', value: `${mentorCount} 位`, inline: true },
      { name: '🧾 已完成導師', value: mentorPreview, inline: false }
    );
  
  if (pet) {
    embed.addFields(
      { name: '---寵物---', value: `**${pet.name}** (${getPetElementDisplayName(pet.type)})`, inline: false },
      { name: t('hp', uiLang), value: formatPetHpWithRecovery(pet), inline: true },
      { name: '⚔️ 攻擊', value: String(pet.attack), inline: true },
      { name: '🛡️ 防禦', value: String(pet.defense), inline: true }
    );
  }
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_profile').setLabel('💳 檔案').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('open_friends').setLabel('🤝 好友').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_finance_ledger').setLabel('💸 資金流水').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
}

function describeMoveEffects(moveOrEffect = {}) {
  const move = (moveOrEffect && typeof moveOrEffect === 'object' && moveOrEffect.effect)
    ? moveOrEffect
    : { effect: moveOrEffect || {}, tier: 1 };
  const effect = move.effect || {};
  if (!effect || typeof effect !== 'object') return '無效果';
  const getRate = (key) => {
    if (typeof BATTLE.getMoveEffectSuccessRate !== 'function') return null;
    const value = Number(BATTLE.getMoveEffectSuccessRate(move, key));
    if (!Number.isFinite(value)) return null;
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  };
  const notes = [];
  if (effect.burn) notes.push(`灼燒${effect.burn}回（每回約22%持續傷害）`);
  if (effect.poison) notes.push(`中毒${effect.poison}回（每回約16%持續傷害）`);
  if (effect.trap) notes.push(`陷阱${effect.trap}回（每回約18%持續傷害）`);
  if (effect.bleed) notes.push(`流血${effect.bleed}回（每回約24%持續傷害）`);
  if (effect.dot) notes.push(`持續干擾（2回，每回${effect.dot}）`);
  if (effect.stun) notes.push(`暈眩${effect.stun}回（命中約${getRate('stun') || '?'}，硬控有抗性）`);
  if (effect.freeze) notes.push(`凍結${effect.freeze}回（命中約${getRate('freeze') || '?'}，硬控有抗性）`);
  if (effect.bind) notes.push(`束縛${effect.bind}回（命中約${getRate('bind') || '?'}，無法逃跑）`);
  if (effect.slow) notes.push(`緩速${effect.slow}回（命中約${getRate('slow') || '?'}，輸出-20%）`);
  if (effect.fear) notes.push(`恐懼${effect.fear}回（命中約${getRate('fear') || '?'}）`);
  if (effect.confuse) notes.push(`混亂${effect.confuse}回（命中約${getRate('confuse') || '?'}）`);
  if (effect.blind) notes.push(`致盲${effect.blind}回（命中約${getRate('blind') || '?'}）`);
  if (effect.missNext) notes.push(`使對手下次攻擊落空（命中約${getRate('missNext') || '?'})`);
  if (effect.defenseDown || effect.defDown) notes.push(`降防${effect.defenseDown || effect.defDown}回（防禦約-30%）`);
  if (effect.shield) notes.push(`護盾${effect.shield}回（每次受擊減傷）`);
  if (effect.dodge) notes.push(`閃避${effect.dodge}回（約45%躲招）`);
  if (effect.reflect) notes.push(`反射${effect.reflect}回（回彈35%）`);
  if (effect.thorns) notes.push(`反刺${effect.thorns}回（回彈20%）`);
  if (effect.heal) notes.push(`治療${effect.heal}`);
  if (effect.cleanse) notes.push('淨化負面狀態');
  if (effect.drain) notes.push(`汲取回復（上限${effect.drain}）`);
  if (effect.selfDamage) notes.push(`自損${effect.selfDamage}`);
  if (effect.splash) notes.push('範圍衝擊（本擊+20%）');
  if (effect.armorBreak) notes.push('破甲（大幅降低對方防禦）');
  if (effect.ignoreResistance) notes.push('無視防禦');
  if (effect.spreadPoison) notes.push('擴散毒化（附加中毒）');
  if (effect.debuff === 'all') notes.push('全體弱化（緩速+降防+致盲）');
  if (effect.summon) notes.push(`幻像干擾${effect.summon}回（失手率上升）`);
  if (effect.flee) notes.push('逃跑技能');
  if (effect.wait) notes.push('待機蓄能（不攻擊）');
  return notes.length > 0 ? notes.join('；') : '無效果';
}

// ============== 招式列表 ==============
async function showMovesList(interaction, user, selectedPetId = '', notice = '', page = 0) {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', embeds: [], components: [] });
    return;
  }

  const ownedPets = getPlayerOwnedPets(user.id);
  if (ownedPets.length === 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Primary)
    );
    await interaction.update({ content: '❌ 沒有寵物！', embeds: [], components: [row] });
    return;
  }

  let selectedPet = ownedPets.find((p) => p.id === selectedPetId) || null;
  if (!selectedPet) {
    const defaultPet = PET.loadPet(user.id);
    selectedPet = ownedPets.find((p) => p.id === defaultPet?.id) || ownedPets[0];
  }
  if (!Array.isArray(selectedPet.moves)) selectedPet.moves = [];

  for (const pet of ownedPets) {
    normalizePetMoveLoadout(pet, true);
  }
  const selectedLoadout = normalizePetMoveLoadout(selectedPet, false);
  const selectedSet = new Set(selectedLoadout.activeMoveIds);
  const activePetResolved = resolvePlayerMainPet(player, { fallbackPet: selectedPet });
  const activePetId = String(activePetResolved?.pet?.id || player?.activePetId || '').trim();
  if (activePetResolved?.changed) CORE.savePlayer(player);
  const allChipEntries = getLearnableSkillChipEntries(player, selectedPet);
  const learnableChips = allChipEntries.filter((entry) => Boolean(entry?.canLearn));
  const allChipTotal = allChipEntries.reduce((sum, item) => sum + Number(item?.count || 0), 0);
  const learnableChipTotal = learnableChips.reduce((sum, item) => sum + Number(item?.count || 0), 0);
  const forgettableMoves = getForgettablePetMoves(selectedPet);

  const currentPage = Math.max(0, Number(page || 0));

  const unlockedMoves = (selectedPet.moves || []).map((m, i) => {
    const isFlee = Boolean(m?.effect && m.effect.flee);
    const isSelected = selectedSet.has(String(m.id || ''));
    const statusMark = isFlee ? '🏃固定' : (isSelected ? '✅攜帶' : '▫️候補');
    const dmg = BATTLE.calculatePlayerMoveDamage(m, {}, selectedPet);
    const energyCost = isFlee ? '-' : BATTLE.getMoveEnergyCost(m);
    const moveSpeed = getMoveSpeedValue(m);
    const tierEmoji = m.tier === 3 ? '🔮' : m.tier === 2 ? '💠' : '⚪';
    const tierName = m.tier === 3 ? '史詩' : m.tier === 2 ? '稀有' : '普通';
    const effectStr = describeMoveEffects(m);
    return `${tierEmoji} ${i + 1}. **${m.name}** (${m.element}/${tierName})｜${statusMark}\n   💥 ${format1(dmg.total)}dmg | ⚡${energyCost} | 🚀速度${format1(moveSpeed)} | ${effectStr || '無效果'}`;
  });

  const petSummary = ownedPets.map((pet, i) => {
    const loadout = normalizePetMoveLoadout(pet, false);
    const activeNames = loadout.activeMoves.map((m) => m.name).join('、') || '（尚未設定）';
    return `${i + 1}. **${pet.name}**（${pet.type}）\n攜帶：${loadout.activeMoves.length}/${PET_MOVE_LOADOUT_LIMIT}｜${activeNames}`;
  }).join('\n\n');

  const chipOverview = allChipEntries.length > 0
    ? allChipEntries
      .map((entry, idx) => {
        const move = entry.move || {};
        const tierEmoji = move.tier === 3 ? '🔮' : move.tier === 2 ? '💠' : '⚪';
        const tierName = move.tier === 3 ? '史詩' : move.tier === 2 ? '稀有' : '普通';
        const mark = entry.canLearn ? '✅可學' : (entry.reason === '已學會' ? '📘已學' : '🚫不可學');
        const dmg = BATTLE.calculatePlayerMoveDamage(move, {}, selectedPet);
        const energyCost = BATTLE.getMoveEnergyCost(move);
        const moveSpeed = getMoveSpeedValue(move);
        const effectStr = describeMoveEffects(move);
        return `${idx + 1}. ${tierEmoji} **${move.name}** x${entry.count}｜${mark}\n   ${move.element}/${tierName} | 💥 ${format1(dmg.total)}dmg | ⚡${energyCost} | 🚀速度${format1(moveSpeed)} | ${effectStr || '無效果'}`;
      })
    : ['（背包目前沒有技能晶片）'];

  const movePreviewPager = paginateList(unlockedMoves, 0, MOVES_DETAIL_PAGE_SIZE);
  const chipPreviewPager = paginateList(chipOverview, 0, MOVES_DETAIL_PAGE_SIZE);
  const totalPages = Math.max(
    1,
    Number(movePreviewPager?.totalPages || 1),
    Number(chipPreviewPager?.totalPages || 1)
  );
  const sharedPage = Math.max(0, Math.min(totalPages - 1, currentPage));
  const movePager = paginateList(unlockedMoves, sharedPage, MOVES_DETAIL_PAGE_SIZE);
  const moveDetailText = movePager.items.length > 0 ? movePager.items.join('\n\n') : '（無招式）';
  const chipPager = paginateList(chipOverview, sharedPage, MOVES_DETAIL_PAGE_SIZE);
  const chipDetailText = chipPager.items.length > 0 ? chipPager.items.join('\n\n') : '（背包目前沒有技能晶片）';

  const noticeLine = notice
    ? (String(notice).startsWith('✅') || String(notice).startsWith('⚠️') ? String(notice) : `✅ ${notice}`)
    : '';

  const description = [
    noticeLine,
    `**目前管理：${selectedPet.name}**（${getPetElementDisplayName(selectedPet.type)}）`,
    `學習入口：請用下拉選單「學習技能晶片」`,
    `取消學習：會退回技能晶片到背包，可拿去賣`,
    `可攜帶上陣招式：**${PET_MOVE_LOADOUT_LIMIT}**（逃跑技能固定，不占名額）`,
    `已解鎖招式：${selectedPet.moves.length}`,
    `背包晶片：${allChipTotal} 枚｜可學：${learnableChipTotal} 枚 / ${learnableChips.length} 種`,
    `升級點數：${Number(player?.upgradePoints || 0)} 點（每點 +${Number(GACHA?.GACHA_CONFIG?.hpPerPoint || 0.2)} HP，可批量）`,
    `主上場寵物：${activePetResolved?.pet?.name || selectedPet.name}`
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`🐾 寵物管理`)
    .setColor(getPetElementColor(selectedPet.type))
    .setDescription(description)
    .addFields(
      { name: `🧭 ${selectedPet.name} 招式清單（第 ${movePager.page + 1}/${movePager.totalPages} 頁）`, value: moveDetailText.slice(0, 1024), inline: false },
      { name: `🎒 可學習技能晶片（第 ${chipPager.page + 1}/${chipPager.totalPages} 頁）`, value: chipDetailText.slice(0, 1024), inline: false },
      { name: '🐾 全寵物攜帶總覽', value: petSummary.slice(0, 1024), inline: false }
    );

  const petSelectOptions = ownedPets.slice(0, 25).map((pet) => {
    const loadout = normalizePetMoveLoadout(pet, false);
    return {
      label: `${pet.name}`.slice(0, 100),
      description: `攜帶 ${loadout.activeMoves.length}/${PET_MOVE_LOADOUT_LIMIT} 招`,
      value: pet.id,
      default: pet.id === selectedPet.id
    };
  });
  const petSelect = new StringSelectMenuBuilder()
    .setCustomId('moves_pet_select')
    .setPlaceholder('選擇要管理的寵物')
    .addOptions(petSelectOptions);
  const rowPetSelect = new ActionRowBuilder().addComponents(petSelect);

  let rowLearnChip = null;
  if (learnableChips.length > 0) {
    const learnOptions = learnableChips.slice(0, 25).map((entry) => {
      const move = entry.move || {};
      const tierText = move.tier === 3 ? '史詩' : move.tier === 2 ? '稀有' : '普通';
      const dmg = BATTLE.calculatePlayerMoveDamage(move, {}, selectedPet);
      const energyCost = BATTLE.getMoveEnergyCost(move);
      const moveSpeed = getMoveSpeedValue(move);
      const effectShort = String(describeMoveEffects(move) || '無效果').replace(/；/g, '/').slice(0, 44);
      return {
        label: `${move.name}`.slice(0, 100),
        description: `${move.element || '未知'}/${tierText}｜${format1(dmg.total)}dmg⚡${energyCost}🚀${format1(moveSpeed)}｜${effectShort}`.slice(0, 100),
        value: `${selectedPet.id}::${move.id}`
      };
    });
    rowLearnChip = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('moves_learn_chip')
        .setPlaceholder(`學習技能晶片（${learnableChipTotal} 枚）`)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(learnOptions)
    );
  }

  let rowUnlearnChip = null;
  if (forgettableMoves.length > 0) {
    const unlearnOptions = forgettableMoves.slice(0, 25).map((move) => ({
      label: `${move.name}`.slice(0, 100),
      description: `取消後會退回技能晶片`.slice(0, 100),
      value: `${selectedPet.id}::${move.id}`
    }));
    rowUnlearnChip = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('moves_unlearn_chip')
        .setPlaceholder('取消學習（退回技能晶片）')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(unlearnOptions)
    );
  }

  const attackMoves = getPetAttackMoves(selectedPet);
  let rowMoveAssign = null;
  if (attackMoves.length > 0) {
    const moveOptions = attackMoves.slice(0, 25).map((m) => ({
      label: `${m.name}`.slice(0, 100),
      description: `${m.element}/${m.tier === 3 ? '史詩' : m.tier === 2 ? '稀有' : '普通'}｜${format1(BATTLE.calculatePlayerMoveDamage(m, {}, selectedPet).total)}dmg⚡${BATTLE.getMoveEnergyCost(m)}🚀${format1(getMoveSpeedValue(m))}｜${String(describeMoveEffects(m) || '無效果').replace(/；/g, '/').slice(0, 34)}`.slice(0, 100),
      value: `${selectedPet.id}::${m.id}`,
      default: selectedSet.has(String(m.id || ''))
    }));
    const moveSelect = new StringSelectMenuBuilder()
      .setCustomId('moves_assign')
      .setPlaceholder(`為 ${selectedPet.name} 選擇上陣招式（1~${PET_MOVE_LOADOUT_LIMIT}）`)
      .setMinValues(1)
      .setMaxValues(Math.min(PET_MOVE_LOADOUT_LIMIT, moveOptions.length))
      .addOptions(moveOptions);
    rowMoveAssign = new ActionRowBuilder().addComponents(moveSelect);
  }

  const remainPoints = Math.max(0, Number(player?.upgradePoints || 0));
  const hpPerPoint = Number(GACHA?.GACHA_CONFIG?.hpPerPoint || 0.2);
  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`moves_page_prev_${selectedPet.id}_${movePager.page}`)
      .setLabel('⬅️ 上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(sharedPage <= 0),
    new ButtonBuilder()
      .setCustomId(`moves_page_next_${selectedPet.id}_${movePager.page}`)
      .setLabel('➡️ 下一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(sharedPage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`set_main_pet_${selectedPet.id}`)
      .setLabel(activePetId === String(selectedPet.id) ? '✅ 主上場' : '🎯 設主上場')
      .setStyle(activePetId === String(selectedPet.id) ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(activePetId === String(selectedPet.id)),
    new ButtonBuilder().setCustomId('open_profile').setLabel('💳 檔案').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
  );

  const rowAllocate = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`alloc_hp_${selectedPet.id}_1`)
      .setLabel(`❤️ +1（+${hpPerPoint}）`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(remainPoints <= 0),
    new ButtonBuilder()
      .setCustomId(`alloc_hp_${selectedPet.id}_5`)
      .setLabel(`❤️ +5`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(remainPoints <= 0),
    new ButtonBuilder()
      .setCustomId(`alloc_hp_${selectedPet.id}_10`)
      .setLabel(`❤️ +10`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(remainPoints <= 0),
    new ButtonBuilder()
      .setCustomId(`alloc_hp_${selectedPet.id}_max`)
      .setLabel(`❤️ 全加（剩${remainPoints}）`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(remainPoints <= 0)
  );

  // Discord 訊息元件最多 5 列；若超過會導致 update 失敗並看起來像「按鈕消失」。
  // 保留優先順序：寵物切換 > 上陣招式 > 學習晶片 > HP加點 > 取消學習 > 返回按鈕。
  const components = [rowPetSelect];
  const optionalRows = [rowMoveAssign, rowLearnChip, rowAllocate, rowUnlearnChip].filter(Boolean);
  for (const row of optionalRows) {
    if (components.length >= 4) break; // 保留最後一列 rowButtons（總列數 <= 5）
    components.push(row);
  }
  components.push(rowButtons);
  const payload = { embeds: [embed], content: null, components };
  try {
    await updateInteractionMessage(interaction, payload);
  } catch (err) {
    console.error('[Moves] show list update failed:', err?.message || err);
    if (interaction?.message?.edit) {
      const edited = await interaction.message.edit(payload).then(() => true).catch(() => false);
      if (edited) return;
    }
    if (interaction?.channel?.send) {
      await interaction.channel.send(payload).catch(() => {});
    }
  }
}

function recordCashflow(player, entry = {}) {
  if (!player || typeof player !== 'object') return;
  if (typeof ECON.appendFinanceLedger !== 'function') return;
  ECON.appendFinanceLedger(player, entry);
}

function buildFinanceLedgerText(player, limit = 20) {
  const rows = Array.isArray(player?.financeLedger)
    ? player.financeLedger.slice(0, Math.max(1, Math.min(40, Number(limit) || 20)))
    : [];
  if (rows.length === 0) return '（尚無資金流水）';
  return rows.map((row, idx) => {
    const sign = Number(row?.amount || 0) > 0 ? '+' : '';
    const source = String(row?.source || row?.category || '資金異動').slice(0, 56);
    const bal = Number(row?.balanceAfter || 0);
    return `${idx + 1}. ${sign}${Number(row?.amount || 0)} Rns｜${source}｜餘額 ${bal}`;
  }).join('\n');
}

function buildMemoryAuditRows(player, limit = 24) {
  if (!player || typeof CORE.getPlayerMemoryAudit !== 'function') return [];
  const rows = CORE.getPlayerMemoryAudit(player.id, { limit: Math.max(1, Math.min(60, Number(limit) || 24)) });
  return Array.isArray(rows) ? rows : [];
}

function buildMemoryAuditText(rows = [], lang = 'zh-TW') {
  if (!Array.isArray(rows) || rows.length === 0) {
    return lang === 'en'
      ? '(No memory records yet)'
      : lang === 'zh-CN'
        ? '（目前没有记忆流水）'
        : '（目前沒有記憶流水）';
  }
  return rows.map((row, idx) => {
    const turn = Math.max(0, Number(row?.turn || 0));
    const category = String(row?.category || '一般記憶');
    const reason = String(row?.reason || '系統判定需保留').slice(0, 44);
    const content = String(row?.content || '').slice(0, 56) || '（空白）';
    const outcome = String(row?.outcome || '').trim();
    const outcomeText = outcome ? ` -> ${outcome.slice(0, 36)}` : '';
    return `${idx + 1}. [T${turn}]【${category}】${content}${outcomeText}\n　└ 理由：${reason}`;
  }).join('\n');
}

async function showFinanceLedger(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const ledgerText = buildFinanceLedgerText(player, 20);
  const notices = Array.isArray(player.financeNotices) ? player.financeNotices.slice(0, 5) : [];
  const noticeText = notices.length > 0 ? notices.map((n, i) => `${i + 1}. ${n}`).join('\n') : '（目前無未讀）';

  const embed = new EmbedBuilder()
    .setTitle('💸 資金流水')
    .setColor(0x1f9d55)
    .setDescription('以下為你最近的收入與支出紀錄。')
    .addFields(
      { name: '💰 目前 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: false },
      { name: '📬 未讀金流通知', value: noticeText.slice(0, 1024), inline: false },
      { name: '📒 最近 20 筆流水', value: ledgerText.slice(0, 1024), inline: false }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒 返回背包').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel('返回主選單').setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

async function showMemoryAudit(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  const uiLang = getPlayerUILang(player);
  const rows = buildMemoryAuditRows(player, 24);
  const auditText = buildMemoryAuditText(rows, uiLang);
  const categoryCount = {};
  for (const row of rows) {
    const key = String(row?.category || '一般記憶');
    categoryCount[key] = Number(categoryCount[key] || 0) + 1;
  }
  const categorySummary = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => `${name}x${count}`)
    .join('、') || (uiLang === 'en' ? 'No records' : (uiLang === 'zh-CN' ? '暂无记录' : '暫無記錄'));

  const title = uiLang === 'en' ? '🧠 Memory Audit' : (uiLang === 'zh-CN' ? '🧠 记忆检查' : '🧠 記憶檢查');
  const desc = uiLang === 'en'
    ? 'Detailed log of what was written into memory each turn and why.'
    : (uiLang === 'zh-CN'
      ? '查看每回合写入记忆的内容，以及为何被判定需要保留。'
      : '查看每回合寫入記憶的內容，以及為何被判定需要保留。');
  const streamTitle = uiLang === 'en' ? 'Recent 24 Records' : (uiLang === 'zh-CN' ? '最近24笔流水' : '最近24筆流水');
  const descBody =
    `${desc}\n\n` +
    `${uiLang === 'en' ? '📊 Category Summary' : (uiLang === 'zh-CN' ? '📊 類別分佈' : '📊 類別分佈')}：${categorySummary}\n\n` +
    `📒 ${streamTitle}\n${auditText}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x2563eb)
    .setDescription(descBody.slice(0, 3950));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel(uiLang === 'en' ? 'Back to Menu' : (uiLang === 'zh-CN' ? '返回主选单' : '返回主選單')).setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

async function showMemoryRecap(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }

  const uiLang = getPlayerUILang(player);
  const tx = getMemoryRecapText(uiLang);

  // 先即時更新成 loading，避免按鈕互動逾時。
  const loadingEmbed = new EmbedBuilder()
    .setTitle(tx.title)
    .setColor(0x3b82f6)
    .setDescription(tx.loading);
  const loadingRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_profile').setLabel(tx.backProfile).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(tx.backMenu).setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [loadingEmbed], components: [loadingRow] }).catch(() => {});

  const currentStory = String(player?.currentStory || '').trim();
  const historyStories = Array.isArray(player?.generationHistory)
    ? player.generationHistory
      .slice(-10)
      .map((item) => String(item?.story || '').trim())
      .filter(Boolean)
      .slice(-5)
    : [];

  if (!currentStory && historyStories.length === 0) {
    const emptyEmbed = new EmbedBuilder()
      .setTitle(tx.title)
      .setColor(0x3b82f6)
      .setDescription(tx.noStory);
    const emptyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_profile').setLabel(tx.backProfile).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('main_menu').setLabel(tx.backMenu).setStyle(ButtonStyle.Secondary)
    );
    await updateInteractionMessage(interaction, { embeds: [emptyEmbed], components: [emptyRow] });
    return;
  }

  let memoryContext = '';
  try {
    memoryContext = await CORE.getPlayerMemoryContextAsync(player.id, {
      location: player.location,
      queryText: [
        `玩家:${player.name || ''}`,
        `地點:${player.location || ''}`,
        `前情:${currentStory || ''}`
      ].join('\n'),
      topK: 8
    });
  } catch (e) {
    console.log('[MemoryRecap] context failed:', e?.message || e);
    memoryContext = '';
  }

  const recentAuditRows = buildMemoryAuditRows(player, 10);
  const recentActions = recentAuditRows
    .slice(0, 8)
    .map((row) => {
      const content = String(row?.content || '').trim();
      const outcome = String(row?.outcome || '').trim();
      if (!content) return '';
      return outcome ? `${content} -> ${outcome}` : content;
    })
    .filter(Boolean);

  let recapText = '';
  let usedFallback = false;
  try {
    recapText = await STORY.generatePlayerMemoryRecap(player, {
      currentStory,
      memoryContext,
      recentStories: historyStories,
      recentActions
    });
  } catch (e) {
    console.log('[MemoryRecap] AI failed:', e?.message || e);
    usedFallback = true;
    recapText = '';
  }

  if (!recapText) {
    usedFallback = true;
    const fallbackParts = [];
    if (currentStory) fallbackParts.push(`目前主軸：${currentStory.slice(0, 240)}${currentStory.length > 240 ? '...' : ''}`);
    if (memoryContext) fallbackParts.push(memoryContext.slice(0, 900));
    if (recentActions.length > 0) fallbackParts.push(`近期行動：${recentActions.slice(0, 5).join('；')}`);
    recapText = fallbackParts.join('\n\n').trim() || tx.noStory;
  }

  const embed = new EmbedBuilder()
    .setTitle(tx.title)
    .setColor(0x3b82f6)
    .setDescription(`${usedFallback ? `${tx.fallbackHint}\n\n` : ''}${String(recapText).slice(0, 3900)}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_profile').setLabel(tx.backProfile).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(tx.backMenu).setStyle(ButtonStyle.Secondary)
  );

  await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
}

function parseMarketTypeFromCustomId(customId = '', fallback = 'renaiss') {
  if (String(customId || '').includes('_digital')) return 'digital';
  if (String(customId || '').includes('_renaiss')) return 'renaiss';
  return fallback === 'digital' ? 'digital' : 'renaiss';
}

function parseMarketAndPageFromCustomId(customId = '', prefix = '', fallbackMarket = 'renaiss') {
  const raw = String(customId || '');
  const body = prefix && raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  const matched = body.match(/^(renaiss|digital)(?:_(\d+))?$/i);
  if (!matched) {
    return { marketType: fallbackMarket === 'digital' ? 'digital' : 'renaiss', page: 0 };
  }
  const marketType = String(matched[1] || fallbackMarket).toLowerCase() === 'digital' ? 'digital' : 'renaiss';
  const page = Math.max(0, Number(matched[2] || 0));
  return { marketType, page };
}

function paginateList(list = [], page = 0, pageSize = 6) {
  const source = Array.isArray(list) ? list : [];
  const size = Math.max(1, Number(pageSize || 6));
  const totalPages = Math.max(1, Math.ceil(source.length / size));
  const safePage = Math.max(0, Math.min(totalPages - 1, Number(page || 0)));
  const start = safePage * size;
  return {
    items: source.slice(start, start + size),
    page: safePage,
    totalPages,
    total: source.length,
    start
  };
}

function buildPagedFieldChunks(lines = [], maxLen = 1000, emptyText = '（空）') {
  const entries = Array.isArray(lines)
    ? lines.map((line) => String(line ?? '')).filter((line) => line.length > 0)
    : [];
  if (entries.length <= 0) return [String(emptyText || '（空）')];

  const chunks = [];
  let current = '';
  const hardLimit = Math.max(120, Number(maxLen || 1000));

  const appendLine = (line) => {
    if (!line) return;
    if (!current) {
      current = line;
      return;
    }
    if (current.length + 1 + line.length <= hardLimit) {
      current += `\n${line}`;
      return;
    }
    chunks.push(current);
    current = line;
  };

  for (const rawLine of entries) {
    if (rawLine.length <= hardLimit) {
      appendLine(rawLine);
      continue;
    }
    // 單行過長時切段，避免超過 Discord 欄位上限
    let remain = rawLine;
    let seg = 0;
    while (remain.length > 0) {
      const room = Math.max(24, hardLimit - (seg > 0 ? 3 : 0));
      const part = remain.slice(0, room);
      const line = seg > 0 ? `↪ ${part}` : part;
      appendLine(line);
      remain = remain.slice(room);
      seg += 1;
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [String(emptyText || '（空）')];
}

function buyShopCrystal(player, pet, marketType = 'renaiss', crystalType = 'heal') {
  const safeType = crystalType === 'energy' ? 'energy' : 'heal';
  const isDigital = marketType === 'digital';
  const cost = safeType === 'energy' ? SHOP_ENERGY_CRYSTAL_COST : SHOP_HEAL_CRYSTAL_COST;
  const currentGold = Math.max(0, Number(player?.stats?.財富 || 0));
  if (currentGold < cost) {
    return {
      success: false,
      reason: `❌ Rns 不足，購買${safeType === 'energy' ? '回能水晶' : '回血水晶'}需要 ${cost} Rns。`
    };
  }

  player.stats.財富 = Math.max(0, currentGold - cost);
  const effectFailed = isDigital && Math.random() < DIGITAL_CRYSTAL_EFFECT_FAIL_RATE;
  const marketLabel = getMarketTypeLabel(marketType);

  recordCashflow(player, {
    amount: -cost,
    category: safeType === 'energy' ? 'shop_energy_crystal' : 'shop_heal_crystal',
    source: `${marketLabel} 購買${safeType === 'energy' ? '回能水晶' : '回血水晶'}`,
    marketType
  });

  if (effectFailed) {
    rememberPlayer(player, {
      type: '商店',
      content: `在${marketLabel}購買${safeType === 'energy' ? '回能水晶' : '回血水晶'}`,
      outcome: '水晶脈衝紊亂，這次未產生效果',
      importance: 1,
      tags: ['shop', marketType, 'crystal', 'effect_failed']
    });
    return {
      success: true,
      cost,
      effectFailed: true,
      message: `你購買了${safeType === 'energy' ? '回能水晶' : '回血水晶'}，但水晶脈衝紊亂，這次沒有產生效果。`
    };
  }

  if (safeType === 'energy') {
    if (!player.stats || typeof player.stats !== 'object') player.stats = {};
    if (!player.maxStats || typeof player.maxStats !== 'object') player.maxStats = {};
    const before = Math.max(0, Number(player.stats.能量 || 0));
    const maxEnergy = Math.max(1, Number(player.maxStats.能量 || 100));
    const after = Math.min(maxEnergy, before + SHOP_ENERGY_CRYSTAL_RECOVER);
    player.stats.能量 = after;
    const gain = Math.max(0, after - before);
    rememberPlayer(player, {
      type: '商店',
      content: `在${marketLabel}購買回能水晶`,
      outcome: gain > 0 ? `能量恢復 +${gain}` : '能量已滿，無需恢復',
      importance: gain > 0 ? 2 : 1,
      tags: ['shop', marketType, 'energy_crystal']
    });
    return {
      success: true,
      cost,
      effectFailed: false,
      message: gain > 0
        ? `回能水晶生效：能量 +${gain}（${after}/${maxEnergy}）。`
        : `回能水晶生效：目前能量已滿（${after}/${maxEnergy}）。`
    };
  }

  const targetPet = pet && typeof pet === 'object' ? pet : null;
  if (!targetPet) {
    rememberPlayer(player, {
      type: '商店',
      content: `在${marketLabel}購買回血水晶`,
      outcome: '未找到寵物，無法作用',
      importance: 1,
      tags: ['shop', marketType, 'heal_crystal', 'no_pet']
    });
    return {
      success: true,
      cost,
      effectFailed: false,
      message: '你購買了回血水晶，但目前沒有可恢復的寵物對象。'
    };
  }

  const beforeHp = Math.max(0, Number(targetPet.hp || 0));
  const maxHp = Math.max(1, Number(targetPet.maxHp || 100));
  const afterHp = Math.min(maxHp, beforeHp + SHOP_HEAL_CRYSTAL_RECOVER);
  targetPet.hp = afterHp;
  const gain = Math.max(0, afterHp - beforeHp);
  rememberPlayer(player, {
    type: '商店',
    content: `在${marketLabel}購買回血水晶`,
    outcome: gain > 0 ? `${targetPet.name || '寵物'} 回復 +${gain} HP` : `${targetPet.name || '寵物'} 已滿血`,
    importance: gain > 0 ? 2 : 1,
    tags: ['shop', marketType, 'heal_crystal']
  });
  return {
    success: true,
    cost,
    effectFailed: false,
    message: gain > 0
      ? `回血水晶生效：${targetPet.name || '寵物'} 回復 +${gain} HP（${afterHp}/${maxHp}）。`
      : `回血水晶生效：${targetPet.name || '寵物'} 目前已滿血（${afterHp}/${maxHp}）。`
  };
}

function buildMarketListingLine(listing = {}, idx = 0) {
  const qty = Math.max(1, Number(listing?.quantity || 1));
  const unitPrice = Math.max(1, Number(listing?.unitPrice || 0));
  const total = Math.max(1, Number(listing?.totalPrice || qty * unitPrice));
  const owner = String(listing?.ownerName || '匿名玩家');
  const note = String(listing?.note || '').trim();
  const noteText = note ? `｜備註:${note}` : '';
  const line = `${idx + 1}. ${listing.itemName} x${qty}｜單價 ${unitPrice}｜總價 ${total}｜掛單:${owner}${noteText}`;
  return line.length > 180 ? `${line.slice(0, 177)}...` : line;
}

async function showPlayerMarketMenu(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const marketLabel = getMarketTypeLabel(safeMarket);
  const openSell = ECON.getMarketListingsView({ marketType: safeMarket, type: 'sell', limit: 40 }).length;
  const myOpen = ECON.getMarketListingsView({ marketType: safeMarket, type: 'sell', ownerId: user.id, limit: 80 }).length;
  const desc = [
    notice ? `✅ ${notice}` : '',
    `你目前在 **${marketLabel}（背包視圖）**。`,
    '這裡可隨時查看市場、購買商品、撤下自己的掛單。',
    '若要新增掛賣，請在劇情中進入商店後操作。',
    `市集賣單：${openSell} 筆｜你目前掛單 ${myOpen} 筆`
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`🏪 玩家鑑價站｜${marketLabel}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(desc)
    .addFields(
      { name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true },
      { name: '📍 位置', value: `${player.location}`, inline: true }
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pmkt_view_sell_${safeMarket}`).setLabel('🛒 買商品').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`pmkt_my_${safeMarket}`).setLabel('📌 我的掛單').setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_finance_ledger').setLabel('💸 資金流水').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒 返回背包').setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function showPlayerMarketListings(interaction, user, marketType = 'renaiss', page = 0) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const stockInfo = getTeleportDeviceStockInfo(player);
  const allListings = ECON.getMarketListingsView({
    marketType: safeMarket,
    type: 'sell',
    excludeOwnerId: user.id,
    limit: 500
  });
  const pager = paginateList(allListings, page, MARKET_LIST_PAGE_SIZE);
  const listings = pager.items;
  const title = '🛒 可購買賣單';
  const listText = listings.length > 0
    ? listings.map((l, i) => buildMarketListingLine(l, pager.start + i)).join('\n')
    : '（目前沒有可成交掛單）';

  const embed = new EmbedBuilder()
    .setTitle(`${title}｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(`${listText}\n\n頁數：${pager.page + 1}/${pager.totalPages}｜總筆數：${pager.total}`);

  const rows = [];
  if (listings.length > 0) {
    const selectOptions = listings.slice(0, 25).map((listing, idx) => {
      const itemName = String(listing.itemName || '商品');
      const qty = Math.max(1, Number(listing.quantity || 1));
      const unitPrice = Math.max(1, Number(listing.unitPrice || 0));
      return {
        label: `${idx + 1}. ${itemName}`.slice(0, 100),
        description: `x${qty}｜單價 ${unitPrice} Rns｜下拉選購`.slice(0, 100),
        value: `pmktbuy_${String(listing.id || '').trim()}`
      };
    });
    const select = new StringSelectMenuBuilder()
      .setCustomId(`pmkt_buy_select_${safeMarket}`)
      .setPlaceholder('下拉選擇要購買的商品')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(selectOptions);
    rows.push(new ActionRowBuilder().addComponents(select));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pmkt_view_sell_${safeMarket}_${Math.max(0, pager.page - 1)}`)
      .setLabel('⬅️ 上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page <= 0),
    new ButtonBuilder()
      .setCustomId(`pmkt_view_sell_${safeMarket}_${Math.min(pager.totalPages - 1, pager.page + 1)}`)
      .setLabel('➡️ 下一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page >= pager.totalPages - 1)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pmkt_open_${safeMarket}`).setLabel('返回鑑價站').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒 返回背包').setStyle(ButtonStyle.Secondary)
  ));

  await interaction.update({ embeds: [embed], components: rows });
}

async function showMyMarketListings(interaction, user, marketType = 'renaiss', page = 0) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const allMine = ECON.getMarketListingsView({ marketType: safeMarket, type: 'sell', ownerId: user.id, limit: 500 });
  const pager = paginateList(allMine, page, MARKET_LIST_PAGE_SIZE);
  const mine = pager.items;

  const text = mine.length > 0
    ? mine.map((l, i) => `${pager.start + i + 1}. ${l.itemName} x${l.quantity}｜單價 ${l.unitPrice}｜總價 ${l.totalPrice}`).join('\n')
    : '（你目前沒有掛單）';

  const embed = new EmbedBuilder()
    .setTitle(`📌 我的掛單｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(`${text}\n\n頁數：${pager.page + 1}/${pager.totalPages}｜總筆數：${pager.total}`);

  const cancelButtons = mine.slice(0, 3).map((listing) =>
    new ButtonBuilder()
      .setCustomId(`pmkt_cancel_${listing.id}`)
      .setLabel(`取消 ${String(listing.itemName || '掛單').slice(0, 12)}`)
      .setStyle(ButtonStyle.Danger)
  );

  const rows = [];
  if (cancelButtons.length > 0) rows.push(new ActionRowBuilder().addComponents(cancelButtons));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pmkt_my_${safeMarket}_${Math.max(0, pager.page - 1)}`)
      .setLabel('⬅️ 上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page <= 0),
    new ButtonBuilder()
      .setCustomId(`pmkt_my_${safeMarket}_${Math.min(pager.totalPages - 1, pager.page + 1)}`)
      .setLabel('➡️ 下一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page >= pager.totalPages - 1)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pmkt_open_${safeMarket}`).setLabel('返回鑑價站').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒 返回背包').setStyle(ButtonStyle.Secondary)
  ));
  await interaction.update({ embeds: [embed], components: rows });
}

function getRarityRank(raw = '') {
  const normalized = String(raw || '').trim();
  if (normalized === '史詩') return 3;
  if (normalized === '稀有') return 2;
  return 1;
}

function normalizeListingRarity(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return '普通';
  if (/史詩|傳說|legend/i.test(text)) return '史詩';
  if (/稀有|精良|罕見|rare/i.test(text)) return '稀有';
  return '普通';
}

function estimateStoryReferencePriceByName(name = '') {
  const text = String(name || '');
  let value = 18;
  if (/靈芝|人參|雪蓮|仙草|稀有|秘笈|核心|晶|寶|礦/u.test(text)) value += 65;
  if (/肉|魚|野兔|野雞|野豬|鹿/u.test(text)) value += 18;
  if (/毒|斷腸|曼陀羅/u.test(text)) value += 12;
  if (/乾糧|水囊/u.test(text)) value = 5;
  return Math.max(1, Math.floor(value));
}

function estimateMoveReferencePriceByTier(tier = 1) {
  const safeTier = Math.max(1, Number(tier) || 1);
  if (safeTier >= 3) return 520;
  if (safeTier >= 2) return 280;
  return 130;
}

function buildShopSellDraftOptions(player, ownerId) {
  ECON.ensurePlayerEconomy(player);
  const stacked = new Map();

  const addStack = (rawName, source, amount = 1, extra = {}) => {
    const name = String(rawName || '').trim();
    if (!name) return;
    const key = name;
    const qty = Math.max(1, Math.floor(Number(amount || 1)));
    const rarity = normalizeListingRarity(extra?.rarity || '');
    const refPrice = Math.max(1, Math.floor(Number(extra?.referencePrice || 0))) || estimateStoryReferencePriceByName(name);
    const prev = stacked.get(key);
    if (prev) {
      prev.quantity += qty;
      if (!prev.sources.includes(source)) prev.sources.push(source);
      if (refPrice > Number(prev.referencePrice || 0)) prev.referencePrice = refPrice;
      if (getRarityRank(rarity) > getRarityRank(prev.rarity)) prev.rarity = rarity;
      return;
    }
    stacked.set(key, {
      kind: 'item',
      sources: [source],
      itemName: name,
      quantity: qty,
      rarity,
      referencePrice: refPrice
    });
  };

  for (const good of Array.isArray(player.tradeGoods) ? player.tradeGoods : []) {
    const goodName = typeof good === 'string' ? good : (good?.name || '');
    addStack(goodName, 'tradeGoods', 1, {
      rarity: good?.rarity || '普通',
      referencePrice: Number(good?.value || 0)
    });
  }
  for (const herb of Array.isArray(player.herbs) ? player.herbs : []) {
    const herbName = typeof herb === 'string' ? herb : herb?.name || '';
    addStack(herbName, 'herbs', 1, {
      rarity: /稀有|靈|仙|神/u.test(String(herbName || '')) ? '稀有' : '普通',
      referencePrice: estimateStoryReferencePriceByName(herbName)
    });
  }
  for (const inv of Array.isArray(player.inventory) ? player.inventory : []) {
    const itemName = typeof inv === 'string' ? inv : inv?.name || '';
    addStack(itemName, 'inventory', 1, {
      rarity: /史詩|傳說|神話/u.test(String(itemName || ''))
        ? '史詩'
        : (/稀有|精良|秘|寶/u.test(String(itemName || '')) ? '稀有' : '普通'),
      referencePrice: estimateStoryReferencePriceByName(itemName)
    });
  }

  const options = Array.from(stacked.values())
    .sort((a, b) => String(a.itemName || '').localeCompare(String(b.itemName || '')))
    .map((entry) => ({
      kind: 'item',
      itemName: String(entry.itemName || '').trim(),
      quantityMax: Math.max(1, Number(entry.quantity || 1)),
      itemRef: { kind: 'item', source: Array.isArray(entry.sources) ? entry.sources[0] : 'inventory' },
      rarity: normalizeListingRarity(entry.rarity || '普通'),
      referencePrice: Math.max(1, Math.floor(Number(entry.referencePrice || estimateStoryReferencePriceByName(entry.itemName || '')))),
      label: `[${normalizeListingRarity(entry.rarity || '普通')}] ${String(entry.itemName || '')}`.slice(0, 100),
      description: `庫存 ${Math.max(1, Number(entry.quantity || 1))}｜參考價 ${Math.max(1, Math.floor(Number(entry.referencePrice || 1)))} Rns`
    }));

  let blockedActiveSkillCount = 0;
  const ownedPets = getPlayerOwnedPets(ownerId);
  for (const pet of ownedPets) {
    if (!pet || !pet.id) continue;
    const loadout = normalizePetMoveLoadout(pet, true);
    const activeSet = new Set(loadout.activeMoveIds || []);
    const attackMoves = getPetAttackMoves(pet);
    for (const move of attackMoves) {
      const moveId = String(move?.id || '').trim();
      if (!moveId) continue;
      if (activeSet.has(moveId)) {
        blockedActiveSkillCount += 1;
        continue;
      }
      const moveName = String(move?.name || moveId).trim();
      if (!moveName) continue;
      const moveRarity = normalizeListingRarity(
        typeof PET.getMoveRarityByTier === 'function'
          ? PET.getMoveRarityByTier(Number(move?.tier || 1))
          : '普通'
      );
      const moveRefPrice = estimateMoveReferencePriceByTier(Number(move?.tier || 1));
      options.push({
        kind: 'pet_move',
        itemName: `技能晶片：${moveName}`,
        quantityMax: 1,
        rarity: moveRarity,
        referencePrice: moveRefPrice,
        itemRef: {
          kind: 'pet_move',
          petId: String(pet.id),
          petName: String(pet.name || '寵物').slice(0, 48),
          moveId,
          moveName
        },
        label: `[${moveRarity}] ${pet.name}｜${moveName}`.slice(0, 100),
        description: `技能晶片｜參考價 ${moveRefPrice} Rns｜未上陣`
      });
    }
  }

  return {
    options: options.slice(0, 80),
    blockedActiveSkillCount
  };
}

function buildShopHaggleDraftOptions(player, ownerId) {
  const draft = buildShopSellDraftOptions(player, ownerId);
  const options = (draft.options || [])
    .filter((entry) => String(entry?.kind || '') === 'item')
    .filter((entry) => !SHOP_HAGGLE_BLOCKED_ITEMS.has(String(entry?.itemName || '').trim()));
  return {
    ...draft,
    options: options.slice(0, 80)
  };
}

function getDraftItemName(raw = null) {
  if (typeof raw === 'string') return raw.trim();
  return String(raw?.name || '').trim();
}

function getHaggleCandidateFromPlayer(player, spec = {}) {
  const itemName = String(spec?.itemName || '').trim();
  const preferSource = String(spec?.itemRef?.source || '').trim();
  if (!itemName) return null;

  const tradeGoods = Array.isArray(player?.tradeGoods) ? player.tradeGoods : [];
  const herbs = Array.isArray(player?.herbs) ? player.herbs : [];
  const inventory = Array.isArray(player?.inventory) ? player.inventory : [];

  const fromTrade = tradeGoods.find((good) => String(good?.name || '').trim() === itemName);
  const fromHerb = herbs.find((herb) => getDraftItemName(herb) === itemName);
  const fromInv = inventory.find((item) => getDraftItemName(item) === itemName && !SHOP_HAGGLE_BLOCKED_ITEMS.has(getDraftItemName(item)));

  const bySource = {
    tradeGoods: fromTrade
      ? {
        source: 'tradeGoods',
        itemName,
        tradeGoodId: String(fromTrade?.id || '').trim(),
        tradeGood: JSON.parse(JSON.stringify(fromTrade))
      }
      : null,
    herbs: fromHerb
      ? { source: 'herbs', itemName }
      : null,
    inventory: fromInv
      ? { source: 'inventory', itemName }
      : null
  };

  if (preferSource && bySource[preferSource]) return bySource[preferSource];
  return bySource.tradeGoods || bySource.herbs || bySource.inventory || null;
}

function buildHaggleShadowPlayer(player, spec = {}, worldDay = 1) {
  const candidate = getHaggleCandidateFromPlayer(player, spec);
  if (!candidate) return { error: '找不到可議價的物品，請重新選擇。' };

  const shadow = JSON.parse(JSON.stringify(player || {}));
  ECON.ensurePlayerEconomy(shadow);
  shadow.tradeGoods = [];
  shadow.herbs = [];
  shadow.inventory = [];
  if (!shadow.marketState || typeof shadow.marketState !== 'object') shadow.marketState = {};
  shadow.marketState.lastSkillLicenseDay = Number(worldDay || 1);

  if (candidate.source === 'tradeGoods' && candidate.tradeGood) {
    shadow.tradeGoods.push(candidate.tradeGood);
  } else if (candidate.source === 'herbs') {
    shadow.herbs.push(candidate.itemName);
  } else {
    shadow.inventory.push(candidate.itemName);
  }

  return { shadow, candidate };
}

function buildHaggleBulkShadowPlayer(player, specs = [], worldDay = 1) {
  const input = Array.isArray(specs) ? specs : [];
  if (input.length <= 0) return { error: '請先選擇要批次議價的商品。' };

  const shadow = JSON.parse(JSON.stringify(player || {}));
  ECON.ensurePlayerEconomy(shadow);
  shadow.tradeGoods = [];
  shadow.herbs = [];
  shadow.inventory = [];
  if (!shadow.marketState || typeof shadow.marketState !== 'object') shadow.marketState = {};
  shadow.marketState.lastSkillLicenseDay = Number(worldDay || 1);

  const tradeGoods = Array.isArray(player?.tradeGoods) ? player.tradeGoods : [];
  const herbs = Array.isArray(player?.herbs) ? player.herbs : [];
  const inventory = Array.isArray(player?.inventory) ? player.inventory : [];

  const normalizedSpecs = [];
  const usedName = new Set();
  for (const raw of input) {
    const itemName = String(raw?.itemName || '').trim();
    if (!itemName || usedName.has(itemName)) continue;
    usedName.add(itemName);

    let matched = 0;
    for (const good of tradeGoods) {
      if (String(good?.name || '').trim() !== itemName) continue;
      shadow.tradeGoods.push(JSON.parse(JSON.stringify(good)));
      matched += 1;
    }
    for (const herb of herbs) {
      if (getDraftItemName(herb) !== itemName) continue;
      shadow.herbs.push(typeof herb === 'string' ? herb : JSON.parse(JSON.stringify(herb)));
      matched += 1;
    }
    for (const item of inventory) {
      const name = getDraftItemName(item);
      if (!name || SHOP_HAGGLE_BLOCKED_ITEMS.has(name) || name !== itemName) continue;
      shadow.inventory.push(typeof item === 'string' ? item : JSON.parse(JSON.stringify(item)));
      matched += 1;
    }
    if (matched <= 0) continue;

    normalizedSpecs.push({
      kind: 'item',
      itemName,
      quantityMax: matched,
      itemRef: { kind: 'item', source: String(raw?.itemRef?.source || 'inventory') }
    });
  }

  if (normalizedSpecs.length <= 0) {
    return { error: '你選的商品目前已不存在，請重新選擇。' };
  }

  return { shadow, specs: normalizedSpecs };
}

function consumeHaggleItemFromPlayer(player, spec = {}) {
  const itemName = String(spec?.itemName || '').trim();
  const tradeGoodId = String(spec?.itemRef?.tradeGoodId || '').trim();
  const preferSource = String(spec?.itemRef?.source || '').trim();
  if (!itemName) return { success: false, reason: '物品名稱缺失' };

  const tryTradeGoods = () => {
    const list = Array.isArray(player?.tradeGoods) ? player.tradeGoods : [];
    let idx = -1;
    if (tradeGoodId) idx = list.findIndex((good) => String(good?.id || '').trim() === tradeGoodId);
    if (idx < 0) idx = list.findIndex((good) => String(good?.name || '').trim() === itemName);
    if (idx < 0) return false;
    list.splice(idx, 1);
    return true;
  };
  const tryHerbs = () => {
    const list = Array.isArray(player?.herbs) ? player.herbs : [];
    const idx = list.findIndex((herb) => getDraftItemName(herb) === itemName);
    if (idx < 0) return false;
    list.splice(idx, 1);
    return true;
  };
  const tryInventory = () => {
    const list = Array.isArray(player?.inventory) ? player.inventory : [];
    const idx = list.findIndex((item) => {
      const name = getDraftItemName(item);
      if (!name || SHOP_HAGGLE_BLOCKED_ITEMS.has(name)) return false;
      return name === itemName;
    });
    if (idx < 0) return false;
    list.splice(idx, 1);
    return true;
  };

  const ordered = preferSource === 'tradeGoods'
    ? [tryTradeGoods, tryHerbs, tryInventory]
    : preferSource === 'herbs'
      ? [tryHerbs, tryTradeGoods, tryInventory]
      : preferSource === 'inventory'
        ? [tryInventory, tryTradeGoods, tryHerbs]
        : [tryTradeGoods, tryHerbs, tryInventory];
  for (const fn of ordered) {
    if (fn()) return { success: true, itemName };
  }
  return { success: false, reason: `物品「${itemName}」已不存在或已被移除` };
}

function consumeHaggleBulkItemsFromPlayer(player, specs = []) {
  const input = Array.isArray(specs) ? specs : [];
  if (input.length <= 0) return { success: false, reason: '缺少批次議價項目' };

  const countAvailable = (itemName) => {
    let count = 0;
    for (const good of Array.isArray(player?.tradeGoods) ? player.tradeGoods : []) {
      if (String(good?.name || '').trim() === itemName) count += 1;
    }
    for (const herb of Array.isArray(player?.herbs) ? player.herbs : []) {
      if (getDraftItemName(herb) === itemName) count += 1;
    }
    for (const item of Array.isArray(player?.inventory) ? player.inventory : []) {
      const name = getDraftItemName(item);
      if (!name || SHOP_HAGGLE_BLOCKED_ITEMS.has(name)) continue;
      if (name === itemName) count += 1;
    }
    return count;
  };

  for (const raw of input) {
    const itemName = String(raw?.itemName || '').trim();
    const need = Math.max(1, Number(raw?.quantityMax || 1));
    if (!itemName) continue;
    const available = countAvailable(itemName);
    if (available < need) {
      return { success: false, reason: `商品「${itemName}」數量已變動，請重新議價。` };
    }
  }

  const consumed = [];
  for (const raw of input) {
    const itemName = String(raw?.itemName || '').trim();
    const need = Math.max(1, Number(raw?.quantityMax || 1));
    if (!itemName) continue;
    let remaining = need;

    const tryTrade = () => {
      const list = Array.isArray(player?.tradeGoods) ? player.tradeGoods : [];
      for (let i = list.length - 1; i >= 0 && remaining > 0; i--) {
        if (String(list[i]?.name || '').trim() !== itemName) continue;
        list.splice(i, 1);
        remaining -= 1;
      }
    };
    const tryHerbs = () => {
      const list = Array.isArray(player?.herbs) ? player.herbs : [];
      for (let i = list.length - 1; i >= 0 && remaining > 0; i--) {
        if (getDraftItemName(list[i]) !== itemName) continue;
        list.splice(i, 1);
        remaining -= 1;
      }
    };
    const tryInv = () => {
      const list = Array.isArray(player?.inventory) ? player.inventory : [];
      for (let i = list.length - 1; i >= 0 && remaining > 0; i--) {
        const name = getDraftItemName(list[i]);
        if (!name || SHOP_HAGGLE_BLOCKED_ITEMS.has(name) || name !== itemName) continue;
        list.splice(i, 1);
        remaining -= 1;
      }
    };

    const prefer = String(raw?.itemRef?.source || '').trim();
    const chain = prefer === 'tradeGoods'
      ? [tryTrade, tryHerbs, tryInv]
      : prefer === 'herbs'
        ? [tryHerbs, tryTrade, tryInv]
        : prefer === 'inventory'
          ? [tryInv, tryTrade, tryHerbs]
          : [tryTrade, tryHerbs, tryInv];
    for (const fn of chain) {
      if (remaining <= 0) break;
      fn();
    }

    const removed = need - remaining;
    if (removed < need) {
      return { success: false, reason: `商品「${itemName}」數量已變動，請重新議價。` };
    }
    consumed.push({ itemName, quantity: removed });
  }

  const totalRemoved = consumed.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
  if (totalRemoved <= 0) return { success: false, reason: '沒有可成交商品' };
  return { success: true, consumed, totalRemoved };
}

function extractPitchFromHaggleMessage(message = '') {
  const text = String(message || '');
  const match = text.match(/🏪\s*[^：:\n]+[：:]\s*([^\n]+)/u);
  return String(match?.[1] || '').trim();
}

async function showWorldShopHaggleAllOffer(interaction, user, marketType = 'renaiss', selectedSpecs = null) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
    return;
  }
  const picked = Array.isArray(selectedSpecs)
    ? selectedSpecs
    : Array.isArray(player.shopSession?.haggleBulkSelectedSpecs)
      ? player.shopSession.haggleBulkSelectedSpecs
      : [];
  if (picked.length <= 0) {
    await showWorldShopHaggleBulkPicker(interaction, user, safeMarket, '請先從清單勾選要批次賣出的商品。');
    return;
  }
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  const worldDay = Number(CORE.getWorld()?.day || 1);
  const built = buildHaggleBulkShadowPlayer(player, picked, worldDay);
  if (built.error || !built.shadow || !Array.isArray(built.specs) || built.specs.length <= 0) {
    await showWorldShopHaggleBulkPicker(interaction, user, safeMarket, built.error || '無法建立批次議價內容，請重新選擇。');
    return;
  }
  const offerResult = await ECON.sellPlayerAtMarket(built.shadow, safeMarket, { worldDay }).catch((err) => ({ error: err?.message || String(err) }));
  if (!offerResult || offerResult.error || Number(offerResult.soldCount || 0) <= 0) {
    await showWorldShopHaggleBulkPicker(interaction, user, safeMarket, `無法批次議價：${offerResult?.error || '目前沒有可售商品'}`);
    return;
  }

  const rawTotal = Math.max(0, Number(offerResult.totalGold || 0));
  const quotedTotal = Math.max(0, Math.floor(rawTotal * 0.7));
  const discountLoss = Math.max(0, rawTotal - quotedTotal);
  const pending = {
    id: `haggle_all_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    marketType: safeMarket,
    createdAt: Date.now(),
    scope: 'bulk',
    itemName: '已選商品（批次）',
    specs: built.specs.map((spec) => ({
      kind: 'item',
      itemName: String(spec?.itemName || '').trim(),
      quantityMax: Math.max(1, Number(spec?.quantityMax || 1)),
      itemRef: { kind: 'item', source: String(spec?.itemRef?.source || 'inventory') }
    })),
    quotedTotal,
    rawQuotedTotal: rawTotal,
    discountLoss,
    soldCount: Number(offerResult.soldCount || 0),
    npcName: String(offerResult.npcName || (safeMarket === 'digital' ? '摩爾・Digital鑑價員' : '艾洛・Renaiss鑑價員')),
    message: String(offerResult.message || ''),
    historyRecall: String(offerResult.historyRecall || ''),
    digitalRiskScore: Number(offerResult.digitalRiskScore || 0),
    digitalRiskDelta: Number(offerResult.digitalRiskDelta || 0),
    marketStateAfter: JSON.parse(JSON.stringify(shadow.marketState || {}))
  };
  player.shopSession.pendingHaggleOffer = pending;
  CORE.savePlayer(player);

  const pitch = extractPitchFromHaggleMessage(offerResult.message);
  const detailLines = [];
  const itemSummary = built.specs
    .map((spec) => `${spec.itemName} x${Math.max(1, Number(spec.quantityMax || 1))}`)
    .slice(0, 6)
    .join('、');
  detailLines.push(`範圍：已選 ${built.specs.length} 項商品`);
  detailLines.push(`項目：${itemSummary}${built.specs.length > 6 ? '…' : ''}`);
  detailLines.push(`件數：${pending.soldCount} 件`);
  detailLines.push(`原始估價：${rawTotal} Rns 代幣`);
  detailLines.push(`批次賣出（七折）：**${quotedTotal} Rns 代幣**`);
  detailLines.push(`折讓差額：-${discountLoss} Rns 代幣`);
  detailLines.push(`鑑價員：${pending.npcName}`);
  if (pitch) detailLines.push(`\n💬 ${pitch}`);
  detailLines.push('\n請選擇是否同意本次批次賣出（七折）提案。');

  const embed = new EmbedBuilder()
    .setTitle(`🤝 批次議價提案｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(detailLines.join('\n'))
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_haggle_confirm_${safeMarket}`).setLabel('✅ 同意成交').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`shop_haggle_cancel_${safeMarket}`).setLabel('↩️ 退出議價').setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
}

async function showWorldShopHaggleBulkPicker(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
    return;
  }

  const draft = buildShopHaggleDraftOptions(player, user.id);
  player.shopSession.haggleDraftOptions = draft.options;
  player.shopSession.haggleBulkSelectedSpecs = [];
  player.shopSession.pendingHaggleOffer = null;
  CORE.savePlayer(player);

  const lines = [];
  if (notice) lines.push(`✅ ${notice}`);
  lines.push('請從下拉選單勾選要「批次賣出（七折）」的商品。');
  lines.push('勾選完成後會即時顯示本次批次報價，再由你決定是否成交。');
  lines.push(`可議價項目：${draft.options.length} 個`);

  const embed = new EmbedBuilder()
    .setTitle(`📦 批次賣出（七折）｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(lines.join('\n'))
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  if (draft.options.length <= 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
    );
    await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
    return;
  }

  const selectOptions = draft.options.slice(0, SHOP_HAGGLE_BULK_SELECT_LIMIT).map((option, idx) => ({
    label: String(option.label || option.itemName || `選項${idx + 1}`).slice(0, 100),
    description: String(option.description || '').slice(0, 100) || '選擇此商品加入批次賣出',
    value: `bulkidx_${idx}`
  }));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`shop_haggle_bulk_select_${safeMarket}`)
    .setPlaceholder('可複選：勾選要批次賣出的商品')
    .setMinValues(1)
    .setMaxValues(Math.min(selectOptions.length, 10))
    .addOptions(selectOptions);

  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [embed], components: [row1, row2] });
}

async function showWorldShopHagglePicker(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
    return;
  }

  const draft = buildShopHaggleDraftOptions(player, user.id);
  player.shopSession.haggleDraftOptions = draft.options;
  player.shopSession.haggleBulkSelectedSpecs = [];
  player.shopSession.pendingHaggleOffer = null;
  CORE.savePlayer(player);

  const lines = [];
  if (notice) lines.push(`✅ ${notice}`);
  lines.push('請先選擇 1 件要交給老闆估價的商品。');
  lines.push('下一步會顯示 AI 鑑價員報價，你可選「同意成交」或「退出議價」。');
  lines.push(`可議價項目：${draft.options.length} 個（單次僅處理 1 件）`);

  const embed = new EmbedBuilder()
    .setTitle(`🤝 老闆議價｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(lines.join('\n'))
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  if (draft.options.length <= 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
    );
    await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
    return;
  }

  const selectOptions = draft.options.slice(0, SHOP_HAGGLE_SELECT_LIMIT).map((option, idx) => ({
    label: String(option.label || option.itemName || `選項${idx + 1}`).slice(0, 100),
    description: String(option.description || '').slice(0, 100) || '選擇此商品進行估價',
    value: `haggleidx_${idx}`
  }));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`shop_haggle_select_${safeMarket}`)
    .setPlaceholder('選擇要交給老闆估價的商品')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(selectOptions);

  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_haggle_all_${safeMarket}`).setLabel('📦 批次賣出(七折)').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [embed], components: [row1, row2] });
}

async function showWorldShopHaggleOffer(interaction, user, marketType = 'renaiss', spec = null) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
    return;
  }
  if (!spec || typeof spec !== 'object') {
    await showWorldShopHagglePicker(interaction, user, safeMarket, '議價選項已失效，請重新選擇。');
    return;
  }

  const worldDay = Number(CORE.getWorld()?.day || 1);
  const built = buildHaggleShadowPlayer(player, spec, worldDay);
  if (built.error || !built.shadow) {
    await showWorldShopHagglePicker(interaction, user, safeMarket, built.error || '目前沒有可議價的項目。');
    return;
  }
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  const offerResult = await ECON.sellPlayerAtMarket(built.shadow, safeMarket, { worldDay }).catch((err) => ({ error: err?.message || String(err) }));
  if (!offerResult || offerResult.error || Number(offerResult.soldCount || 0) <= 0) {
    await showWorldShopHagglePicker(interaction, user, safeMarket, `議價失敗：${offerResult?.error || '無可成交項目'}`);
    return;
  }

  const pending = {
    id: `haggle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    marketType: safeMarket,
    createdAt: Date.now(),
    itemName: String(built.candidate?.itemName || spec.itemName || '').trim(),
    spec: {
      kind: 'item',
      itemName: String(built.candidate?.itemName || spec.itemName || '').trim(),
      itemRef: {
        kind: 'item',
        source: String(built.candidate?.source || spec?.itemRef?.source || 'inventory'),
        tradeGoodId: String(built.candidate?.tradeGoodId || '')
      }
    },
    quotedTotal: Number(offerResult.totalGold || 0),
    soldCount: Number(offerResult.soldCount || 1),
    npcName: String(offerResult.npcName || (safeMarket === 'digital' ? '摩爾・Digital鑑價員' : '艾洛・Renaiss鑑價員')),
    message: String(offerResult.message || ''),
    historyRecall: String(offerResult.historyRecall || ''),
    digitalRiskScore: Number(offerResult.digitalRiskScore || 0),
    digitalRiskDelta: Number(offerResult.digitalRiskDelta || 0),
    marketStateAfter: JSON.parse(JSON.stringify(built.shadow.marketState || {}))
  };
  player.shopSession.pendingHaggleOffer = pending;
  CORE.savePlayer(player);

  const pitch = extractPitchFromHaggleMessage(offerResult.message);
  const detailLines = [];
  detailLines.push(`商品：${pending.itemName}`);
  detailLines.push(`報價：**${pending.quotedTotal} Rns 代幣**`);
  detailLines.push(`鑑價員：${pending.npcName}`);
  if (pitch) detailLines.push(`\n💬 ${pitch}`);
  detailLines.push('\n請選擇是否同意本次 AI 議價。');

  const embed = new EmbedBuilder()
    .setTitle(`🤝 議價提案｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(detailLines.join('\n'))
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_haggle_confirm_${safeMarket}`).setLabel('✅ 同意成交').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`shop_haggle_cancel_${safeMarket}`).setLabel('↩️ 退出議價').setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
}

async function showWorldShopSellPicker(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 只能在商店場景掛賣。請先由劇情進入商店。', ephemeral: true }).catch(() => {});
    return;
  }

  const draft = buildShopSellDraftOptions(player, user.id);
  player.shopSession.sellDraftOptions = draft.options;
  player.shopSession.pendingSellSpec = null;
  CORE.savePlayer(player);

  const lines = [];
  if (notice) lines.push(`✅ ${notice}`);
  lines.push(`請從下拉選單直接選擇要掛賣的項目（避免打錯字）。`);
  lines.push(`每個項目都會顯示稀有度與參考價；你可自行掛更高價格。`);
  lines.push(`可選項目：${draft.options.length} 個`);
  if (draft.blockedActiveSkillCount > 0) {
    lines.push(`上陣中技能已自動排除：${draft.blockedActiveSkillCount} 招（需先到招式配置卸下）`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`📤 掛賣選單｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(lines.join('\n'))
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  if (draft.options.length <= 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('show_moves').setLabel('🐾 寵物管理').setStyle(ButtonStyle.Primary)
    );
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  const selectOptions = draft.options.slice(0, SHOP_SELL_SELECT_LIMIT).map((option, idx) => ({
    label: String(option.label || option.itemName || `選項${idx + 1}`).slice(0, 100),
    description: String(option.description || '').slice(0, 100) || `最多 ${Math.max(1, Number(option.quantityMax || 1))} 件`,
    value: `sellidx_${idx}`
  }));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`shop_sell_select_${safeMarket}`)
    .setPlaceholder('選擇要掛賣的道具/技能')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(selectOptions);

  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_moves').setLabel('🐾 寵物管理').setStyle(ButtonStyle.Primary)
  );
  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function showWorldShopSellModal(interaction, marketType = 'renaiss', spec = null) {
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const itemName = String(spec?.itemName || '商品').slice(0, 36);
  const rarity = normalizeListingRarity(spec?.rarity || '普通');
  const referencePrice = Math.max(1, Math.floor(Number(spec?.referencePrice || estimateStoryReferencePriceByName(itemName))));
  const modal = new ModalBuilder()
    .setCustomId(`shop_sell_modal_${safeMarket}`)
    .setTitle(`上架賣單｜${rarity}｜${itemName}`);

  const qtyInput = new TextInputBuilder()
    .setCustomId('shop_sell_qty')
    .setLabel(spec?.kind === 'pet_move' ? '數量（技能固定為 1）' : '數量')
    .setPlaceholder(spec?.kind === 'pet_move' ? '固定為 1' : `最多 ${Math.max(1, Number(spec?.quantityMax || 1))} 件`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4)
    .setValue(spec?.kind === 'pet_move' ? '1' : '1');

  const priceInput = new TextInputBuilder()
    .setCustomId('shop_sell_price')
    .setLabel(`單價（Rns｜參考 ${referencePrice}）`.slice(0, 45))
    .setPlaceholder(`例如：${referencePrice}（可掛更高）`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(8)
    .setValue(String(referencePrice));

  const noteInput = new TextInputBuilder()
    .setCustomId('shop_sell_note')
    .setLabel('備註（可留空）')
    .setPlaceholder('例如：可議價 / 急售')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80);

  modal.addComponents(
    new ActionRowBuilder().addComponents(qtyInput),
    new ActionRowBuilder().addComponents(priceInput),
    new ActionRowBuilder().addComponents(noteInput)
  );
  await interaction.showModal(modal);
}

async function handleWorldShopSellModal(interaction, user, marketType = 'renaiss') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 你目前不在此商店場景。', ephemeral: true }).catch(() => {});
    return;
  }
  const spec = player.shopSession?.pendingSellSpec;
  if (!spec || typeof spec !== 'object') {
    await interaction.reply({ content: '⚠️ 掛賣項目已失效，請重新選擇。', ephemeral: true }).catch(() => {});
    return;
  }

  const rawQty = Number(interaction.fields.getTextInputValue('shop_sell_qty')?.trim() || 0);
  const unitPrice = Number(interaction.fields.getTextInputValue('shop_sell_price')?.trim() || 0);
  const note = interaction.fields.getTextInputValue('shop_sell_note')?.trim() || '';
  let quantity = Math.max(1, Math.floor(rawQty || 0));
  if (spec.kind === 'pet_move') {
    quantity = 1;
  } else {
    quantity = Math.min(Math.max(1, Number(spec.quantityMax || 1)), quantity);
  }

  const result = ECON.createSellListing(player, safeMarket, {
    itemName: spec.itemName,
    quantity,
    unitPrice,
    note,
    itemRef: spec.itemRef || { kind: spec.kind || 'item' }
  });

  if (!result?.success) {
    await interaction.reply({ content: `❌ 掛單失敗：${result?.reason || '未知錯誤'}`, ephemeral: true }).catch(() => {});
    return;
  }

  player.shopSession.pendingSellSpec = null;
  CORE.savePlayer(player);
  const listing = result.listing || {};
  const successText = `賣單已上架：${listing.itemName} x${listing.quantity}（單價 ${listing.unitPrice}）`;
  const updated = await interaction.deferUpdate()
    .then(async () => {
      await showWorldShopScene(interaction, user, safeMarket, successText);
      return true;
    })
    .catch(() => false);
  if (!updated) {
    await interaction.reply({ content: `✅ ${successText}`, ephemeral: true }).catch(() => {});
  }
}

async function showMarketPostModal(interaction, marketType = 'renaiss', listingType = 'sell') {
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const safeType = 'sell';
  const modal = new ModalBuilder()
    .setCustomId(`pmkt_modal_${safeType}_${safeMarket}`)
    .setTitle(`${getMarketTypeLabel(safeMarket)}｜上架賣單`);

  const itemInput = new TextInputBuilder()
    .setCustomId('pmkt_item_name')
    .setLabel('物品名稱（需與你持有名稱一致）')
    .setPlaceholder('例如：月影蘭')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80);
  const qtyInput = new TextInputBuilder()
    .setCustomId('pmkt_qty')
    .setLabel('數量')
    .setPlaceholder('例如：2')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4);
  const priceInput = new TextInputBuilder()
    .setCustomId('pmkt_unit_price')
    .setLabel('單價（Rns）')
    .setPlaceholder('例如：120')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(8);
  const noteInput = new TextInputBuilder()
    .setCustomId('pmkt_note')
    .setLabel('備註（可留空）')
    .setPlaceholder('例如：可議價/急售')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80);

  modal.addComponents(
    new ActionRowBuilder().addComponents(itemInput),
    new ActionRowBuilder().addComponents(qtyInput),
    new ActionRowBuilder().addComponents(priceInput),
    new ActionRowBuilder().addComponents(noteInput)
  );
  await interaction.showModal(modal);
}

async function handleMarketPostModal(interaction, user, listingType = 'sell', marketType = 'renaiss') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
    return;
  }
  ECON.ensurePlayerEconomy(player);
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || '')) {
    await interaction.reply({ content: '⚠️ 只能在商店內掛賣。請先從劇情進入商店。', ephemeral: true }).catch(() => {});
    return;
  }
  const itemName = interaction.fields.getTextInputValue('pmkt_item_name')?.trim() || '';
  const qty = Number(interaction.fields.getTextInputValue('pmkt_qty')?.trim() || 0);
  const unitPrice = Number(interaction.fields.getTextInputValue('pmkt_unit_price')?.trim() || 0);
  const note = interaction.fields.getTextInputValue('pmkt_note')?.trim() || '';

  const result = ECON.createSellListing(player, marketType, { itemName, quantity: qty, unitPrice, note });

  if (!result?.success) {
    await interaction.reply({ content: `❌ 掛單失敗：${result?.reason || '未知錯誤'}`, ephemeral: true }).catch(() => {});
    return;
  }

  CORE.savePlayer(player);
  const listing = result.listing || {};
  const successText = `賣單已上架：${listing.itemName} x${listing.quantity}（單價 ${listing.unitPrice}）`;
  const updated = await interaction.deferUpdate()
    .then(async () => {
      await showWorldShopScene(interaction, user, marketType, successText);
      return true;
    })
    .catch(() => false);
  if (!updated) {
    await interaction.reply({ content: `✅ ${successText}\n請回到「背包 → 鑑價站」查看。`, ephemeral: true }).catch(() => {});
  }
}

function cloneChoicesForSnapshot(choices = []) {
  const list = normalizeEventChoices(null, Array.isArray(choices) ? choices : []);
  return list.map((choice) => JSON.parse(JSON.stringify(choice)));
}

function openShopSession(player, marketType = 'renaiss', sourceChoice = '') {
  if (!player || typeof player !== 'object') return;
  player.shopSession = {
    open: true,
    marketType: marketType === 'digital' ? 'digital' : 'renaiss',
    enteredAt: Date.now(),
    sourceChoice: String(sourceChoice || ''),
    preStory: String(player.currentStory || ''),
    preChoices: cloneChoicesForSnapshot(player.eventChoices || []),
    sellDraftOptions: [],
    pendingSellSpec: null,
    haggleDraftOptions: [],
    haggleBulkSelectedSpecs: [],
    pendingHaggleOffer: null
  };
}

function leaveShopSession(player) {
  if (!player || !player.shopSession) return;
  const session = player.shopSession;
  if (String(session.preStory || '').trim()) {
    player.currentStory = String(session.preStory || '');
  }
  if (Array.isArray(session.preChoices) && session.preChoices.length > 0) {
    player.eventChoices = cloneChoicesForSnapshot(session.preChoices);
  }
  delete player.shopSession;
}

async function showWorldShopBuyPanel(interaction, user, marketType = 'renaiss', notice = '', page = 0) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const allListings = ECON.getMarketListingsView({
    marketType: safeMarket,
    type: 'sell',
    excludeOwnerId: user.id,
    limit: 500
  });
  const pager = paginateList(allListings, page, MARKET_LIST_PAGE_SIZE);
  const listings = pager.items;
  const stockInfo = getTeleportDeviceStockInfo(player);
  const listText = listings.length > 0
    ? listings.map((l, i) => buildMarketListingLine(l, pager.start + i)).join('\n')
    : '（目前沒有可購買商品）';

  const embed = new EmbedBuilder()
    .setTitle(`🛒 商店可購買商品｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(
      `${notice ? `✅ ${notice}\n\n` : ''}` +
      `${listText}\n\n` +
      `頁數：${pager.page + 1}/${pager.totalPages}｜總筆數：${pager.total}\n` +
      `回血水晶：${SHOP_HEAL_CRYSTAL_COST} Rns（恢復氣血）\n` +
      `回能水晶：${SHOP_ENERGY_CRYSTAL_COST} Rns（恢復能量）\n` +
      `加成點數：花費 200 Rns 可獲得 +1 點。\n` +
      `傳送裝置：${TELEPORT_DEVICE_COST} Rns（同島瞬移，單顆效期 ${TELEPORT_DEVICE_DURATION_HOURS}h，每次消耗 1 顆）\n` +
      `目前可用：${stockInfo.count} 顆${stockInfo.count > 0 ? `（最早到期：${formatTeleportDeviceRemaining(stockInfo.soonestRemainingMs)}）` : ''}`
    );

  const rows = [];
  if (listings.length > 0) {
    const selectOptions = listings.slice(0, 25).map((listing, idx) => {
      const itemName = String(listing.itemName || '商品');
      const qty = Math.max(1, Number(listing.quantity || 1));
      const unitPrice = Math.max(1, Number(listing.unitPrice || 0));
      return {
        label: `${idx + 1}. ${itemName}`.slice(0, 100),
        description: `x${qty}｜單價 ${unitPrice} Rns｜下拉選購`.slice(0, 100),
        value: `shopbuy_${String(listing.id || '').trim()}`
      };
    });
    const select = new StringSelectMenuBuilder()
      .setCustomId(`shop_buy_select_${safeMarket}`)
      .setPlaceholder('下拉選擇要購買的商品')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(selectOptions);
    rows.push(new ActionRowBuilder().addComponents(select));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_scratch_${safeMarket}`).setLabel('🎟️ 刮刮樂(100)').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`shop_buy_heal_crystal_${safeMarket}`).setLabel(`🩸 回血水晶(${SHOP_HEAL_CRYSTAL_COST})`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`shop_buy_energy_crystal_${safeMarket}`).setLabel(`⚡ 回能水晶(${SHOP_ENERGY_CRYSTAL_COST})`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`shop_buy_point_${safeMarket}`).setLabel('🧩 買加成點數(200)').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`shop_buy_device_${safeMarket}`).setLabel(`🧭 傳送裝置(${TELEPORT_DEVICE_COST})`).setStyle(ButtonStyle.Success)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_buy_${safeMarket}_${Math.max(0, pager.page - 1)}`)
      .setLabel('⬅️ 上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page <= 0),
    new ButtonBuilder()
      .setCustomId(`shop_buy_${safeMarket}_${Math.min(pager.totalPages - 1, pager.page + 1)}`)
      .setLabel('➡️ 下一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page >= pager.totalPages - 1),
    new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
  ));
  await updateInteractionMessage(interaction, { embeds: [embed], components: rows });
}

async function showWorldShopScene(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const bossName = safeMarket === 'digital' ? '摩爾・Digital鑑價員' : '艾洛・Renaiss鑑價員';
  const bossTone = safeMarket === 'digital'
    ? '老闆眼神很熱情，但每句話都像在試探你的底線。'
    : '老闆把估值表攤在你面前，強調透明與長期信任。';
  const listingCount = ECON.getMarketListingsView({ marketType: safeMarket, type: 'sell', limit: 99 }).length;
  const myCount = ECON.getMarketListingsView({ marketType: safeMarket, type: 'sell', ownerId: user.id, limit: 99 }).length;

  const embed = new EmbedBuilder()
    .setTitle(`🏪 進入商店｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(
      `${notice ? `${/^[🧭📖]/u.test(String(notice).trim()) ? notice : `✅ ${notice}`}\n\n` : ''}` +
      `你走進了${getMarketTypeLabel(safeMarket)}，櫃台後方的 **${bossName}** 正看著你。\n` +
      `${bossTone}\n\n` +
      `市面賣單：${listingCount} 筆｜你掛單：${myCount} 筆\n` +
      `請選擇：要掛賣、直接跟老闆議價、買商品、刮刮樂，或離開商店。\n` +
      `掛賣會先出現下拉選單；技能需先從上陣招式卸下才可掛賣。`
    )
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_post_sell_${safeMarket}`).setLabel('📤 掛賣商品').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`shop_npc_haggle_${safeMarket}`).setLabel('🤝 跟老闆議價').setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_scratch_${safeMarket}`).setLabel('🎟️ 刮刮樂(100)').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`shop_buy_${safeMarket}`).setLabel('🛒 買商品').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('shop_leave').setLabel('🚪 離開商店').setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [embed], components: [row1, row2] });
}

// ============== 行囊/背包 ==============
async function showInventory(interaction, user, page = 0) {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  
  // 顯示物品（分頁，不截斷）
  const items = Array.isArray(player.inventory) ? player.inventory : [];
  const herbs = Array.isArray(player.herbs) ? player.herbs : [];
  const tradeGoods = Array.isArray(player.tradeGoods) ? player.tradeGoods : [];

  const itemLines = items.map((item, i) => `${i + 1}. ${String(item || '')}`);
  const herbLines = herbs.map((h, i) => `${i + 1}. ${String(h || '')}`);
  const goodLines = tradeGoods.map((g, i) =>
    `${i + 1}. ${String(g?.name || '未命名素材')}（${String(g?.rarity || '普通')}｜${Number(g?.value || 0)} Rns 代幣）`
  );

  const itemPages = buildPagedFieldChunks(itemLines, 1000, '（空）');
  const herbPages = buildPagedFieldChunks(herbLines, 1000, '（空）');
  const goodsPages = buildPagedFieldChunks(goodLines, 1000, '（空）');
  const totalPages = Math.max(itemPages.length, herbPages.length, goodsPages.length, 1);
  const safePage = Math.max(0, Math.min(totalPages - 1, Number(page || 0)));
  const itemsList = itemPages[Math.min(safePage, itemPages.length - 1)] || '（空）';
  const herbsList = herbPages[Math.min(safePage, herbPages.length - 1)] || '（空）';
  const goodsList = goodsPages[Math.min(safePage, goodsPages.length - 1)] || '（空）';
  
  const embed = new EmbedBuilder()
    .setTitle(`🎒 ${player.name} 的行囊`)
    .setColor(0x8B4513)
    .setDescription('你身上攜帶的物品')
    .addFields(
      { name: '📦 物品', value: itemsList, inline: true },
      { name: '🌿 草藥', value: herbsList, inline: true }
    )
    .addFields({ name: `🧰 可售素材（第 ${safePage + 1}/${totalPages} 頁）`, value: goodsList, inline: false })
    .addFields({ name: t('gold', uiLang), value: `${player.stats.財富} Rns 代幣`, inline: false });

  const rowPage = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`inv_page_prev_${safePage}`)
      .setLabel('⬅️ 上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(`inv_page_next_${safePage}`)
      .setLabel('➡️ 下一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1)
  );
  const rowMain = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Primary)
  );

  await interaction.update({ embeds: [embed], components: [rowPage, rowMain] });
}

function getCodexLabels(uiLang = 'zh-TW') {
  const map = {
    'zh-TW': {
      overviewTitle: '📚 圖鑑總覽',
      overviewDesc: '可分開查看 NPC 圖鑑與技能圖鑑。未收集項目只顯示數量，不顯示名稱。',
      npcProgress: '🤝 NPC 圖鑑進度',
      skillProgress: '🧬 技能圖鑑進度',
      unknownCount: '🕶️ 未收集（隱藏名稱）',
      npcButton: '🤝 NPC圖鑑',
      skillButton: '🧬 技能圖鑑',
      npcTitle: '🤝 NPC 圖鑑',
      npcCollected: '已收集 NPC',
      npcUnknown: '未收集 NPC',
      npcEmpty: '（尚未遇到 NPC）',
      skillTitle: '🧬 技能圖鑑',
      skillCollected: '已收集技能',
      skillUnknown: '未收集技能',
      skillEmpty: '（尚未抽到技能）',
      backCodex: '📚 回圖鑑',
      canFight: '可交鋒',
      canDraw: '可抽取'
    },
    'zh-CN': {
      overviewTitle: '📚 图鉴总览',
      overviewDesc: '可分开查看 NPC 图鉴与技能图鉴。未收集项目只显示数量，不显示名称。',
      npcProgress: '🤝 NPC 图鉴进度',
      skillProgress: '🧬 技能图鉴进度',
      unknownCount: '🕶️ 未收集（隐藏名称）',
      npcButton: '🤝 NPC图鉴',
      skillButton: '🧬 技能图鉴',
      npcTitle: '🤝 NPC 图鉴',
      npcCollected: '已收集 NPC',
      npcUnknown: '未收集 NPC',
      npcEmpty: '（尚未遇到 NPC）',
      skillTitle: '🧬 技能图鉴',
      skillCollected: '已收集技能',
      skillUnknown: '未收集技能',
      skillEmpty: '（尚未抽到技能）',
      backCodex: '📚 回图鉴',
      canFight: '可交锋',
      canDraw: '可抽取'
    },
    en: {
      overviewTitle: '📚 Codex Overview',
      overviewDesc: 'NPC Codex and Skill Codex are separated. Uncollected entries show counts only.',
      npcProgress: '🤝 NPC Progress',
      skillProgress: '🧬 Skill Progress',
      unknownCount: '🕶️ Uncollected (hidden names)',
      npcButton: '🤝 NPC Codex',
      skillButton: '🧬 Skill Codex',
      npcTitle: '🤝 NPC Codex',
      npcCollected: 'Collected NPCs',
      npcUnknown: 'Uncollected NPCs',
      npcEmpty: '(none yet)',
      skillTitle: '🧬 Skill Codex',
      skillCollected: 'Collected Skills',
      skillUnknown: 'Uncollected Skills',
      skillEmpty: '(none yet)',
      backCodex: '📚 Back Codex',
      canFight: 'Fightable',
      canDraw: 'Drawable'
    }
  };
  return map[uiLang] || map['zh-TW'];
}

function collectPlayerCodexData(player) {
  const codex = player?.codex && typeof player.codex === 'object' ? player.codex : {};
  const npcEntries = Object.values(codex.npcEncountered || {})
    .filter((entry) => entry && typeof entry === 'object')
    .sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0));
  const drawEntries = Object.values(codex.drawnMoves || {})
    .filter((entry) => entry && typeof entry === 'object')
    .sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0));

  const allAgents = Array.isArray(CORE.getAgents?.()) ? CORE.getAgents() : [];
  const allNpcIds = new Set(allAgents.map((agent) => String(agent?.id || '').trim()).filter(Boolean));
  const encounteredNpcIds = new Set(npcEntries.map((entry) => String(entry.id || '').trim()).filter(Boolean));
  const totalNpc = allNpcIds.size;
  const encounteredNpc = Array.from(encounteredNpcIds).filter((id) => allNpcIds.has(id)).length;
  const remainingNpc = Math.max(0, totalNpc - encounteredNpc);

  const allMoves = getAllPetSkillMoves();
  const allMoveMap = new Map();
  const allMoveNameMap = new Map();
  for (const move of allMoves) {
    const id = String(move?.id || '').trim();
    if (!id || allMoveMap.has(id)) continue;
    allMoveMap.set(id, move);
    const moveName = String(move?.name || '').trim();
    if (moveName && !allMoveNameMap.has(moveName)) {
      allMoveNameMap.set(moveName, move);
    }
  }

  const totalSkills = allMoveMap.size;
  const drawnKnownEntries = drawEntries.filter((entry) => allMoveMap.has(String(entry?.id || '').trim()));
  const drawnIds = new Set(drawnKnownEntries.map((entry) => String(entry.id || '').trim()).filter(Boolean));

  const ownedPets = getPlayerOwnedPets(String(player?.id || '').trim());
  const learnedMoveIds = new Set();
  for (const pet of ownedPets) {
    const moves = Array.isArray(pet?.moves) ? pet.moves : [];
    for (const m of moves) {
      const id = String(m?.id || '').trim();
      if (id && allMoveMap.has(id)) learnedMoveIds.add(id);
    }
  }

  const chipMoveIds = new Map();
  const inventory = Array.isArray(player?.inventory) ? player.inventory : [];
  for (const raw of inventory) {
    const moveName = extractSkillChipMoveName(raw);
    if (!moveName) continue;
    const move = allMoveNameMap.get(String(moveName || '').trim());
    const moveId = String(move?.id || '').trim();
    if (!moveId || !allMoveMap.has(moveId)) continue;
    chipMoveIds.set(moveId, (chipMoveIds.get(moveId) || 0) + 1);
  }

  const collectedIds = new Set([...drawnIds, ...learnedMoveIds, ...chipMoveIds.keys()]);
  const collectedSkills = collectedIds.size;
  const remainingSkills = Math.max(0, totalSkills - collectedSkills);
  const totalDrawCount = Math.max(
    0,
    Number(codex.drawTotalCount || 0),
    drawEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.count || 0)), 0)
  );

  const drawCountById = new Map();
  for (const entry of drawnKnownEntries) {
    const id = String(entry?.id || '').trim();
    if (!id) continue;
    drawCountById.set(id, Math.max(0, Number(entry.count || 0)));
  }

  const collectedSkillEntries = Array.from(collectedIds).map((moveId) => {
    const move = allMoveMap.get(moveId) || {};
    const drawCount = drawCountById.get(moveId) || 0;
    const chipCount = chipMoveIds.get(moveId) || 0;
    const learned = learnedMoveIds.has(moveId);
    const drawEntry = drawnKnownEntries.find((entry) => String(entry?.id || '').trim() === moveId);
    const lastAt = Math.max(
      0,
      Number(drawEntry?.lastAt || 0),
      learned ? Date.now() : 0
    );
    return {
      id: moveId,
      name: String(move?.name || drawEntry?.name || moveId),
      tier: Math.max(1, Math.min(3, Number(move?.tier || drawEntry?.tier || 1))),
      drawCount,
      chipCount,
      learned,
      lastAt
    };
  }).sort((a, b) => {
    const byTime = Number(b.lastAt || 0) - Number(a.lastAt || 0);
    if (byTime !== 0) return byTime;
    const byTier = Number(b.tier || 1) - Number(a.tier || 1);
    if (byTier !== 0) return byTier;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
  });

  const uniqueTier = { 1: 0, 2: 0, 3: 0 };
  const pullTier = { 1: 0, 2: 0, 3: 0 };
  for (const entry of collectedSkillEntries) {
    const tier = Math.max(1, Math.min(3, Number(entry.tier || 1)));
    uniqueTier[tier] += 1;
    pullTier[tier] += Math.max(0, Number(entry.drawCount || 0));
  }

  const remainingTier = { 1: 0, 2: 0, 3: 0 };
  for (const [moveId, move] of allMoveMap.entries()) {
    if (collectedIds.has(moveId)) continue;
    const tier = Math.max(1, Math.min(3, Number(move?.tier || 1)));
    remainingTier[tier] += 1;
  }

  return {
    codex,
    npcEntries,
    drawEntries: drawnKnownEntries,
    skillEntries: collectedSkillEntries,
    totalNpc,
    encounteredNpc,
    remainingNpc,
    totalSkills,
    collectedSkills,
    remainingSkills,
    totalDrawCount,
    uniqueTier,
    pullTier,
    remainingTier
  };
}

async function showPlayerCodex(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }

  let mutated = ensurePlayerGenerationSchema(player);
  if (recordNearbyNpcEncounters(player, 8)) mutated = true;
  if (mutated) CORE.savePlayer(player);

  const uiLang = getPlayerUILang(player);
  const labels = getCodexLabels(uiLang);
  const data = collectPlayerCodexData(player);

  const embed = new EmbedBuilder()
    .setTitle(labels.overviewTitle)
    .setColor(0x3b82f6)
    .setDescription(labels.overviewDesc)
    .addFields(
      {
        name: labels.npcProgress,
        value:
          `已收集：**${data.encounteredNpc}/${data.totalNpc || 0}**\n` +
          `${labels.unknownCount}：**${data.remainingNpc}**（${labels.canFight}）\n` +
          `遭遇總次數：**${Math.max(0, Number(data.codex?.npcEncounterTotal || 0))}**`,
        inline: true
      },
      {
        name: labels.skillProgress,
        value:
          `已收集：**${data.collectedSkills}/${data.totalSkills || 0}**\n` +
          `${labels.unknownCount}：**${data.remainingSkills}**（${labels.canDraw}）\n` +
          `抽取總次數：**${data.totalDrawCount}**\n` +
          `（含：抽取 / 寵物已學 / 背包技能晶片）`,
        inline: true
      }
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_codex_npc').setLabel(labels.npcButton).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('show_codex_skill').setLabel(labels.skillButton).setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function showNpcCodex(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }

  let mutated = ensurePlayerGenerationSchema(player);
  if (recordNearbyNpcEncounters(player, 8)) mutated = true;
  if (mutated) CORE.savePlayer(player);

  const uiLang = getPlayerUILang(player);
  const labels = getCodexLabels(uiLang);
  const data = collectPlayerCodexData(player);

  const npcLines = data.npcEntries.slice(0, 18).map((entry, idx) =>
    `${idx + 1}. ${entry.name}${entry.title ? `（${entry.title}）` : ''}｜${entry.lastLocation || '未知地點'}`
  );

  const embed = new EmbedBuilder()
    .setTitle(labels.npcTitle)
    .setColor(0x4f46e5)
    .setDescription(
      `已收集 **${data.encounteredNpc}/${data.totalNpc || 0}** ｜ ` +
      `未收集 **${data.remainingNpc}**（${labels.canFight}）`
    )
    .addFields(
      { name: labels.npcCollected, value: formatCodexLines(npcLines, 1020, labels.npcEmpty), inline: false },
      { name: labels.npcUnknown, value: `尚有 **${data.remainingNpc}** 位未收集（名稱隱藏）`, inline: false }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_codex').setLabel(labels.backCodex).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_codex_skill').setLabel(labels.skillButton).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

async function showSkillCodex(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }

  let mutated = ensurePlayerGenerationSchema(player);
  if (recordNearbyNpcEncounters(player, 8)) mutated = true;
  if (mutated) CORE.savePlayer(player);

  const uiLang = getPlayerUILang(player);
  const labels = getCodexLabels(uiLang);
  const data = collectPlayerCodexData(player);

  const skillLines = data.skillEntries.slice(0, 30).map((entry, idx) => {
    const tier = Math.max(1, Math.min(3, Number(entry.tier || 1)));
    const tierEmoji = tier === 3 ? '🔮' : tier === 2 ? '💠' : '⚪';
    const tags = [];
    if (Number(entry.drawCount || 0) > 0) tags.push(`抽取x${Number(entry.drawCount || 0)}`);
    if (Number(entry.chipCount || 0) > 0) tags.push(`晶片x${Number(entry.chipCount || 0)}`);
    if (entry.learned) tags.push('寵物已學');
    const source = tags.length > 0 ? `｜${tags.join('・')}` : '';
    return `${idx + 1}. ${tierEmoji} ${entry.name}${source}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(labels.skillTitle)
    .setColor(0x0ea5e9)
    .setDescription(
      `已收集 **${data.collectedSkills}/${data.totalSkills || 0}** ｜ ` +
      `未收集 **${data.remainingSkills}**（${labels.canDraw}）`
    )
    .addFields(
      {
        name: labels.skillCollected,
        value: formatCodexLines(skillLines, 1020, labels.skillEmpty),
        inline: false
      },
      {
        name: labels.skillUnknown,
        value:
          `尚有 **${data.remainingSkills}** 招未收集（名稱隱藏）\n` +
          `T1/T2/T3 剩餘：${data.remainingTier[1]}/${data.remainingTier[2]}/${data.remainingTier[3]}`,
        inline: false
      }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_codex').setLabel(labels.backCodex).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_codex_npc').setLabel(labels.npcButton).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

// ============== 處理事件 ==============
async function handleEvent(interaction, user, eventIndex, options = {}) {
  const player = CORE.loadPlayer(user.id);
  const respondError = async (content) => {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ephemeral: true }).catch(() => {});
      return;
    }
    if (interaction?.isButton && interaction.isButton()) {
      await interaction.reply({ content, ephemeral: true }).catch(() => {});
      return;
    }
    if (interaction?.isModalSubmit && interaction.isModalSubmit()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content, ephemeral: true }).catch(() => {});
      }
      return;
    }
    await interaction.reply({ content, ephemeral: true }).catch(() => {});
  };

  if (!player) {
    await respondError('❌ 請重新開始！');
    return;
  }

  const choices = player.eventChoices || [];
  const event = choices[eventIndex];
  const wishTextFromModal = String(options?.wishText || '').trim();
  const customActionTextFromModal = String(options?.customActionText || '').trim();

  if (!event) {
    await respondError('❌ 事件不存在！');
    return;
  }

  // Modal 類事件先快速回應，避免先做重操作導致 3 秒超時
  if (event.action === 'wish_pool' && !wishTextFromModal) {
    const modal = new ModalBuilder()
      .setCustomId(`wish_pool_submit_${eventIndex}`)
      .setTitle('🪙 許願池');
    const wishInput = new TextInputBuilder()
      .setCustomId('wish_text')
      .setLabel('你想許下什麼願望？')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('例如：希望賺很多錢、希望變強、希望遇到貴人...')
      .setRequired(true)
      .setMaxLength(120);
    modal.addComponents(new ActionRowBuilder().addComponents(wishInput));
    await interaction.showModal(modal).catch(async () => {
      await interaction.reply({ content: '⚠️ 無法開啟許願輸入框，請再點一次。', ephemeral: true }).catch(() => {});
    });
    return;
  }

  if (event.action === 'custom_input' && !customActionTextFromModal) {
    const modal = new ModalBuilder()
      .setCustomId(`custom_action_submit_${eventIndex}`)
      .setTitle('✍️ 自訂行動');
    const actionInput = new TextInputBuilder()
      .setCustomId('custom_action_text')
      .setLabel('你接下來想做什麼？')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('例如：我去跟茶師談判，要求先合作再分成')
      .setRequired(true)
      .setMaxLength(CUSTOM_INPUT_MAX_LENGTH);
    modal.addComponents(new ActionRowBuilder().addComponents(actionInput));
    await interaction.showModal(modal).catch(async () => {
      await interaction.reply({ content: '⚠️ 無法開啟自訂輸入框，請再點一次。', ephemeral: true }).catch(() => {});
    });
    return;
  }

  // 一般事件按鈕先 ACK，避免 Discord 顯示「此交互失敗」
  if (interaction?.isButton && interaction.isButton() && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  if (!pet) {
    await respondError('❌ 請重新開始！');
    return;
  }

  if (petResolved?.changed) {
    CORE.savePlayer(player);
  }
  if (ensurePlayerGenerationSchema(player)) {
    CORE.savePlayer(player);
  }
  if (recordNearbyNpcEncounters(player, 8)) {
    CORE.savePlayer(player);
  }
  ECON.ensurePlayerEconomy(player);
  if (!Array.isArray(player.herbs)) player.herbs = [];
  if (!Array.isArray(player.inventory)) player.inventory = [];
  const worldDay = Number(CORE.getWorld()?.day || 1);

  MAIN_STORY.ensureMainStoryState(player);
  ensurePlayerIslandState(player);
  const islandLocationBefore = String(player.location || '').trim();
  const islandStateBefore = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
    ? ISLAND_STORY.getIslandStoryState(player, islandLocationBefore)
    : null;
  
  if (event?.enemy?.id) {
    const npc = typeof CORE.getAgentFullInfo === 'function'
      ? CORE.getAgentFullInfo(event.enemy.id)
      : null;
    if (npc && recordNpcEncounter(player, npc, player.location)) {
      CORE.savePlayer(player);
    }
  }

  const playerId = player?.id || user.id;
  if (!tryAcquireStoryLock(playerId, 'event')) {
    await notifyStoryBusy(interaction);
    return;
  }

  let releaseInScope = true;
  try {
  // 執行事件（傳送門為特殊流程，不走一般事件表）
  let result = null;
  let selectedChoice = event.choice || event.name || '未知選擇';
  const eventMainlineGoal = String(event?.mainlineGoal || '').trim();
  const eventMainlineProgress = String(event?.mainlineProgress || '').trim();
  const eventMainlineStage = Math.max(1, Number(event?.mainlineStage || 1));
  const eventMainlineStageCount = Math.max(eventMainlineStage, Number(event?.mainlineStageCount || 8));
  let extraStoryGuide = '';
  const pendingMemories = [];
  const queueMemory = (memory) => {
    if (memory?.content) pendingMemories.push(memory);
  };
  const flushMemories = () => {
    for (const memory of pendingMemories) {
      rememberPlayer(player, memory);
    }
    pendingMemories.length = 0;
  };

  if (event.action === 'wish_pool' && wishTextFromModal && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  if (event.action === 'custom_input' && customActionTextFromModal && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  if (event.action === 'scratch_lottery') {
    const marketType = /digital|暗潮|黑市/u.test([event.name || '', event.choice || '', event.desc || ''].join(' '))
      ? 'digital'
      : 'renaiss';
    openShopSession(player, marketType, selectedChoice);
    queueMemory({
      type: '商店',
      content: `進入${getMarketTypeLabel(marketType)}`,
      outcome: '主選單刮刮樂入口已導向商店內櫃檯操作',
      importance: 1,
      tags: ['market', marketType, 'shop_enter', 'scratch_gate']
    });
    flushMemories();
    CORE.savePlayer(player);
    try {
      await showWorldShopScene(
        interaction,
        user,
        marketType,
        '🧭 刮刮樂已移至商店內操作，請點「🎟️ 刮刮樂(100)」。'
      );
    } catch (shopErr) {
      console.error('[商店] 刮刮樂入口開啟失敗:', shopErr?.message || shopErr);
      await respondError(`❌ 無法開啟${getMarketTypeLabel(marketType)}，請再試一次。`);
      return;
    }
    if (interaction.message?.id) {
      trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
    }
    return;
  } else if (event.action === 'market_renaiss' || event.action === 'market_digital') {
    const marketType = event.action === 'market_digital' ? 'digital' : 'renaiss';
    openShopSession(player, marketType, selectedChoice);
    queueMemory({
      type: '商店',
      content: `進入${getMarketTypeLabel(marketType)}`,
      outcome: '商店場景開啟',
      importance: 2,
      tags: ['market', marketType, 'shop_enter']
    });
    flushMemories();
    CORE.savePlayer(player);

    const intro = marketType === 'digital'
      ? '你推門進入店內，老闆笑著招手，語氣親切卻帶著一絲試探。'
      : '你走進店內，牆上掛著完整估值表，老闆示意你先看規則。';
    try {
      await showWorldShopScene(interaction, user, marketType, intro);
    } catch (shopErr) {
      console.error('[商店] 鑑價站開啟失敗:', shopErr?.message || shopErr);
      await respondError(`❌ 無法開啟${getMarketTypeLabel(marketType)}，請再點一次。`);
      return;
    }
    if (interaction.message?.id) {
      trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
    }
    return;
  } else if (event.action === 'main_story') {
    const mainlineNarrative = String(event.mainlineNarrative || '').trim();
    const mainlineGoal = eventMainlineGoal;
    const mainlineProgress = eventMainlineProgress;
    const fallbackMsg = String(event.desc || event.choice || '主線正在暗中推進。').trim();
    const message = mainlineNarrative || fallbackMsg;
    const messageWithProgress = mainlineProgress ? `${message}\n📌 ${mainlineProgress}` : message;
    result = {
      type: 'main_story',
      message: messageWithProgress
    };
    selectedChoice = String(event.choice || event.name || '主線推進');
    if (mainlineGoal) {
      setMainlineBridgeLock(player, {
        goal: mainlineGoal,
        location: String(player.location || '').trim(),
        stage: eventMainlineStage,
        stageCount: eventMainlineStageCount,
        progress: mainlineProgress || `本區主線進行中（${String(player.location || '').trim() || '當前地區'}）`,
        sourceChoice: selectedChoice
      });
    }
    queueMemory({
      type: '主線',
      content: mainlineGoal || selectedChoice || '主線改為被動觸發，不需固定按鈕',
      importance: 1,
      tags: ['main_story']
    });
  } else if (event.action === 'portal_intent') {
    const nearbyPortals = typeof getPortalDestinations === 'function'
      ? getPortalDestinations(player.location || '')
      : [];
    player.portalMenuOpen = Array.isArray(nearbyPortals) && nearbyPortals.length > 0;
    extraStoryGuide = player.portalMenuOpen
      ? buildPortalUsageGuide(player)
      : '🌀 你嘗試感應傳送門，但目前沒有可用的主節點。';
    result = {
      type: 'portal_ready',
      message: player.portalMenuOpen
        ? `你在${player.location}感應到穩定傳送門節點，門紋逐漸亮起。`
        : `你在${player.location}搜尋傳送門訊號，但尚無可用主節點。`
    };
    queueMemory({
      type: '傳送',
      content: player.portalMenuOpen ? `啟動${player.location}附近傳送門` : `嘗試啟動${player.location}傳送門`,
      outcome: player.portalMenuOpen ? '可在地圖選擇傳送目的地' : '未找到可用傳送門',
      importance: 2,
      tags: ['portal']
    });
  } else if (event.action === 'teleport' && event.targetLocation) {
    const fromLocation = player.location;
    const targetLocation = event.targetLocation;
    const entryGate = canEnterLocation(player, targetLocation);
    if (!entryGate.allowed) {
      result = {
        type: 'travel_blocked',
        message: `🛑 你嘗試前往 **${targetLocation}**，但目前勝率僅 **${format1(entryGate.winRate)}%**（門檻 > ${format1(LOCATION_ENTRY_MIN_WINRATE)}%）。請先提升實力再前往。`
      };
      queueMemory({
        type: '移動',
        content: `嘗試前往${targetLocation}`,
        outcome: `受阻｜勝率 ${format1(entryGate.winRate)}%`,
        importance: 2,
        tags: ['travel', 'blocked', 'entry_gate']
      });
    } else {
    player.location = targetLocation;
    syncLocationArcLocation(player);
    ensurePlayerIslandState(player);
    player.portalMenuOpen = false;
    player.navigationTarget = '';
    queueMemory({
      type: '移動',
      content: `經傳送門由${fromLocation}前往${targetLocation}`,
      outcome: '完成傳送',
      importance: 2,
      tags: ['travel', 'teleport']
    });
    result = {
      type: 'travel',
      message: `🌀 傳送門啟動，空間在你腳下折疊。眨眼間，你已抵達 **${targetLocation}**。`
    };
    }
  } else if (event.action === 'wish_pool') {
    const safeWishText = wishTextFromModal.slice(0, 120);
    selectedChoice = `在許願池許願：「${safeWishText}」`;

    const outcome = await WISH.judgeWishWithAI({
      wishText: safeWishText,
      player
    });
    const applied = WISH.applyWishOutcome(player, outcome);
    const summaryText = applied.summaryLines.length > 0
      ? '\n\n' + applied.summaryLines.join(' | ')
      : '';

    result = {
      type: 'wish_pool',
      message:
        `🪙 **${outcome.title}**\n` +
        `${outcome.immediateText}\n\n` +
        `${outcome.futureHook}${summaryText}`
    };
    if (applied.delta?.gold > 0) {
      result.gold = applied.delta.gold;
    }

    publishWorldEvent(
      `🪙 ${player.name}在${player.location}的許願池許願「${safeWishText}」，結果：${outcome.worldRumor}`,
      'wish_pool',
      {
        actor: player.name,
        location: player.location,
        wish: safeWishText,
        rumor: String(outcome.worldRumor || '').slice(0, 120)
      }
    );
    queueMemory({
      type: '許願',
      content: `${safeWishText} -> ${outcome.title}`,
      outcome: outcome.futureHook,
      importance: 3,
      tags: ['wish_pool']
    });
  } else if (event.action === 'custom_input') {
    const safeCustomAction = customActionTextFromModal.slice(0, CUSTOM_INPUT_MAX_LENGTH);
    selectedChoice = `自訂行動：「${safeCustomAction}」`;

    const outcome = await WISH.judgeCustomActionWithAI({
      actionText: safeCustomAction,
      player
    });
    const applied = WISH.applyWishOutcome(player, outcome);
    const summaryText = applied.summaryLines.length > 0
      ? '\n\n' + applied.summaryLines.join(' | ')
      : '';

    result = {
      type: 'custom_input',
      message:
        `✍️ **${outcome.title}**\n` +
        `${outcome.immediateText}\n\n` +
        `${outcome.futureHook}${summaryText}`,
      skipGoldApply: true,
      customVerdict: outcome.verdict
    };

    publishWorldEvent(
      `✍️ ${player.name}在${player.location}採取自訂行動「${safeCustomAction}」，後續傳聞：${outcome.worldRumor}`,
      'custom_input',
      {
        actor: player.name,
        location: player.location,
        actionText: safeCustomAction,
        verdict: String(outcome.verdict || 'costly'),
        rumor: String(outcome.worldRumor || '').slice(0, 120)
      }
    );

    queueMemory({
      type: '自訂行動',
      content: `${safeCustomAction} -> ${outcome.title}`,
      outcome: `${outcome.verdict || 'costly'}｜${outcome.futureHook || ''}`.slice(0, 180),
      importance: outcome.verdict === 'allow' ? 2 : 3,
      tags: ['custom_input', String(outcome.verdict || 'costly')]
    });
  } else if (event.action === 'location_story_battle') {
    const fallback = createGuaranteedLocationStoryBattleChoice(
      player,
      String(player?.currentStory || player?.generationState?.storySnapshot || '')
    );
    const enemyTemplate = (event?.enemy && typeof event.enemy === 'object')
      ? { ...event.enemy }
      : (fallback?.enemy ? { ...fallback.enemy } : null);
    const npcId = String(event?.npcId || fallback?.npcId || enemyTemplate?.id || '').trim();
    const npcName = String(event?.npcName || fallback?.npcName || enemyTemplate?.name || '在地敵對勢力').trim();
    selectedChoice = event.choice || fallback?.choice || `在${player.location}迎戰${npcName}`;
    result = {
      type: 'combat',
      message:
        String(event?.desc || '').trim() ||
        `你沿著${player.location}的暗線追上${npcName}，雙方話語未落便爆發正面衝突。`,
      enemy: enemyTemplate || {
        id: npcId || 'local_story_enemy',
        name: npcName || '在地敵對勢力',
        hp: 130,
        maxHp: 130,
        attack: 28,
        defense: 12,
        moves: ['突襲', '壓制'],
        reward: { gold: [60, 120] },
        isMonster: false,
        companionPet: false
      },
      npcId,
      npcName,
      locationStoryBattle: true
    };
    queueMemory({
      type: '地區篇章',
      content: `在${player.location}對上${npcName}`,
      outcome: '地區關鍵戰啟動',
      importance: 3,
      tags: ['location_story', 'combat']
    });
  } else if (event.action === 'mentor_spar') {
    result = buildMentorSparResult(event, player, pet);
    selectedChoice = event.choice || `向${result?.mentorSpar?.mentorName || event?.mentorName || '導師'}提出友誼賽`;
    if (result?.type === 'combat') {
      queueMemory({
        type: '友誼賽',
        content: selectedChoice,
        outcome: `對手 ${result?.mentorSpar?.mentorName || result?.enemy?.name || '導師'}｜門檻 ${Math.round(Number(result?.mentorSpar?.acceptHpRatio || MENTOR_SPAR_WIN_HP_RATIO) * 100)}%`,
        importance: 2,
        tags: ['mentor_spar', 'training']
      });
    } else {
      queueMemory({
        type: '友誼賽',
        content: `嘗試發起友誼賽：${selectedChoice}`,
        outcome: '附近暫無可切磋導師',
        importance: 1,
        tags: ['mentor_spar', 'unavailable']
      });
    }
  } else {
    result = EVENTS.executeEvent(event, player);
    queueMemory({
      type: event.tag ? '行動' : '選擇',
      content: selectedChoice,
      tags: [String(event.action || ''), String(result?.type || '')].filter(Boolean)
    });

    if (result?.type === 'combat') {
      const hasExplicitEnemy = Boolean(result?.enemy?.name || event?.enemy?.name);
      if (!hasExplicitEnemy) {
        const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
        const fallbackTarget = resolveLocationStoryBattleTarget(player, storyText, {
          allowLooseSelection: true,
          wantedLevel: getPlayerWantedPressure(player),
          preferVillain: getPlayerWantedPressure(player) >= WANTED_AMBUSH_MIN_LEVEL
        });
        if (fallbackTarget?.enemy) {
          result.enemy = fallbackTarget.enemy;
          result.npcId = fallbackTarget.npcId;
          result.npcName = fallbackTarget.npcName;
          const joinLine = `${result.message || event.desc || ''}`.trim();
          result.message = `${joinLine}\n\n你在${player.location}與${fallbackTarget.npcName}正面衝突，戰鬥無可避免。`.trim();
          queueMemory({
            type: '遭遇',
            content: `在${player.location}對上${fallbackTarget.npcName}`,
            outcome: '由當前場景人物直接引發衝突',
            importance: 2,
            tags: ['combat', 'story_bound']
          });
        }
      }
    }

    if (result?.type === 'social') {
      const nearbyNpcIds = typeof CORE.getNearbyNpcIds === 'function'
        ? CORE.getNearbyNpcIds(player.location, 1)
        : [];
      const targetNpcId = nearbyNpcIds[0];
      if (targetNpcId) {
        const npcInfo = typeof CORE.getAgentFullInfo === 'function'
          ? CORE.getAgentFullInfo(targetNpcId)
          : null;
        if (npcInfo && typeof CORE.negotiationPrompt === 'function') {
          try {
            const npcReply = await CORE.negotiationPrompt(
              npcInfo,
              player,
              selectedChoice,
              process.env.MINIMAX_API_KEY || ''
            );
            result.message = `${result.message || ''}\n\n💬 ${npcInfo.name}：${npcReply}`.trim();
            result.npcId = targetNpcId;
            result.npcName = npcInfo.name;
            result.npcDialogueGenerated = true;
            appendNpcDialogueLog(player, {
              speaker: npcInfo.name,
              text: npcReply,
              location: player.location,
              source: 'social_npc_reply'
            });
            if (typeof CORE.appendNpcQuoteMemory === 'function') {
              CORE.appendNpcQuoteMemory(user.id, {
                npcId: targetNpcId,
                npcName: npcInfo.name,
                speaker: npcInfo.name,
                text: npcReply,
                location: player.location,
                source: 'social_npc_reply'
              });
            }
          } catch (npcErr) {
            throw new Error(`NPC 對話生成失敗：${npcErr?.message || npcErr}`);
          }
        }
      }
    }
  }

  if (result) {
    const goldDelta = Number(result.gold || 0);
    if (!result.skipGoldApply && Number.isFinite(goldDelta) && goldDelta !== 0) {
      player.stats.財富 = Math.max(0, Number(player.stats.財富 || 0) + goldDelta);
      recordCashflow(player, {
        amount: goldDelta,
        category: `event_${String(result.type || event.action || 'action')}`.slice(0, 40),
        source: selectedChoice || event.name || event.action || '事件結算'
      });
    }
    const cost = Number(result.cost || 0);
    if (Number.isFinite(cost) && cost > 0) {
      player.stats.財富 = Math.max(0, Number(player.stats.財富 || 0) - cost);
      recordCashflow(player, {
        amount: -cost,
        category: `cost_${String(result.type || event.action || 'action')}`.slice(0, 40),
        source: selectedChoice || event.name || event.action || '事件花費'
      });
    }
    if (Number.isFinite(Number(result.reputation)) && Number(result.reputation) !== 0) {
      player.reputation = Number(player.reputation || 0) + Number(result.reputation);
    }
    if (result.item && result.success) {
      if (result.type === 'gather') appendUniqueItem(player.herbs, result.item, 80);
      if (result.type === 'hunt') appendUniqueItem(player.inventory, result.item, 120);
    }
    if (result.type === 'social') {
      if (result.npcDialogueGenerated) {
        // negotiationPrompt 內已寫入 NPC 私有/公共記憶，這裡避免重複寫入
      } else {
      const npcIds = typeof CORE.getNearbyNpcIds === 'function'
        ? CORE.getNearbyNpcIds(player.location, 1)
        : [];
      const targetNpcId = npcIds[0];
      if (targetNpcId) {
        CORE.appendNpcMemory(targetNpcId, user.id, {
          type: '互動',
          content: `${player.name} 與我互動：${selectedChoice}`,
          outcome: String(result.message || '交換了情報').slice(0, 160),
          location: player.location,
          tags: ['social', 'private'],
          importance: 2
        }, { scope: 'private' });
      }
      }
    }

    let tradeGood = await maybeGenerateTradeGoodFromChoice(event, player, result, selectedChoice);
    if (!tradeGood && result?.success !== false && String(result?.type || '') !== 'combat') {
      player.noLootStreak = Math.max(0, Number(player.noLootStreak || 0)) + 1;
      if (player.noLootStreak >= 4) {
        const luck = Number(player?.stats?.運氣 || 50);
        tradeGood = Math.random() < 0.6
          ? ECON.createTreasureLoot(player.location || '未知地點', luck, { lang: player?.language || 'zh-TW' })
          : ECON.createForageLoot(player.location || '未知地點', luck, { lang: player?.language || 'zh-TW' });
        player.noLootStreak = 0;
      }
    } else if (tradeGood) {
      player.noLootStreak = 0;
    }
    if (tradeGood) {
      ECON.addTradeGood(player, tradeGood);
      result.loot = tradeGood;
      const lootText = `🧰 你取得可交易物：${tradeGood.name}（${tradeGood.rarity}），鑑價參考 ${tradeGood.value} Rns 代幣。`;
      result.message = result.message ? `${result.message}\n\n${lootText}` : lootText;
      queueMemory({
        type: '戰利品',
        content: tradeGood.name,
        outcome: `${tradeGood.rarity}｜估值 ${tradeGood.value} Rns 代幣`,
        importance: 2,
        tags: ['loot', String(tradeGood.category || 'goods')]
      });
    }
  }

  const roamTravel = maybeApplyRoamMovement(player, event, result, queueMemory);
  if (roamTravel?.targetLocation) {
    const movedPortals = typeof getPortalDestinations === 'function'
      ? getPortalDestinations(player.location || '')
      : [];
    if (Array.isArray(movedPortals) && movedPortals.length > 0) {
      extraStoryGuide = buildPortalUsageGuide(player);
    }
  }

  const arcStateForMission = syncLocationArcLocation(player);
  const turnsInLocationForMission = Number(arcStateForMission?.turnsInLocation || 0);
  const storyTurnsForMission = getPlayerStoryTurns(player);

  const actionEvidence = (typeof MAIN_STORY.recordActionEvidence === 'function')
    ? MAIN_STORY.recordActionEvidence(player, {
      location: String(islandLocationBefore || player.location || '').trim(),
      regionId: String(getLocationStoryMetadata(islandLocationBefore || player.location || '')?.regionId || '').trim(),
      selectedChoice,
      eventAction: String(event?.action || '').trim(),
      resultType: String(result?.type || '').trim(),
      resultMessage: String(result?.message || '').trim(),
      npcName: String(result?.npcName || event?.npcName || '').trim(),
      storyTurns: storyTurnsForMission,
      turnsInLocation: turnsInLocationForMission
    })
    : null;
  if (actionEvidence?.appendText) {
    result.message = `${result.message || ''}\n\n${actionEvidence.appendText}`.trim();
  }
  if (actionEvidence?.announcement) {
    EVENTS.addWorldEvent(actionEvidence.announcement, 'main_story');
  }
  if (actionEvidence?.memory) {
    queueMemory({
      type: '主線',
      content: actionEvidence.memory,
      importance: 3,
      tags: ['main_story', 'key_mission']
    });
  }

  const missionLead = (typeof MAIN_STORY.maybeTriggerMissionNpcLead === 'function')
    ? MAIN_STORY.maybeTriggerMissionNpcLead(player, {
      location: String(player.location || '').trim(),
      regionId: String(getLocationStoryMetadata(player.location || '')?.regionId || '').trim(),
      storyTurns: storyTurnsForMission,
      turnsInLocation: turnsInLocationForMission
    })
    : null;
  if (missionLead?.appendText) {
    result.message = `${result.message || ''}\n\n${missionLead.appendText}`.trim();
  }
  if (missionLead?.memory) {
    queueMemory({
      type: '主線',
      content: missionLead.memory,
      importance: 2,
      tags: ['main_story', 'npc_lead']
    });
  }

  const passive = MAIN_STORY.maybeTriggerPassiveStory(player, { event, result });
  if (passive?.overrideResult) {
    result = passive.overrideResult;
    selectedChoice = `${selectedChoice}（主線觸發）`;
  }
  if (passive?.appendText) {
    result.message = `${result.message || ''}\n\n${passive.appendText}`.trim();
  }
  if (passive?.announcement) {
    EVENTS.addWorldEvent(passive.announcement, 'main_story');
  }
  if (passive?.memory) {
    queueMemory({
      type: '主線',
      content: passive.memory,
      importance: 3,
      tags: ['main_story']
    });
  }

  const enteringBattleNow = shouldTriggerBattle(event, result);
  if (enteringBattleNow) {
    clearPendingConflictFollowup(player);
  } else if (isAggressiveChoice(event)) {
    const storySnapshotBeforeChoice = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
    const displayName = pickStoryConflictDisplayName(player, storySnapshotBeforeChoice, selectedChoice);
    setPendingConflictFollowup(player, {
      displayName,
      sourceChoice: selectedChoice,
      location: player.location
    });
  }

  recordPlayerChoiceHistory(player, event, selectedChoice);

  const outcomeParts = [];
  if (result?.type) outcomeParts.push(`類型:${result.type}`);
  if (Number.isFinite(Number(result?.gold)) && Number(result.gold) !== 0) {
    outcomeParts.push(`Rns 代幣 ${Number(result.gold) > 0 ? '+' : ''}${Number(result.gold)}`);
  }
  if (result?.wantedLevel) outcomeParts.push(`通緝 ${result.wantedLevel}`);
  if (result?.loot?.name) outcomeParts.push(`掉落:${result.loot.name}`);
  if (Number.isFinite(Number(result?.digitalRiskScore))) {
    const score = Number(result.digitalRiskScore);
    const delta = Number(result.digitalRiskDelta || 0);
    const digitalMasked = Boolean(result?.digitalMasked || isDigitalMaskPhaseForPlayer(player));
    outcomeParts.push(
      digitalMasked
        ? `市場異常 ${score}/100${delta > 0 ? `(+${delta})` : ''}`
        : `Digital風險 ${score}/100${delta > 0 ? `(+${delta})` : ''}`
    );
  }
  if (result?.type === 'combat') {
    const enemyName = result?.enemy?.name || event?.enemy?.name || '未知敵人';
    outcomeParts.push(`遭遇:${enemyName}`);
  }
  if (result?.autoTravel?.targetLocation) {
    outcomeParts.push(`移動:${result.autoTravel.fromLocation}->${result.autoTravel.targetLocation}`);
  }
  queueMemory({
    type: '結果',
    content: selectedChoice,
    outcome: outcomeParts.join(' | ') || '事件推進',
    importance: result?.type === 'combat' ? 2 : 1,
    tags: [String(event.action || ''), String(result?.type || '')].filter(Boolean)
  });
  
  incrementPlayerStoryTurns(player, 1);
  const recoveryTick = applyPetRecoveryTurnTick(pet, 1);
  if (recoveryTick.changed) {
    PET.savePet(pet);
  }
  if (recoveryTick.revived) {
    result.petRevived = true;
    queueMemory({
      type: '恢復',
      content: `${pet.name} 完成復活`,
      outcome: '戰敗後經過 2 回合已回到可戰鬥狀態',
      importance: 2,
      tags: ['pet_revive', 'turn_based']
    });
  }
  incrementLocationArcTurns(player, 1);
  const islandProgressAfterTurn = syncCurrentIslandStoryProgress(player);
  const islandCompletedNow = Boolean(
    !Boolean(islandStateBefore?.completed) &&
    islandProgressAfterTurn?.completed
  );
  const completedLocation = String(player.location || '').trim();
  const regionMissionAtCompletion = (MAIN_STORY && typeof MAIN_STORY.getCurrentRegionMission === 'function')
    ? MAIN_STORY.getCurrentRegionMission(player, completedLocation)
    : null;
  const shouldHoldForRegionMission = Boolean(regionMissionAtCompletion && !regionMissionAtCompletion.keyFound);
  const completedChapterTitle = ISLAND_STORY && typeof ISLAND_STORY.getStoryChapterTitle === 'function'
    ? String(ISLAND_STORY.getStoryChapterTitle(completedLocation) || '島內篇章').trim()
    : '島內篇章';
  const nextIslandHint = islandCompletedNow && ISLAND_STORY && typeof ISLAND_STORY.getNextPrimaryLocation === 'function'
    ? ISLAND_STORY.getNextPrimaryLocation(completedLocation)
    : '';
  const nextPortalHubHint = nextIslandHint && typeof getLocationPortalHub === 'function'
    ? String(getLocationPortalHub(nextIslandHint) || '').trim()
    : '';
  if (islandCompletedNow && !shouldHoldForRegionMission) {
    // 這個地區已完成：開放同區自由遊走（可不傳送）
    unlockRegionFreeRoamByLocation(player, completedLocation);
    // 收尾點直接把玩家帶到該區主傳送門旁，讓轉場更自然
    const regionPortalHub = typeof getLocationPortalHub === 'function'
      ? String(getLocationPortalHub(completedLocation) || '').trim()
      : '';
    let movedToPortalHub = false;
    if (regionPortalHub && regionPortalHub !== completedLocation) {
      const fromLocation = completedLocation;
      player.location = regionPortalHub;
      syncLocationArcLocation(player);
      movedToPortalHub = true;
      const handoffLine = (getPlayerStoryTurns(player) % 2 === 0)
        ? `🧭 你把「${completedChapterTitle}」收束後，順勢走到 **${regionPortalHub}** 主傳送門節點。`
        : `🧭 ${completedLocation} 的關鍵段落告一段落，你跟著導引光帶抵達 **${regionPortalHub}** 主傳送門。`;
      result.message = `${String(result.message || '').trim()}\n\n${handoffLine}`.trim();
      queueMemory({
        type: '移動',
        content: `地區收尾後前往主傳送門`,
        outcome: `${fromLocation} -> ${regionPortalHub}`,
        importance: 2,
        tags: ['travel', 'portal_hub', 'island_story']
      });
    }

    const completedLine = nextPortalHubHint
      ? `📍 ${completedChapterTitle}已完成：你可直接前往 **${nextPortalHubHint}** 接下一段，也可先在本區自由探索。`
      : (nextIslandHint
        ? `📍 ${completedChapterTitle}已完成：下一步可朝 **${nextIslandHint}** 推進，或暫留本區整理線索。`
        : `📍 ${completedChapterTitle}已完成：你可留在本區擴展支線，或自行挑選下一個地區。`);
    result.message = `${String(result.message || '').trim()}\n\n${completedLine}`.trim();
    if (!movedToPortalHub && regionPortalHub) {
      result.message = `${String(result.message || '').trim()}\n\n🧭 你已靠近 **${regionPortalHub}** 主傳送門，可立刻跨區，也可先留在本區延伸支線。`.trim();
    }
    player.portalMenuOpen = true;
    player.forcePortalChoice = true;
    if (nextPortalHubHint && ISLAND_STORY && typeof ISLAND_STORY.unlockLocation === 'function') {
      ISLAND_STORY.unlockLocation(player, nextPortalHubHint);
    }
    queueMemory({
      type: '地區篇章',
      content: `${completedLocation} 劇情已完成`,
      outcome: nextPortalHubHint
        ? `主傳送門啟動｜建議前往 ${nextPortalHubHint}`
        : (nextIslandHint ? `建議前往 ${nextIslandHint}` : '可自由探索或跨區'),
      importance: 2,
      tags: ['island_story', 'completed']
    });
    if (!extraStoryGuide) extraStoryGuide = buildPortalUsageGuide(player);
  } else if (islandCompletedNow && shouldHoldForRegionMission) {
    const missionNpc = String(regionMissionAtCompletion?.npcName || '關鍵NPC').trim();
    const missionLocation = String(regionMissionAtCompletion?.npcLocation || completedLocation).trim();
    const missionEvidence = String(regionMissionAtCompletion?.evidenceName || '關鍵證據').trim();
    result.message = `${String(result.message || '').trim()}\n\n` +
      `📍 ${completedChapterTitle}可自由探索，但你尚未取得本區唯一來源關鍵證據「${missionEvidence}」。\n` +
      `🎯 請優先在 **${missionLocation}** 接觸 **${missionNpc}**，完成後再考慮跨區。`;
    player.portalMenuOpen = false;
    player.forcePortalChoice = false;
    queueMemory({
      type: '主線',
      content: `本區收尾但關鍵證據未取得：${missionEvidence}`,
      outcome: `維持本區調查，優先接觸${missionNpc}@${missionLocation}`,
      importance: 2,
      tags: ['main_story', 'mission_hold']
    });
  }
  if (typeof CORE.advanceRoamingDigitalVillains === 'function') {
    CORE.advanceRoamingDigitalVillains({ steps: 1, persist: true });
  }
  if (event.action === 'market_renaiss' || event.action === 'market_digital') {
    player.lastMarketTurn = getPlayerStoryTurns(player);
  }
  
  // 清除舊選項（必須重新生成）
  player.eventChoices = [];
  const enteringBattle = enteringBattleNow;
  if (!enteringBattle) {
    const passiveHeal = applyPassivePetRecovery(pet, PET_PASSIVE_HEAL_PER_STORY_TURN);
    if (passiveHeal > 0) {
      result.passivePetHeal = passiveHeal;
      queueMemory({
        type: '恢復',
        content: `${pet.name} 在行進中恢復`,
        outcome: `HP +${passiveHeal}`,
        importance: 1,
        tags: ['pet_heal', 'passive_regen']
      });
      PET.savePet(pet);
    }
  }
  
  if (enteringBattle) {
    const preBattleStory = composeActionBridgeStory(
      player,
      selectedChoice,
      String(result?.message || event?.desc || '').trim()
    );
    const enemy = buildEnemyForBattle(
      event,
      result,
      player,
      result?.isMentorSpar ? { skipBeginnerDanger: true } : undefined
    );
    publishBattleWorldEvent(player, enemy?.name || event?.npcName || '未知敵人', 'battle_start');
    if (shouldCountCombatForLocationStory(event, result, enemy)) {
      markCurrentLocationStoryBattleDone(player, {
        npcId: String(event?.npcId || result?.npcId || enemy?.id || '').trim(),
        npcName: String(event?.npcName || result?.npcName || enemy?.name || '').trim(),
        enemyId: String(enemy?.id || '').trim(),
        enemyName: String(enemy?.name || '').trim()
      });
      syncCurrentIslandStoryProgress(player);
    }
    const mentorSparState = result?.isMentorSpar ? { ...(result?.mentorSpar || {}) } : null;
    const fighterType = CORE.canPetFight(pet) ? 'pet' : 'player';
    const battleEstimate = estimateBattleOutcome(player, pet, enemy, fighterType);
    const fighterLabel = fighterType === 'pet'
      ? `🐾 ${pet.name}`
      : `🧍 ${player.name}(ATK 10)`;
    const enemyElementText = formatBattleElementDisplay(resolveEnemyBattleElement(enemy));
    const allyElementText = fighterType === 'pet'
      ? formatBattleElementDisplay(pet?.type || pet?.element || '')
      : '🧍 無屬性';
    const relationText = getBattleElementRelation(
      fighterType === 'pet' ? (pet?.type || pet?.element || '') : '',
      resolveEnemyBattleElement(enemy)
    ).text;
    const enemyPetLine = enemy?.npcPet
      ? `🐾 對手寵物：${enemy.npcPet.name}（${formatBattleElementDisplay(enemy.npcPet.element)}｜ATK ${enemy.npcPet.attack}${enemy.npcPet.newbieScaled ? '｜新手區調整' : ''}）\n`
      : '';
    const beginnerGuardText = enemy.beginnerBalanced
      ? '🛡️ 新手區保護：本場敵人能力已平衡調整\n'
      : '';
    const beginnerDangerText = enemy.beginnerDanger
      ? '⚠️ 危險提示：這是新手區中的偏強敵，建議先評估勝率再決定是否開戰。\n'
      : '';
    const mentorRuleText = mentorSparState
      ? `🤝 友誼賽規則：將導師壓到 ${Math.round(Number(mentorSparState.acceptHpRatio || MENTOR_SPAR_WIN_HP_RATIO) * 100)}% HP 以下即可通過試煉\n🩹 若你方寵物被打到 0，導師會立即治療回滿\n`
      : '';
    player.battleState = {
      enemy,
      fighter: fighterType,
      mode: null,
      fleeAttempts: 0,
      energy: 2,
      turn: 1,
      startedAt: Date.now(),
      sourceChoice: selectedChoice,
      preBattleStory,
      humanState: null,
      petState: null,
      activePetId: String(pet?.id || '').trim() || null,
      petStates: {},
      mentorSpar: mentorSparState
    };
    queueMemory({
      type: '戰鬥',
      content: `遭遇 ${enemy.name}`,
      outcome: '戰鬥開始',
      importance: 3,
      tags: ['battle_start']
    });
    player.currentStory = result?.message || event?.desc || `${selectedChoice}`;
    flushMemories();
    CORE.savePlayer(player);

    await interaction.deferUpdate().catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${player.name} - ${pet.name}`)
      .setColor(0xff6600)
      .setDescription(
        `**戰鬥即將開始！**\n\n${player.currentStory}\n\n` +
        `👹 敵人：**${enemy.name}**\n` +
        `🏷️ 敵方屬性：${enemyElementText}\n` +
        `❤️ 敵方 HP：${formatBattleHpValue(enemy?.hp, 0)}/${formatBattleHpValue(enemy?.maxHp, 1)}\n` +
        `⚔️ 敵方攻擊：${enemy.attack}\n` +
        `${enemyPetLine}` +
        `${fighterLabel} 出戰\n` +
        `🏷️ 我方屬性：${allyElementText}\n` +
        `${relationText}\n` +
        `⚡ 戰鬥能量規則：每回合 +2，可結轉到下一回合\n` +
        `${beginnerGuardText}\n` +
        `${beginnerDangerText}` +
        `${mentorRuleText}` +
        `📊 **勝率預估：${battleEstimate.rank}（約 ${format1(battleEstimate.winRate)}%）**（模擬 ${battleEstimate.simulations || BATTLE_ESTIMATE_SIMULATIONS} 場）\n` +
        `你方平均傷害 ${battleEstimate.avgPlayerDamage}/回合，預計 ${battleEstimate.turnsToWin} 回合擊倒敵人\n` +
        `敵方平均傷害 ${format1(battleEstimate.enemyDamage)}/回合，預計 ${format1(battleEstimate.turnsToLose)} 回合擊倒你方\n\n` +
        `請選擇戰鬥模式：`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('battle_mode_manual').setLabel('⚔️ 手動戰鬥').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('battle_mode_ai').setLabel('🤖 AI戰鬥').setStyle(ButtonStyle.Primary)
    );

    const battlePromptMsg = await interaction.channel.send({ embeds: [embed], components: [row] });
    trackActiveGameMessage(player, interaction.channel?.id, battlePromptMsg.id);
    await disableMessageComponents(interaction.channel, interaction.message?.id);
    return;
  }
  
  const previousOutcomeText = String(result?.message || event?.desc || '').trim();
  player.currentStory = composeActionBridgeStory(player, selectedChoice, previousOutcomeText);
  flushMemories();
  startGenerationState(player, {
    source: 'event',
    phase: 'memory_context',
    sourceChoice: selectedChoice,
    storySnapshot: player.currentStory || '',
    choicesSnapshot: []
  });
  CORE.savePlayer(player);
  
  // 取得記憶上下文
  let memoryContext = '';
  try {
    const memStartedAt = Date.now();
    const memoryQueryText = [
      `剛選擇:${selectedChoice}`,
      `當前地點:${player.location || ''}`,
      `勢力目擊:${getFactionPresenceHintForPlayer(player)}`,
      `前一段故事:${player.currentStory || ''}`
    ].join('\n');
    const [playerMemoryContext, npcMemoryContext] = await Promise.all([
      CORE.getPlayerMemoryContextAsync(user.id, {
        location: player.location,
        previousChoice: selectedChoice,
        previousStory: player.currentStory || '',
        queryText: memoryQueryText,
        topK: 8
      }),
      CORE.getNearbyNpcMemoryContextAsync(user.id, {
        location: player.location,
        queryText: memoryQueryText,
        limit: 1,
        topKPrivate: 3,
        topKPublic: 2,
        maxChars: 980
      })
    ]);
    memoryContext = String(playerMemoryContext || '');
    if (npcMemoryContext) {
      memoryContext = [memoryContext, npcMemoryContext].filter(Boolean).join('\n\n');
    }
    console.log(`[Perf][event] memory_context ${Date.now() - memStartedAt}ms`);
  } catch (memErr) {
    finishGenerationState(player, 'failed', {
      phase: 'memory_failed',
      error: memErr?.message || memErr,
      storySnapshot: player.currentStory,
      choicesSnapshot: player.eventChoices
    });
    CORE.savePlayer(player);
    const failMsg = `❌ 記憶系統錯誤：${memErr.message}\n請檢查 OpenAI Embedding 設定（此模式不會自動降級）。若剛更新 .env，請重啟機器人後再試。`;
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: failMsg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: failMsg, ephemeral: true }).catch(() => {});
    }
    return;
  }
  
  const uiText = getAdventureText(player.language || 'zh-TW');
  const statusBar = buildMainStatusBar(player, pet, player.language || 'zh-TW');
  const eventMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
  
  // 立即確認按鈕（避免 Discord 顯示失敗）
  await interaction.deferUpdate().catch(() => {});
  
  // 發送一個「AI 正在思考」的訊息（帶上舊 story，讓 continuity 明顯）
  // choices 變數在 eventChoices 清除前就 capture 了，所以仍有效
  const prevStory = player.currentStory || '(故事載入中...)';
  const prevOptionsText = buildChoiceOptionsText(normalizeEventChoices(player, choices), { player, pet });

  const loadingMsg = await interaction.channel.send({
    content: null,
    embeds: [{
      title: `⚔️ ${player.name} - ${pet.name}`,
      color: getAlignmentColor(player.alignment),
      description: `**${uiText.statusLabel}：【${statusBar}】**${eventMainlineLine ? `\n${eventMainlineLine}` : ''}\n\n**${uiText.lastChoice}：** ${selectedChoice}\n\n⏳ *AI 說書人正在構思新故事...*\n\n**${uiText.sectionPrevStory}：**\n${prevStory}${prevOptionsText ? `\n\n**${uiText.sectionUpcomingChoices}：**${prevOptionsText}` : ''}`
    }]
  });

  trackActiveGameMessage(player, interaction.channel?.id, loadingMsg.id);
  updateGenerationState(player, {
    phase: 'loading',
    loadingMessageId: loadingMsg.id
  });
  CORE.savePlayer(player);
  const stopLoadingAnimation = startLoadingAnimation(loadingMsg, 'AI 說書人正在構思新故事');
  const stopTypingIndicator = startTypingIndicator(interaction.channel);
  
  // 背景 AI 生成：先出故事，再補按鈕
  (async () => {
    try {
      updateGenerationState(player, { phase: 'generating_story' });
      CORE.savePlayer(player);
      const storyText = await STORY.generateStory(
        event,
        player,
        pet,
        {
          name: event?.name || '',
          choice: selectedChoice,
          desc: previousOutcomeText || event?.desc || '',
          action: event?.action || '',
          outcome: previousOutcomeText || '',
          mainlineGoal: eventMainlineGoal,
          mainlineProgress: eventMainlineProgress,
          mainlineStage: eventMainlineStage,
          mainlineStageCount: eventMainlineStageCount
        },
        memoryContext
      );
      if (!storyText) {
        stopLoadingAnimation();
        finishGenerationState(player, 'failed', {
          phase: 'story_empty',
          error: 'AI story generation failed (empty result)',
          storySnapshot: player.currentStory,
          choicesSnapshot: []
        });
        CORE.savePlayer(player);
        const failStoryMsg = await editOrSendFallback(interaction.channel, loadingMsg, {
          content: '❌ AI 生成失敗，請點「重新生成」再試。',
          embeds: [],
          components: buildRetryGenerationComponents()
        }, 'event.story_empty');
        if (failStoryMsg?.id) {
          trackActiveGameMessage(player, interaction.channel?.id, failStoryMsg.id);
        }
        return;
      }

      player.currentStory = storyText;
      if (getMainlineBridgeLock(player, { autoClear: true })) {
        consumeMainlineBridgeLock(player);
      }
      player.eventChoices = [];
      const rememberStats = rememberStoryDialogues(player, storyText);
      if ((rememberStats?.quotes || 0) > 0 || (rememberStats?.mainline || 0) > 0) {
        console.log(
          `[StoryQuote] event quotes=${rememberStats?.quotes || 0} dialoguePins=${rememberStats?.dialoguePins || 0} mainlinePins=${rememberStats?.mainline || 0} player=${player.id}`
        );
      }
      updateGenerationState(player, {
        phase: 'story_ready',
        storySnapshot: storyText,
        choicesSnapshot: []
      });
      CORE.savePlayer(player);

      const rewardText = [];
      if (result.gold) rewardText.push(`💰 +${result.gold} Rns 代幣`);
      if (result.wantedLevel) rewardText.push(`⚠️ 通緝等级: ${result.wantedLevel}`);
      if (result.soldCount > 0) rewardText.push(`🏪 已售出 ${result.soldCount} 件`);
      if (result.item && result.success) rewardText.push(`📦 取得 ${result.item}`);
      if (result.loot?.name) rewardText.push(`🧰 ${result.loot.name}（${result.loot.rarity || '普通'}）`);
      if (result.petRevived) rewardText.push(`🐾 ${pet.name} 復活完成（2回合制）`);
      if (Number(result?.passivePetHeal || 0) > 0) rewardText.push(`🩹 ${pet.name} 行進恢復 +${Number(result.passivePetHeal)} HP`);
      if (Number.isFinite(Number(result.digitalRiskScore))) {
        const score = Number(result.digitalRiskScore);
        const delta = Number(result.digitalRiskDelta || 0);
        const digitalMasked = Boolean(result?.digitalMasked || isDigitalMaskPhaseForPlayer(player));
        rewardText.push(
          digitalMasked
            ? `🧠 市場異常指標 ${score}/100${delta > 0 ? `（+${delta}）` : ''}`
            : `🧠 Digital 詐價風險提示累積值 ${score}/100${delta > 0 ? `（+${delta}）` : ''}`
        );
      }

      const worldEvents = getMergedWorldEvents(5);
      let worldEventsText = '';
      if (worldEvents.length > 0) {
        worldEventsText = `\n\n**${uiText.sectionWorldEvents}：**\n` + worldEvents.map(e => e.message || e).join('\n');
      }
      const portalGuideText = extraStoryGuide || (player.portalMenuOpen ? buildPortalUsageGuide(player) : '');
      const portalGuideBlock = portalGuideText ? `\n\n${portalGuideText}` : '';

      const storyOnlyMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
      const storyOnlyDesc =
        `**${uiText.statusLabel}：【${statusBar}】**${storyOnlyMainlineLine ? `\n${storyOnlyMainlineLine}` : ''}\n\n**${uiText.lastChoice}：** ${selectedChoice}\n\n${storyText}` +
        `${rewardText.length > 0 ? '\n\n' + rewardText.join(' | ') : ''}` +
        `${worldEventsText}${portalGuideBlock}\n\n⏳ *故事已送達，正在生成選項...*`;

      const storyOnlyEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(getAlignmentColor(player.alignment))
        .setDescription(storyOnlyDesc)
        .addFields(
          { name: '🐾 寵物', value: `${pet.name} (${getPetElementDisplayName(pet.type)})`, inline: true },
          { name: '⚔️ 氣血', value: formatPetHpWithRecovery(pet), inline: true },
          { name: '💰 Rns 代幣', value: String(player.stats.財富), inline: true }
        );

      stopLoadingAnimation();
      const storyOnlyMsg = await editOrSendFallback(
        interaction.channel,
        loadingMsg,
        { content: null, embeds: [storyOnlyEmbed], components: [] },
        'event.story_only'
      );
      if (storyOnlyMsg?.id) {
        trackActiveGameMessage(player, interaction.channel?.id, storyOnlyMsg.id);
      }

      updateGenerationState(player, {
        phase: 'generating_choices',
        loadingMessageId: storyOnlyMsg?.id || loadingMsg?.id || null
      });
      CORE.savePlayer(player);
      const aiChoices = await STORY.generateChoicesWithAI(player, pet, storyText, memoryContext);
      if (!aiChoices || aiChoices.length === 0) {
        finishGenerationState(player, 'failed', {
          phase: 'choice_empty',
          error: 'AI choice generation failed (empty result)',
          storySnapshot: storyText,
          choicesSnapshot: []
        });
        CORE.savePlayer(player);
        const failChoicesMsg = await editOrSendFallback(interaction.channel, storyOnlyMsg || loadingMsg, {
          content: '⚠️ 故事已生成，但選項生成失敗，請點「重新生成」。',
          embeds: [storyOnlyEmbed],
          components: buildRetryGenerationComponents()
        }, 'event.choice_empty');
        if (failChoicesMsg?.id) {
          trackActiveGameMessage(player, interaction.channel?.id, failChoicesMsg.id);
        }
        return;
      }

      player.eventChoices = applyChoicePolicy(
        player,
        maybeInjectRareCustomInputChoice(normalizeEventChoices(player, aiChoices))
      );
      updateGenerationState(player, {
        phase: 'choices_ready',
        storySnapshot: storyText,
        choicesSnapshot: player.eventChoices
      });
      finishGenerationState(player, 'done', {
        phase: 'completed',
        storySnapshot: storyText,
        choicesSnapshot: player.eventChoices
      });
      CORE.savePlayer(player);

      const newChoices = player.eventChoices;
      const optionsText = buildChoiceOptionsText(newChoices, { player, pet });

      const finalMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
      const description =
        `**${uiText.statusLabel}：【${statusBar}】**${finalMainlineLine ? `\n${finalMainlineLine}` : ''}\n\n**${uiText.lastChoice}：** ${selectedChoice}\n\n${storyText}` +
        `${rewardText.length > 0 ? '\n\n' + rewardText.join(' | ') : ''}` +
        `${worldEventsText}${portalGuideBlock}\n\n**${uiText.sectionNewChoices}：**${optionsText}\n\n_${uiText.chooseNumber(CHOICE_DISPLAY_COUNT)}_`;

      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(getAlignmentColor(player.alignment))
        .setDescription(description)
        .addFields(
          { name: '🐾 寵物', value: `${pet.name} (${getPetElementDisplayName(pet.type)})`, inline: true },
          { name: '⚔️ 氣血', value: formatPetHpWithRecovery(pet), inline: true },
          { name: '💰 Rns 代幣', value: String(player.stats.財富), inline: true }
        );

      const buttons = buildEventChoiceButtons(newChoices, player.id);
      appendMainMenuUtilityButtons(buttons, player);

      const components = [];
      for (let i = 0; i < buttons.length; i += 5) {
        components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }

      const finalStoryMsg = await editOrSendFallback(
        interaction.channel,
        storyOnlyMsg || loadingMsg,
        { content: null, embeds: [embed], components },
        'event.final_story'
      );
      if (finalStoryMsg?.id) {
        trackActiveGameMessage(player, interaction.channel?.id, finalStoryMsg.id);
      }
      triggerMainlineForeshadowAIInBackground(player, {
        phase: 'event',
        storyText,
        previousAction: selectedChoice,
        location: player.location,
        playerLang: player.language
      });
    } catch (err) {
      stopLoadingAnimation();
      console.error('[事件] 處理失敗:', err);
      finishGenerationState(player, 'failed', {
        phase: 'exception',
        error: err?.message || err,
        storySnapshot: player.currentStory,
        choicesSnapshot: player.eventChoices
      });
      CORE.savePlayer(player);
      const eventFailMsg = await editOrSendFallback(interaction.channel, loadingMsg, {
        content: `❌ 事件處理失敗：${err?.message || err}\n請點「重新生成」再試。`,
        embeds: [],
        components: buildRetryGenerationComponents()
      }, 'event.fail');
      if (eventFailMsg?.id) {
        trackActiveGameMessage(player, interaction.channel?.id, eventFailMsg.id);
      }
    } finally {
      stopTypingIndicator();
      releaseStoryLock(playerId);
    }
  })();

  releaseInScope = false;
  return;
  } finally {
    if (releaseInScope) {
      releaseStoryLock(playerId);
    }
  }
}

// ============== 戰鬥 ==============
function normalizeBattleLayoutMode(mode = '') {
  const raw = String(mode || '').trim().toLowerCase();
  return raw === 'mobile' ? 'mobile' : 'desktop';
}

function getBattleLayoutMode(player) {
  return normalizeBattleLayoutMode(player?.battleUILayout || 'desktop');
}

function toggleBattleLayoutMode(player) {
  const current = getBattleLayoutMode(player);
  const next = current === 'mobile' ? 'desktop' : 'mobile';
  if (player && typeof player === 'object') {
    player.battleUILayout = next;
  }
  return next;
}

function getOnlineBattleLayoutMode(online = null) {
  return normalizeBattleLayoutMode(online?.layoutMode || 'desktop');
}

function toggleOnlineBattleLayoutMode(online = null) {
  const current = getOnlineBattleLayoutMode(online);
  const next = current === 'mobile' ? 'desktop' : 'mobile';
  if (online && typeof online === 'object') {
    online.layoutMode = next;
  }
  return next;
}

function buildBattleMoveDetails(player, pet, combatant) {
  const battleState = player?.battleState || {};
  const currentEnergy = Number.isFinite(Number(battleState.energy)) ? Number(battleState.energy) : 2;
  return getCombatantMoves(combatant, pet).map(m => {
    const d = BATTLE.calculatePlayerMoveDamage(m, player, combatant);
    const energyCost = BATTLE.getMoveEnergyCost(m);
    const moveSpeed = getMoveSpeedValue(m);
    const canUse = currentEnergy >= energyCost;
    const effectStr = describeMoveEffects(m);
    return `⚔️ ${m.name} | ${format1(d.total)} dmg | ⚡${energyCost} | 🚀速度${format1(moveSpeed)} | ${canUse ? '可用' : '能量不足'} | ${effectStr || '無'}`;
  }).join('\n');
}

function ensureBattleEnergyState(player) {
  if (!player?.battleState) return { energy: 0, turn: 1 };
  if (!Number.isFinite(Number(player.battleState.energy))) player.battleState.energy = 2;
  if (!Number.isFinite(Number(player.battleState.turn)) || Number(player.battleState.turn) < 1) player.battleState.turn = 1;
  return {
    energy: Number(player.battleState.energy),
    turn: Number(player.battleState.turn)
  };
}

function advanceBattleTurnEnergy(player, spentCost = 0) {
  if (!player?.battleState) return { energy: 0, turn: 1 };
  const state = ensureBattleEnergyState(player);
  const spent = Math.max(0, Number(spentCost) || 0);
  const remaining = Math.max(0, state.energy - spent);
  player.battleState.energy = remaining + 2;
  player.battleState.turn = Math.max(1, state.turn) + 1;
  return {
    energy: player.battleState.energy,
    turn: player.battleState.turn
  };
}

function buildBattleActionRows(player, pet, combatant, options = {}) {
  const state = ensureBattleEnergyState(player);
  const battleState = player.battleState || {};
  const disableAll = Boolean(options?.disableAll);
  const currentEnergy = state.energy;
  const indexedMoves = getCombatantMoves(combatant, pet)
    .map((m, i) => ({ move: m, index: i }))
    .slice(0, Math.min(5, PET_MOVE_LOADOUT_LIMIT));

  const moveButtons = indexedMoves.map(({ move, index }) => {
    const m = move;
    const d = BATTLE.calculatePlayerMoveDamage(m, player, combatant);
    const energyCost = BATTLE.getMoveEnergyCost(m);
    const canUse = currentEnergy >= energyCost;
    return new ButtonBuilder()
      .setCustomId(`use_move_${index}`)
      .setLabel(`${m.name} ⚡${energyCost}`)
      .setStyle(canUse ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setDisabled(disableAll || !canUse);
  });

  const moveRow = new ActionRowBuilder().addComponents(
    moveButtons.length > 0
      ? moveButtons
      : [new ButtonBuilder().setCustomId('no_attack_moves').setLabel('無可用攻擊招式').setStyle(ButtonStyle.Secondary).setDisabled(true)]
  );
  const fleeTry = battleState.fleeAttempts || 0;
  const swapBlocked = hasPetSwapBlockingStatus(combatant?.status || {});
  const canSwap = !disableAll && !combatant?.isHuman && !swapBlocked && getBattleSwitchCandidates(player, combatant?.id).length > 0;
  const layoutMode = getBattleLayoutMode(player);
  const toggleLabel = layoutMode === 'mobile' ? '🖥️ 電腦版' : '📱 手機版';
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('battle_wait').setLabel('⚡ 蓄能待機').setStyle(ButtonStyle.Primary).setDisabled(disableAll),
    new ButtonBuilder().setCustomId('battle_switch_pet').setLabel('🔁 換寵物').setStyle(ButtonStyle.Secondary).setDisabled(!canSwap),
    new ButtonBuilder()
      .setCustomId(`flee_${fleeTry}`)
      .setLabel(`🏃 逃跑 70%（失敗 ${fleeTry}/2）`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableAll),
    new ButtonBuilder()
      .setCustomId('battle_toggle_layout')
      .setLabel(toggleLabel)
      .setStyle(ButtonStyle.Secondary)
  );
  return [moveRow, actionRow];
}

function clipBattleCellText(text = '', maxLen = 18) {
  const raw = String(text || '').trim() || '—';
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, Math.max(1, maxLen - 1))}…`;
}

function extractActionExtra(lines = [], fallback = '無') {
  const cleaned = (Array.isArray(lines) ? lines : [])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .filter((line) => !/施展「/.test(line));
  if (cleaned.length === 0) return fallback;
  return cleaned.slice(0, 2).join(' / ');
}

function buildActionPanelLines(title, data = {}, width = 24) {
  const safeWidth = Math.max(18, Number(width) || 24);
  const inner = safeWidth;
  const top = `┌─【${title}】${'─'.repeat(Math.max(0, inner - title.length - 4))}┐`;
  const bottom = `└${'─'.repeat(inner + 2)}┘`;
  const toLine = (value = '') => `│ ${clipBattleCellText(value, inner)}${' '.repeat(Math.max(0, inner - clipBattleCellText(value, inner).length))} │`;

  if (data?.pending) {
    return [
      top,
      toLine('（準備中...）'),
      toLine(''),
      toLine(''),
      bottom
    ];
  }

  const moveLine = data?.move ? `招式：${data.move}` : '（尚未行動）';
  const damageLabel = data?.damageLabel || '造成';
  const damageLine = Number.isFinite(Number(data?.damage))
    ? `${damageLabel}：${format1(Math.max(0, Number(data.damage)))}`
    : '';
  const extraLine = `附加：${data?.extra || '無'}`;

  return [
    top,
    toLine(moveLine),
    toLine(damageLine),
    toLine(extraLine),
    bottom
  ];
}

function buildDualActionPanels(actionView = {}) {
  const ally = buildActionPanelLines('我方行動', actionView?.ally || {}, 26);
  const enemy = buildActionPanelLines('敵方行動', actionView?.enemy || {}, 26);
  const rows = [];
  for (let i = 0; i < Math.max(ally.length, enemy.length); i++) {
    rows.push(`${ally[i] || ''}    ${enemy[i] || ''}`);
  }
  return `\`\`\`text\n${rows.join('\n')}\n\`\`\``;
}

function buildDualActionPanelsMobile(actionView = {}, options = {}) {
  const ally = actionView?.ally || {};
  const enemy = actionView?.enemy || {};
  const allyName = String(options?.allyName || '我方').trim();
  const allyMove = ally?.pending ? '（準備中...）' : (ally?.move || '（尚未行動）');
  const enemyMove = enemy?.pending ? '（準備中...）' : (enemy?.move || '（尚未行動）');
  const allyDamage = Number.isFinite(Number(ally?.damage)) ? format1(Math.max(0, Number(ally.damage))) : '—';
  const enemyDamage = Number.isFinite(Number(enemy?.damage)) ? format1(Math.max(0, Number(enemy.damage))) : '—';
  const allyExtra = ally?.pending ? '—' : (ally?.extra || '無');
  const enemyExtra = enemy?.pending ? '—' : (enemy?.extra || '無');
  return (
    `【敵方行動】\n` +
    `招式：${enemyMove}\n` +
    `對我造成：${enemyDamage}\n` +
    `附加：${enemyExtra}\n` +
    `--------------------------------\n` +
    `戰況更新：🐾 我方：${allyName}\n` +
    `【我方行動】\n` +
    `招式：${allyMove}\n` +
    `對敵造成：${allyDamage}\n` +
    `附加：${allyExtra}`
  );
}

function buildActionViewFromPhase(playerPhase = null, enemyPhase = null, options = {}) {
  const enemyPending = Boolean(options?.enemyPending);
  return {
    ally: {
      move: playerPhase?.playerMoveName || '',
      damage: Number.isFinite(Number(playerPhase?.playerDamage)) ? Number(playerPhase.playerDamage) : null,
      damageLabel: '對敵造成',
      extra: extractActionExtra(playerPhase?.playerLines || [])
    },
    enemy: enemyPending
      ? { pending: true }
      : {
          move: enemyPhase?.enemyMoveName || '',
          damage: Number.isFinite(Number(enemyPhase?.enemyDamage)) ? Number(enemyPhase.enemyDamage) : null,
          damageLabel: '對我造成',
          extra: extractActionExtra(enemyPhase?.enemyLines || [])
        }
  };
}

function buildAIBattleStory(rounds, combatant, enemy, finalResult) {
  const lines = [];
  const icon = combatant?.isHuman ? '🧍' : '🐾';
  lines.push(`戰場氣壓驟降，${combatant.name}與${enemy.name}在塵霧中對峙，呼吸與殺意同時收緊。`);

  for (const r of rounds) {
    const hitText = r.playerDamage > 0
      ? `命中造成 **${format1(r.playerDamage)}** 點傷害`
      : '攻勢被對手硬生生擋下';
    const takenText = r.enemyDamage > 0
      ? `反擊讓你承受 **${format1(r.enemyDamage)}** 點傷害`
      : '反擊落空，擦身而過';
    lines.push(
      `**第 ${r.turn} 回合**\n` +
      `${icon} ${combatant.name}使出「${r.playerMove}」，${hitText}。\n` +
      `👹 ${enemy.name}立刻以「${r.enemyMove}」回應，${takenText}。\n` +
      `⚡ 能量：${r.energyBefore ?? '-'} -> ${r.energyAfter ?? '-'}（消耗 ${r.energyCost ?? 0}）\n` +
      `📉 戰況：${combatant.name} ${r.petHp}/${r.petMaxHp} ｜ ${enemy.name} ${r.enemyHp}/${r.enemyMaxHp}`
    );
  }

  if (finalResult) {
    const lastRound = Array.isArray(rounds) && rounds.length > 0 ? rounds[rounds.length - 1] : null;
    const finisher = String(lastRound?.playerMove || '最後一擊').trim();
    if (finalResult.victory === true) {
      const gold = Math.max(0, Number(finalResult?.gold || 0));
      const wanted = Math.max(0, Number(finalResult?.wantedLevel || 0));
      const rewardLine = gold > 0 ? `，獲得 ${gold} Rns！` : '。';
      const wantedLine = wanted > 0 ? `\n⚠️ 你現在是 ${wanted} 級通緝犯！` : '';
      lines.push(`**終局：** 🏆 ${combatant.name}以「${finisher}」擊倒${enemy.name}${rewardLine}${wantedLine}`);
    } else if (finalResult.victory === false) {
      lines.push(`**終局：** 💀 ${combatant.name}不敵${enemy.name}，戰鬥落敗。`);
    } else if (finalResult?.message) {
      lines.push(`**終局：** ${String(finalResult.message).split('\n').slice(-1)[0]}`);
    }
  }
  return lines.join('\n\n');
}

function padBattleLabel(text = '', width = 16) {
  const raw = String(text || '');
  if (raw.length >= width) return raw.slice(0, width);
  return raw + ' '.repeat(width - raw.length);
}

function formatBattleHpValue(value, fallback = 0) {
  return format1(value, fallback);
}

function buildManualBattleBoard(enemy, combatant, state) {
  const enemyName = padBattleLabel(enemy?.name || '敵人', 14);
  const allyName = padBattleLabel(combatant?.name || '我方', 14);
  const enemyElement = formatBattleElementDisplay(resolveEnemyBattleElement(enemy));
  const allyElement = combatant?.isHuman
    ? '🧍 無屬性'
    : formatBattleElementDisplay(combatant?.type || combatant?.element || '');
  const relationText = getBattleElementRelation(
    combatant?.isHuman ? '' : (combatant?.type || combatant?.element || ''),
    resolveEnemyBattleElement(enemy)
  ).text.replace(/^([^\s]+\s)/u, '');
  const enemyHp = `${formatBattleHpValue(enemy?.hp, 0)}/${formatBattleHpValue(enemy?.maxHp, 1)}`;
  const allyHp = `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`;
  const turn = Number(state?.turn || 1);
  const energy = Number(state?.energy || 0);
  const roundText = `第 ${turn} 回合`;
  const roundLine = `${' '.repeat(Math.max(0, 41 - roundText.length))}${roundText}`;
  return (
    '```text\n' +
    `${roundLine}\n` +
    `                 ┌─【敵方】──────────────┐\n` +
    `                 │ ${enemyName} HP ${enemyHp}\n` +
    `                 │ 屬性 ${enemyElement}\n` +
    `                 │ ATK ${enemy?.attack || 0}\n` +
    `                 └───────────────────────┘\n` +
    `\n` +
    `┌─【我方】──────────────┐\n` +
    `│ ${allyName} HP ${allyHp}\n` +
    `│ 屬性 ${allyElement}\n` +
    `│ ${relationText}\n` +
    `│ ⚡ 能量 ${energy}（每回 +2，可結轉）\n` +
    `└───────────────────────┘\n` +
    '```'
  );
}

function buildManualBattleBoardMobile(enemy, combatant, state) {
  const enemyElement = formatBattleElementDisplay(resolveEnemyBattleElement(enemy));
  const allyElement = combatant?.isHuman
    ? '🧍 無屬性'
    : formatBattleElementDisplay(combatant?.type || combatant?.element || '');
  const relationText = getBattleElementRelation(
    combatant?.isHuman ? '' : (combatant?.type || combatant?.element || ''),
    resolveEnemyBattleElement(enemy)
  ).text;
  const turn = Number(state?.turn || 1);
  const energy = Number(state?.energy || 0);
  return (
    `第 ${turn} 回合\n` +
    `👹 敵方：${enemy?.name || '敵人'}\n` +
    `屬性：${enemyElement}\n` +
    `HP：${formatBattleHpValue(enemy?.hp, 0)}/${formatBattleHpValue(enemy?.maxHp, 1)} ｜ ATK：${format1(enemy?.attack || 0)}\n\n` +
    `🐾 我方：${combatant?.name || '我方'}\n` +
    `屬性：${allyElement}\n` +
    `${relationText}\n` +
    `HP：${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}\n` +
    `⚡ 能量：${energy}（每回 +2，可結轉）`
  );
}

async function sendBattleMessage(interaction, payload, mode = 'update') {
  if (mode === 'edit') {
    if (interaction?.message?.edit) {
      await interaction.message.edit(payload);
      return;
    }
    if (interaction?.channel && interaction?.message?.id) {
      const msg = await interaction.channel.messages.fetch(interaction.message.id);
      if (msg) await msg.edit(payload);
      return;
    }
  }
  await interaction.update(payload);
}

function buildManualBattlePayload(player, pet, options = {}) {
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, pet);
  const state = ensureBattleEnergyState(player);
  const [moveRow, actionRow] = buildBattleActionRows(player, pet, combatant, { disableAll: Boolean(options?.disableActions) });
  const dmgInfo = buildBattleMoveDetails(player, pet, combatant);
  const fighterLabel = combatant.isHuman ? `🧍 ${combatant.name}` : `🐾 ${combatant.name}`;
  const layoutMode = getBattleLayoutMode(player);
  const board = layoutMode === 'mobile'
    ? buildManualBattleBoardMobile(enemy, combatant, state)
    : buildManualBattleBoard(enemy, combatant, state);
  const actionPanels = layoutMode === 'mobile'
    ? buildDualActionPanelsMobile(options?.actionView || {}, { allyName: combatant?.name || '我方' })
    : buildDualActionPanels(options?.actionView || {});
  const statusLines = []
    .concat(Array.isArray(options?.turnStartLines) ? options.turnStartLines : [])
    .concat(Array.isArray(options?.extraLines) ? options.extraLines : []);
  const statusText = statusLines.length > 0
    ? `\n**戰況更新：**\n${statusLines.join('\n')}\n`
    : '';
  const noticeLine = options?.notice ? `\n${options.notice}\n` : '';

  return {
    content:
      `⚔️ **戰鬥中：${fighterLabel} vs ${enemy.name}**\n` +
      `${board}\n\n${actionPanels}` +
      `${statusText}` +
      `${noticeLine}` +
      `\n**招式：**\n${dmgInfo}`,
    embeds: [],
    components: [moveRow, actionRow]
  };
}

function buildBattleSwitchPayload(player, currentPet, notice = '') {
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, currentPet);
  const state = ensureBattleEnergyState(player);
  const layoutMode = getBattleLayoutMode(player);
  const board = layoutMode === 'mobile'
    ? buildManualBattleBoardMobile(enemy, combatant, state)
    : buildManualBattleBoard(enemy, combatant, state);
  const candidates = getBattleSwitchCandidates(player, combatant?.id);
  const options = candidates.slice(0, 25).map((p) => ({
    label: `${p.name}`.slice(0, 100),
    description: `${getPetElementDisplayName(p.type)}｜HP ${p.hp}/${p.maxHp}`.slice(0, 100),
    value: String(p.id || '')
  }));

  const rows = [];
  if (options.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('battle_switch_select')
      .setPlaceholder('選擇要換上的寵物')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('battle_switch_cancel').setLabel('↩️ 取消換寵').setStyle(ButtonStyle.Secondary)
  ));

  return {
    content:
      `⚔️ **戰鬥中：🐾 ${combatant?.name || '寵物'} vs ${enemy?.name || '敵人'}**\n` +
      `${board}\n` +
      `${notice ? `${notice}\n` : ''}` +
      `請選擇要換上的寵物：`,
    embeds: [],
    components: rows
  };
}

async function renderManualBattle(interaction, player, pet, roundMessage = '', options = {}) {
  const enemy = player?.battleState?.enemy;
  if (!enemy) {
    const mode = options?.mode === 'edit' ? 'edit' : 'update';
    await sendBattleMessage(interaction, { content: '❌ 找不到戰鬥狀態，請重新選擇戰鬥。', components: [] }, mode);
    return;
  }

  if (interaction.message?.id) {
    trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
  }

  const mode = options?.mode === 'edit' ? 'edit' : 'update';
  const payload = buildManualBattlePayload(player, pet, {
    disableActions: Boolean(options?.disableActions),
    actionView: options?.actionView || {},
    turnStartLines: options?.turnStartLines || [],
    extraLines: roundMessage ? [roundMessage] : [],
    notice: options?.notice || ''
  });
  await sendBattleMessage(interaction, payload, mode);
}

async function handleBattleSwitchOpen(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const currentPet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet }).pet;
  const combatant = getActiveCombatant(player, currentPet);
  const enemy = player?.battleState?.enemy;
  if (!player || !currentPet || !combatant || !enemy) {
    await interaction.reply({ content: '❌ 目前不在可換寵的戰鬥狀態。', ephemeral: true }).catch(() => {});
    return;
  }
  if (combatant.isHuman) {
    await renderManualBattle(interaction, player, currentPet, '⚠️ 目前是玩家本人上場，無法切換寵物。');
    return;
  }
  if (hasPetSwapBlockingStatus(combatant.status || {})) {
    await renderManualBattle(interaction, player, currentPet, '⚠️ 目前有持續效果（如中毒/灼燒/束縛），本回合不能換寵物。');
    return;
  }
  const candidates = getBattleSwitchCandidates(player, combatant.id);
  if (candidates.length <= 0) {
    await renderManualBattle(interaction, player, currentPet, '⚠️ 沒有可切換的寵物（其他寵物可能倒下或不存在）。');
    return;
  }
  const payload = buildBattleSwitchPayload(player, currentPet, '🔁 你可以在本回合改派其他寵物上場。');
  await interaction.update(payload);
}

async function handleBattleSwitchCancel(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const currentPet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet }).pet;
  if (!player || !currentPet || !player?.battleState?.enemy) {
    await interaction.reply({ content: '❌ 目前不在戰鬥狀態。', ephemeral: true }).catch(() => {});
    return;
  }
  await renderManualBattle(interaction, player, currentPet, '↩️ 已取消換寵，繼續由目前寵物作戰。');
}

async function handleBattleSwitchSelect(interaction, user, targetPetId = '') {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const currentPet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet }).pet;
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, currentPet);
  const targetPet = targetPetId ? PET.getPetById(targetPetId) : null;
  if (!player || !currentPet || !combatant || !enemy || !targetPet || String(targetPet.ownerId || '') !== String(user.id || '')) {
    await interaction.reply({ content: '⚠️ 換寵資料失效，請重新操作。', ephemeral: true }).catch(() => {});
    return;
  }
  if (combatant.isHuman) {
    await renderManualBattle(interaction, player, currentPet, '⚠️ 目前是玩家本人上場，無法切換寵物。');
    return;
  }
  if (hasPetSwapBlockingStatus(combatant.status || {})) {
    await renderManualBattle(interaction, player, currentPet, '⚠️ 目前有持續效果（如中毒/灼燒/束縛），本回合不能換寵物。');
    return;
  }
  if (!CORE.canPetFight(targetPet)) {
    await renderManualBattle(interaction, player, currentPet, `⚠️ ${targetPet.name} 目前無法上場。`);
    return;
  }
  if (String(targetPet.id || '') === String(combatant.id || '')) {
    await renderManualBattle(interaction, player, currentPet, '⚠️ 目前已是這隻寵物上場。');
    return;
  }

  const savedPet = persistCombatantState(player, currentPet, combatant);
  if (savedPet) PET.savePet(savedPet);
  player.battleState.activePetId = targetPet.id;
  player.battleState.fighter = 'pet';
  CORE.savePlayer(player);
  await renderManualBattle(interaction, player, targetPet, `🔁 已切換上場寵物：${targetPet.name}`);
}

async function showTrueGameOver(interaction, user, detailText, mode = 'update') {
  const beforeReset = CORE.loadPlayer(user.id);
  const enemyName = String(beforeReset?.battleState?.enemy?.name || '敵人').trim();
  if (beforeReset) {
    publishBattleWorldEvent(
      beforeReset,
      enemyName,
      'player_down',
      String(detailText || '').replace(/\s+/g, ' ').slice(0, 120)
    );
  }
  CORE.resetPlayerGame(user.id);
  const embed = new EmbedBuilder()
    .setTitle('💀 你戰死了...')
    .setColor(0xff0000)
    .setDescription(`${detailText}\n\n你的旅程就此結束...`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('restart_onboarding').setLabel('🔄 重新開始').setStyle(ButtonStyle.Danger)
  );
  await sendBattleMessage(interaction, { embeds: [embed], content: null, components: [row] }, mode);
}

async function showPetDefeatedTransition(interaction, player, pet, battleDetail = '', mode = 'update') {
  PET.markPetDefeated(pet, '戰鬥落敗');
  PET.savePet(pet);

  const remainTurns = typeof PET.getPetRecoveryRemainingTurns === 'function'
    ? Number(PET.getPetRecoveryRemainingTurns(pet) || 2)
    : 2;
  const enemyName = player?.battleState?.enemy?.name || '敵人';
  publishBattleWorldEvent(
    player,
    enemyName,
    'pet_down',
    `${pet?.name || '夥伴'}復活倒數 ${formatRecoveryTurnsShort(remainTurns)}`
  );
  player.battleState.fighter = 'player';
  player.battleState.mode = null;
  player.battleState.fleeAttempts = 0;
  rememberPlayer(player, {
    type: '戰鬥',
    content: `${pet.name} 被 ${enemyName} 擊倒`,
    outcome: '改由玩家親自接戰',
    importance: 3,
    tags: ['battle', 'pet_down']
  });
  CORE.savePlayer(player);

  const embed = new EmbedBuilder()
    .setTitle('🐾 寵物陣亡')
    .setColor(0xff9900)
    .setDescription(
      `${pet.name} 在戰鬥中倒下了，將於 **${formatRecoveryTurnsShort(remainTurns)}** 後復活。\n\n` +
      `你若還要硬戰，可以改由 **${player.name}** 親自上場（ATK 固定 10）。` +
      `${battleDetail ? `\n\n📜 戰況回放：\n${String(battleDetail).slice(0, 1200)}` : ''}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('battle_continue_human').setLabel('🧍 我親自上場').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('main_menu').setLabel('📖 先撤退').setStyle(ButtonStyle.Secondary)
  );
  await sendBattleMessage(interaction, { embeds: [embed], content: null, components: [row] }, mode);
}

async function continueBattleWithHuman(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  const enemy = player?.battleState?.enemy;
  if (!player || !pet || !enemy) {
    await interaction.update({ content: '❌ 找不到可續戰的戰鬥。', components: [] });
    return;
  }
  if (petResolved?.changed) CORE.savePlayer(player);

  player.battleState.fighter = 'player';
  player.battleState.mode = 'manual';
  player.battleState.fleeAttempts = 0;
  ensureBattleEnergyState(player);
  rememberPlayer(player, {
    type: '戰鬥',
    content: `改由 ${player.name} 親自上場`,
    outcome: `續戰 ${enemy.name}`,
    importance: 2,
    tags: ['battle', 'human_takeover']
  });
  CORE.savePlayer(player);

  const estimate = estimateBattleOutcome(player, pet, enemy, 'player');
  await renderManualBattle(
    interaction,
    player,
    pet,
    `⚠️ ${pet.name} 尚未復活，由你本人接戰。\n` +
      `勝率預估：${estimate.rank}（約 ${format1(estimate.winRate)}%）`
  );
}

function buildOnlineFriendDuelButtons(hostId = '', hostMoves = [], hostEnergy = 0, layoutMode = 'desktop') {
  const id = String(hostId || '').trim();
  const safeMoves = Array.isArray(hostMoves) ? hostMoves.slice(0, 5) : [];
  const moveButtons = [];
  for (let i = 0; i < Math.min(5, PET_MOVE_LOADOUT_LIMIT); i++) {
    const move = safeMoves[i];
    if (!move) {
      moveButtons.push(
        new ButtonBuilder()
          .setCustomId(`fdonline_move_${id}_${i}`)
          .setLabel('（空）')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
      continue;
    }
    const cost = BATTLE.getMoveEnergyCost(move);
    const canUse = Number(hostEnergy || 0) >= cost;
    moveButtons.push(
      new ButtonBuilder()
        .setCustomId(`fdonline_move_${id}_${i}`)
        .setLabel(`${move.name} ⚡${cost}`.slice(0, 80))
        .setStyle(canUse ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setDisabled(!canUse)
    );
  }
  return [
    new ActionRowBuilder().addComponents(
      ...moveButtons.slice(0, 3)
    ),
    new ActionRowBuilder().addComponents(
      ...moveButtons.slice(3, 5),
      new ButtonBuilder().setCustomId(`fdonline_wait_${id}`).setLabel('⚡ 待機').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`fdonline_view_${id}`)
        .setLabel(layoutMode === 'mobile' ? '🖥️ 電腦版' : '📱 手機版')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildFriendDuelResultRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_friends').setLabel('🤝 返回好友').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('main_menu').setLabel('📖 回主選單').setStyle(ButtonStyle.Secondary)
  );
}

function getOnlineFriendDuelRivalMoves(enemy = null) {
  const raw = Array.isArray(enemy?.moves) ? enemy.moves : [];
  const fallbackDamage = Math.max(8, Number(enemy?.attack || 12));
  const list = raw
    .slice(0, PET_MOVE_LOADOUT_LIMIT)
    .map((move) => ({
      id: String(move?.id || '').trim(),
      name: String(move?.name || '普通攻擊').trim() || '普通攻擊',
      element: String(move?.element || '普通').trim() || '普通',
      tier: Math.max(1, Math.min(3, Number(move?.tier || 1))),
      priority: Math.max(-1, Math.min(3, Number(move?.priority || 0))),
      speed: getMoveSpeedValue(move),
      baseDamage: Math.max(1, Number(move?.baseDamage ?? move?.damage ?? fallbackDamage) || fallbackDamage),
      damage: Math.max(1, Number(move?.baseDamage ?? move?.damage ?? fallbackDamage) || fallbackDamage),
      effect: (move?.effect && typeof move.effect === 'object') ? { ...move.effect } : {},
      desc: String(move?.desc || '').trim()
    }))
    .filter((move) => move.name && !isFleeLikeMove(move));
  if (list.length > 0) return list;
  return [{
    id: 'friend_duel_strike',
    name: '友誼試探',
    element: '普通',
    tier: 1,
    priority: 0,
    speed: 10,
    baseDamage: fallbackDamage,
    damage: fallbackDamage,
    effect: {},
    desc: '穩定試探'
  }];
}

function formatOnlineFriendDuelMoveList(moves = [], attacker = null, defender = null, energy = 0) {
  const list = Array.isArray(moves) ? moves : [];
  if (list.length <= 0) return '（本側無可用招式，逾時會自動待機）';
  return list
    .slice(0, PET_MOVE_LOADOUT_LIMIT)
    .map((move, idx) => {
      const cost = BATTLE.getMoveEnergyCost(move);
      const speed = getMoveSpeedValue(move);
      const dmg = BATTLE.calculatePlayerMoveDamage(move, {}, attacker || {}).total || 0;
      const est = Math.max(0, Number(dmg) - Math.max(0, Number(defender?.defense || 0)));
      const canUse = Number(energy || 0) >= cost;
      return `${idx + 1}. ${move.name} | 💥${format1(est)} | ⚡${cost} | 🚀${format1(speed)}${canUse ? '' : '（能量不足）'}`;
    })
    .join('\n');
}

function formatOnlineFriendChoiceText(choice = null, moves = []) {
  if (!choice || typeof choice !== 'object') return '⌛ 尚未提交';
  if (choice.kind === 'wait') return '⚡ 待機';
  const idx = Math.max(0, Number(choice.moveIndex || 0));
  const move = Array.isArray(moves) ? moves[idx] : null;
  if (!move) return `⚠️ 索引${idx + 1}無效（將自動重算）`;
  return `✅ ${move.name}`;
}

function formatOnlineHostMoveDetails(moves = [], attacker = null, defender = null, energy = 0) {
  const list = Array.isArray(moves) ? moves : [];
  if (list.length <= 0) return '（無可用招式）';
  return list
    .slice(0, PET_MOVE_LOADOUT_LIMIT)
    .map((move) => {
      const cost = BATTLE.getMoveEnergyCost(move);
      const speed = getMoveSpeedValue(move);
      const dmg = BATTLE.calculatePlayerMoveDamage(move, {}, attacker || {}).total || 0;
      const est = Math.max(0, Number(dmg) - Math.max(0, Number(defender?.defense || 0)));
      const canUse = Number(energy || 0) >= cost;
      const effectStr = describeMoveEffects(move);
      return `⚔️ ${move.name} | ${format1(est)} dmg | ⚡${cost} | 🚀速度${format1(speed)} | ${canUse ? '可用' : '能量不足'} | ${effectStr || '無'}`;
    })
    .join('\n');
}

function buildOnlineFriendDuelActionView(roundResult = null) {
  if (!roundResult || typeof roundResult !== 'object') {
    return {
      ally: { pending: true },
      enemy: { pending: true }
    };
  }
  return {
    ally: {
      move: roundResult.playerMoveName || '',
      damage: Number.isFinite(Number(roundResult.playerDamage)) ? Number(roundResult.playerDamage) : null,
      damageLabel: '對敵造成',
      extra: extractActionExtra(roundResult.playerLines || [])
    },
    enemy: {
      move: roundResult.enemyMoveName || '',
      damage: Number.isFinite(Number(roundResult.enemyDamage)) ? Number(roundResult.enemyDamage) : null,
      damageLabel: '對我造成',
      extra: extractActionExtra(roundResult.enemyLines || [])
    }
  };
}

function buildOnlineFriendDuelPayload(hostPlayer, hostPet, options = {}) {
  const online = getOnlineFriendDuelState(hostPlayer);
  const enemy = hostPlayer?.battleState?.enemy;
  const combatant = getActiveCombatant(hostPlayer, hostPet);
  const state = ensureBattleEnergyState(hostPlayer);
  const hostMoves = getCombatantMoves(combatant, hostPet).slice(0, PET_MOVE_LOADOUT_LIMIT);
  const rivalMoves = getOnlineFriendDuelRivalMoves(enemy).slice(0, PET_MOVE_LOADOUT_LIMIT);
  const hostId = String(online?.hostId || hostPlayer?.id || '').trim();
  const rivalId = String(online?.rivalId || hostPlayer?.battleState?.friendDuel?.friendId || '').trim();
  const rivalName = String(hostPlayer?.battleState?.friendDuel?.friendName || '好友').trim() || '好友';
  const hostName = String(hostPlayer?.name || '你').trim() || '你';
  const hostEnergy = Number(state?.energy || 0);
  const rivalEnergy = Math.max(0, Number(online?.rivalEnergy || 2));
  const hostChoice = online?.choices?.[hostId] || null;
  const rivalChoice = online?.choices?.[rivalId] || null;
  const deadlineAt = Math.max(Date.now() + 1000, Number(online?.deadlineAt || Date.now() + FRIEND_DUEL_ONLINE_TURN_MS));
  const remainSec = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
  const layoutMode = getOnlineBattleLayoutMode(online);
  const board = layoutMode === 'mobile'
    ? buildManualBattleBoardMobile(enemy, combatant, state)
    : buildManualBattleBoard(enemy, combatant, state);
  const actionPanels = layoutMode === 'mobile'
    ? buildDualActionPanelsMobile(options?.actionView || buildOnlineFriendDuelActionView(null))
    : buildDualActionPanels(options?.actionView || buildOnlineFriendDuelActionView(null));
  const roundSummary = String(options?.roundSummary || '').trim();
  const notice = String(options?.notice || '').trim();
  const summaryBlock = roundSummary ? `\n📜 本回合結算：\n${roundSummary}\n` : '';
  const hostSubmitted = Boolean(hostChoice);
  const rivalSubmitted = Boolean(rivalChoice);
  const waitingHint = (hostSubmitted && !rivalSubmitted)
    ? '⏳ 你已提交，正在等待對手按下按鈕...'
    : (!hostSubmitted && rivalSubmitted)
      ? '⏳ 對手已提交，請你按下招式按鈕...'
      : '';
  const noticeBlock = [notice, waitingHint].filter(Boolean).join('\n');
  const readyText =
    `提交狀態：${hostName} ${formatOnlineFriendChoiceText(hostChoice, hostMoves)} ｜ ${rivalName} ${formatOnlineFriendChoiceText(rivalChoice, rivalMoves)}`;

  if (online?.awaitingRival) {
    const waitingContent =
      `🌐 **好友手動對戰（線上模式）**\n` +
      `🕒 正在等待對手加入本場即時戰鬥...\n` +
      `就緒狀態：${hostName} ✅ ｜ ${rivalName} ⌛\n` +
      `\n請對手按下「✅ 加入即時戰鬥」後開打。\n` +
      `（若對手未加入，你也可以改用其他模式）`;
    const readyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fdonline_join_${hostId}`).setLabel('✅ 加入即時戰鬥').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('battle_mode_manual_offline').setLabel('⚔️ 改用手動（對手AI）').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('battle_mode_ai').setLabel('🤖 改用AI戰鬥').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('battle_mode_manual_back').setLabel('↩️ 返回').setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`fdonline_view_${hostId}`)
        .setLabel(layoutMode === 'mobile' ? '🖥️ 電腦版' : '📱 手機版')
        .setStyle(ButtonStyle.Secondary)
    );
    return {
      content: waitingContent,
      embeds: [],
      components: [readyRow]
    };
  }

  const content =
    `🌐 **好友手動對戰（線上模式）**\n` +
    `⏳ 本回合倒數：${remainSec} 秒（每回合 ${Math.floor(FRIEND_DUEL_ONLINE_TURN_MS / 1000)} 秒）\n` +
    `⚡ 能量：${hostName} ${hostEnergy} ｜ ${rivalName} ${rivalEnergy}\n` +
    `${readyText}\n` +
    `${board}\n\n` +
    `${actionPanels}` +
    `${summaryBlock}` +
    `${noticeBlock ? `\n${noticeBlock}\n` : ''}` +
    `\n**招式：**\n${formatOnlineHostMoveDetails(hostMoves, combatant, enemy, hostEnergy)}\n` +
    `\n在倒數內可改選；雙方都提交後會立即結算。`;

  return {
    content,
    embeds: [],
    components: buildOnlineFriendDuelButtons(hostId, hostMoves, hostEnergy, layoutMode)
  };
}

async function editOnlineFriendDuelMessage(hostPlayer, payload) {
  const online = getOnlineFriendDuelState(hostPlayer);
  if (!online) return null;
  const channelId = String(online.channelId || hostPlayer?.activeThreadId || '').trim();
  const messageId = String(online.messageId || '').trim();
  if (!channelId || !messageId) return null;
  let channel = CLIENT.channels.cache.get(channelId);
  if (!channel) {
    channel = await CLIENT.channels.fetch(channelId).catch(() => null);
  }
  if (!channel) return null;
  const msg = await findMessageInChannel(channel, messageId);
  if (!msg) return null;
  await msg.edit(payload).catch(() => {});
  trackActiveGameMessage(hostPlayer, channelId, messageId);
  return msg;
}

function pickBestMoveForOnlineEnemy(enemy, combatant, moves, availableEnergy = 0) {
  const list = (Array.isArray(moves) ? moves : []).filter((move) => Boolean(move) && !isFleeLikeMove(move));
  const affordable = list.filter((move) => BATTLE.getMoveEnergyCost(move) <= Number(availableEnergy || 0));
  const pool = affordable.length > 0 ? affordable : [];
  if (pool.length <= 0) return WAIT_COMBAT_MOVE;
  let best = pool[0];
  let bestScore = -Infinity;
  for (const move of pool) {
    const cost = BATTLE.getMoveEnergyCost(move);
    const speed = getMoveSpeedValue(move);
    const dmg = BATTLE.calculatePlayerMoveDamage(move, {}, enemy || {}).total || 0;
    const net = Math.max(1, Number(dmg) - Math.max(0, Number(combatant?.defense || 0)));
    const killBonus = Number(combatant?.hp || 0) <= net ? 120 : 0;
    const efficiency = Math.max(0, 4 - cost) * 2;
    const score = net + killBonus + efficiency + (speed - 10) * 0.4;
    if (score > bestScore) {
      best = move;
      bestScore = score;
    }
  }
  return best || WAIT_COMBAT_MOVE;
}

function resolveOnlineSubmittedMove(args = {}) {
  const {
    choice = null,
    moves = [],
    fallbackMove = WAIT_COMBAT_MOVE,
    availableEnergy = 0
  } = args;
  const list = Array.isArray(moves) ? moves : [];
  if (!choice || typeof choice !== 'object') {
    return {
      move: fallbackMove,
      cost: BATTLE.getMoveEnergyCost(fallbackMove),
      autoSelected: true,
      reason: 'timeout_auto'
    };
  }
  if (choice.kind === 'wait') {
    return {
      move: WAIT_COMBAT_MOVE,
      cost: 0,
      autoSelected: false,
      reason: 'manual_wait'
    };
  }
  const idx = Math.max(0, Number(choice.moveIndex || 0));
  const move = list[idx];
  if (!move) {
    return {
      move: fallbackMove,
      cost: BATTLE.getMoveEnergyCost(fallbackMove),
      autoSelected: true,
      reason: 'invalid_index'
    };
  }
  const cost = BATTLE.getMoveEnergyCost(move);
  if (Number(availableEnergy || 0) < cost) {
    return {
      move: fallbackMove,
      cost: BATTLE.getMoveEnergyCost(fallbackMove),
      autoSelected: true,
      reason: 'energy_insufficient'
    };
  }
  return {
    move,
    cost,
    autoSelected: false,
    reason: 'manual_move'
  };
}

function scheduleOnlineFriendDuelTimer(hostPlayer) {
  const online = getOnlineFriendDuelState(hostPlayer);
  if (!online) return;
  const roomId = String(online.roomId || '').trim();
  const hostId = String(online.hostId || hostPlayer?.id || '').trim();
  if (!roomId || !hostId) return;
  clearOnlineFriendDuelTimer(roomId);
  const delay = Math.max(200, Number(online.deadlineAt || Date.now() + FRIEND_DUEL_ONLINE_TURN_MS) - Date.now());
  const timer = setTimeout(() => {
    resolveOnlineFriendDuelTurnByTimeout(hostId, roomId).catch((err) => {
      console.error('[FriendDuelOnline] timeout resolve failed:', err?.message || err);
    });
  }, delay);
  ONLINE_FRIEND_DUEL_TIMERS.set(roomId, timer);
}

async function resolveOnlineFriendDuelTurnByTimeout(hostId = '', roomId = '') {
  const hostPlayer = getOnlineFriendDuelHostPlayer(hostId);
  if (!hostPlayer) return;
  const online = getOnlineFriendDuelState(hostPlayer);
  if (!online) return;
  const activeRoomId = String(online.roomId || '').trim();
  if (roomId && activeRoomId !== String(roomId || '').trim()) return;
  if (Date.now() + 80 < Number(online.deadlineAt || 0)) {
    scheduleOnlineFriendDuelTimer(hostPlayer);
    return;
  }
  await resolveOnlineFriendDuelTurn(hostPlayer, { trigger: 'timeout' });
}

async function resolveOnlineFriendDuelTurn(hostPlayer, options = {}) {
  if (!hostPlayer || typeof hostPlayer !== 'object') return;
  const online = getOnlineFriendDuelState(hostPlayer);
  if (!online) return;
  if (online.resolving) return;
  const hostId = String(online.hostId || hostPlayer.id || '').trim();
  const rivalId = String(online.rivalId || '').trim();
  if (!hostId || !rivalId) return;

  online.resolving = true;
  CORE.savePlayer(hostPlayer);

  try {
    const fallbackPet = PET.loadPet(hostId);
    const petResolved = resolvePlayerMainPet(hostPlayer, { preferBattle: true, fallbackPet });
    let hostPet = petResolved?.pet || fallbackPet;
    let enemy = hostPlayer?.battleState?.enemy;
    let combatant = getActiveCombatant(hostPlayer, hostPet);
    if (!hostPet || !enemy || !combatant) {
      online.resolving = false;
      CORE.savePlayer(hostPlayer);
      return;
    }
    if (petResolved?.changed) CORE.savePlayer(hostPlayer);

    const hostState = ensureBattleEnergyState(hostPlayer);
    const hostEnergyBefore = Number(hostState.energy || 0);
    const rivalEnergyBefore = Math.max(0, Number(online.rivalEnergy || 2));
    const hostMoves = getCombatantMoves(combatant, hostPet).slice(0, PET_MOVE_LOADOUT_LIMIT);
    const rivalMoves = getOnlineFriendDuelRivalMoves(enemy).slice(0, PET_MOVE_LOADOUT_LIMIT);
    const hostChoice = online.choices?.[hostId] || null;
    const rivalChoice = online.choices?.[rivalId] || null;

    const hostAuto = pickBestMoveForAI(hostPlayer, hostPet, enemy, combatant, hostEnergyBefore) || WAIT_COMBAT_MOVE;
    const rivalAuto = pickBestMoveForOnlineEnemy(enemy, combatant, rivalMoves, rivalEnergyBefore) || WAIT_COMBAT_MOVE;
    const hostPicked = resolveOnlineSubmittedMove({
      choice: hostChoice,
      moves: hostMoves,
      fallbackMove: hostAuto,
      availableEnergy: hostEnergyBefore
    });
    const rivalPicked = resolveOnlineSubmittedMove({
      choice: rivalChoice,
      moves: rivalMoves,
      fallbackMove: rivalAuto,
      availableEnergy: rivalEnergyBefore
    });

    const roundRaw = BATTLE.executeBattleRound(
      hostPlayer,
      combatant,
      enemy,
      hostPicked.move,
      rivalPicked.move,
      { nonLethal: true }
    );
    const roundResult = maybeResolveMentorSparResult(hostPlayer, enemy, roundRaw);

    const savedPet = persistCombatantState(hostPlayer, hostPet, combatant);
    if (savedPet) PET.savePet(savedPet);

    const roundNoteParts = [];
    if (hostPicked.autoSelected) {
      roundNoteParts.push(`⚠️ ${hostPlayer.name} 未在時限內完成有效提交，系統改為「${hostPicked.move?.name || '待機'}」。`);
    }
    const rivalName = String(hostPlayer?.battleState?.friendDuel?.friendName || '好友').trim() || '好友';
    if (rivalPicked.autoSelected) {
      roundNoteParts.push(`⚠️ ${rivalName} 未在時限內完成有效提交，系統改為「${rivalPicked.move?.name || '待機'}」。`);
    }
    const duelSwitchNotes = [];
    if (roundResult?.victory === true) {
      const switchedEnemy = trySwitchFriendDuelEnemy(hostPlayer, enemy?.name || '');
      if (switchedEnemy?.switched) {
        duelSwitchNotes.push(switchedEnemy.message);
        enemy = hostPlayer?.battleState?.enemy;
      } else {
        const roundSummary = [String(roundResult?.message || '').trim(), ...roundNoteParts].filter(Boolean).join('\n');
        const roomId = String(online.roomId || '').trim();
        clearOnlineFriendDuelTimer(roomId);
        const duel = finalizeFriendDuel(hostPlayer, hostPet, combatant, roundSummary, true);
        const endEmbed = new EmbedBuilder()
          .setTitle('🤝 好友友誼戰勝利（線上）')
          .setColor(0x8b5cf6)
          .setDescription(`${roundSummary}\n\n${duel.summaryLine}`);
        const row = buildFriendDuelResultRow();
        await editOnlineFriendDuelMessage(hostPlayer, { content: null, embeds: [endEmbed], components: [row] });
        return;
      }
    } else if (roundResult?.victory === false || Number(combatant?.hp || 0) <= 0) {
      const switchedPet = trySwitchFriendDuelPlayerPet(hostPlayer, hostPet, combatant);
      if (switchedPet?.switched && switchedPet?.nextPet) {
        duelSwitchNotes.push(switchedPet.message);
        hostPet = switchedPet.nextPet;
        combatant = getActiveCombatant(hostPlayer, hostPet);
      } else {
        const roundSummary = [String(roundResult?.message || '').trim(), ...roundNoteParts].filter(Boolean).join('\n');
        const roomId = String(online.roomId || '').trim();
        clearOnlineFriendDuelTimer(roomId);
        const duel = finalizeFriendDuel(hostPlayer, hostPet, combatant, roundSummary, false);
        const endEmbed = new EmbedBuilder()
          .setTitle('🤝 好友友誼戰落敗（線上）')
          .setColor(0x8b5cf6)
          .setDescription(`${roundSummary}\n\n${duel.summaryLine}`);
        const row = buildFriendDuelResultRow();
        await editOnlineFriendDuelMessage(hostPlayer, { content: null, embeds: [endEmbed], components: [row] });
        return;
      }
    }

    const roundSummary = [
      String(roundResult?.message || '').trim(),
      ...duelSwitchNotes,
      ...roundNoteParts
    ].filter(Boolean).join('\n');

    if (!combatant) {
      const roomId = String(online.roomId || '').trim();
      clearOnlineFriendDuelTimer(roomId);
      const duel = finalizeFriendDuel(hostPlayer, hostPet, combatant, roundSummary, false);
      const endEmbed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰落敗（線上）')
        .setColor(0x8b5cf6)
        .setDescription(`${roundSummary}\n\n${duel.summaryLine}`);
      const row = buildFriendDuelResultRow();
      await editOnlineFriendDuelMessage(hostPlayer, { content: null, embeds: [endEmbed], components: [row] });
      return;
    }

    hostPlayer.battleState.mode = 'manual_online';
    const next = advanceBattleTurnEnergy(hostPlayer, hostPicked.cost);
    online.rivalEnergy = Math.max(0, rivalEnergyBefore - rivalPicked.cost) + 2;
    online.turn = Math.max(1, Number(next.turn || online.turn || 1));
    online.deadlineAt = Date.now() + FRIEND_DUEL_ONLINE_TURN_MS;
    online.choices = {};
    online.resolving = false;
    CORE.savePlayer(hostPlayer);
    scheduleOnlineFriendDuelTimer(hostPlayer);

    const refreshedFallbackPet = PET.loadPet(hostId);
    const refreshedHostPet = resolvePlayerMainPet(hostPlayer, { preferBattle: true, fallbackPet: refreshedFallbackPet }).pet || hostPet || refreshedFallbackPet;
    await editOnlineFriendDuelMessage(hostPlayer, buildOnlineFriendDuelPayload(hostPlayer, refreshedHostPet, {
      actionView: buildOnlineFriendDuelActionView(roundResult),
      roundSummary,
      notice: `✅ 本回合已結算，下一回合開始。`
    }));
  } catch (err) {
    const latest = CORE.loadPlayer(String(hostPlayer?.id || '').trim());
    const onlineLatest = getOnlineFriendDuelState(latest);
    if (onlineLatest) {
      onlineLatest.resolving = false;
      CORE.savePlayer(latest);
    }
    console.error('[FriendDuelOnline] resolve failed:', err?.message || err);
  }
}

async function startManualBattleOnline(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  if (!player || !pet || !player?.battleState?.enemy || !player?.battleState?.friendDuel) {
    await interaction.reply({ content: '❌ 目前不是可啟用線上模式的好友友誼戰。', ephemeral: true }).catch(() => {});
    return;
  }
  if (petResolved?.changed) CORE.savePlayer(player);

  const duel = player.battleState.friendDuel || {};
  const friendId = String(duel.friendId || '').trim();
  if (!friendId) {
    await interaction.reply({ content: '❌ 找不到好友對戰對象。', ephemeral: true }).catch(() => {});
    return;
  }

  // 若好友已先建立等待中的線上房間，直接加入對方房間，避免雙方各自開房卡住。
  const rivalHost = getOnlineFriendDuelHostPlayer(friendId);
  const rivalOnline = getOnlineFriendDuelState(rivalHost);
  if (
    rivalHost &&
    rivalOnline &&
    rivalOnline.awaitingRival &&
    String(rivalOnline.rivalId || '').trim() === String(player.id || '').trim()
  ) {
    rivalHost.battleState.mode = 'manual_online';
    ensureBattleEnergyState(rivalHost);
    rivalOnline.awaitingRival = false;
    if (!String(rivalOnline.layoutMode || '').trim()) {
      rivalOnline.layoutMode = getBattleLayoutMode(rivalHost);
    }
    rivalOnline.deadlineAt = Date.now() + FRIEND_DUEL_ONLINE_TURN_MS;
    rivalOnline.turn = Math.max(1, Number(rivalHost?.battleState?.turn || rivalOnline.turn || 1));
    rivalOnline.choices = {};
    rivalOnline.resolving = false;
    CORE.savePlayer(rivalHost);
    scheduleOnlineFriendDuelTimer(rivalHost);

    const rivalFallbackPet = PET.loadPet(String(rivalHost.id || '').trim());
    const rivalPetResolved = resolvePlayerMainPet(rivalHost, { preferBattle: true, fallbackPet: rivalFallbackPet });
    const rivalPet = rivalPetResolved?.pet || rivalFallbackPet;
    if (rivalPetResolved?.changed) CORE.savePlayer(rivalHost);
    const payload = buildOnlineFriendDuelPayload(rivalHost, rivalPet, {
      notice: `✅ ${player.name} 已加入即時戰鬥，回合開始（每回合 ${Math.floor(FRIEND_DUEL_ONLINE_TURN_MS / 1000)} 秒）。`
    });
    const duelMsg = await editOnlineFriendDuelMessage(rivalHost, payload);

    player.battleState.mode = 'manual_online';
    if (player?.battleState?.friendDuel?.online) {
      const oldRoomId = String(player.battleState.friendDuel.online.roomId || '').trim();
      if (oldRoomId) clearOnlineFriendDuelTimer(oldRoomId);
      delete player.battleState.friendDuel.online;
    }
    CORE.savePlayer(player);

    const rows = [];
    if (duelMsg?.url) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(duelMsg.url).setLabel('🌐 前往即時戰鬥面板')
        )
      );
    }
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('battle_mode_manual_back').setLabel('↩️ 返回').setStyle(ButtonStyle.Secondary)
      )
    );
    await interaction.update({
      content: `✅ 已自動加入 ${String(rivalHost.name || '好友').trim() || '好友'} 的即時戰鬥房。`,
      embeds: [],
      components: rows
    }).catch(async () => {
      await interaction.reply({ content: '✅ 已自動加入好友的即時戰鬥房。', ephemeral: true }).catch(() => {});
    });
    return;
  }

  player.battleState.mode = 'manual_online';
  ensureBattleEnergyState(player);
  const online = {
    enabled: true,
    hostId: String(player.id || '').trim(),
    rivalId: friendId,
    roomId: `fd_${String(player.id || '').trim()}_${Date.now().toString(36)}`,
    turn: Math.max(1, Number(player?.battleState?.turn || 1)),
    deadlineAt: 0,
    rivalEnergy: 2,
    choices: {},
    channelId: String(interaction.channelId || '').trim(),
    messageId: String(interaction.message?.id || '').trim(),
    resolving: false,
    awaitingRival: true,
    layoutMode: getBattleLayoutMode(player)
  };
  player.battleState.friendDuel.online = online;
  CORE.savePlayer(player);
  clearOnlineFriendDuelTimer(online.roomId);

  const payload = buildOnlineFriendDuelPayload(player, pet, {
    notice: `📡 已建立即時友誼戰房間，等待對手加入。`
  });
  await interaction.update(payload).catch(async () => {
    await interaction.reply({ content: '❌ 線上模式啟動失敗，請重試。', ephemeral: true }).catch(() => {});
  });
}

async function handleOnlineFriendDuelChoice(interaction, user, customId = '') {
  const action = parseOnlineFriendDuelAction(customId);
  if (!action?.hostId) {
    await interaction.reply({ content: '⚠️ 線上對戰按鈕格式錯誤。', ephemeral: true }).catch(() => {});
    return;
  }
  const hostPlayer = getOnlineFriendDuelHostPlayer(action.hostId);
  if (!hostPlayer) {
    await interaction.reply({ content: '⚠️ 這個線上對戰房間已失效。', ephemeral: true }).catch(() => {});
    return;
  }
  if (!canOperateOnlineFriendDuel(hostPlayer, user.id, interaction.channelId)) {
    await interaction.reply({ content: '⚠️ 你不是這場線上友誼戰的參戰者。', ephemeral: true }).catch(() => {});
    return;
  }

  const online = getOnlineFriendDuelState(hostPlayer);
  if (!online) {
    await interaction.reply({ content: '⚠️ 線上友誼戰狀態不存在。', ephemeral: true }).catch(() => {});
    return;
  }

  if (action.kind === 'view') {
    await interaction.deferUpdate().catch(() => {});
    const nextMode = toggleOnlineBattleLayoutMode(online);
    CORE.savePlayer(hostPlayer);
    const fallbackPetView = PET.loadPet(String(hostPlayer?.id || '').trim());
    const petResolvedView = resolvePlayerMainPet(hostPlayer, { preferBattle: true, fallbackPet: fallbackPetView });
    const hostPetView = petResolvedView?.pet || fallbackPetView;
    if (petResolvedView?.changed) CORE.savePlayer(hostPlayer);
    if (hostPetView) {
      await editOnlineFriendDuelMessage(hostPlayer, buildOnlineFriendDuelPayload(hostPlayer, hostPetView, {
        notice: nextMode === 'mobile'
          ? '📱 已切換為手機版戰鬥排版。'
          : '🖥️ 已切換為電腦版戰鬥排版。'
      }));
    }
    return;
  }

  if (Date.now() > Number(online.deadlineAt || 0) && !online.resolving) {
    await interaction.deferUpdate().catch(() => {});
    await resolveOnlineFriendDuelTurn(hostPlayer, { trigger: 'late_click' });
    return;
  }

  const hostId = String(online.hostId || '').trim();
  const rivalId = String(online.rivalId || '').trim();
  const actorId = String(user.id || '').trim();
  const actorIsHost = actorId === hostId;
  const actorIsRival = actorId === rivalId;
  if (!actorIsHost && !actorIsRival) {
    await interaction.reply({ content: '⚠️ 你不是本場線上友誼戰參戰者。', ephemeral: true }).catch(() => {});
    return;
  }

  if (action.kind === 'join') {
    if (!online.awaitingRival) {
      await interaction.reply({ content: 'ℹ️ 這場即時戰鬥已開始。', ephemeral: true }).catch(() => {});
      return;
    }
    if (!actorIsRival) {
      // 若發生雙方各自開房（雙等待房），允許主機端一鍵合併到對手房，避免卡死。
      const mirrorHost = getOnlineFriendDuelHostPlayer(rivalId);
      const mirrorOnline = getOnlineFriendDuelState(mirrorHost);
      if (
        mirrorHost &&
        mirrorOnline &&
        mirrorOnline.awaitingRival &&
        String(mirrorOnline.rivalId || '').trim() === hostId
      ) {
        await interaction.deferUpdate().catch(() => {});

        mirrorHost.battleState.mode = 'manual_online';
        ensureBattleEnergyState(mirrorHost);
        mirrorOnline.awaitingRival = false;
        mirrorOnline.deadlineAt = Date.now() + FRIEND_DUEL_ONLINE_TURN_MS;
        mirrorOnline.turn = Math.max(1, Number(mirrorHost?.battleState?.turn || mirrorOnline.turn || 1));
        mirrorOnline.choices = {};
        mirrorOnline.resolving = false;
        CORE.savePlayer(mirrorHost);
        scheduleOnlineFriendDuelTimer(mirrorHost);

        const staleRoomId = String(online.roomId || '').trim();
        if (staleRoomId) clearOnlineFriendDuelTimer(staleRoomId);
        if (hostPlayer?.battleState?.friendDuel?.online) {
          delete hostPlayer.battleState.friendDuel.online;
        }
        CORE.savePlayer(hostPlayer);

        const mirrorFallbackPet = PET.loadPet(String(mirrorHost.id || '').trim());
        const mirrorPetResolved = resolvePlayerMainPet(mirrorHost, { preferBattle: true, fallbackPet: mirrorFallbackPet });
        const mirrorPet = mirrorPetResolved?.pet || mirrorFallbackPet;
        if (mirrorPetResolved?.changed) CORE.savePlayer(mirrorHost);
        const payload = buildOnlineFriendDuelPayload(mirrorHost, mirrorPet, {
          notice: `✅ 已自動合併雙等待房，回合開始（每回合 ${Math.floor(FRIEND_DUEL_ONLINE_TURN_MS / 1000)} 秒）。`
        });
        const duelMsg = await editOnlineFriendDuelMessage(mirrorHost, payload);
        const jump = duelMsg?.url ? `\n請前往面板：${duelMsg.url}` : '';
        await interaction.followUp({ content: `✅ 已自動合併到對手房間。${jump}`, ephemeral: true }).catch(() => {});
        return;
      }

      await interaction.reply({ content: '⚠️ 只有對手可以按「加入即時戰鬥」。', ephemeral: true }).catch(() => {});
      return;
    }
    await interaction.deferUpdate().catch(() => {});
    online.awaitingRival = false;
    online.deadlineAt = Date.now() + FRIEND_DUEL_ONLINE_TURN_MS;
    online.turn = Math.max(1, Number(hostPlayer?.battleState?.turn || online.turn || 1));
    online.choices = {};
    online.resolving = false;
    CORE.savePlayer(hostPlayer);
    scheduleOnlineFriendDuelTimer(hostPlayer);

    const fallbackPetJoin = PET.loadPet(hostId);
    const petResolvedJoin = resolvePlayerMainPet(hostPlayer, { preferBattle: true, fallbackPet: fallbackPetJoin });
    const hostPetJoin = petResolvedJoin?.pet || fallbackPetJoin;
    if (!hostPetJoin) return;
    if (petResolvedJoin?.changed) CORE.savePlayer(hostPlayer);

    const payload = buildOnlineFriendDuelPayload(hostPlayer, hostPetJoin, {
      notice: `✅ 雙方已就緒，回合開始（每回合 ${Math.floor(FRIEND_DUEL_ONLINE_TURN_MS / 1000)} 秒）。`
    });
    await editOnlineFriendDuelMessage(hostPlayer, payload);
    return;
  }

  if (online.awaitingRival) {
    await interaction.reply({ content: '⏳ 對手尚未加入線上即時戰鬥，暫時不能提交招式。', ephemeral: true }).catch(() => {});
    return;
  }

  const fallbackPet = PET.loadPet(hostId);
  const petResolved = resolvePlayerMainPet(hostPlayer, { preferBattle: true, fallbackPet });
  const hostPet = petResolved?.pet || fallbackPet;
  const enemy = hostPlayer?.battleState?.enemy;
  const combatant = getActiveCombatant(hostPlayer, hostPet);
  if (!hostPet || !enemy || !combatant) {
    await interaction.reply({ content: '❌ 戰鬥資料缺失，請重新發起友誼戰。', ephemeral: true }).catch(() => {});
    return;
  }
  if (petResolved?.changed) CORE.savePlayer(hostPlayer);

  const hostEnergy = Number(ensureBattleEnergyState(hostPlayer).energy || 0);
  const rivalEnergy = Math.max(0, Number(online.rivalEnergy || 2));
  const hostMoves = getCombatantMoves(combatant, hostPet).slice(0, PET_MOVE_LOADOUT_LIMIT);
  const rivalMoves = getOnlineFriendDuelRivalMoves(enemy).slice(0, PET_MOVE_LOADOUT_LIMIT);
  const actorMoves = actorIsHost ? hostMoves : rivalMoves;
  const actorEnergy = actorIsHost ? hostEnergy : rivalEnergy;
  if (action.kind === 'move') {
    const move = actorMoves[action.moveIndex];
    if (!move) {
      await interaction.reply({ content: `⚠️ 索引 ${action.moveIndex + 1} 不存在。`, ephemeral: true }).catch(() => {});
      return;
    }
    const cost = BATTLE.getMoveEnergyCost(move);
    if (actorEnergy < cost) {
      await interaction.reply({ content: `⚠️ 能量不足：${move.name} 需要 ⚡${cost}，你目前只有 ⚡${actorEnergy}。`, ephemeral: true }).catch(() => {});
      return;
    }
  }

  await interaction.deferUpdate().catch(() => {});
  if (!online.choices || typeof online.choices !== 'object') online.choices = {};
  online.choices[actorId] = {
    kind: action.kind,
    moveIndex: action.kind === 'move' ? action.moveIndex : -1,
    at: Date.now()
  };
  CORE.savePlayer(hostPlayer);

  const bothReady = Boolean(online.choices?.[hostId]) && Boolean(online.choices?.[rivalId]);
  if (bothReady) {
    await resolveOnlineFriendDuelTurn(hostPlayer, { trigger: 'both_ready' });
    return;
  }

  const payload = buildOnlineFriendDuelPayload(hostPlayer, hostPet, {
    notice: `📝 ${user.username} 已提交本回合行動，等待另一位玩家。`
  });
  await editOnlineFriendDuelMessage(hostPlayer, payload);
}

async function startManualBattle(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  if (!player || !pet) {
    await interaction.reply({ content: '❌ 沒有可用招式，無法開始戰鬥。', ephemeral: true }).catch(() => {});
    return;
  }
  const previousOnlineRoomId = String(player?.battleState?.friendDuel?.online?.roomId || '').trim();
  if (previousOnlineRoomId) {
    clearOnlineFriendDuelTimer(previousOnlineRoomId);
    if (player?.battleState?.friendDuel?.online) {
      delete player.battleState.friendDuel.online;
    }
  }

  let createdBattle = false;
  if (!player.battleState?.enemy) {
    player.battleState = {
      enemy: BATTLE.createEnemy('哥布林', Math.max(1, player.level || 1)),
      fighter: CORE.canPetFight(pet) ? 'pet' : 'player',
      mode: 'manual',
      fleeAttempts: 0,
      energy: 2,
      turn: 1,
      startedAt: Date.now(),
      sourceChoice: '突發戰鬥',
      preBattleStory: String(player?.currentStory || '').trim(),
      humanState: null,
      petState: null,
      activePetId: String(pet?.id || '').trim() || null,
      petStates: {}
    };
    createdBattle = true;
  } else {
    if (player.battleState.fighter !== 'player' && !CORE.canPetFight(pet)) {
      player.battleState.fighter = 'player';
    }
    player.battleState.mode = 'manual';
  }

  if (createdBattle) {
    rememberPlayer(player, {
      type: '戰鬥',
      content: `突發戰鬥：遭遇 ${player.battleState.enemy.name}`,
      outcome: '手動模式',
      importance: 2,
      tags: ['battle', 'manual_start']
    });
    publishBattleWorldEvent(player, player.battleState.enemy.name, 'battle_start');
  }
  ensureBattleEnergyState(player);
  if (petResolved?.changed) CORE.savePlayer(player);
  CORE.savePlayer(player);
  await handleFight(interaction, user);
}

async function startAutoBattle(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  let pet = petResolved?.pet || fallbackPet;
  const uiLang = getPlayerUILang(player);
  if (!player || !pet) {
    await interaction.update({ content: '❌ 沒有可用招式，無法開始 AI 戰鬥。', components: [] });
    return;
  }
  const previousOnlineRoomId = String(player?.battleState?.friendDuel?.online?.roomId || '').trim();
  if (previousOnlineRoomId) {
    clearOnlineFriendDuelTimer(previousOnlineRoomId);
    if (player?.battleState?.friendDuel?.online) {
      delete player.battleState.friendDuel.online;
    }
  }
  ECON.ensurePlayerEconomy(player);

  let createdBattle = false;
  if (!player.battleState?.enemy) {
    player.battleState = {
      enemy: BATTLE.createEnemy('哥布林', Math.max(1, player.level || 1)),
      fighter: CORE.canPetFight(pet) ? 'pet' : 'player',
      mode: 'ai',
      fleeAttempts: 0,
      energy: 2,
      turn: 1,
      startedAt: Date.now(),
      sourceChoice: '突發戰鬥',
      preBattleStory: String(player?.currentStory || '').trim(),
      humanState: null,
      petState: null,
      activePetId: String(pet?.id || '').trim() || null,
      petStates: {}
    };
    createdBattle = true;
  } else {
    if (player.battleState.fighter !== 'player' && !CORE.canPetFight(pet)) {
      player.battleState.fighter = 'player';
    }
    player.battleState.mode = 'ai';
  }

  if (createdBattle) {
    rememberPlayer(player, {
      type: '戰鬥',
      content: `突發戰鬥：遭遇 ${player.battleState.enemy.name}`,
      outcome: 'AI模式',
      importance: 2,
      tags: ['battle', 'ai_start']
    });
    publishBattleWorldEvent(player, player.battleState.enemy.name, 'battle_start');
  }
  ensureBattleEnergyState(player);
  if (petResolved?.changed) CORE.savePlayer(player);
  CORE.savePlayer(player);

  let enemy = player.battleState.enemy;
  let combatant = getActiveCombatant(player, pet);
  const candidateMoves = getCombatantMoves(combatant, pet);
  if (candidateMoves.length === 0) {
    await interaction.update({ content: '❌ 沒有可用招式，無法開始 AI 戰鬥。', components: [] });
    return;
  }

  const rounds = [];
  const duelSwitchNotes = [];
  let finalResult = null;
  const maxTurns = 12;
  ensureBattleEnergyState(player);

  for (let turn = 1; turn <= maxTurns; turn++) {
    const energyBefore = ensureBattleEnergyState(player).energy;
    const aiMove = pickBestMoveForAI(player, pet, enemy, combatant, energyBefore);
    const selectedMove = aiMove || WAIT_COMBAT_MOVE;
    const energyCost = aiMove ? BATTLE.getMoveEnergyCost(aiMove) : 0;
    const enemyMove = BATTLE.enemyChooseMove(enemy);
    const enemyHpBefore = enemy.hp;
    const petHpBefore = combatant.hp;
    const roundResultRaw = BATTLE.executeBattleRound(
      player,
      combatant,
      enemy,
      selectedMove,
      enemyMove,
      (player?.battleState?.mentorSpar || player?.battleState?.friendDuel) ? { nonLethal: true } : undefined
    );
    const roundResult = maybeResolveMentorSparResult(player, enemy, roundResultRaw);
    const nextEnergy = Math.max(0, energyBefore - energyCost) + 2;
    rounds.push({
      turn,
      playerMove: selectedMove.name || '普通攻擊',
      enemyMove: enemyMove?.name || '普通攻擊',
      playerDamage: Math.max(0, enemyHpBefore - enemy.hp),
      enemyDamage: Math.max(0, petHpBefore - combatant.hp),
      petHp: combatant.hp,
      petMaxHp: combatant.maxHp,
      enemyHp: enemy.hp,
      enemyMaxHp: enemy.maxHp,
      energyBefore,
      energyCost,
      energyAfter: nextEnergy
    });
    {
      const savedRoundPet = persistCombatantState(player, pet, combatant);
      if (savedRoundPet) PET.savePet(savedRoundPet);
    }
    advanceBattleTurnEnergy(player, energyCost);
    if (player?.battleState?.friendDuel && roundResult?.victory === true) {
      const switchedEnemy = trySwitchFriendDuelEnemy(player, enemy?.name || '');
      if (switchedEnemy?.switched) {
        duelSwitchNotes.push(switchedEnemy.message);
        enemy = player.battleState.enemy;
        CORE.savePlayer(player);
        continue;
      }
    }
    if (player?.battleState?.friendDuel && (roundResult?.victory === false || Number(combatant?.hp || 0) <= 0)) {
      const switchedPet = trySwitchFriendDuelPlayerPet(player, pet, combatant);
      if (switchedPet?.switched && switchedPet?.nextPet) {
        duelSwitchNotes.push(switchedPet.message);
        pet = switchedPet.nextPet;
        combatant = getActiveCombatant(player, pet);
        if (!combatant) {
          finalResult = { victory: false, gold: 0, message: switchedPet.message };
          break;
        }
        CORE.savePlayer(player);
        continue;
      }
    }
    if (roundResult.victory !== null) {
      finalResult = roundResult;
      break;
    }
  }

  {
    const savedPet = persistCombatantState(player, pet, combatant);
    if (savedPet) PET.savePet(savedPet);
  }
  CORE.savePlayer(player);

  if (finalResult?.victory === true) {
    if (player?.battleState?.friendDuel) {
      const detail = [
        buildAIBattleStory(rounds, combatant, enemy, finalResult),
        duelSwitchNotes.length > 0 ? duelSwitchNotes.join('\n') : ''
      ].filter(Boolean).join('\n');
      const duel = finalizeFriendDuel(player, pet, combatant, detail, true);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰勝利')
        .setColor(0x8b5cf6)
        .setDescription(`**AI 已完成好友友誼戰**\n\n${detail}\n\n${duel.summaryLine}`)
        .addFields(
          { name: '🤝 對手', value: duel.rivalName, inline: true },
          { name: '🩸 戰後 HP', value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await interaction.update({ embeds: [embed], content: null, components: [row] });
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const detail = buildAIBattleStory(rounds, combatant, enemy, finalResult);
      const mentorVictory = finalizeMentorSparVictory(player, pet, detail);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`**AI 已完成友誼賽**\n\n${detail}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: '🩸 戰後 HP', value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await interaction.update({ embeds: [embed], content: null, components: [row] });
      return;
    }
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    player.stats.財富 += finalResult.gold;
    recordCashflow(player, {
      amount: Number(finalResult.gold || 0),
      category: 'battle_victory_ai',
      source: `AI 戰鬥擊敗 ${enemy.name}`,
      marketType: 'renaiss'
    });
    const battleLoot = await ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50, { lang: player?.language || 'zh-TW' });
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `AI 自動戰鬥擊敗 ${enemy.name}`,
      outcome: `獲得 ${finalResult.gold} Rns 代幣，掉落 ${battleLoot.name}`,
      importance: 3,
      tags: ['battle', 'victory', 'ai']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_win',
      `AI戰鬥勝利｜+${Number(finalResult.gold || 0)} Rns`
    );
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你的 AI 戰鬥成功擊敗 **${enemy.name}**，獲得 ${finalResult.gold} Rns 代幣與「${battleLoot.name}」。`,
      buildAIBattleStory(rounds, combatant, enemy, finalResult),
      `你迅速整隊，準備把這場勝利帶來的連鎖影響推進到下一段冒險。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    queuePendingStoryTrigger(player, {
      name: 'AI戰鬥勝利',
      choice: sourceChoice || `與${enemy.name}交戰`,
      desc: `你在 ${enemy.name} 一戰中獲勝`,
      action: 'battle_result',
      outcome: `戰鬥勝利｜獲得 ${finalResult.gold} Rns｜戰利品 ${battleLoot.name}`
    });
    player.battleState = null;
    player.eventChoices = [];
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle('🤖 AI戰鬥勝利！')
      .setColor(0x00cc66)
      .setDescription(`**AI 已完成自動作戰**\n\n${buildAIBattleStory(rounds, combatant, enemy, finalResult)}`)
      .addFields(
        { name: '💰 獎勵', value: `${finalResult.gold} Rns 代幣`, inline: true },
        { name: '🩸 剩餘 HP', value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLoot.name}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
    );

    await interaction.update({ embeds: [embed], content: null, components: [row] });
    return;
  }

  if (finalResult?.victory === false || combatant.hp <= 0) {
    if (player?.battleState?.friendDuel) {
      const detail = [
        buildAIBattleStory(rounds, combatant, enemy, finalResult),
        duelSwitchNotes.length > 0 ? duelSwitchNotes.join('\n') : ''
      ].filter(Boolean).join('\n');
      const duel = finalizeFriendDuel(player, pet, combatant, detail, false);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰落敗')
        .setColor(0x8b5cf6)
        .setDescription(`${detail}\n\n${duel.summaryLine}`);
      const row = buildFriendDuelResultRow();
      await interaction.update({ embeds: [embed], content: null, components: [row] });
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const detail = buildAIBattleStory(rounds, combatant, enemy, finalResult);
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, detail);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${detail}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
      );
      await interaction.update({ embeds: [embed], content: null, components: [row] });
      return;
    }
    if (combatant.isHuman) {
      await showTrueGameOver(interaction, user, `${buildAIBattleStory(rounds, combatant, enemy, finalResult)}`);
      return;
    }
    await showPetDefeatedTransition(interaction, player, pet, buildAIBattleStory(rounds, combatant, enemy, finalResult));
    return;
  }

  player.battleState.enemy = enemy;
  CORE.savePlayer(player);
  await renderManualBattle(
    interaction,
    player,
    pet,
    rounds.map(r => `第 ${r.turn} 回合：${combatant.name}「${r.playerMove}」｜${enemy.name}「${r.enemyMove}」`).join('\n')
  );
}

async function handleFight(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;

  if (!player || !pet) {
    await interaction.reply({ content: '❌ 沒有招式！', ephemeral: true }).catch(() => {});
    return;
  }

  let createdBattle = false;
  if (!player.battleState?.enemy) {
    player.battleState = {
      enemy: BATTLE.createEnemy('哥布林', Math.max(1, player.level || 1)),
      fighter: CORE.canPetFight(pet) ? 'pet' : 'player',
      mode: 'manual',
      fleeAttempts: 0,
      energy: 2,
      turn: 1,
      startedAt: Date.now(),
      sourceChoice: '突發戰鬥',
      preBattleStory: String(player?.currentStory || '').trim(),
      humanState: null,
      petState: null,
      activePetId: String(pet?.id || '').trim() || null,
      petStates: {}
    };
    createdBattle = true;
  } else if (player.battleState.fighter !== 'player' && !CORE.canPetFight(pet)) {
    player.battleState.fighter = 'player';
    player.battleState.mode = 'manual';
    player.battleState.fleeAttempts = 0;
  }
  ensureBattleEnergyState(player);
  if (createdBattle) {
    publishBattleWorldEvent(player, player.battleState?.enemy?.name || '哥布林', 'battle_start');
  }

  if (petResolved?.changed) CORE.savePlayer(player);
  CORE.savePlayer(player);
  await renderManualBattle(interaction, player, pet);
}

// ============== 使用招式 ==============
async function handleUseMove(interaction, user, moveIndex) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  const uiLang = getPlayerUILang(player);
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, pet);
  const availableMoves = getCombatantMoves(combatant, pet);
  const chosenMove = availableMoves[moveIndex];

  if (!player || !pet || !enemy || !chosenMove) {
    await interaction.update({ content: '❌ 招式不存在！', components: [] });
    return;
  }
  if (petResolved?.changed) CORE.savePlayer(player);
  ECON.ensurePlayerEconomy(player);
  const state = ensureBattleEnergyState(player);
  const energyCost = BATTLE.getMoveEnergyCost(chosenMove);
  if (state.energy < energyCost) {
    await renderManualBattle(
      interaction,
      player,
      pet,
      `⚠️ 能量不足：${chosenMove.name} 需要 ⚡${energyCost}，目前只有 ⚡${state.energy}。`
    );
    return;
  }

  if (chosenMove?.effect?.flee) {
    await renderManualBattle(interaction, player, pet, '⚠️ 請使用下方「逃跑」按鈕，不是招式按鈕。');
    return;
  }

  const battleOptions = (player?.battleState?.mentorSpar || player?.battleState?.friendDuel) ? { nonLethal: true } : undefined;
  const enemyMove = BATTLE.enemyChooseMove(enemy);
  const playerPhaseRaw = BATTLE.executeBattlePlayerPhase(
    player,
    combatant,
    enemy,
    chosenMove,
    battleOptions
  );
  const playerPhase = maybeResolveMentorSparResult(player, enemy, playerPhaseRaw);

  {
    const savedPet = persistCombatantState(player, pet, combatant);
    if (savedPet) PET.savePet(savedPet);
  }
  CORE.savePlayer(player);

  if (playerPhase.victory === true) {
    if (player?.battleState?.friendDuel) {
      const switchedEnemy = trySwitchFriendDuelEnemy(player, enemy?.name || '');
      if (switchedEnemy?.switched) {
        const activePet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet: pet }).pet || pet;
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          activePet,
          `${playerPhase.message}\n\n${switchedEnemy.message}`,
          { mode: 'update' }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, playerPhase.message, true);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰勝利')
        .setColor(0x8b5cf6)
        .setDescription(`${playerPhase.message}\n\n${duel.summaryLine}`)
        .addFields(
          { name: '🤝 對手', value: duel.rivalName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'update');
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorVictory = finalizeMentorSparVictory(player, pet, playerPhase.message);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`${playerPhase.message}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'update');
      return;
    }
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    player.stats.財富 += playerPhase.gold;
    recordCashflow(player, {
      amount: Number(playerPhase.gold || 0),
      category: 'battle_victory_manual',
      source: `手動戰鬥擊敗 ${enemy.name}`,
      marketType: 'renaiss'
    });
    const battleLoot = await ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50, { lang: player?.language || 'zh-TW' });
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `擊敗 ${enemy.name}`,
      outcome: `獲得 ${playerPhase.gold} Rns 代幣，掉落 ${battleLoot.name}`,
      importance: 3,
      tags: ['battle', 'victory']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_win',
      `手動勝利｜+${Number(playerPhase.gold || 0)} Rns`
    );
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你擊敗了 **${enemy.name}**，取得 ${playerPhase.gold} Rns 代幣與戰利品「${battleLoot.name}」。`,
      playerPhase.message,
      `戰場餘波未散，你準備依據這次勝負帶來的新線索繼續推進。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    queuePendingStoryTrigger(player, {
      name: '戰鬥勝利',
      choice: sourceChoice || `與${enemy.name}交戰`,
      desc: `你在 ${enemy.name} 一戰中獲勝`,
      action: 'battle_result',
      outcome: `戰鬥勝利｜獲得 ${playerPhase.gold} Rns｜戰利品 ${battleLoot.name}`
    });
    player.battleState = null;
    player.eventChoices = [];
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory', uiLang))
      .setColor(0x00ff00)
      .setDescription(playerPhase.message)
      .addFields(
        { name: t('gold', uiLang), value: `${playerPhase.gold}`, inline: true },
        { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLoot.name}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
    );
    
    await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'update');
    return;
  }

  if (playerPhase.victory === false) {
    if (player?.battleState?.friendDuel) {
      const switchedPet = trySwitchFriendDuelPlayerPet(player, pet, combatant);
      if (switchedPet?.switched && switchedPet?.nextPet) {
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          switchedPet.nextPet,
          `${playerPhase.message}\n\n${switchedPet.message}`,
          { mode: 'update' }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, playerPhase.message, false);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰落敗')
        .setColor(0x8b5cf6)
        .setDescription(`${playerPhase.message}\n\n${duel.summaryLine}`);
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'update');
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, playerPhase.message);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${playerPhase.message}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
      );
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'update');
      return;
    }
    if (combatant.isHuman) {
      await showTrueGameOver(interaction, user, playerPhase.message, 'update');
      return;
    }
    await showPetDefeatedTransition(interaction, player, pet, playerPhase.message, 'update');
    return;
  }

  await renderManualBattle(
    interaction,
    player,
    pet,
    '',
    {
      disableActions: true,
      actionView: buildActionViewFromPhase(playerPhase, null, { enemyPending: true }),
      turnStartLines: playerPhase.turnStartLines || [],
      notice: '⏳ 敵方即將行動，按鈕暫時鎖定...'
    }
  );

  await new Promise((resolve) => setTimeout(resolve, MANUAL_ENEMY_RESPONSE_DELAY_MS));

  const enemyPhaseRaw = BATTLE.executeBattleEnemyPhase(
    player,
    combatant,
    enemy,
    enemyMove,
    battleOptions
  );
  const enemyPhase = maybeResolveMentorSparResult(player, enemy, enemyPhaseRaw);
  const combinedLines = [...(playerPhase.lines || []), ...(enemyPhase.lines || [])].filter(Boolean);
  const combinedMessage = enemyPhase.outcomeText
    ? [...combinedLines, enemyPhase.outcomeText].join('\n')
    : combinedLines.join('\n');

  {
    const savedPet = persistCombatantState(player, pet, combatant);
    if (savedPet) PET.savePet(savedPet);
  }
  CORE.savePlayer(player);

  if (enemyPhase.victory === true) {
    if (player?.battleState?.friendDuel) {
      const switchedEnemy = trySwitchFriendDuelEnemy(player, enemy?.name || '');
      if (switchedEnemy?.switched) {
        const activePet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet: pet }).pet || pet;
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          activePet,
          `${combinedMessage}\n\n${switchedEnemy.message}`,
          { mode: 'edit' }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, combinedMessage, true);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰勝利')
        .setColor(0x8b5cf6)
        .setDescription(`${combinedMessage}\n\n${duel.summaryLine}`)
        .addFields(
          { name: '🤝 對手', value: duel.rivalName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'edit');
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorVictory = finalizeMentorSparVictory(player, pet, combinedMessage);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`${combinedMessage}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'edit');
      return;
    }
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    player.stats.財富 += enemyPhase.gold;
    recordCashflow(player, {
      amount: Number(enemyPhase.gold || 0),
      category: 'battle_victory_manual',
      source: `手動戰鬥擊敗 ${enemy.name}`,
      marketType: 'renaiss'
    });
    const battleLoot = await ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50, { lang: player?.language || 'zh-TW' });
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `擊敗 ${enemy.name}`,
      outcome: `獲得 ${enemyPhase.gold} Rns 代幣，掉落 ${battleLoot.name}`,
      importance: 3,
      tags: ['battle', 'victory']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_win',
      `手動勝利｜+${Number(enemyPhase.gold || 0)} Rns`
    );
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你擊敗了 **${enemy.name}**，取得 ${enemyPhase.gold} Rns 代幣與戰利品「${battleLoot.name}」。`,
      combinedMessage,
      `戰場餘波未散，你準備依據這次勝負帶來的新線索繼續推進。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    queuePendingStoryTrigger(player, {
      name: '戰鬥勝利',
      choice: sourceChoice || `與${enemy.name}交戰`,
      desc: `你在 ${enemy.name} 一戰中獲勝`,
      action: 'battle_result',
      outcome: `戰鬥勝利｜獲得 ${enemyPhase.gold} Rns｜戰利品 ${battleLoot.name}`
    });
    player.battleState = null;
    player.eventChoices = [];
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory', uiLang))
      .setColor(0x00ff00)
      .setDescription(combinedMessage)
      .addFields(
        { name: t('gold', uiLang), value: `${enemyPhase.gold}`, inline: true },
        { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLoot.name}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
    );
    await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'edit');
    return;
  }

  if (enemyPhase.victory === false) {
    if (player?.battleState?.friendDuel) {
      const switchedPet = trySwitchFriendDuelPlayerPet(player, pet, combatant);
      if (switchedPet?.switched && switchedPet?.nextPet) {
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          switchedPet.nextPet,
          `${combinedMessage}\n\n${switchedPet.message}`,
          { mode: 'edit' }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, combinedMessage, false);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰落敗')
        .setColor(0x8b5cf6)
        .setDescription(`${combinedMessage}\n\n${duel.summaryLine}`);
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'edit');
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, combinedMessage);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${combinedMessage}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
      );
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'edit');
      return;
    }
    if (combatant.isHuman) {
      await showTrueGameOver(interaction, user, combinedMessage, 'edit');
      return;
    }
    await showPetDefeatedTransition(interaction, player, pet, combinedMessage, 'edit');
    return;
  }

  player.battleState.enemy = enemy;
  player.battleState.mode = 'manual';
  const next = advanceBattleTurnEnergy(player, energyCost);
  CORE.savePlayer(player);
  await renderManualBattle(
    interaction,
    player,
    pet,
    `⚡ 消耗：${chosenMove.name} -${energyCost} 能量，下一回合能量 ${next.energy}`,
    {
      mode: 'edit',
      actionView: buildActionViewFromPhase(playerPhase, enemyPhase),
      notice: '✅ 敵方已行動，輪到你選擇下一步。'
    }
  );
}

async function handleBattleWait(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  const uiLang = getPlayerUILang(player);
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, pet);

  if (!player || !pet || !enemy || !combatant) {
    await interaction.update({ content: '❌ 目前不在有效戰鬥狀態。', components: [] });
    return;
  }
  if (petResolved?.changed) CORE.savePlayer(player);

  const state = ensureBattleEnergyState(player);
  const beforeEnergy = state.energy;
  const enemyMove = BATTLE.enemyChooseMove(enemy);
  const battleOptions = (player?.battleState?.mentorSpar || player?.battleState?.friendDuel) ? { nonLethal: true } : undefined;
  const playerPhaseRaw = BATTLE.executeBattlePlayerPhase(
    player,
    combatant,
    enemy,
    WAIT_COMBAT_MOVE,
    battleOptions
  );
  const playerPhase = maybeResolveMentorSparResult(player, enemy, playerPhaseRaw);

  {
    const savedPet = persistCombatantState(player, pet, combatant);
    if (savedPet) PET.savePet(savedPet);
  }
  CORE.savePlayer(player);

  if (playerPhase.victory === true) {
    if (player?.battleState?.friendDuel) {
      const switchedEnemy = trySwitchFriendDuelEnemy(player, enemy?.name || '');
      if (switchedEnemy?.switched) {
        const activePet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet: pet }).pet || pet;
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          activePet,
          `${playerPhase.message}\n\n${switchedEnemy.message}`,
          { mode: 'update' }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, playerPhase.message, true);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰勝利')
        .setColor(0x8b5cf6)
        .setDescription(`${playerPhase.message}\n\n${duel.summaryLine}`)
        .addFields(
          { name: '🤝 對手', value: duel.rivalName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'update');
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorVictory = finalizeMentorSparVictory(player, pet, playerPhase.message);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`${playerPhase.message}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'update');
      return;
    }
    player.stats.財富 += playerPhase.gold;
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    recordCashflow(player, {
      amount: Number(playerPhase.gold || 0),
      category: 'battle_victory_wait',
      source: `待機反擊擊敗 ${enemy.name}`,
      marketType: 'renaiss'
    });
    const battleLoot = await ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50, { lang: player?.language || 'zh-TW' });
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `蓄能待機後反殺 ${enemy.name}`,
      outcome: `獲得 ${playerPhase.gold} Rns 代幣，掉落 ${battleLoot.name}`,
      importance: 3,
      tags: ['battle', 'victory', 'wait_turn']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_win',
      `待機逆轉勝｜+${Number(playerPhase.gold || 0)} Rns`
    );
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你在蓄能待機後逆轉擊敗 **${enemy.name}**，取得 ${playerPhase.gold} Rns 代幣與戰利品「${battleLoot.name}」。`,
      playerPhase.message,
      `你把這段對戰節奏記下，準備把優勢延伸到下一段冒險。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    queuePendingStoryTrigger(player, {
      name: '待機逆轉勝',
      choice: sourceChoice || `與${enemy.name}交戰`,
      desc: `你在蓄能後反殺 ${enemy.name}`,
      action: 'battle_result',
      outcome: `逆轉勝｜獲得 ${playerPhase.gold} Rns｜戰利品 ${battleLoot.name}`
    });
    player.battleState = null;
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory', uiLang))
      .setColor(0x00ff00)
      .setDescription(`${playerPhase.message}${kingProgressLine ? `\n\n${kingProgressLine}` : ''}`)
      .addFields(
        { name: t('gold', uiLang), value: `${playerPhase.gold}`, inline: true },
        { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLoot.name}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
    );
    await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'update');
    return;
  }

  if (playerPhase.victory === false || combatant.hp <= 0) {
    if (player?.battleState?.friendDuel) {
      const switchedPet = trySwitchFriendDuelPlayerPet(player, pet, combatant);
      if (switchedPet?.switched && switchedPet?.nextPet) {
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          switchedPet.nextPet,
          `${playerPhase.message || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`}\n\n${switchedPet.message}`,
          { mode: 'update' }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, playerPhase.message || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`, false);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰落敗')
        .setColor(0x8b5cf6)
        .setDescription(`${playerPhase.message || ''}\n\n${duel.summaryLine}`.trim());
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'update');
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, playerPhase.message || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${playerPhase.message || ''}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`.trim());
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
      );
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'update');
      return;
    }
    CORE.savePlayer(player);
    if (combatant.isHuman) {
      player.battleState = null;
      CORE.savePlayer(player);
      await showTrueGameOver(interaction, user, playerPhase.message || `💀 你在蓄能時被 ${enemy.name} 擊倒...`, 'update');
      return;
    }
    await showPetDefeatedTransition(interaction, player, pet, playerPhase.message || `⚡ 你在蓄能待機時被 ${enemy.name} 擊倒。`, 'update');
    return;
  }

  await renderManualBattle(
    interaction,
    player,
    pet,
    '',
    {
      disableActions: true,
      actionView: buildActionViewFromPhase(playerPhase, null, { enemyPending: true }),
      turnStartLines: playerPhase.turnStartLines || [],
      notice: '⏳ 敵方即將行動，按鈕暫時鎖定...'
    }
  );

  await new Promise((resolve) => setTimeout(resolve, MANUAL_ENEMY_RESPONSE_DELAY_MS));

  const enemyPhaseRaw = BATTLE.executeBattleEnemyPhase(
    player,
    combatant,
    enemy,
    enemyMove,
    battleOptions
  );
  const enemyPhase = maybeResolveMentorSparResult(player, enemy, enemyPhaseRaw);
  const combinedLines = [...(playerPhase.lines || []), ...(enemyPhase.lines || [])].filter(Boolean);
  const combinedMessage = enemyPhase.outcomeText
    ? [...combinedLines, enemyPhase.outcomeText].join('\n')
    : combinedLines.join('\n');

  {
    const savedPet = persistCombatantState(player, pet, combatant);
    if (savedPet) PET.savePet(savedPet);
  }

  if (enemyPhase.victory === true) {
    if (player?.battleState?.friendDuel) {
      const switchedEnemy = trySwitchFriendDuelEnemy(player, enemy?.name || '');
      if (switchedEnemy?.switched) {
        const activePet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet: pet }).pet || pet;
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          activePet,
          `${combinedMessage}\n\n${switchedEnemy.message}`,
          { mode: 'edit' }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, combinedMessage, true);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰勝利')
        .setColor(0x8b5cf6)
        .setDescription(`${combinedMessage}\n\n${duel.summaryLine}`)
        .addFields(
          { name: '🤝 對手', value: duel.rivalName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], content: null, components: [row] }, 'edit');
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorVictory = finalizeMentorSparVictory(player, pet, combinedMessage);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`${combinedMessage}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
      );
      await sendBattleMessage(interaction, { embeds: [embed], content: null, components: [row] }, 'edit');
      return;
    }
    player.stats.財富 += enemyPhase.gold;
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    recordCashflow(player, {
      amount: Number(enemyPhase.gold || 0),
      category: 'battle_victory_wait',
      source: `待機反擊擊敗 ${enemy.name}`,
      marketType: 'renaiss'
    });
    const battleLoot = await ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50, { lang: player?.language || 'zh-TW' });
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `蓄能待機後反殺 ${enemy.name}`,
      outcome: `獲得 ${enemyPhase.gold} Rns 代幣，掉落 ${battleLoot.name}`,
      importance: 3,
      tags: ['battle', 'victory', 'wait_turn']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_win',
      `待機逆轉勝｜+${Number(enemyPhase.gold || 0)} Rns`
    );
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你在蓄能待機後逆轉擊敗 **${enemy.name}**，取得 ${enemyPhase.gold} Rns 代幣與戰利品「${battleLoot.name}」。`,
      combinedMessage,
      `你把這段對戰節奏記下，準備把優勢延伸到下一段冒險。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    queuePendingStoryTrigger(player, {
      name: '待機逆轉勝',
      choice: sourceChoice || `與${enemy.name}交戰`,
      desc: `你在蓄能後反殺 ${enemy.name}`,
      action: 'battle_result',
      outcome: `逆轉勝｜獲得 ${enemyPhase.gold} Rns｜戰利品 ${battleLoot.name}`
    });
    player.battleState = null;
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory', uiLang))
      .setColor(0x00ff00)
      .setDescription(`${combinedMessage}${kingProgressLine ? `\n\n${kingProgressLine}` : ''}`)
      .addFields(
        { name: t('gold', uiLang), value: `${enemyPhase.gold}`, inline: true },
        { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLoot.name}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
    );
    await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'edit');
    return;
  }

  if (enemyPhase.victory === false || combatant.hp <= 0) {
    if (player?.battleState?.friendDuel) {
      const switchedPet = trySwitchFriendDuelPlayerPet(player, pet, combatant);
      if (switchedPet?.switched && switchedPet?.nextPet) {
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          switchedPet.nextPet,
          `${combinedMessage || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`}\n\n${switchedPet.message}`,
          { mode: 'edit' }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, combinedMessage || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`, false);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰落敗')
        .setColor(0x8b5cf6)
        .setDescription(`${combinedMessage || ''}\n\n${duel.summaryLine}`.trim());
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'edit');
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, combinedMessage || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${combinedMessage || ''}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`.trim());
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
      );
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, 'edit');
      return;
    }
    CORE.savePlayer(player);
    if (combatant.isHuman) {
      player.battleState = null;
      CORE.savePlayer(player);
      await showTrueGameOver(interaction, user, combinedMessage || `💀 你在蓄能時被 ${enemy.name} 擊倒...`, 'edit');
      return;
    }
    await showPetDefeatedTransition(interaction, player, pet, combinedMessage || `⚡ 你在蓄能待機時被 ${enemy.name} 擊倒。`, 'edit');
    return;
  }

  player.battleState.enemy = enemy;
  player.battleState.mode = 'manual';
  const next = advanceBattleTurnEnergy(player, 0);
  CORE.savePlayer(player);

  await renderManualBattle(
    interaction,
    player,
    pet,
    `⚡ 能量 ${beforeEnergy} → ${next.energy}（+2）`,
    {
      mode: 'edit',
      actionView: buildActionViewFromPhase(playerPhase, enemyPhase),
      notice: '✅ 敵方已行動，輪到你選擇下一步。'
    }
  );
}

// ============== 逃跑 ==============
async function handleFlee(interaction, user, attemptNum) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  const uiLang = getPlayerUILang(player);
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, pet);

  if (!player || !pet || !enemy) {
    await interaction.update({ content: '❌ 目前不在戰鬥狀態。', components: [] });
    return;
  }
  if (petResolved?.changed) CORE.savePlayer(player);

  const currentAttempt = (player.battleState.fleeAttempts || 0) + 1;
  const result = BATTLE.attemptFlee(player, pet, enemy, currentAttempt, combatant);

  if (result.blocked) {
    {
      const savedPet = persistCombatantState(player, pet, combatant);
      if (savedPet) PET.savePet(savedPet);
    }
    CORE.savePlayer(player);
    await renderManualBattle(interaction, player, pet, result.message);
    return;
  }

  if (result.success) {
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    player.currentStory = composePostBattleStory(
      player,
      `🏃 你成功脫離與 **${enemy.name}** 的交戰，保住了隊伍狀態。`,
      result.message,
      '你拉開距離重整資源，準備以更穩定的節奏回到冒險。',
      sourceChoice,
      preBattleStory
    );
    queuePendingStoryTrigger(player, {
      name: '逃離戰鬥',
      choice: sourceChoice || `與${enemy.name}交戰`,
      desc: `你成功脫離 ${enemy.name} 的追擊`,
      action: 'battle_escape',
      outcome: String(result.message || '').trim()
    });
    player.battleState = null;
    rememberPlayer(player, {
      type: '戰鬥',
      content: `從 ${enemy.name} 戰鬥中撤退`,
      outcome: `第 ${currentAttempt} 次逃跑成功`,
      importance: 2,
      tags: ['battle', 'flee_success']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_flee',
      `第${currentAttempt}次逃跑成功`
    );
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle('🏃 逃跑成功！')
      .setColor(0x00ff00)
      .setDescription(result.message);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
    );

    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  if (result.death) {
    if (combatant?.isHuman) {
      player.battleState = null;
      CORE.savePlayer(player);
      await showTrueGameOver(interaction, user, result.message);
      return;
    }

    await showPetDefeatedTransition(interaction, player, pet, result.message);
    return;
  }

  player.battleState.fleeAttempts = currentAttempt;
  rememberPlayer(player, {
    type: '戰鬥',
    content: `嘗試從 ${enemy.name} 逃跑失敗`,
    outcome: `第 ${currentAttempt} 次失敗`,
    importance: 1,
    tags: ['battle', 'flee_fail']
  });
  publishBattleWorldEvent(
    player,
    enemy.name,
    'battle_flee_fail',
    `第${currentAttempt}次逃跑失敗`
  );
  CORE.savePlayer(player);

  // 可以再試一次
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`flee_${currentAttempt}`).setLabel('🏃 再逃一次！').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('fight_retry').setLabel('⚔️ 不逃了！').setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ content: result.message, components: [row] });
}

// ============== 斜線指令註冊 ==============
CLIENT.on('ready', async () => {
  console.log(`[Storage] APP_ENV=${STORAGE.appEnv} data=${STORAGE.dataDir} worldRoot=${STORAGE.worldDataRoot}`);
  startWorldBackupScheduler(notifyWorldBackupSuccess);

  const commands = [
    { name: 'start', description: '開始你的Renaiss星球冒險！（有存檔則繼續）' },
    { name: 'warstatus', description: '查看正派與 Digital 張力、勢力值與最近三次衝突' },
    {
      name: 'resetdata',
      description: '清空角色資料（需密碼）',
      options: [
        {
          type: 3,
          name: 'scope',
          description: '清空範圍：自己或所有人',
          required: true,
          choices: [
            { name: '自己', value: 'self' },
            { name: '所有人', value: 'all' }
          ]
        },
        {
          type: 3,
          name: 'password',
          description: '安全密碼',
          required: true
        }
      ]
    },
    {
      name: 'resetplayerhistory',
      description: '清空指定玩家全部角色資料（需密碼）',
      options: [
        {
          type: 3,
          name: 'player_id',
          description: '要清空歷史的玩家 Discord ID',
          required: true
        },
        {
          type: 3,
          name: 'password',
          description: '安全密碼',
          required: true
        }
      ]
    },
    {
      name: 'resetworld',
      description: '清空世界事件或重置整個世界（需密碼）',
      options: [
        {
          type: 3,
          name: 'mode',
          description: '清空範圍：events(只清事件) 或 all(整個世界重置)',
          required: true,
          choices: [
            { name: '世界事件', value: 'events' },
            { name: '全部世界', value: 'all' }
          ]
        },
        {
          type: 3,
          name: 'password',
          description: '安全密碼',
          required: true
        }
      ]
    },
    {
      name: 'backupworld',
      description: '手動備份世界/玩家/記憶資料到備份 Git（需密碼）',
      options: [
        {
          type: 3,
          name: 'password',
          description: '安全密碼',
          required: true
        },
        {
          type: 3,
          name: 'note',
          description: '備份備註（可選）',
          required: false
        }
      ]
    },
    {
      name: 'backupcheck',
      description: '檢查備份環境變數是否被程式讀到（需密碼）',
      options: [
        {
          type: 3,
          name: 'password',
          description: '安全密碼',
          required: true
        }
      ]
    }
  ];
  
  try {
    // 全球註冊
    await CLIENT.application.commands.set(commands);
    console.log('[Slash] 全球指令已註冊');
  } catch (e) {
    console.log('[Slash] 全球註冊失敗:', e.message);
  }

  // 伺服器本地註冊（全伺服器嘗試，避免固定 GUILD_ID 限制）
  const guilds = Array.from(CLIENT.guilds.cache.values());
  for (const guild of guilds) {
    try {
      await guild.commands.set(commands);
      console.log('[Slash] Guild 指令已註冊:', guild.id);
    } catch (e) {
      console.log(`[Slash] Guild(${guild.id}) 註冊失敗:`, e.message);
    }
  }
});

// ============== 啟動 ==============
if (require.main === module) {
  CLIENT.login(CONFIG.DISCORD_TOKEN).catch(err => {
    console.error('[Bot]', err.message);
  });
  console.log('[Renaiss World] 🌟 系統啟動中...');
}

module.exports = {
  canEnterLocation,
  buildLocationEntryBaselineEnemy,
  syncCurrentIslandStoryProgress,
  ensurePlayerIslandState
};
