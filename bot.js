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
  StringSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

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
const { startWorldBackupScheduler, runWorldBackup, getBackupDebugStatus } = require('./world-backup');
const {
  ISLAND_MAP_TEXT,
  buildIslandMapAnsi,
  MAP_LOCATIONS,
  getLocationProfile,
  getLocationStoryContext,
  getPortalDestinations
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
  }
};

function t(key) {
  return TEXT[CONFIG.LANGUAGE]?.[key] || TEXT['zh-TW'][key] || key;
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
    clearedNpcQuotes: 0
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
  return report;
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

async function rejectIfNotThreadOwner(interaction, userId) {
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
const SHOP_HAGGLE_OFFER_TTL_MS = 10 * 60 * 1000;
const SHOP_HAGGLE_BLOCKED_ITEMS = new Set(['乾糧一包', '水囊']);
const NPC_DIALOGUE_LOG_LIMIT = Math.max(20, Math.min(200, Number(process.env.NPC_DIALOGUE_LOG_LIMIT || 80)));
const STARTER_FIVE_PULL_COUNT = 5;
const GENERATION_HISTORY_LIMIT = Math.max(5, Math.min(100, Number(process.env.GENERATION_HISTORY_LIMIT || 20)));
const MAP_ENABLE_WIDE_ANSI = String(process.env.MAP_ENABLE_WIDE_ANSI || '0') === '1';
const MARKET_GUARANTEE_GAP_TURNS = Math.max(1, Math.min(8, Number(process.env.MARKET_GUARANTEE_GAP_TURNS || 3)));
const LOCATION_ARC_COMPLETE_TURNS = Math.max(3, Math.min(12, Number(process.env.LOCATION_ARC_COMPLETE_TURNS || 6)));
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
  if (String(choice.action || '') === 'fight' || String(choice.action || '') === 'mentor_spar') return true;
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
  if (String(choice.action || '') === 'fight') return true;
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
  return list.map((choice) => downgradeImmediateBattleChoice(choice));
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
  return `預估:${estimate.rank} ${estimate.winRate}%`;
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

function buildEventChoiceButtons(choices = []) {
  return choices.slice(0, CHOICE_DISPLAY_COUNT).map((choice, i) => {
    const label = (formatChoiceText(choice) || `選項${i + 1}`).substring(0, 20).trim();
    return new ButtonBuilder()
      .setCustomId(`event_${i}`)
      .setLabel(label || `${i + 1}`)
      .setStyle(ButtonStyle.Primary);
  });
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
      moves: '📜 招式',
      character: '👤 個人',
      profile: '💳 檔案',
      gacha: '🎰 抽獎',
      map: '🗺️ 地圖',
      quickShopReady: '🏪 鑑價站',
      quickShopCooldown: (remaining) => `🏪 鑑價站 ${remaining}T`
    },
    'zh-CN': {
      inventory: '🎒 背包',
      moves: '📜 招式',
      character: '👤 个人',
      profile: '💳 档案',
      gacha: '🎰 抽奖',
      map: '🗺️ 地图',
      quickShopReady: '🏪 鉴价站',
      quickShopCooldown: (remaining) => `🏪 鉴价站 ${remaining}T`
    },
    en: {
      inventory: '🎒 Bag',
      moves: '📜 Moves',
      character: '👤 Character',
      profile: '💳 Profile',
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
    new ButtonBuilder().setCustomId('open_profile').setLabel(labels.profile).setStyle(ButtonStyle.Secondary),
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
  const pool = Array.isArray(choices)
    ? choices
      .filter(Boolean)
      .slice(0, CHOICE_POOL_COUNT)
      .map((choice) => rewriteScratchChoiceToShop(choice, player))
    : [];
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
  if (!player.locationArcState || typeof player.locationArcState !== 'object') {
    player.locationArcState = {
      currentLocation: String(player.location || ''),
      turnsInLocation: 0,
      completedLocations: {},
      systemExposureByLocation: {}
    };
  }
  if (typeof player.locationArcState.completedLocations !== 'object' || Array.isArray(player.locationArcState.completedLocations)) {
    player.locationArcState.completedLocations = {};
  }
  if (typeof player.locationArcState.systemExposureByLocation !== 'object' || Array.isArray(player.locationArcState.systemExposureByLocation)) {
    player.locationArcState.systemExposureByLocation = {};
  }
  if (!Number.isFinite(Number(player.locationArcState.turnsInLocation))) {
    player.locationArcState.turnsInLocation = 0;
  }
  if (typeof player.locationArcState.currentLocation !== 'string') {
    player.locationArcState.currentLocation = String(player.location || '');
  }
  return player.locationArcState;
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
    return state;
  }

  if (state.currentLocation && Number(state.turnsInLocation || 0) >= LOCATION_ARC_COMPLETE_TURNS) {
    const prev = String(state.currentLocation);
    state.completedLocations[prev] = Number(state.completedLocations[prev] || 0) + 1;
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
    desc: '可開啟傳送門地圖並選擇下一個島嶼'
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
  if (list.some(isPortalChoice)) {
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

  if (!forcePortal && !shouldGuidePortal) return list;

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
  const masterPool = Array.isArray(EVENTS?.MASTERS) ? EVENTS.MASTERS : [];
  const chosenMaster = masterPool.length > 0
    ? masterPool[stableHashCode(seed) % masterPool.length]
    : null;
  const masterTeaches = Array.isArray(chosenMaster?.teaches) ? chosenMaster.teaches : [];
  if (masterTeaches.length > 0) return masterTeaches.slice(0, 3);

  const positiveMoves = Array.isArray(PET.POSITIVE_MOVES) ? PET.POSITIVE_MOVES : [];
  if (positiveMoves.length === 0) return ['堡壘力場', '電漿盛放', '再生矩陣'];
  const sorted = [...positiveMoves].sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
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
  const align = String(npc.align || '').trim().toLowerCase();
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
      power: Number(info?.stats?.戰力 || 0)
    });
  }

  return list.sort((a, b) => {
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
  list = applyStoryThreatGate(player, list);
  list = enforceMentorSparAvailability(player, list);
  list = ensurePortalChoiceAvailability(player, list);
  list = ensureWishPoolChoiceAvailability(player, list);
  list = ensureMarketChoiceAvailability(player, list);
  list = ensureEarlyGameIncomeChoice(player, list);
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

  const learnedMoves = [];
  const duplicateMoves = [];
  const failedMoves = [];

  for (const draw of drawResult.draws || []) {
    const move = draw?.move;
    if (!move?.id) continue;
    const learned = GACHA.learnDrawnMove(playerId, move);
    if (learned?.success) {
      learnedMoves.push({
        name: move.name,
        tier: draw?.tier || move.tier || 1,
        emoji: draw?.tierEmoji || (move.tier === 3 ? '🔮' : move.tier === 2 ? '💠' : '⚪')
      });
      continue;
    }
    if (/已經學過/.test(String(learned?.reason || ''))) {
      duplicateMoves.push(move.name);
    } else {
      failedMoves.push(`${move.name}（${learned?.reason || '學習失敗'}）`);
    }
  }

  const refreshed = CORE.loadPlayer(playerId);
  if (!refreshed) return { draws: drawResult.draws || [], learnedMoves, duplicateMoves, failedMoves };
  ensureStarterRewardState(refreshed);
  refreshed.starterRewards.fivePullClaimed = true;
  refreshed.starterRewards.claimedAt = Date.now();
  CORE.savePlayer(refreshed);

  return {
    draws: drawResult.draws || [],
    learnedMoves,
    duplicateMoves,
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

function ensurePlayerGenerationSchema(player) {
  if (!player || typeof player !== 'object') return false;
  let mutated = false;

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
  const normalizedRecentChoices = normalizeRecentChoiceHistory(player.recentChoiceHistory);
  if (JSON.stringify(player.recentChoiceHistory || []) !== JSON.stringify(normalizedRecentChoices)) {
    player.recentChoiceHistory = normalizedRecentChoices;
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
      tags: ['main_story', 'kings']
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
    ...(Array.isArray(PET.POSITIVE_MOVES) ? PET.POSITIVE_MOVES : []),
    ...(Array.isArray(PET.NEGATIVE_MOVES) ? PET.NEGATIVE_MOVES : []),
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
    const fallbackPool = (Array.isArray(PET.POSITIVE_MOVES) ? PET.POSITIVE_MOVES : [])
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
  player.battleState = null;
  player.eventChoices = [];
  CORE.savePlayer(player);
  return { mentorName };
}

function formatDurationShort(ms = 0) {
  const safe = Math.max(0, Number(ms) || 0);
  const totalMinutes = Math.ceil(safe / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小時`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}分`);
  return parts.join('');
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

function getActiveCombatant(player, pet) {
  const fighterType = getBattleFighterType(player, pet);
  if (fighterType === 'player') return buildHumanCombatant(player);
  const saved = player?.battleState?.petState || {};
  const hpFromState = Number(saved?.hp);
  const hpFromPet = Number(pet?.hp || 0);
  const resolvedHp = Number.isFinite(hpFromState) ? hpFromState : hpFromPet;
  return {
    ...pet,
    hp: Math.max(0, resolvedHp),
    isHuman: false,
    status: cloneStatusState(saved?.status)
  };
}

function getPlayerOwnedPets(ownerId) {
  const allPets = PET.loadAllPets();
  return Object.values(allPets).filter((p) => p?.ownerId === ownerId);
}

function getPetAttackMoves(pet) {
  return (pet?.moves || []).filter((m) => !(m?.effect && m.effect.flee));
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
  if (pet) {
    pet.hp = Math.max(0, combatant.hp);
    if (player.battleState) {
      player.battleState.petState = {
        hp: pet.hp,
        status: statusSnapshot
      };
    }
  }
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

function pickBestMoveForAI(player, pet, enemy, combatant = null, availableEnergy = Number.POSITIVE_INFINITY) {
  const activeCombatant = combatant || getActiveCombatant(player, pet);
  const candidateMoves = getCombatantMoves(activeCombatant, pet);
  if (candidateMoves.length === 0) return null;

  const affordableMoves = candidateMoves.filter((move) => BATTLE.getMoveEnergyCost(move) <= availableEnergy);
  if (affordableMoves.length === 0) return null;

  let best = affordableMoves[0];
  let bestScore = -1;
  for (const move of affordableMoves) {
    const cost = BATTLE.getMoveEnergyCost(move);
    const dmg = BATTLE.calculatePlayerMoveDamage(move, player, activeCombatant);
    const netDamage = Math.max(1, (dmg.total || 0) - (enemy?.defense || 0));
    const killBonus = (enemy?.hp || 0) <= netDamage ? 120 : 0;
    const efficiencyBonus = Math.max(0, 4 - cost) * 2;
    const score = netDamage + killBonus + efficiencyBonus;
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
      return true;
    }
  }
  return false;
}

function buildPortalUsageGuide(player) {
  const destinations = typeof getPortalDestinations === 'function'
    ? getPortalDestinations(player?.location || '')
    : [];
  const preview = destinations.length > 0 ? destinations.slice(0, 3).join('、') : '未知';
  return `🌀 **傳送門操作：** 先按「🗺️ 地圖」→ 再按「🌀 傳送門」→ 選目的地（如：${preview}）。`;
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
  if (!isRoamEligibleAction(player, event, result)) return null;
  const chance = getRoamMoveChance(event, result);
  if (Math.random() > chance) return null;

  const fromLocation = String(player.location || '');
  const targetLocation = pickRoamDestination(player);
  if (!targetLocation || targetLocation === fromLocation) return null;

  player.location = targetLocation;
  syncLocationArcLocation(player);
  player.portalMenuOpen = false;

  const moveLine = `🧭 你順著路線離開 **${fromLocation}**，一路推進到 **${targetLocation}**。`;
  result.message = `${String(result.message || '').trim()}\n\n${moveLine}`.trim();
  result.autoTravel = { fromLocation, targetLocation, reason: 'wander' };

  if (typeof queueMemory === 'function') {
    queueMemory({
      type: '移動',
      content: `從${fromLocation}一路探索到${targetLocation}`,
      outcome: '自然移動（晃圖）',
      importance: 2,
      tags: ['travel', 'wander']
    });
  }

  return result.autoTravel;
}

function appendUniqueItem(arr, item, limit = 120) {
  if (!Array.isArray(arr) || !item) return;
  arr.unshift(item);
  if (arr.length > limit) arr.length = limit;
}

function maybeGenerateTradeGoodFromChoice(event, player, result, selectedChoice) {
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

  if (action === 'forage' || herbHint) {
    if (Math.random() < (action === 'forage' ? 0.92 : 0.68)) {
      return ECON.createForageLoot(location, luck);
    }
  }
  if (action === 'hunt' || huntHint) {
    if (Math.random() < (action === 'hunt' ? 0.9 : 0.66)) {
      const animalName = result?.item || event?.animal?.name || '獵物';
      return ECON.createHuntLoot(animalName, location, luck);
    }
  }
  if (action === 'treasure' || treasureHint) {
    if (Math.random() < (action === 'treasure' ? 0.78 : 0.45)) {
      return ECON.createTreasureLoot(location, luck);
    }
  }
  if (action === 'explore' && Math.random() < 0.18) {
    return Math.random() < 0.7
      ? ECON.createForageLoot(location, luck)
      : ECON.createTreasureLoot(location, luck);
  }
  return null;
}

function buildMapComponents(page, currentLocation, canOpenPortal = false, mapViewMode = 'text') {
  const maxPage = Math.max(0, Math.ceil(MAP_LOCATIONS.length / MAP_PAGE_SIZE) - 1);
  const safePage = Math.max(0, Math.min(page, maxPage));
  const start = safePage * MAP_PAGE_SIZE;
  const pageLocations = MAP_LOCATIONS.slice(start, start + MAP_PAGE_SIZE);
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
        .setLabel('⬅️ 上一頁')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`map_page_${safePage + 1}`)
        .setLabel('下一頁 ➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= maxPage),
      new ButtonBuilder().setCustomId('map_back_main').setLabel('📖 返回故事').setStyle(ButtonStyle.Success)
  ];
  if (canOpenPortal) {
    navButtons.splice(2, 0, new ButtonBuilder()
      .setCustomId('map_open_portal')
      .setLabel('🌀 傳送門')
      .setStyle(ButtonStyle.Primary));
  }
  rows.push(new ActionRowBuilder().addComponents(navButtons));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`map_view_text_${safePage}`)
      .setLabel('📄 文字版')
      .setStyle(safeMapViewMode === 'text' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(safeMapViewMode === 'text'),
    new ButtonBuilder()
      .setCustomId(`map_view_ascii_${safePage}`)
      .setLabel('🧩 ASCII版')
      .setStyle(safeMapViewMode === 'ascii' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(safeMapViewMode === 'ascii')
  ));

  return { rows, safePage, maxPage, pageLocations };
}

async function showIslandMap(interaction, user, page = 0, notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: '❌ 找不到角色資料，請先 /start', ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: '❌ 找不到角色資料，請先 /start', ephemeral: true }).catch(() => {});
    }
    return;
  }

  const nearbyPortals = typeof getPortalDestinations === 'function'
    ? getPortalDestinations(player.location || '')
    : [];
  const canOpenPortal = Boolean(player.portalMenuOpen && nearbyPortals.length > 0);
  const mapViewMode = getPlayerMapViewMode(player);
  const { rows, safePage, maxPage, pageLocations } = buildMapComponents(page, player.location, canOpenPortal, mapViewMode);
  const useWideAnsiMap = mapViewMode === 'ascii';
  const renderedMap = useWideAnsiMap
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
    const region = profile?.region || '未知區域';
    const difficulty = Number(profile?.difficulty || 3);
    const marker = loc === player.location ? '◉' : '•';
    if (!useWideAnsiMap) {
      return `${marker} ${loc}（${region}｜D${difficulty}）`;
    }
    const nearby = Array.isArray(profile?.nearby) && profile.nearby.length > 0
      ? profile.nearby.slice(0, 2).join('、')
      : '未知';
    return `${marker} ${loc}（${region}｜D${difficulty}）附近：${nearby}`;
  }).join('\n');
  const compactMap = useWideAnsiMap
    ? ''
    : `**本頁地圖（手機友善）**\n${pageSummary || '（本頁無地點）'}`;
  const mapBlock = useWideAnsiMap
    ? ('```ansi\n' + renderedMap + '\n```')
    : compactMap;
  const mapDesc =
    mapBlock +
    `\n**目前位置：** ◉${player.location || '未知'}◉（地圖中已高亮）` +
    `\n**地圖顯示：** ${useWideAnsiMap ? 'ASCII 版' : '文字版'}` +
    `\n**區域難度：** ${currentProfile ? `D${currentProfile.difficulty}` : '未知'}` +
    (locationContext ? `\n**當前地區情報：** ${locationContext}` : '') +
    `\n**地圖頁數：** ${safePage + 1}/${maxPage + 1}` +
    (useWideAnsiMap && pageSummary ? `\n\n**本頁地區情報**\n${pageSummary}` : '') +
    (canOpenPortal ? `\n\n${buildPortalUsageGuide(player)}` : '') +
    '\n_地圖僅供查看，移動請透過劇情中的「傳送門」選項。_' +
    (notice ? `\n${notice}` : '');

  const embed = new EmbedBuilder()
    .setTitle('🗺️ Renaiss 群島海圖')
    .setColor(0x4da6ff)
    .setDescription(mapDesc);

  if (interaction.isButton && interaction.isButton()) {
    await interaction.update({ embeds: [embed], components: rows }).catch(() => {});
    if (interaction.message?.id) {
      trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
    }
    return;
  }

  if (interaction.deferred || interaction.replied) {
    const msg = await interaction.followUp({ embeds: [embed], components: rows }).catch(() => null);
    if (msg) trackActiveGameMessage(player, interaction.channel?.id, msg.id);
  } else {
    const msg = await interaction.reply({ embeds: [embed], components: rows }).catch(() => null);
    if (msg) trackActiveGameMessage(player, interaction.channel?.id, msg.id);
  }
}

async function showPortalSelection(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.reply({ content: '❌ 找不到角色資料，請先 /start', ephemeral: true }).catch(() => {});
    return;
  }

  const destinations = typeof getPortalDestinations === 'function'
    ? getPortalDestinations(player.location || '')
    : [];
  if (!player.portalMenuOpen || destinations.length === 0) {
    await interaction.reply({
      content: '⚠️ 你目前尚未啟用傳送門。請先在故事選項中選擇「前往附近傳送門」。',
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
      new ButtonBuilder().setCustomId('map_page_0').setLabel('🗺️ 返回地圖').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('map_back_main').setLabel('📖 返回故事').setStyle(ButtonStyle.Success)
    )
  );

  const embed = new EmbedBuilder()
    .setTitle('🌀 傳送門目的地')
    .setColor(0x7b68ee)
    .setDescription(
      `你已啟動 ${player.location} 附近的傳送門網路。\n` +
      `請點選要傳送到的目的地：\n\n` +
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
      welcomeDesc: '在這個世界，你需要：\n• 選擇你的陣營（信標聯盟/灰域協定）\n• 培養你的夥伴\n• 探索區域事件、戰鬥與任務',
      choosePathHint: '請選擇你的流派：',
      positive: '信標聯盟',
      positiveDesc: '重視秩序、透明與區域穩定\n特色：防護、修復、控場',
      negative: '灰域協定',
      negativeDesc: '偏向高風險高回報的策略路線\n特色：干擾、侵蝕、爆發'
    },
    'zh-CN': {
      welcome: '欢迎来到 Renaiss 星球！',
      welcomeDesc: '在这个世界，你需要：\n• 选择你的阵营（信标联盟/灰域协定）\n• 培养你的伙伴\n• 探索区域事件、战斗与任务',
      choosePathHint: '请选择你的流派：',
      positive: '信标联盟',
      positiveDesc: '重视秩序、透明与区域稳定\n特色：防护、修复、控场',
      negative: '灰域协定',
      negativeDesc: '偏向高风险高回报的策略路线\n特色：干扰、侵蚀、爆发'
    },
    'en': {
      welcome: 'Welcome to Renaiss Planet!',
      welcomeDesc: 'In this world, you need to:\n• Choose your faction (Beacon Union / Gray Accord)\n• Raise your partner\n• Explore regional events, battle, and complete quests',
      choosePathHint: 'Please choose your style:',
      positive: 'Beacon Union',
      positiveDesc: 'Order-first route focused on stability and trust\nSpecialty: shields, sustain, control',
      negative: 'Gray Accord',
      negativeDesc: 'High-risk route focused on disruption and burst\nSpecialty: sabotage, pressure, payoff'
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
      'Renaiss 的前線核心由 Winchman、Tom、Harry、Kathy、Yuzu、Leslie 協同維持，重點是守住航道與民生據點。',
      '這是開放世界，沒有固定主線按鈕；章節、流言、戰況與角色命運都由你的選擇被動推進。',
      '世界會記住你做過的事，並把後果擴散成所有玩家可見的長期傳聞。'
    ].join('\n'),
    'zh-CN': [
      '你身在 Renaiss 海域。这片星域长期由 Renaiss 维运，是航道、交易与居住秩序的核心。',
      '但在明面秩序之外，另一股势力正与既有体系长期角力，双方在各区节点持续拉锯。',
      '主角群由你与伙伴宠物展开；你每一次探索、交易、战斗、撤退，都会改写下一段剧情。',
      'Renaiss 前线核心由 Winchman、Tom、Harry、Kathy、Yuzu、Leslie 协同维持，重点是守住航道与民生据点。',
      '这是开放世界，没有固定主线按钮；章节、流言、战况与角色命运都由你的选择被动推进。',
      '世界会记住你做过的事，并把后果扩散成所有玩家可见的长期传闻。'
    ].join('\n'),
    'en': [
      'You are in the Renaiss Sea, a star region long maintained by Renaiss as the backbone of routes, trade, and civil order.',
      'Beyond the visible order, a rival force keeps contesting that system across multiple regional nodes.',
      'The protagonists are you and your partner creature; each exploration, trade, battle, or retreat rewrites your next chapter.',
      'Renaiss frontline operations are coordinated by Winchman, Tom, Harry, Kathy, Yuzu, and Leslie to keep routes and civilian hubs stable.',
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
      `- NPC 引言記憶刪除：${report.clearedNpcQuotes} 筆`,
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
  const pet = PET.loadPet(user.id);

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
      content: `👋 <@${user.id}> 你回來了！繼續你的冒險吧！` 
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
  const pet = PET.loadPet(user.id);
  
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
  
  if (!pet) {
    await interaction.reply({ content: '❌ 你還沒有寵物！', ephemeral: true });
    return;
  }
  
  const dmgInfo = pet.moves.map((m, i) => {
    const d = BATTLE.calculatePlayerMoveDamage(m, {}, pet);
    return `${i+1}. **${m.name}** (${m.element}): ${d.total}dmg`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle(`🐾 ${pet.name || '寵物'}`)
    .setColor(pet.type === '正派' ? 0x00ff00 : 0xff0000)
    .setDescription(pet.appearance)
    .addFields(
      { name: t('hp'), value: `${pet.hp}/${pet.maxHp}`, inline: true },
      { name: t('atk'), value: String(pet.attack), inline: true },
      { name: t('def'), value: String(pet.defense), inline: true },
      { name: '📊 等級', value: String(pet.level), inline: true },
      { name: '🏷️ 類型', value: pet.type, inline: true }
    )
    .addFields({ name: '📜 招式', value: dmgInfo, inline: false });
  
  if (player) {
    embed.addFields(
      { name: t('hp'), value: `${player.stats.生命}/${player.maxStats.生命}`, inline: true },
      { name: t('gold'), value: String(player.stats.財富), inline: true },
      { name: '📍 位置', value: player.location, inline: true }
    );
  }
  
  await interaction.reply({ embeds: [embed] });
}

// ============== 按鈕互動 ==============
CLIENT.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return;
  
  const { customId, user } = interaction;

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

  // 全域防重複點擊：按到按鈕就先把該訊息按鈕鎖住
  if (interaction.isButton()) {
    const isMapFlowButton =
      customId === 'open_map' ||
      customId === 'map_back_main' ||
      customId === 'map_open_portal' ||
      customId.startsWith('map_page_') ||
      customId.startsWith('map_view_') ||
      customId.startsWith('map_loc_') ||
      customId.startsWith('portal_jump_') ||
      customId.startsWith('map_goto_');
    // 這些按鈕會先開 modal；若使用者按右上角 X 取消，不應把原按鈕整排清空
    const isModalLauncherButton =
      customId === 'open_wallet_modal' ||
      customId === 'open_profile';
    if (!isMapFlowButton && !isModalLauncherButton) {
      await lockPressedButtonImmediately(interaction);
    }
  }

  // ===== 招式配置下拉 =====
  if (interaction.isStringSelectMenu()) {
    if (customId === 'moves_pet_select') {
      const petId = String(interaction.values?.[0] || '');
      await showMovesList(interaction, user, petId);
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
      await showWorldShopHaggleOffer(interaction, user, marketType, spec);
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
  
  // ===== 錢包綁定 Modal =====
  if (customId === 'wallet_bind_modal') {
    await handleWalletBind(interaction, user);
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
  
  // ===== 名字輸入 Modal =====
  if (customId.startsWith('name_submit_')) {
    const alignment = normalizePlayerAlignment(customId.replace('name_submit_', ''));
    const charName = interaction.fields.getTextInputValue('player_name').trim();
    const finalName = charName || user.username;
    await createCharacterWithName(interaction, user, alignment, finalName);
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
  
  // ===== 選擇正派/機變派 =====
  if (customId === 'choose_positive' || customId === 'choose_negative') {
    await handleChooseAlignment(interaction, user, customId);
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
        player.eventChoices = [];
        rememberPlayer(player, {
          type: '戰鬥',
          content: `從 ${enemyName} 戰線撤離`,
          outcome: '回到冒險流程',
          importance: 2,
          tags: ['battle', 'retreat']
        });
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
    
    // 發送陣營選擇（使用選定語言）
    const langText = getLanguageText(lang);
    const embed = new EmbedBuilder()
      .setTitle(`🌟 ${langText.welcome}`)
      .setColor(0x00ff00)
      .setDescription(`${langText.welcomeDesc}\n\n${langText.choosePathHint}`)
      .addFields(
        { name: langText.positive, value: langText.positiveDesc, inline: true },
        { name: langText.negative, value: langText.negativeDesc, inline: true }
      );
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('choose_positive').setLabel('☀️ ' + langText.positive).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('choose_negative').setLabel('🌙 ' + langText.negative).setStyle(ButtonStyle.Danger)
    );
    
    await interaction.channel.send({ embeds: [embed], components: [row] });
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
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (player && pet && interaction.channel?.isThread()) {
      // Restore the game message by calling sendMainMenuToThread
      await sendMainMenuToThread(interaction.channel, player, pet, interaction);
    } else {
      await interaction.update({ content: '請在遊戲討論串中使用', components: [] });
    }
    return;
  }
  
  // ===== 角色資訊 =====
  if (customId === 'open_character') {
    await showCharacter(interaction, user);
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
    if (player) {
      player.mapViewMode = mode;
      CORE.savePlayer(player);
    }
    await showIslandMap(
      interaction,
      user,
      safePage,
      `✅ 已切換為 ${mode === 'ascii' ? 'ASCII 地圖' : '文字地圖'}`
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

  if (customId.startsWith('portal_jump_')) {
    const idx = parseInt(customId.replace('portal_jump_', ''), 10);
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色資料，請先 /start', ephemeral: true }).catch(() => {});
      return;
    }

    const destinations = typeof getPortalDestinations === 'function'
      ? getPortalDestinations(player.location || '')
      : [];
    const targetLocation = destinations[Number.isNaN(idx) ? -1 : idx];
    if (!targetLocation) {
      await interaction.reply({ content: '⚠️ 無效的傳送目的地。', ephemeral: true }).catch(() => {});
      return;
    }

    const fromLocation = player.location;
    player.location = targetLocation;
    syncLocationArcLocation(player);
    player.portalMenuOpen = false;
    player.currentStory =
      `🌀 傳送門正在開啟，空間折疊完成。\n你已由 **${fromLocation}** 抵達 **${targetLocation}**。`;
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
      .setTitle('✅ 傳送完成')
      .setColor(0x7b68ee)
      .setDescription(
        `你已由 **${fromLocation}** 傳送至 **${targetLocation}**。\n\n` +
        '接下來按「📖 返回故事」，系統會以新地點生成新的故事與選項。'
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('map_back_main').setLabel('📖 返回故事').setStyle(ButtonStyle.Success)
    );
    await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
    return;
  }

  if (customId.startsWith('map_goto_')) {
    await interaction.reply({
      content: '🗺️ 地圖按鈕僅供查看，移動請透過劇情中的「前往傳送門」選項。',
      ephemeral: true
    }).catch(() => {});
    return;
  }

  if (customId === 'map_back_main') {
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (!player || !pet || !interaction.channel?.isThread()) {
      await interaction.reply({ content: '⚠️ 請回到遊戲討論串使用。', ephemeral: true }).catch(() => {});
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
    const idx = parseInt(customId.split('_')[1]);
    await handleEvent(interaction, user, idx);
    return;
  }

  if (customId === 'battle_mode_manual') {
    await startManualBattle(interaction, user);
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

  if (customId === 'battle_wait') {
    await handleBattleWait(interaction, user);
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
  
  // ===== 顯示行囊 =====
  if (customId === 'show_inventory') {
    await showInventory(interaction, user);
    return;
  }

  if (customId === 'show_finance_ledger') {
    await showFinanceLedger(interaction, user);
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
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await showPlayerMarketListings(interaction, user, marketType);
    return;
  }

  if (customId.startsWith('pmkt_my_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await showMyMarketListings(interaction, user, marketType);
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
    await showWorldShopHaggleAllOffer(interaction, user, marketType);
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

    if (String(pending.scope || '') === 'all' || String(pending.spec?.kind || '') === 'all') {
      const worldDay = Number(CORE.getWorld()?.day || 1);
      const sellResult = await ECON.sellPlayerAtMarket(player, marketType, { worldDay }).catch((err) => ({ error: err?.message || String(err) }));
      if (!sellResult || sellResult.error || Number(sellResult.soldCount || 0) <= 0) {
        player.shopSession.pendingHaggleOffer = null;
        CORE.savePlayer(player);
        await showWorldShopHagglePicker(interaction, user, marketType, `全部議價失敗：${sellResult?.error || '目前沒有可售商品'}`);
        return;
      }
      const rawTotal = Math.max(0, Number(sellResult.totalGold || 0));
      quoted = Math.max(0, Math.floor(rawTotal * 0.7));
      const discountLoss = Math.max(0, rawTotal - quoted);
      if (discountLoss > 0) {
        player.stats.財富 = Math.max(0, Number(player?.stats?.財富 || 0) - discountLoss);
      }
      soldCount = Math.max(1, Number(sellResult.soldCount || 1));
      soldLabel = `全部商品（${soldCount} 件）`;
      if (quoted > 0) {
        recordCashflow(player, {
          amount: quoted,
          category: marketType === 'digital' ? 'market_digital_sell' : 'market_renaiss_sell',
          source: `${getMarketTypeLabel(marketType)} 商店議價全部賣出（七折）`,
          marketType
        });
      }
      if (discountLoss > 0) {
        recordCashflow(player, {
          amount: -discountLoss,
          category: 'shop_haggle_bulk_discount',
          source: `${getMarketTypeLabel(marketType)} 全賣七折折讓`,
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

  if (customId.startsWith('shop_buy_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await showWorldShopBuyPanel(interaction, user, marketType);
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
    if (!WALLET.isWalletBound(user.id)) {
      await showWalletBindModal(interaction);
      return;
    }
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
  
  // ===== 學習招式 =====
  if (customId.startsWith('learn_move_')) {
    const idx = parseInt(customId.split('_')[2]);
    await handleLearnMove(interaction, user, idx);
    return;
  }
  
  // ===== 分配 HP =====
  if (customId.startsWith('alloc_hp_')) {
    const petId = customId.replace('alloc_hp_', '');
    await handleAllocateHP(interaction, user, petId);
    return;
  }
  
  // ===== Modal 提交（名字）=====
  if (customId.startsWith('name_modal_')) {
    await handleNameSubmit(interaction, user);
    return;
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

  WALLET.updatePendingRNS(discordUserId, assets.rns);
  WALLET.updateWalletData(discordUserId, {
    cardFMV: assets.assets.cardFMV,
    cardCount: assets.assets.cardCount,
    packTxCount: assets.assets.packTxCount,
    packSpentUSDT: assets.assets.packSpentUSDT
  });

  const player = CORE.loadPlayer(discordUserId);
  if (player) {
    player.stats.財富 = assets.rns;
    CORE.savePlayer(player);
  }

  return assets;
}

async function handleWalletBind(interaction, user) {
  const walletAddress = interaction.fields.getTextInputValue('wallet_address').trim();
  
  const result = WALLET.bindWallet(user.id, walletAddress);
  
  if (!result.success) {
    await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
    return;
  }

  try {
    const assets = await syncWalletAndApplyNow(user.id);
    const maxPets = WALLET.getMaxPetsByFMV(assets.assets.cardFMV);
    const hasPlayer = Boolean(CORE.loadPlayer(user.id));
    const cardInfo = assets.assets.cardCount > 0
      ? `📦 卡片 FMV: $${assets.assets.cardFMV.toFixed(2)} USD (${assets.assets.cardCount} 張)\n`
      : '📦 卡片 FMV: $0.00 USD (0 張)\n';

    const embed = new EmbedBuilder()
      .setTitle('✅ 錢包綁定完成，資產已即時入帳')
      .setColor(0x00ff00)
      .setDescription(
        `錢包地址：\`${result.address}\`\n\n` +
        `${cardInfo}` +
        `📊 開包數量: ${assets.assets.packTxCount} 次\n` +
        `🎁 目前 Rns 代幣: ${assets.rns}\n` +
        `🐾 可擁有寵物: ${maxPets} 隻\n\n` +
        (hasPlayer ? '你可以直接回到主選單繼續冒險。' : '你可以繼續完成新手流程。')
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
  } catch (e) {
    console.error(`[錢包] 綁定後同步失敗: ${e.message}`);
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚠️ 錢包已綁定，但同步失敗')
          .setColor(0xffa500)
          .setDescription(`錢包地址：\`${result.address}\`\n\n錯誤：${e.message}\n請稍後再試，或聯絡管理員。`)
      ],
      components: []
    });
  }
}

async function handleWalletSyncNow(interaction, user) {
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
        `🎁 目前 Rns 代幣: ${assets.rns}\n` +
        `🐾 可擁有寵物: ${maxPets} 隻`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('settings_back').setLabel('🔙 返回').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 回到冒險').setStyle(ButtonStyle.Success)
    );

    await interaction.update({ embeds: [embed], components: [row] });
  } catch (e) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚠️ 同步失敗')
          .setColor(0xffa500)
          .setDescription(`錯誤：${e.message}\n請稍後再試。`)
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('settings_back').setLabel('🔙 返回').setStyle(ButtonStyle.Secondary)
        )
      ]
    });
  }
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
    // 綁定時已即時同步，這裡直接讀 pendingRNS（避免重抓造成等待）
    const initialRns = WALLET.getPendingRNS(user.id);
    
    const embed = new EmbedBuilder()
      .setTitle(`🌟 歡迎來到 Renaiss 星球！`)
      .setColor(0x00ff00)
      .setDescription(`**${user.username}**，你的初始資產已確認！\n\n💰 **初始 Rns 代幣：${initialRns}**\n\n在這個世界，你需要：\n• 選擇你的流派（正派/機變派）\n• 培養你的寵物\n• 探索世界、戰鬥、任務\n\n**請選擇你的流派：**`)
      .addFields(
        { name: '☀️ 正派', value: '光明正面，守秩序與公信\n招式：治療、護盾、正義之擊', inline: true },
        { name: '🌙 機變派', value: '同屬正義，但更擅策略與博弈\n風格：灰階手段，不主動作惡', inline: true }
      );
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('choose_positive').setLabel('☀️ 選擇正派').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('choose_negative').setLabel('🌙 選擇機變派').setStyle(ButtonStyle.Danger)
    );
    
    // 發送到當前 thread
    await threadChannel.send({ 
      embeds: [embed], 
      components: [row] 
    });
  } catch (err) {
    console.error('[錯誤] 創建角色失敗:', err.message);
  }
});

// ============== 選擇陣營 ==============
async function handleChooseAlignment(interaction, user, customId) {
  const alignment = customId === 'choose_positive' ? '正派' : '機變派';

  // 已建立角色時，不允許重複選陣營，直接導回目前進度
  const resumed = await resumeExistingOnboardingOrGame(interaction, user);
  if (resumed) {
    await interaction.message?.edit({ components: [] }).catch(() => {});
    return;
  }

  // 先鎖住當前陣營按鈕，確保只能點一次
  await interaction.message?.edit({ components: [] }).catch(() => {});
  
  // 顯示名字輸入 Modal
  const modal = new ModalBuilder()
    .setCustomId(`name_submit_${alignment}`)
    .setTitle('📛 為你的角色取個名字');
  
  const nameInput = new TextInputBuilder()
    .setCustomId('player_name')
    .setLabel('角色名字')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('輸入你在Renaiss星球的名字')
    .setRequired(true)
    .setMaxLength(20);
  
  const row = new ActionRowBuilder().addComponents(nameInput);
  modal.addComponents(row);
  
  await interaction.showModal(modal).catch(async () => {
    // 如果 Modal 失敗，直接用 DC 名稱
    await interaction.deferUpdate().catch(() => {});
    await createCharacterWithName(interaction, user, alignment, user.username);
  });
}

// 創建角色（名字輸入後調用）
async function createCharacterWithName(interaction, user, alignment, charName) {
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
  
  const player = CORE.createPlayer(user.id, charName, '男', '無門無派');
  const spawnProfile = getLocationProfile(player.location);
  player.alignment = normalizePlayerAlignment(alignment);
  player.wanted = 0;
  player.stats.財富 = pendingRNS; // 使用暫時 RNS（0 或上次保存的值）
  ECON.ensurePlayerEconomy(player);
  
  // 取得選擇的語言
  const selectedLang = getPlayerTempData(user.id, 'language') || 'zh-TW';
  player.language = selectedLang;
  player.currentStory = '';
  player.eventChoices = [];
  CORE.savePlayer(player);
  
  // 清除臨時資料
  clearPlayerTempData(user.id);
  
  const egg = PET.createPetEgg(user.id, player.alignment);
  PET.savePet(egg);
  
  const embed = new EmbedBuilder()
    .setTitle(`🎉 歡迎 ${formatAlignmentLabel(player.alignment)}！`)
    .setColor(getAlignmentColor(player.alignment))
    .setDescription(`**${player.name}**，你的Renaiss星球之旅開始了！\n\n🥚 寵物蛋已獲得！\n\n🔨 敲開寵物蛋，看看你的天賦！`)
    .addFields(
      { name: '📍 位置', value: player.location, inline: true },
      { name: '🎚️ 出生難度', value: spawnProfile ? `D${spawnProfile.difficulty}` : 'D1', inline: true },
      { name: t('hp'), value: `${player.stats.生命}/${player.maxStats.生命}`, inline: true },
      { name: t('gold'), value: String(player.stats.財富), inline: true }
    );
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hatch_egg').setLabel('🔨 敲開寵物蛋！').setStyle(ButtonStyle.Primary)
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
  const allMoves = egg.type === '正派' ? PET.POSITIVE_MOVES : PET.NEGATIVE_MOVES;
  const shuffled = allMoves.sort(() => Math.random() - 0.5);
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
      type: egg.type === '正派' ? 'positive' : 'negative',
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
  
  if (!pet || !pet.waitingForName) {
    await interaction.reply({ content: '❌ 錯誤！', components: [] });
    return;
  }
  
  let name = interaction.fields.getTextInputValue('pet_name').trim();
  
  // 如果名字太長或太短，隨機給一個
  if (!name || name.length < 1 || name.length > 6) {
    name = pet.type === '正派' 
      ? ['小白', '小青', '阿拓', '靈兒', '阿正'][Math.floor(Math.random() * 5)]
      : ['小黑', '邪仔', '夜影', '惡獸', '阿修'][Math.floor(Math.random() * 5)];
  }
  
  pet.name = name;
  pet.waitingForName = false;
  PET.savePet(pet);
  const starterPack = grantStarterFivePullIfNeeded(user.id);
  
  const dmgInfo = pet.moves.map(m => {
    const d = BATTLE.calculatePlayerMoveDamage(m, {}, pet);
    return `• ${m.name} (${m.element}): ${d.total}dmg`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle(`🐾 ${pet.name} 命名成功！`)
    .setColor(pet.type === '正派' ? 0x00ff00 : 0xff0000)
    .setDescription(pet.appearance)
    .addFields(
      { name: '🐾 名字', value: pet.name, inline: true },
      { name: '🏷️ 類型', value: pet.type, inline: true },
      { name: t('hp'), value: `${pet.hp}/${pet.maxHp}`, inline: true },
      { name: t('atk'), value: String(pet.attack), inline: true },
      { name: t('def'), value: String(pet.defense), inline: true },
      { name: '⚡ 速度', value: String(pet.speed), inline: true }
    )
    .addFields({ name: '📜 招式', value: dmgInfo, inline: false });

  if (starterPack) {
    const learnedLine = starterPack.learnedMoves.length > 0
      ? starterPack.learnedMoves
        .slice(0, 5)
        .map(m => `${m.emoji} ${m.name}`)
        .join('、')
      : '本次抽到的招式已重複或欄位已滿，沒有新增。';
    embed.addFields({
      name: '🎁 開局贈禮：免費五連抽',
      value: `已自動發放並嘗試學習。\n本次新增：${starterPack.learnedMoves.length} 招\n${learnedLine}`,
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
  
  if (!pet || !pet.waitingForName) return;
  
  const name = pet.type === '正派' 
    ? ['小白', '小青', '阿拓', '靈兒', '阿正'][Math.floor(Math.random() * 5)]
    : ['小黑', '邪仔', '夜影', '惡獸', '阿修'][Math.floor(Math.random() * 5)];
  
  pet.name = name;
  pet.waitingForName = false;
  PET.savePet(pet);
  const starterPack = grantStarterFivePullIfNeeded(userId);
  
  const dmgInfo = pet.moves.map(m => {
    const d = BATTLE.calculatePlayerMoveDamage(m, {}, pet);
    return `• ${m.name} (${m.element}): ${d.total}dmg`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle(`🐾 寵物命名：${pet.name}`)
    .setColor(pet.type === '正派' ? 0x00ff00 : 0xff0000)
    .setDescription(pet.appearance)
    .addFields(
      { name: '🐾 名字', value: pet.name, inline: true },
      { name: '🏷️ 類型', value: pet.type, inline: true },
      { name: t('hp'), value: `${pet.hp}/${pet.maxHp}`, inline: true },
      { name: '⚔️ 攻擊', value: String(pet.attack), inline: true },
      { name: '🛡️ 防禦', value: String(pet.defense), inline: true }
    )
    .addFields({ name: '📜 招式', value: dmgInfo, inline: false });

  if (starterPack) {
    const learnedLine = starterPack.learnedMoves.length > 0
      ? starterPack.learnedMoves
        .slice(0, 5)
        .map(m => `${m.emoji} ${m.name}`)
        .join('、')
      : '本次抽到的招式已重複或欄位已滿，沒有新增。';
    embed.addFields({
      name: '🎁 開局贈禮：免費五連抽',
      value: `已自動發放並嘗試學習。\n本次新增：${starterPack.learnedMoves.length} 招\n${learnedLine}`,
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

  let stateMutated = ensurePlayerGenerationSchema(player);
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

  // 如果沒有暂存的事件選項，才生成新的（防止刷選項）
  // ============================================================
  //  continuity 維護：有 story+choices 就直接顯示，不重新生成
  // ============================================================
  if (player.currentStory && player.eventChoices && player.eventChoices.length > 0) {
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
    
    player.stats.飽腹度 = player.stats.飽腹度 || 100;
    const statusBar = `氣血 ${pet.hp}/${pet.maxHp} | 能量 ${player.stats.能量 || 10}/${player.maxStats.能量 || 10} | 飽腹度 ${player.stats.飽腹度} | Rns 代幣 ${player.stats.財富} | ${player.location}`;
    
    const optionsText = buildChoiceOptionsText(choices, { player, pet });
    
    const description = `${financeNoticeBlock}${worldIntroBlock}**狀態：【${statusBar}】**\n\n${storyText}${portalGuideBlock}\n\n**🆕 選項：**${optionsText}\n\n_請選擇編號（1-${CHOICE_DISPLAY_COUNT}）_`;
    
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${player.name} - ${pet.name}`)
      .setColor(getAlignmentColor(player.alignment))
      .setDescription(description)
      .addFields(
        { name: '🐾 寵物', value: `${pet.name} (${pet.type})`, inline: true },
        { name: '⚔️ 氣血', value: `${pet.hp}/${pet.maxHp}`, inline: true },
        { name: '💰 Rns 代幣', value: String(player.stats.財富), inline: true }
      )
      .addFields(
        { name: '📍 位置', value: player.location, inline: true },
        { name: '🌟 幸運', value: String(player.stats.運氣), inline: true },
        { name: '📊 等級', value: String(player.level), inline: true }
      );
    
    const buttons = buildEventChoiceButtons(choices);
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

  const hasRecoverableStoryOnly =
    String(player.currentStory || '').trim().length > 0 &&
    (!Array.isArray(player.eventChoices) || player.eventChoices.length === 0);
  startGenerationState(player, {
    source: hasRecoverableStoryOnly ? 'main_menu_recover_choices' : 'main_menu',
    phase: 'loading',
    sourceChoice: hasRecoverableStoryOnly ? '補齊上次中斷選項' : '主選單生成',
    storySnapshot: hasRecoverableStoryOnly ? player.currentStory : '',
    choicesSnapshot: []
  });
  CORE.savePlayer(player);
  
  // ===== 狀態列 =====
  player.stats.飽腹度 = player.stats.飽腹度 || 100;
  const statusBar = `氣血 ${pet.hp}/${pet.maxHp} | 能量 ${player.stats.能量 || 10}/${player.maxStats.能量 || 10} | 飽腹度 ${player.stats.飽腹度} | Rns 代幣 ${player.stats.財富} | ${player.location}`;

  // 先用 Loading 訊息回覆（先故事、後選項）
  const loadingHint = hasRecoverableStoryOnly
    ? 'AI 說書人正在補齊上次中斷的選項...'
    : 'AI 說書人正在構思故事...';
  const loadingDesc = `${financeNoticeBlock}${worldIntroBlock}**狀態：【${statusBar}】**\n\n⏳ *${loadingHint}*${portalGuideBlock}`;
  
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
      let storyText = hasRecoverableStoryOnly ? String(player.currentStory || '').trim() : '';
      if (!hasRecoverableStoryOnly) {
        updateGenerationState(player, { phase: 'generating_story' });
        CORE.savePlayer(player);
        storyText = await STORY.generateStory(null, player, pet, null, memoryContext);
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
        player.eventChoices = [];
        updateGenerationState(player, {
          phase: 'story_ready',
          storySnapshot: storyText,
          choicesSnapshot: []
        });
        CORE.savePlayer(player);
      }

      const storyFirstDesc =
        `${financeNoticeBlock}${worldIntroBlock}**狀態：【${statusBar}】**\n\n${storyText}${portalGuideBlock}\n\n` +
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

      const newButtons = buildEventChoiceButtons(normalizedNewChoices);
      appendMainMenuUtilityButtons(newButtons, player);

      const newComponents = [];
      for (let i = 0; i < newButtons.length; i += 5) {
        newComponents.push(new ActionRowBuilder().addComponents(newButtons.slice(i, i + 5)));
      }

      const aiDesc = `${financeNoticeBlock}${worldIntroBlock}**狀態：【${statusBar}】**\n\n${storyText}${portalGuideBlock}\n\n**🆕 新選項：**${newOptionsText}\n\n_請選擇編號（1-${CHOICE_DISPLAY_COUNT}）_`;

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

// ============== 設置選單 ==============
async function showSettings(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const currentLang = player?.language || 'zh-TW';
  const introFull = getWorldIntroTemplate(currentLang);
  const introPreview = introFull.length > 900 ? `${introFull.slice(0, 900)}...` : introFull;
  const langName =
    currentLang === 'zh-TW'
      ? '中文（繁體）'
      : currentLang === 'zh-CN'
        ? '中文（简体）'
        : currentLang === 'en'
          ? 'English'
          : '中文（繁體）';
  const walletBound = WALLET.isWalletBound(user.id);
  const walletData = WALLET.getWalletData(user.id);
  const walletStatus = walletBound
    ? `已綁定：\`${walletData?.walletAddress || 'unknown'}\``
    : '未綁定（可中途綁定，立即入帳）';
  
  if (player?.activeMessageId) {
    await disableMessageComponents(interaction.channel, player.activeMessageId);
  }
  
  const embed = new EmbedBuilder()
    .setTitle(`⚙️ ${t('settings')}`)
    .setColor(0x0099ff)
    .setDescription('遊戲設置（可在此查看世界導讀）')
    .addFields(
      { name: '🌐 語言 / Language', value: `目前：${langName}`, inline: false },
      { name: '💳 錢包', value: walletStatus, inline: false },
      { name: '📖 世界導讀', value: introPreview, inline: false }
    );
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lang_zh-TW').setLabel('🇹🇼 繁體中文').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('lang_zh-CN').setLabel('🇨🇳 簡體中文').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('lang_en').setLabel('🇺🇸 English').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(walletBound ? 'sync_wallet_now' : 'open_wallet_modal')
      .setLabel(walletBound ? '🔄 同步資產' : '💳 綁定錢包')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('settings_back').setLabel('🔙 返回').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_renaiss_world').setLabel('🌍 renaiss世界').setStyle(ButtonStyle.Success)
  );

  await interaction.update({ embeds: [embed], components: [row, row2] });
}

async function showRenaissWorldGuide(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const lang = player?.language || 'zh-TW';
  const intro = getWorldIntroTemplate(lang);

  const title =
    lang === 'en'
      ? '🌍 Renaiss World'
      : lang === 'zh-CN'
        ? '🌍 Renaiss 世界'
        : '🌍 Renaiss 世界';
  const desc =
    lang === 'en'
      ? `${intro}\n\nMain story is passively triggered by your actions.`
      : lang === 'zh-CN'
        ? `${intro}\n\n主线会由你的行动被动触发。`
        : `${intro}\n\n主線會由你的行動被動觸發。`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x2f855a)
    .setDescription(desc);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('world_back_settings').setLabel('⚙️ 返回設定').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('settings_back').setLabel('🔙 返回冒險').setStyle(ButtonStyle.Secondary)
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
  const gachaConfig = GACHA.GACHA_CONFIG;
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
    .addFields({ name: '💳 錢包', value: walletStatus, inline: false })
    .addFields({ name: '🐾 寵物列表', value: petsList, inline: false });
  
  // 每隻寵物一個分配按鈕
  const petButtons = profile.pets.map(p => 
    new ButtonBuilder()
      .setCustomId(`alloc_hp_${p.id}`)
      .setLabel(`❤️ ${p.name} +${gachaConfig.hpPerPoint}HP`)
      .setStyle(ButtonStyle.Success)
  );
  
  const rows = [];
  for (let i = 0; i < petButtons.length; i += 3) {
    rows.push(new ActionRowBuilder().addComponents(petButtons.slice(i, i + 3)));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(walletBound ? 'sync_wallet_now' : 'open_wallet_modal')
      .setLabel(walletBound ? '🔄 同步資產' : '💳 綁定錢包')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('open_gacha').setLabel('🎰 去開包').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel('返回').setStyle(ButtonStyle.Secondary)
  ));
  
  await interaction.update({ embeds: [embed], components: rows });
}

// ============== 扭蛋選單 ==============
async function showGacha(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  
  const config = GACHA.GACHA_CONFIG;
  const profile = GACHA.getPlayerProfile(player);
  
  const embed = new EmbedBuilder()
    .setTitle('🎰 招式扭蛋機')
    .setColor(0xffd700)
    .setDescription('花費 Rns 代幣 抽招式！')
    .addFields(
      { name: '💰 單抽', value: `${config.singleCost} Rns 代幣 (1包)`, inline: true },
      { name: '💰 十連', value: `${config.tenPullCost} Rns 代幣 (10包)`, inline: true },
      { name: '⭐ 升級點數', value: `${profile.upgradePoints} 點`, inline: true }
    )
    .addFields(
      { name: '📊 已開包數', value: `${profile.totalDraws} 包`, inline: true },
      { name: '💡 每點可換', value: `${config.hpPerPoint} HP`, inline: true }
    )
    .addFields({ name: '💡 說明', value: '每開1包 = 1升級點數\n每點 = 0.2 HP（可分配給不同寵物）\n可分配給任何寵物，用完就沒了', inline: false });
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gacha_single').setLabel(`單抽 (${config.singleCost} Rns 代幣)`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('gacha_ten').setLabel(`十連 (${config.tenPullCost} Rns 代幣)`).setStyle(ButtonStyle.Success),
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

async function handleGachaResult(interaction, user, count) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  
  const result = GACHA.drawMove(player, count);
  
  if (!result.success) {
    await interaction.update({ content: `❌ ${result.reason}`, components: [] });
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
  
  const resultsText = result.draws.map((r, i) => formatGachaSlotLine(r, i)).join('\n\n');
  
  const embed = new EmbedBuilder()
    .setTitle(`🎰 開包結果 x${count}`)
    .setColor(0xffd700)
    .setDescription(`💰 花費 ${result.cost} Rns 代幣\n💡 拉霸規則：三格相同 = 5% 大獎（不改原本機率）\n\n**開到以下招式：**\n${resultsText}\n\n**總價值：${result.totalValue} Rns 代幣**\n**⭐ 獲得升級點數：+${result.earnedPoints} 點**\n**📊 已開包數：${result.totalDraws} 包**`)
    .addFields({ name: '💡', value: '每點 = 0.2 HP，可在檔案分配給任意寵物！', inline: false });
  
  // 存放抽卡結果
  player.tempGachaResults = result.draws;
  CORE.savePlayer(player);
  
  // 招式選擇按鈕
  const moveButtons = result.draws.slice(0, 3).map((r, i) => 
    new ButtonBuilder()
      .setCustomId(`learn_move_${i}`)
      .setLabel(`${r.tierEmoji} ${r.move.name}`)
      .setStyle(r.tier === 3 ? ButtonStyle.Danger : r.tier === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  
  const row1 = new ActionRowBuilder().addComponents(moveButtons);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_gacha').setLabel('繼續抽').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('main_menu').setLabel('返回主選單').setStyle(ButtonStyle.Primary)
  );
  
  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

// ============== 學習抽到的招式 ==============
async function handleLearnMove(interaction, user, moveIndex) {
  const player = CORE.loadPlayer(user.id);
  
  if (!player || !player.tempGachaResults) {
    await interaction.update({ content: '❌ 沒有可學習的招式！', components: [] });
    return;
  }
  
  const moveData = player.tempGachaResults[moveIndex];
  if (!moveData) {
    await interaction.update({ content: '❌ 無效的招式！', components: [] });
    return;
  }
  
  const result = GACHA.learnDrawnMove(user.id, moveData.move);
  
  if (!result.success) {
    await interaction.update({ content: `❌ ${result.reason}`, components: [] });
    return;
  }
  
  // 清除暫存
  delete player.tempGachaResults;
  CORE.savePlayer(player);
  
  const embed = new EmbedBuilder()
    .setTitle(`✅ 學習成功！`)
    .setColor(0x00ff00)
    .setDescription(`你的寵物學會了 **${moveData.tierEmoji} ${moveData.move.name}**！\n\n${moveData.move.desc}`);
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_gacha').setLabel('繼續抽').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('main_menu').setLabel('返回主選單').setStyle(ButtonStyle.Primary)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
}

// ============== 分配 HP ==============
async function handleAllocateHP(interaction, user, petId) {
  const player = CORE.loadPlayer(user.id);
  
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  
  const result = GACHA.allocateUpgradePoint(user.id, petId, 1);
  
  if (!result.success) {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ 升級失敗')
      .setColor(0xffa500)
      .setDescription(`❌ ${result.reason}`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_profile').setLabel('💳 返回檔案').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('main_menu').setLabel('返回主選單').setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({ embeds: [embed], content: null, components: [row] });
    return;
  }
  
  const embed = new EmbedBuilder()
    .setTitle(`✅ 升級成功！`)
    .setColor(0x00ff00)
    .setDescription(`**${result.petName}** 的 HP 增加了 **+${result.hpGain}**！\n\n` +
      `使用點數：${result.pointsUsed}\n剩餘點數：${result.remaining}`);
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_profile').setLabel('💳 返回檔案').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel('返回主選單').setStyle(ButtonStyle.Secondary)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
}

// ============== 角色資訊 ==============
async function showCharacter(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  
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
    .setColor(getAlignmentColor(player.alignment))
    .setDescription(`**${player.title}**`)
    .addFields(
      { name: '🏷️ 陣營', value: formatAlignmentLabel(player.alignment), inline: true },
      { name: '📍 位置', value: player.location, inline: true }
    )
    .addFields(
      { name: '📊 等級', value: String(player.level), inline: true },
      { name: '🍀 幸運值', value: String(player.stats.運氣), inline: true },
      { name: t('hp'), value: `${player.stats.生命}/${player.maxStats.生命}`, inline: true },
      { name: t('gold'), value: String(player.stats.財富), inline: true },
      { name: '🎖️ 友誼賽成就', value: `${mentorCount} 位`, inline: true },
      { name: '🧾 已完成導師', value: mentorPreview, inline: false }
    );
  
  if (pet) {
    embed.addFields(
      { name: '---寵物---', value: `**${pet.name}** (${pet.type})`, inline: false },
      { name: t('hp'), value: `${pet.hp}/${pet.maxHp}`, inline: true },
      { name: '⚔️ 攻擊', value: String(pet.attack), inline: true },
      { name: '🛡️ 防禦', value: String(pet.defense), inline: true }
    );
  }
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_finance_ledger').setLabel('💸 資金流水').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back')).setStyle(ButtonStyle.Secondary)
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
async function showMovesList(interaction, user, selectedPetId = '', notice = '') {
  const ownedPets = getPlayerOwnedPets(user.id);
  if (ownedPets.length === 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('back')).setStyle(ButtonStyle.Primary)
    );
    await interaction.update({ content: '❌ 沒有寵物！', embeds: [], components: [row] });
    return;
  }

  let selectedPet = ownedPets.find((p) => p.id === selectedPetId) || null;
  if (!selectedPet) {
    const defaultPet = PET.loadPet(user.id);
    selectedPet = ownedPets.find((p) => p.id === defaultPet?.id) || ownedPets[0];
  }

  for (const pet of ownedPets) {
    normalizePetMoveLoadout(pet, true);
  }
  const selectedLoadout = normalizePetMoveLoadout(selectedPet, false);
  const selectedSet = new Set(selectedLoadout.activeMoveIds);

  const unlockedMoves = (selectedPet.moves || []).map((m, i) => {
    const isFlee = Boolean(m?.effect && m.effect.flee);
    const isSelected = selectedSet.has(String(m.id || ''));
    const statusMark = isFlee ? '🏃固定' : (isSelected ? '✅攜帶' : '▫️候補');
    const dmg = BATTLE.calculatePlayerMoveDamage(m, {}, selectedPet);
    const energyCost = isFlee ? '-' : BATTLE.getMoveEnergyCost(m);
    const tierEmoji = m.tier === 3 ? '🔮' : m.tier === 2 ? '💠' : '⚪';
    const tierName = m.tier === 3 ? '史詩' : m.tier === 2 ? '稀有' : '普通';
    const effectStr = describeMoveEffects(m);
    return `${tierEmoji} ${i + 1}. **${m.name}** (${m.element}/${tierName})｜${statusMark}\n   💥 ${dmg.total}dmg | ⚡${energyCost} | ${effectStr || '無效果'}`;
  }).join('\n\n') || '（無招式）';

  const petSummary = ownedPets.map((pet, i) => {
    const loadout = normalizePetMoveLoadout(pet, false);
    const activeNames = loadout.activeMoves.map((m) => m.name).join('、') || '（尚未設定）';
    return `${i + 1}. **${pet.name}**（${pet.type}）\n攜帶：${loadout.activeMoves.length}/${PET_MOVE_LOADOUT_LIMIT}｜${activeNames}`;
  }).join('\n\n');

  const description = [
    notice ? `✅ ${notice}` : '',
    `**目前管理：${selectedPet.name}**（${selectedPet.type}）`,
    `可攜帶上陣招式：**${PET_MOVE_LOADOUT_LIMIT}**（逃跑技能固定，不占名額）`,
    `已解鎖招式：${selectedPet.moves.length}`
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`📜 寵物招式配置`)
    .setColor(selectedPet.type === '正派' ? 0x00ff00 : 0xff0000)
    .setDescription(description)
    .addFields(
      { name: `🧭 ${selectedPet.name} 招式清單`, value: unlockedMoves.slice(0, 1024), inline: false },
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

  const attackMoves = getPetAttackMoves(selectedPet);
  let rowMoveAssign = null;
  if (attackMoves.length > 0) {
    const moveOptions = attackMoves.slice(0, 25).map((m) => ({
      label: `${m.name}`.slice(0, 100),
      description: `${m.element} / ${m.tier === 3 ? '史詩' : m.tier === 2 ? '稀有' : '普通'}`.slice(0, 100),
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

  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_profile').setLabel('💳 返回檔案').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back')).setStyle(ButtonStyle.Secondary)
  );

  const components = rowMoveAssign ? [rowPetSelect, rowMoveAssign, rowButtons] : [rowPetSelect, rowButtons];
  await interaction.update({ embeds: [embed], content: null, components });
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

function parseMarketTypeFromCustomId(customId = '', fallback = 'renaiss') {
  if (String(customId || '').includes('_digital')) return 'digital';
  if (String(customId || '').includes('_renaiss')) return 'renaiss';
  return fallback === 'digital' ? 'digital' : 'renaiss';
}

function buildMarketListingLine(listing = {}, idx = 0) {
  const qty = Math.max(1, Number(listing?.quantity || 1));
  const unitPrice = Math.max(1, Number(listing?.unitPrice || 0));
  const total = Math.max(1, Number(listing?.totalPrice || qty * unitPrice));
  const owner = String(listing?.ownerName || '匿名玩家');
  const note = String(listing?.note || '').trim();
  const noteText = note ? `｜備註:${note}` : '';
  return `${idx + 1}. ${listing.itemName} x${qty}｜單價 ${unitPrice}｜總價 ${total}｜掛單:${owner}${noteText}`;
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

async function showPlayerMarketListings(interaction, user, marketType = 'renaiss') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const listings = ECON.getMarketListingsView({
    marketType: safeMarket,
    type: 'sell',
    excludeOwnerId: user.id,
    limit: 6
  });
  const title = '🛒 可購買賣單';
  const listText = listings.length > 0
    ? listings.map((l, i) => buildMarketListingLine(l, i)).join('\n')
    : '（目前沒有可成交掛單）';

  const embed = new EmbedBuilder()
    .setTitle(`${title}｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(listText);

  const actionButtons = [];
  for (const listing of listings.slice(0, 3)) {
    actionButtons.push(
      new ButtonBuilder()
        .setCustomId(`pmkt_buy_${listing.id}`)
        .setLabel(`買 ${String(listing.itemName || '物品').slice(0, 12)}`)
        .setStyle(ButtonStyle.Success)
    );
  }

  const rows = [];
  if (actionButtons.length > 0) rows.push(new ActionRowBuilder().addComponents(actionButtons));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pmkt_open_${safeMarket}`).setLabel('返回鑑價站').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒 返回背包').setStyle(ButtonStyle.Secondary)
  ));

  await interaction.update({ embeds: [embed], components: rows });
}

async function showMyMarketListings(interaction, user, marketType = 'renaiss') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const mine = ECON.getMarketListingsView({ marketType: safeMarket, type: 'sell', ownerId: user.id, limit: 6 });

  const text = mine.length > 0
    ? mine.map((l, i) => `${i + 1}. ${l.itemName} x${l.quantity}｜單價 ${l.unitPrice}｜總價 ${l.totalPrice}`).join('\n')
    : '（你目前沒有掛單）';

  const embed = new EmbedBuilder()
    .setTitle(`📌 我的掛單｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(text);

  const cancelButtons = mine.slice(0, 3).map((listing) =>
    new ButtonBuilder()
      .setCustomId(`pmkt_cancel_${listing.id}`)
      .setLabel(`取消 ${String(listing.itemName || '掛單').slice(0, 12)}`)
      .setStyle(ButtonStyle.Danger)
  );

  const rows = [];
  if (cancelButtons.length > 0) rows.push(new ActionRowBuilder().addComponents(cancelButtons));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pmkt_open_${safeMarket}`).setLabel('返回鑑價站').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒 返回背包').setStyle(ButtonStyle.Secondary)
  ));
  await interaction.update({ embeds: [embed], components: rows });
}

function buildShopSellDraftOptions(player, ownerId) {
  ECON.ensurePlayerEconomy(player);
  const stacked = new Map();

  const addStack = (rawName, source, amount = 1) => {
    const name = String(rawName || '').trim();
    if (!name) return;
    const key = name;
    const qty = Math.max(1, Math.floor(Number(amount || 1)));
    const prev = stacked.get(key);
    if (prev) {
      prev.quantity += qty;
      if (!prev.sources.includes(source)) prev.sources.push(source);
      return;
    }
    stacked.set(key, {
      kind: 'item',
      sources: [source],
      itemName: name,
      quantity: qty
    });
  };

  for (const good of Array.isArray(player.tradeGoods) ? player.tradeGoods : []) {
    addStack(good?.name || '', 'tradeGoods', 1);
  }
  for (const herb of Array.isArray(player.herbs) ? player.herbs : []) {
    addStack(typeof herb === 'string' ? herb : herb?.name || '', 'herbs', 1);
  }
  for (const inv of Array.isArray(player.inventory) ? player.inventory : []) {
    addStack(typeof inv === 'string' ? inv : inv?.name || '', 'inventory', 1);
  }

  const options = Array.from(stacked.values())
    .sort((a, b) => String(a.itemName || '').localeCompare(String(b.itemName || '')))
    .map((entry) => ({
      kind: 'item',
      itemName: String(entry.itemName || '').trim(),
      quantityMax: Math.max(1, Number(entry.quantity || 1)),
      itemRef: { kind: 'item', source: Array.isArray(entry.sources) ? entry.sources[0] : 'inventory' },
      label: String(entry.itemName || '').slice(0, 100),
      description: `庫存 ${Math.max(1, Number(entry.quantity || 1))} 件｜${(entry.sources || []).join('+')}`
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
      options.push({
        kind: 'pet_move',
        itemName: `技能晶片：${moveName}`,
        quantityMax: 1,
        itemRef: {
          kind: 'pet_move',
          petId: String(pet.id),
          petName: String(pet.name || '寵物').slice(0, 48),
          moveId,
          moveName
        },
        label: `${pet.name}｜${moveName}`.slice(0, 100),
        description: `技能掛賣｜${pet.type || '未知'}｜未上陣`
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

function extractPitchFromHaggleMessage(message = '') {
  const text = String(message || '');
  const match = text.match(/🏪\s*[^：:\n]+[：:]\s*([^\n]+)/u);
  return String(match?.[1] || '').trim();
}

async function showWorldShopHaggleAllOffer(interaction, user, marketType = 'renaiss') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
    return;
  }

  const worldDay = Number(CORE.getWorld()?.day || 1);
  const shadow = JSON.parse(JSON.stringify(player || {}));
  ECON.ensurePlayerEconomy(shadow);
  const offerResult = await ECON.sellPlayerAtMarket(shadow, safeMarket, { worldDay }).catch((err) => ({ error: err?.message || String(err) }));
  if (!offerResult || offerResult.error || Number(offerResult.soldCount || 0) <= 0) {
    await showWorldShopHagglePicker(interaction, user, safeMarket, `無法全部議價：${offerResult?.error || '目前沒有可售商品'}`);
    return;
  }

  const rawTotal = Math.max(0, Number(offerResult.totalGold || 0));
  const quotedTotal = Math.max(0, Math.floor(rawTotal * 0.7));
  const discountLoss = Math.max(0, rawTotal - quotedTotal);
  const pending = {
    id: `haggle_all_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    marketType: safeMarket,
    createdAt: Date.now(),
    scope: 'all',
    itemName: '全部可賣商品',
    spec: { kind: 'all' },
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
  detailLines.push('範圍：全部可賣商品');
  detailLines.push(`件數：${pending.soldCount} 件`);
  detailLines.push(`原始估價：${rawTotal} Rns 代幣`);
  detailLines.push(`快速清倉（七折）：**${quotedTotal} Rns 代幣**`);
  detailLines.push(`折讓差額：-${discountLoss} Rns 代幣`);
  detailLines.push(`鑑價員：${pending.npcName}`);
  if (pitch) detailLines.push(`\n💬 ${pitch}`);
  detailLines.push('\n請選擇是否同意「全部賣出（七折）」提案。');

  const embed = new EmbedBuilder()
    .setTitle(`🤝 全部議價提案｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(detailLines.join('\n'))
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_haggle_confirm_${safeMarket}`).setLabel('✅ 同意成交').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`shop_haggle_cancel_${safeMarket}`).setLabel('↩️ 退出議價').setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

async function showWorldShopHagglePicker(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
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
    await interaction.update({ embeds: [embed], components: [row] });
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
    new ButtonBuilder().setCustomId(`shop_haggle_all_${safeMarket}`).setLabel('📦 全部賣出(七折)').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function showWorldShopHaggleOffer(interaction, user, marketType = 'renaiss', spec = null) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
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
  await interaction.update({ embeds: [embed], components: [row] });
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
      new ButtonBuilder().setCustomId('show_moves').setLabel('📜 寵物招式配置').setStyle(ButtonStyle.Primary)
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
    new ButtonBuilder().setCustomId('show_moves').setLabel('📜 寵物招式配置').setStyle(ButtonStyle.Primary)
  );
  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function showWorldShopSellModal(interaction, marketType = 'renaiss', spec = null) {
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const itemName = String(spec?.itemName || '商品').slice(0, 36);
  const modal = new ModalBuilder()
    .setCustomId(`shop_sell_modal_${safeMarket}`)
    .setTitle(`上架賣單｜${itemName}`);

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
    .setLabel('單價（Rns）')
    .setPlaceholder('例如：120')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(8);

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

async function showWorldShopBuyPanel(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const listings = ECON.getMarketListingsView({
    marketType: safeMarket,
    type: 'sell',
    excludeOwnerId: user.id,
    limit: 6
  });
  const listText = listings.length > 0
    ? listings.map((l, i) => buildMarketListingLine(l, i)).join('\n')
    : '（目前沒有可購買商品）';

  const embed = new EmbedBuilder()
    .setTitle(`🛒 商店可購買商品｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(`${notice ? `✅ ${notice}\n\n` : ''}${listText}\n\n加成點數：花費 200 Rns 可獲得 +1 點。`);

  const buyButtons = listings.slice(0, 3).map((listing) =>
    new ButtonBuilder()
      .setCustomId(`shop_buy_item_${listing.id}`)
      .setLabel(`買 ${String(listing.itemName || '商品').slice(0, 11)}`)
      .setStyle(ButtonStyle.Success)
  );
  const rows = [];
  if (buyButtons.length > 0) rows.push(new ActionRowBuilder().addComponents(buyButtons));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_scratch_${safeMarket}`).setLabel('🎟️ 刮刮樂(100)').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`shop_buy_point_${safeMarket}`).setLabel('🧩 買加成點數(200)').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
  ));
  await interaction.update({ embeds: [embed], components: rows });
}

async function showWorldShopScene(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
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
  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

// ============== 行囊/背包 ==============
async function showInventory(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  
  // 顯示物品
  const items = player.inventory || [];
  const herbs = player.herbs || [];
  const tradeGoods = player.tradeGoods || [];
  
  const itemsList = items.length > 0 ? items.map((item, i) => `${i+1}. ${item}`).join('\n') : '（空）';
  const herbsList = herbs.length > 0 ? herbs.map((h, i) => `${i+1}. ${h}`).join('\n') : '（空）';
  const goodsList = tradeGoods.length > 0
    ? tradeGoods.slice(0, 10).map((g, i) => `${i + 1}. ${g.name}（${g.rarity || '普通'}｜${Number(g.value || 0)} Rns 代幣）`).join('\n')
    : '（空）';
  
  const embed = new EmbedBuilder()
    .setTitle(`🎒 ${player.name} 的行囊`)
    .setColor(0x8B4513)
    .setDescription('你身上攜帶的物品')
    .addFields(
      { name: '📦 物品', value: itemsList, inline: true },
      { name: '🌿 草藥', value: herbsList, inline: true }
    )
    .addFields({ name: '🧰 可售素材（前10）', value: goodsList, inline: false })
    .addFields({ name: t('gold'), value: `${player.stats.財富} Rns 代幣`, inline: false });
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back')).setStyle(ButtonStyle.Primary)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
}

// ============== 處理事件 ==============
async function handleEvent(interaction, user, eventIndex, options = {}) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  const respondError = async (content) => {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ephemeral: true }).catch(() => {});
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
    await interaction.update({ content, components: [] }).catch(async () => {
      await interaction.reply({ content, ephemeral: true }).catch(() => {});
    });
  };
  
  if (!player || !pet) {
    await respondError('❌ 請重新開始！');
    return;
  }
  if (ensurePlayerGenerationSchema(player)) {
    CORE.savePlayer(player);
  }
  ECON.ensurePlayerEconomy(player);
  if (!Array.isArray(player.herbs)) player.herbs = [];
  if (!Array.isArray(player.inventory)) player.inventory = [];
  const worldDay = Number(CORE.getWorld()?.day || 1);

  MAIN_STORY.ensureMainStoryState(player);
  
  const choices = player.eventChoices || [];
  const event = choices[eventIndex];
  const wishTextFromModal = String(options?.wishText || '').trim();
  const customActionTextFromModal = String(options?.customActionText || '').trim();
  
  if (!event) {
    await respondError('❌ 事件不存在！');
    return;
  }

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

  // 事件按鈕一律先即時確認，避免 Discord 顯示「互動失敗」
  if (interaction?.isButton && interaction.isButton() && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
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
    const embed = new EmbedBuilder()
      .setTitle(`🏪 ${getMarketTypeLabel(marketType)}`)
      .setColor(marketType === 'digital' ? 0x9333ea : 0x0ea5e9)
      .setDescription(
        `🧭 刮刮樂已移至商店內操作，請點「🎟️ 刮刮樂(100)」。\n\n` +
        `你可以：掛賣商品、跟老闆議價、買商品，或離開商店回到原本故事。`
      );
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop_post_sell_${marketType}`).setLabel('📤 掛賣商品').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`shop_npc_haggle_${marketType}`).setLabel('🤝 跟老闆議價').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop_scratch_${marketType}`).setLabel('🎟️ 刮刮樂(100)').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`shop_buy_${marketType}`).setLabel('🛒 買商品').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('shop_leave').setLabel('🚪 離開商店').setStyle(ButtonStyle.Secondary)
    );
    const shopMsg = await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
    trackActiveGameMessage(player, interaction.channel?.id, shopMsg.id);
    await disableMessageComponents(interaction.channel, interaction.message?.id);
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

    const bossName = marketType === 'digital' ? '摩爾・Digital鑑價員' : '艾洛・Renaiss鑑價員';
    const intro = marketType === 'digital'
      ? '你推門進入店內，老闆笑著招手，語氣親切卻帶著一絲試探。'
      : '你走進店內，牆上掛著完整估值表，老闆示意你先看規則。';
    const embed = new EmbedBuilder()
      .setTitle(`🏪 ${getMarketTypeLabel(marketType)}`)
      .setColor(marketType === 'digital' ? 0x9333ea : 0x0ea5e9)
      .setDescription(
        `${intro}\n\n` +
        `櫃台老闆：**${bossName}**\n` +
        `你可以：掛賣商品、跟老闆議價、買商品，或離開商店回到原本故事。\n` +
        `掛賣採下拉選單；上陣中的技能請先卸下。`
      );
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop_post_sell_${marketType}`).setLabel('📤 掛賣商品').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`shop_npc_haggle_${marketType}`).setLabel('🤝 跟老闆議價').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop_buy_${marketType}`).setLabel('🛒 買商品').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('shop_leave').setLabel('🚪 離開商店').setStyle(ButtonStyle.Secondary)
    );

    const shopMsg = await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
    trackActiveGameMessage(player, interaction.channel?.id, shopMsg.id);
    await disableMessageComponents(interaction.channel, interaction.message?.id);
    return;
  } else if (event.action === 'main_story') {
    result = {
      type: 'main_story',
      message: String(event.desc || event.choice || '主線正在暗中推進。')
    };
    selectedChoice = String(event.choice || event.name || '主線推進');
    queueMemory({
      type: '主線',
      content: '主線改為被動觸發，不需固定按鈕',
      importance: 1,
      tags: ['main_story']
    });
  } else if (event.action === 'portal_intent') {
    const nearbyPortals = typeof getPortalDestinations === 'function'
      ? getPortalDestinations(player.location || '')
      : [];
    player.portalMenuOpen = nearbyPortals.length > 0;
    extraStoryGuide = player.portalMenuOpen
      ? buildPortalUsageGuide(player)
      : '🌀 你嘗試感應傳送門，但附近暫時沒有穩定門可啟動。';
    result = {
      type: 'portal_ready',
      message: player.portalMenuOpen
        ? `你在${player.location}感應到穩定傳送門節點，門紋逐漸亮起。`
        : `你在${player.location}搜尋傳送門訊號，但暫時未找到可用門。`
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
    player.location = targetLocation;
    syncLocationArcLocation(player);
    player.portalMenuOpen = false;
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

    EVENTS.addWorldEvent(
      `🪙 ${player.name}在${player.location}的許願池許願「${safeWishText}」，結果：${outcome.worldRumor}`,
      'wish_pool'
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

    EVENTS.addWorldEvent(
      `✍️ ${player.name}在${player.location}採取自訂行動「${safeCustomAction}」，後續傳聞：${outcome.worldRumor}`,
      'custom_input'
    );

    queueMemory({
      type: '自訂行動',
      content: `${safeCustomAction} -> ${outcome.title}`,
      outcome: `${outcome.verdict || 'costly'}｜${outcome.futureHook || ''}`.slice(0, 180),
      importance: outcome.verdict === 'allow' ? 2 : 3,
      tags: ['custom_input', String(outcome.verdict || 'costly')]
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
      if (!hasExplicitEnemy && typeof CORE.buildRoamingDigitalEncounterEnemy === 'function') {
        const roamingEncounter = CORE.buildRoamingDigitalEncounterEnemy(player.location, {
          limit: 3,
          forceRelocate: true,
          persist: true
        });
        if (roamingEncounter?.enemy && Math.random() < 0.78) {
          result.enemy = roamingEncounter.enemy;
          result.message = `${result.message || event.desc || ''}\n\n${roamingEncounter.hint || ''}`.trim();
          result.npcId = roamingEncounter.npcId;
          result.npcGroup = roamingEncounter.group;
          queueMemory({
            type: '遭遇',
            content: `在${player.location}遭遇無名滲透者`,
            outcome: `分組 ${roamingEncounter.group || '未知'}｜戰鬥即將開始`,
            importance: 2,
            tags: ['digital_roamer', 'combat']
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

    const tradeGood = maybeGenerateTradeGoodFromChoice(event, player, result, selectedChoice);
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
  
  // 減少飽腹度
  player.stats.飽腹度 = Math.max(0, (player.stats.飽腹度 || 100) - Math.floor(Math.random() * 5 + 3));
  incrementPlayerStoryTurns(player, 1);
  incrementLocationArcTurns(player, 1);
  if (typeof CORE.advanceRoamingDigitalVillains === 'function') {
    CORE.advanceRoamingDigitalVillains({ steps: 1, persist: true });
  }
  if (event.action === 'market_renaiss' || event.action === 'market_digital') {
    player.lastMarketTurn = getPlayerStoryTurns(player);
  }
  
  // 清除舊選項（必須重新生成）
  player.eventChoices = [];
  const enteringBattle = shouldTriggerBattle(event, result);
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
    const mentorSparState = result?.isMentorSpar ? { ...(result?.mentorSpar || {}) } : null;
    const fighterType = CORE.canPetFight(pet) ? 'pet' : 'player';
    const battleEstimate = estimateBattleOutcome(player, pet, enemy, fighterType);
    const fighterLabel = fighterType === 'pet'
      ? `🐾 ${pet.name}`
      : `🧍 ${player.name}(ATK 10)`;
    const enemyPetLine = enemy?.npcPet
      ? `🐾 對手寵物：${enemy.npcPet.name}（ATK ${enemy.npcPet.attack}${enemy.npcPet.newbieScaled ? '｜新手區調整' : ''}）\n`
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
        `❤️ 敵方 HP：${enemy.hp}/${enemy.maxHp}\n` +
        `⚔️ 敵方攻擊：${enemy.attack}\n` +
        `${enemyPetLine}` +
        `${fighterLabel} 出戰\n` +
        `⚡ 戰鬥能量規則：每回合 +2，可結轉到下一回合\n` +
        `${beginnerGuardText}\n` +
        `${beginnerDangerText}` +
        `${mentorRuleText}` +
        `📊 **勝率預估：${battleEstimate.rank}（約 ${battleEstimate.winRate}%）**（模擬 ${battleEstimate.simulations || BATTLE_ESTIMATE_SIMULATIONS} 場）\n` +
        `你方平均傷害 ${battleEstimate.avgPlayerDamage}/回合，預計 ${battleEstimate.turnsToWin} 回合擊倒敵人\n` +
        `敵方平均傷害 ${battleEstimate.enemyDamage}/回合，預計 ${battleEstimate.turnsToLose} 回合擊倒你方\n\n` +
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
  
  const statusBar = `氣血 ${pet.hp}/${pet.maxHp} | 能量 ${player.stats.能量 || 10}/${player.maxStats.能量 || 10} | 飽腹度 ${player.stats.飽腹度} | Rns 代幣 ${player.stats.財富} | ${player.location}`;
  
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
      description: `**📍 上個選擇：** ${selectedChoice}\n\n⏳ *AI 說書人正在構思新故事...*\n\n**📜 前情提要：**\n${prevStory}${prevOptionsText ? '\n\n**🆕 即將更新選項：**' + prevOptionsText : ''}`
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
          outcome: previousOutcomeText || ''
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
      player.eventChoices = [];
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
        worldEventsText = '\n\n📢 **世界事件：**\n' + worldEvents.map(e => e.message || e).join('\n');
      }
      const portalGuideText = extraStoryGuide || (player.portalMenuOpen ? buildPortalUsageGuide(player) : '');
      const portalGuideBlock = portalGuideText ? `\n\n${portalGuideText}` : '';

      const storyOnlyDesc =
        `**📍 上個選擇：** ${selectedChoice}\n\n${storyText}` +
        `${rewardText.length > 0 ? '\n\n' + rewardText.join(' | ') : ''}` +
        `${worldEventsText}${portalGuideBlock}\n\n⏳ *故事已送達，正在生成選項...*`;

      const storyOnlyEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(getAlignmentColor(player.alignment))
        .setDescription(storyOnlyDesc)
        .addFields(
          { name: '🐾 寵物', value: `${pet.name} (${pet.type})`, inline: true },
          { name: '⚔️ 氣血', value: `${pet.hp}/${pet.maxHp}`, inline: true },
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

      const description =
        `**📍 上個選擇：** ${selectedChoice}\n\n${storyText}` +
        `${rewardText.length > 0 ? '\n\n' + rewardText.join(' | ') : ''}` +
        `${worldEventsText}${portalGuideBlock}\n\n**🆕 新選項：**${optionsText}\n\n_請選擇編號（1-${CHOICE_DISPLAY_COUNT}）_`;

      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(getAlignmentColor(player.alignment))
        .setDescription(description)
        .addFields(
          { name: '🐾 寵物', value: `${pet.name} (${pet.type})`, inline: true },
          { name: '⚔️ 氣血', value: `${pet.hp}/${pet.maxHp}`, inline: true },
          { name: '💰 Rns 代幣', value: String(player.stats.財富), inline: true }
        );

      const buttons = buildEventChoiceButtons(newChoices);
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
function buildBattleMoveDetails(player, pet, combatant) {
  const battleState = player?.battleState || {};
  const currentEnergy = Number.isFinite(Number(battleState.energy)) ? Number(battleState.energy) : 2;
  return getCombatantMoves(combatant, pet).map(m => {
    const d = BATTLE.calculatePlayerMoveDamage(m, player, combatant);
    const energyCost = BATTLE.getMoveEnergyCost(m);
    const canUse = currentEnergy >= energyCost;
    const effectStr = describeMoveEffects(m);
    return `⚔️ ${m.name} | ${d.total} dmg | ⚡${energyCost} | ${canUse ? '可用' : '能量不足'} | ${effectStr || '無'}`;
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

function buildBattleActionRows(player, pet, combatant) {
  const state = ensureBattleEnergyState(player);
  const battleState = player.battleState || {};
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
      .setDisabled(!canUse);
  });

  const moveRow = new ActionRowBuilder().addComponents(
    moveButtons.length > 0
      ? moveButtons
      : [new ButtonBuilder().setCustomId('no_attack_moves').setLabel('無可用攻擊招式').setStyle(ButtonStyle.Secondary).setDisabled(true)]
  );
  const fleeTry = battleState.fleeAttempts || 0;
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('battle_wait').setLabel('⚡ 蓄能待機').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`flee_${fleeTry}`).setLabel(`${t('flee')} (70%×2)`).setStyle(ButtonStyle.Secondary)
  );
  return [moveRow, actionRow];
}

function buildAIBattleStory(rounds, combatant, enemy, finalResult) {
  const lines = [];
  const icon = combatant?.isHuman ? '🧍' : '🐾';
  lines.push(`戰場氣壓驟降，${combatant.name}與${enemy.name}在塵霧中對峙，呼吸與殺意同時收緊。`);

  for (const r of rounds) {
    const hitText = r.playerDamage > 0
      ? `命中造成 **${r.playerDamage}** 點傷害`
      : '攻勢被對手硬生生擋下';
    const takenText = r.enemyDamage > 0
      ? `反擊讓你承受 **${r.enemyDamage}** 點傷害`
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

function buildManualBattleBoard(enemy, combatant, state) {
  const enemyName = padBattleLabel(enemy?.name || '敵人', 14);
  const allyName = padBattleLabel(combatant?.name || '我方', 14);
  const enemyHp = `${enemy?.hp || 0}/${enemy?.maxHp || 0}`;
  const allyHp = `${combatant?.hp || 0}/${combatant?.maxHp || 0}`;
  const turn = Number(state?.turn || 1);
  const energy = Number(state?.energy || 0);
  return (
    '```text\n' +
    `                 ┌─【敵方】──────────────┐\n` +
    `                 │ ${enemyName} HP ${enemyHp}\n` +
    `                 │ ATK ${enemy?.attack || 0}  回合 ${turn}\n` +
    `                 └───────────────────────┘\n` +
    `\n` +
    `┌─【我方】──────────────┐\n` +
    `│ ${allyName} HP ${allyHp}\n` +
    `│ ⚡ 能量 ${energy}（每回 +2，可結轉）\n` +
    `└───────────────────────┘\n` +
    '```'
  );
}

async function renderManualBattle(interaction, player, pet, roundMessage = '') {
  const enemy = player?.battleState?.enemy;
  if (!enemy) {
    await interaction.update({ content: '❌ 找不到戰鬥狀態，請重新選擇戰鬥。', components: [] });
    return;
  }

  if (interaction.message?.id) {
    trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
  }

  const combatant = getActiveCombatant(player, pet);
  const state = ensureBattleEnergyState(player);
  const [moveRow, actionRow] = buildBattleActionRows(player, pet, combatant);
  const dmgInfo = buildBattleMoveDetails(player, pet, combatant);
  const roundText = roundMessage ? `\n${roundMessage}\n` : '';
  const fighterLabel = combatant.isHuman ? `🧍 ${combatant.name}` : `🐾 ${combatant.name}`;
  const board = buildManualBattleBoard(enemy, combatant, state);

  await interaction.update({
    content:
      `⚔️ **戰鬥中：${fighterLabel} vs ${enemy.name}**\n` +
      `${board}` +
      `${roundText}\n` +
      `**招式：**\n${dmgInfo}`,
    embeds: [],
    components: [moveRow, actionRow]
  });
}

async function showTrueGameOver(interaction, user, detailText) {
  CORE.resetPlayerGame(user.id);
  const embed = new EmbedBuilder()
    .setTitle('💀 你戰死了...')
    .setColor(0xff0000)
    .setDescription(`${detailText}\n\n你的旅程就此結束...`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('choose_positive').setLabel('🔄 重新開始').setStyle(ButtonStyle.Danger)
  );
  await interaction.update({ embeds: [embed], content: null, components: [row] });
}

async function showPetDefeatedTransition(interaction, player, pet, battleDetail = '') {
  PET.markPetDefeated(pet, '戰鬥落敗');
  PET.savePet(pet);

  const remain = PET.getPetRecoveryRemainingMs(pet);
  const enemyName = player?.battleState?.enemy?.name || '敵人';
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
      `${pet.name} 在戰鬥中倒下了，將於 **${formatDurationShort(remain)}** 後復活。\n\n` +
      `你若還要硬戰，可以改由 **${player.name}** 親自上場（ATK 固定 10）。` +
      `${battleDetail ? `\n\n📜 戰況回放：\n${String(battleDetail).slice(0, 1200)}` : ''}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('battle_continue_human').setLabel('🧍 我親自上場').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('main_menu').setLabel('📖 先撤退').setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], content: null, components: [row] });
}

async function continueBattleWithHuman(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  const enemy = player?.battleState?.enemy;
  if (!player || !pet || !enemy) {
    await interaction.update({ content: '❌ 找不到可續戰的戰鬥。', components: [] });
    return;
  }

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
      `勝率預估：${estimate.rank}（約 ${estimate.winRate}%）`
  );
}

async function startManualBattle(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  if (!player || !pet) {
    await interaction.update({ content: '❌ 沒有可用招式，無法開始戰鬥。', components: [] });
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
      petState: null
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
  }
  ensureBattleEnergyState(player);
  CORE.savePlayer(player);
  await handleFight(interaction, user);
}

async function startAutoBattle(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  if (!player || !pet) {
    await interaction.update({ content: '❌ 沒有可用招式，無法開始 AI 戰鬥。', components: [] });
    return;
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
      petState: null
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
  }
  ensureBattleEnergyState(player);
  CORE.savePlayer(player);

  const enemy = player.battleState.enemy;
  const combatant = getActiveCombatant(player, pet);
  const candidateMoves = getCombatantMoves(combatant, pet);
  if (candidateMoves.length === 0) {
    await interaction.update({ content: '❌ 沒有可用招式，無法開始 AI 戰鬥。', components: [] });
    return;
  }

  const rounds = [];
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
      player?.battleState?.mentorSpar ? { nonLethal: true } : undefined
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
    advanceBattleTurnEnergy(player, energyCost);
    if (roundResult.victory !== null) {
      finalResult = roundResult;
      break;
    }
  }

  persistCombatantState(player, pet, combatant);
  PET.savePet(pet);
  CORE.savePlayer(player);

  if (finalResult?.victory === true) {
    if (player?.battleState?.mentorSpar) {
      const detail = buildAIBattleStory(rounds, combatant, enemy, finalResult);
      const mentorVictory = finalizeMentorSparVictory(player, pet, detail);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`**AI 已完成友誼賽**\n\n${detail}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: '🩸 戰後 HP', value: `${combatant.hp}/${combatant.maxHp}`, inline: true }
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
      );
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
    const battleLoot = ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50);
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `AI 自動戰鬥擊敗 ${enemy.name}`,
      outcome: `獲得 ${finalResult.gold} Rns 代幣，掉落 ${battleLoot.name}`,
      importance: 3,
      tags: ['battle', 'victory', 'ai']
    });
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你的 AI 戰鬥成功擊敗 **${enemy.name}**，獲得 ${finalResult.gold} Rns 代幣與「${battleLoot.name}」。`,
      buildAIBattleStory(rounds, combatant, enemy, finalResult),
      `你迅速整隊，準備把這場勝利帶來的連鎖影響推進到下一段冒險。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    player.battleState = null;
    player.eventChoices = [];
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle('🤖 AI戰鬥勝利！')
      .setColor(0x00cc66)
      .setDescription(`**AI 已完成自動作戰**\n\n${buildAIBattleStory(rounds, combatant, enemy, finalResult)}`)
      .addFields(
        { name: '💰 獎勵', value: `${finalResult.gold} Rns 代幣`, inline: true },
        { name: '🩸 剩餘 HP', value: `${combatant.hp}/${combatant.maxHp}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLoot.name}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
    );

    await interaction.update({ embeds: [embed], content: null, components: [row] });
    return;
  }

  if (finalResult?.victory === false || combatant.hp <= 0) {
    if (player?.battleState?.mentorSpar) {
      const detail = buildAIBattleStory(rounds, combatant, enemy, finalResult);
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, detail);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${detail}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
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
  const pet = PET.loadPet(user.id);

  if (!player || !pet) {
    await interaction.update({ content: '❌ 沒有招式！', components: [] });
    return;
  }

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
      petState: null
    };
  } else if (player.battleState.fighter !== 'player' && !CORE.canPetFight(pet)) {
    player.battleState.fighter = 'player';
    player.battleState.mode = 'manual';
    player.battleState.fleeAttempts = 0;
  }
  ensureBattleEnergyState(player);

  CORE.savePlayer(player);
  await renderManualBattle(interaction, player, pet);
}

// ============== 使用招式 ==============
async function handleUseMove(interaction, user, moveIndex) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, pet);
  const availableMoves = getCombatantMoves(combatant, pet);
  const chosenMove = availableMoves[moveIndex];

  if (!player || !pet || !enemy || !chosenMove) {
    await interaction.update({ content: '❌ 招式不存在！', components: [] });
    return;
  }
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
  const enemyMove = BATTLE.enemyChooseMove(enemy);
  const resultRaw = BATTLE.executeBattleRound(
    player,
    combatant,
    enemy,
    chosenMove,
    enemyMove,
    player?.battleState?.mentorSpar ? { nonLethal: true } : undefined
  );
  const result = maybeResolveMentorSparResult(player, enemy, resultRaw);

  persistCombatantState(player, pet, combatant);
  PET.savePet(pet);
  CORE.savePlayer(player);

  if (result.victory === true) {
    if (player?.battleState?.mentorSpar) {
      const mentorVictory = finalizeMentorSparVictory(player, pet, result.message);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`${result.message}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: t('hp'), value: `${combatant.hp}/${combatant.maxHp}`, inline: true }
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
      );
      await interaction.update({ embeds: [embed], components: [row] });
      return;
    }
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    player.stats.財富 += result.gold;
    recordCashflow(player, {
      amount: Number(result.gold || 0),
      category: 'battle_victory_manual',
      source: `手動戰鬥擊敗 ${enemy.name}`,
      marketType: 'renaiss'
    });
    const battleLoot = ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50);
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `擊敗 ${enemy.name}`,
      outcome: `獲得 ${result.gold} Rns 代幣，掉落 ${battleLoot.name}`,
      importance: 3,
      tags: ['battle', 'victory']
    });
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你擊敗了 **${enemy.name}**，取得 ${result.gold} Rns 代幣與戰利品「${battleLoot.name}」。`,
      result.message,
      `戰場餘波未散，你準備依據這次勝負帶來的新線索繼續推進。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    player.battleState = null;
    player.eventChoices = [];
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory'))
      .setColor(0x00ff00)
      .setDescription(result.message)
      .addFields(
        { name: t('gold'), value: `${result.gold}`, inline: true },
        { name: t('hp'), value: `${combatant.hp}/${combatant.maxHp}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLoot.name}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
    );
    
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  if (result.victory === false) {
    if (player?.battleState?.mentorSpar) {
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, result.message);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${result.message}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
      );
      await interaction.update({ embeds: [embed], components: [row] });
      return;
    }
    if (combatant.isHuman) {
      await showTrueGameOver(interaction, user, result.message);
      return;
    }
    await showPetDefeatedTransition(interaction, player, pet, result.message);
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
    `${result.message}\n⚡ 消耗：${chosenMove.name} -${energyCost} 能量，下一回合能量 ${next.energy}`
  );
}

async function handleBattleWait(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, pet);

  if (!player || !pet || !enemy || !combatant) {
    await interaction.update({ content: '❌ 目前不在有效戰鬥狀態。', components: [] });
    return;
  }

  const state = ensureBattleEnergyState(player);
  const beforeEnergy = state.energy;
  const enemyMove = BATTLE.enemyChooseMove(enemy);
  const resultRaw = BATTLE.executeBattleRound(
    player,
    combatant,
    enemy,
    WAIT_COMBAT_MOVE,
    enemyMove,
    player?.battleState?.mentorSpar ? { nonLethal: true } : undefined
  );
  const result = maybeResolveMentorSparResult(player, enemy, resultRaw);

  persistCombatantState(player, pet, combatant);
  PET.savePet(pet);

  if (result.victory === true) {
    if (player?.battleState?.mentorSpar) {
      const mentorVictory = finalizeMentorSparVictory(player, pet, result.message);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`${result.message}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: t('hp'), value: `${combatant.hp}/${combatant.maxHp}`, inline: true }
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
      );
      await interaction.update({ embeds: [embed], components: [row] });
      return;
    }
    player.stats.財富 += result.gold;
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    recordCashflow(player, {
      amount: Number(result.gold || 0),
      category: 'battle_victory_wait',
      source: `待機反擊擊敗 ${enemy.name}`,
      marketType: 'renaiss'
    });
    const battleLoot = ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50);
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `蓄能待機後反殺 ${enemy.name}`,
      outcome: `獲得 ${result.gold} Rns 代幣，掉落 ${battleLoot.name}`,
      importance: 3,
      tags: ['battle', 'victory', 'wait_turn']
    });
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你在蓄能待機後逆轉擊敗 **${enemy.name}**，取得 ${result.gold} Rns 代幣與戰利品「${battleLoot.name}」。`,
      result.message,
      `你把這段對戰節奏記下，準備把優勢延伸到下一段冒險。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    player.battleState = null;
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory'))
      .setColor(0x00ff00)
      .setDescription(`${result.message}${kingProgressLine ? `\n\n${kingProgressLine}` : ''}`)
      .addFields(
        { name: t('gold'), value: `${result.gold}`, inline: true },
        { name: t('hp'), value: `${combatant.hp}/${combatant.maxHp}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLoot.name}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
    );
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  if (result.victory === false || combatant.hp <= 0) {
    if (player?.battleState?.mentorSpar) {
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, result.message || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${result.message || ''}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`.trim());
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
      );
      await interaction.update({ embeds: [embed], components: [row] });
      return;
    }
    CORE.savePlayer(player);
    if (combatant.isHuman) {
      player.battleState = null;
      CORE.savePlayer(player);
      await showTrueGameOver(interaction, user, result.message || `💀 你在蓄能時被 ${enemy.name} 擊倒...`);
      return;
    }
    await showPetDefeatedTransition(interaction, player, pet, result.message || `⚡ 你在蓄能待機時被 ${enemy.name} 擊倒。`);
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
    `${result.message}\n⚡ 能量 ${beforeEnergy} → ${next.energy}（+2）`
  );
}

// ============== 逃跑 ==============
async function handleFlee(interaction, user, attemptNum) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, pet);

  if (!player || !pet || !enemy) {
    await interaction.update({ content: '❌ 目前不在戰鬥狀態。', components: [] });
    return;
  }

  const currentAttempt = (player.battleState.fleeAttempts || 0) + 1;
  const result = BATTLE.attemptFlee(player, pet, enemy, currentAttempt, combatant);

  if (result.blocked) {
    persistCombatantState(player, pet, combatant);
    PET.savePet(pet);
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
    player.battleState = null;
    rememberPlayer(player, {
      type: '戰鬥',
      content: `從 ${enemy.name} 戰鬥中撤退`,
      outcome: `第 ${currentAttempt} 次逃跑成功`,
      importance: 2,
      tags: ['battle', 'flee_success']
    });
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle('🏃 逃跑成功！')
      .setColor(0x00ff00)
      .setDescription(result.message);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
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
CLIENT.login(CONFIG.DISCORD_TOKEN).catch(err => {
  console.error('[Bot]', err.message);
});

console.log('[Renaiss World] 🌟 系統啟動中...');
