// Renaiss World Discord Bot v5
/**
 * 🌟 Renaiss World - Discord Bot v5
 * Renaiss星球 - 寵物對戰 RPG
 * 完整版本：無死路、隨機抽招、設置/角色按鈕
 */

const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { setupWorldStorage } = require('./storage-paths');

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

const STORAGE = setupWorldStorage();
const DATA_DIR = STORAGE.dataDir;
const PLAYER_THREADS_FILE = path.join(DATA_DIR, 'player_threads.json');

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
const { startWorldBackupScheduler } = require('./world-backup');
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
    gold: 'Rns'
  }
};

function t(key) {
  return TEXT[CONFIG.LANGUAGE]?.[key] || TEXT['zh-TW'][key] || key;
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
  await interaction.message?.edit({ components: [] }).catch(() => {});
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
const CHOICE_POOL_COUNT = 7;
const CHOICE_DISPLAY_COUNT = 5;
const BATTLE_ESTIMATE_SIMULATIONS = Math.max(20, Math.min(500, Number(process.env.BATTLE_ESTIMATE_SIMULATIONS || 100)));
const BATTLE_ESTIMATE_MAX_TURNS = 16;
const CUSTOM_INPUT_OPTION_RATE = Math.max(0, Math.min(1, Number(process.env.CUSTOM_INPUT_OPTION_RATE || 0.01)));
const CUSTOM_INPUT_MAX_LENGTH = 120;
const EARLY_GAME_GOLD_GUARANTEE_TURNS = Math.max(1, Math.min(10, Number(process.env.EARLY_GAME_GOLD_GUARANTEE_TURNS || 5)));
const STARTER_FIVE_PULL_COUNT = 5;
const GENERATION_HISTORY_LIMIT = Math.max(5, Math.min(100, Number(process.env.GENERATION_HISTORY_LIMIT || 20)));
const RISK_CATEGORY_WEIGHTS = Object.freeze({
  high_risk: 10,
  spend: 10,
  social: 20,
  explore: 20,
  combat: 20,
  high_reward: 10,
  surprise: 10,
  unknown: 10
});

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
  if (String(choice.action || '') === 'fight') return true;
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
  if (String(choice.action || '') === 'fight') return true;
  const text = [
    choice.tag || '',
    choice.name || '',
    choice.choice || '',
    choice.desc || ''
  ].join(' ');
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
  if (action === 'fight') return 'combat';
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

function normalizeEventChoices(choices = []) {
  const pool = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_POOL_COUNT) : [];
  if (pool.length <= CHOICE_DISPLAY_COUNT) return pool;
  const grouped = new Map();
  for (const choice of pool) {
    const category = getChoiceRiskCategory(choice);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(choice);
  }

  const selected = [];
  const maxPick = Math.min(CHOICE_DISPLAY_COUNT, pool.length);
  while (selected.length < maxPick) {
    const availableEntries = Array.from(grouped.entries()).filter(([_, list]) => Array.isArray(list) && list.length > 0);
    if (availableEntries.length === 0) break;
    const pickedCategory = pickWeightedKey(
      availableEntries.map(([category]) => [category, RISK_CATEGORY_WEIGHTS[category] ?? RISK_CATEGORY_WEIGHTS.unknown])
    );
    if (!pickedCategory || !grouped.has(pickedCategory)) break;
    const bucket = grouped.get(pickedCategory);
    const idx = Math.floor(Math.random() * bucket.length);
    const [choice] = bucket.splice(idx, 1);
    if (choice) selected.push(choice);
  }

  if (selected.length >= maxPick) return selected.slice(0, maxPick);

  const fallback = pool.filter(choice => !selected.includes(choice));
  selected.push(...chooseRandomUnique(fallback, maxPick - selected.length));
  return selected.slice(0, maxPick);
}

function getPlayerStoryTurns(player) {
  const turns = Number(player?.storyTurns || 0);
  return Number.isFinite(turns) ? Math.max(0, Math.floor(turns)) : 0;
}

function incrementPlayerStoryTurns(player, amount = 1) {
  if (!player || typeof player !== 'object') return 0;
  const next = getPlayerStoryTurns(player) + Math.max(0, Number(amount) || 0);
  player.storyTurns = next;
  return next;
}

function isGoldMakingChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  const action = String(choice.action || '');
  if (['fight', 'forage', 'hunt', 'treasure', 'market_renaiss', 'market_digital', 'scratch_lottery'].includes(action)) {
    return true;
  }
  const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
  return /(Rns|金幣|賺錢|收入|鑑價|交易|戰利品|寶藏|採集|狩獵|刮刮樂|中獎)/i.test(text);
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
  return isImmediateBattleChoice(event);
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
    ? Math.max(4, Math.floor(baseAttack * 0.28))
    : Math.max(8, Math.floor(baseAttack * 0.42));
  const petHp = newbieZone
    ? Math.max(18, Math.floor(baseHp * 0.3))
    : Math.max(30, Math.floor(baseHp * 0.45));

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
  const atkGain = Math.max(1, Math.floor(npcPet.attack * (newbieZone ? 0.35 : 0.55)));
  const hpGain = Math.max(1, Math.floor(npcPet.maxHp * (newbieZone ? 0.25 : 0.4)));
  const defGain = Math.max(1, Math.floor(npcPet.attack * (newbieZone ? 0.06 : 0.12)));

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
  if (difficulty <= 1) return ['哥布林'];
  if (difficulty === 2) return ['哥布林', '哥布林', '狼人', '巫師學徒'];
  if (difficulty === 3) return ['狼人', '巫師學徒'];
  if (difficulty === 4) return ['巫師學徒', '殭屍'];
  return ['殭屍'];
}

function getBattleEnemyName(event, result, player = null, options = {}) {
  const explicit = result?.enemy?.name || event?.enemy?.name;
  if (explicit) return explicit;
  const fallback = pickFallbackEnemyNamesByDifficulty(player);
  if (options?.deterministicFallback) return fallback[0];
  return fallback[Math.floor(Math.random() * fallback.length)];
}

function applyBeginnerZoneEnemyBalance(enemy, player) {
  if (!enemy || !player) return enemy;
  const difficulty = getLocationDifficultyForPlayer(player);
  const playerLevel = Math.max(1, Number(player?.level || 1));
  if (difficulty > 2 || playerLevel > 6) return enemy;

  // 新手區維持 80~90% 左右可勝率，但避免過度簡單
  const hpScale = difficulty <= 1 ? 0.8 : 0.88;
  const atkScale = difficulty <= 1 ? 0.76 : 0.84;
  const defScale = difficulty <= 1 ? 0.82 : 0.9;
  const minHp = Math.max(20, 26 + playerLevel * 8);
  const minAtk = Math.max(6, 9 + playerLevel * 2);

  const scaledHp = Math.max(minHp, Math.floor((enemy.hp || 1) * hpScale));
  enemy.hp = scaledHp;
  enemy.maxHp = Math.max(scaledHp, Math.floor((enemy.maxHp || scaledHp) * hpScale));
  enemy.attack = Math.max(minAtk, Math.floor((enemy.attack || 1) * atkScale));
  enemy.defense = Math.max(1, Math.floor((enemy.defense || 0) * defScale));
  enemy.beginnerBalanced = true;
  return enemy;
}

function applyBeginnerZoneDangerVariant(enemy, player) {
  if (!enemy || !player) return enemy;
  const difficulty = getLocationDifficultyForPlayer(player);
  const playerLevel = Math.max(1, Number(player?.level || 1));
  if (difficulty > 2 || playerLevel > 8) return enemy;
  if (Math.random() > 0.2) return enemy; // 約 20% 出現偏強敵

  const powerScale = difficulty <= 1 ? 1.15 : 1.2;
  enemy.hp = Math.max(1, Math.floor((enemy.hp || 1) * powerScale));
  enemy.maxHp = Math.max(enemy.hp, Math.floor((enemy.maxHp || enemy.hp || 1) * powerScale));
  enemy.attack = Math.max(1, Math.floor((enemy.attack || 1) * (powerScale + 0.04)));
  enemy.defense = Math.max(1, Math.floor((enemy.defense || 1) * (powerScale - 0.02)));
  enemy.beginnerDanger = true;
  return enemy;
}

function buildEnemyForBattle(event, result, player, options = {}) {
  const level = Math.max(1, player?.level || 1);
  const base = BATTLE.createEnemy(getBattleEnemyName(event, result, player, options), level);
  const sourceEnemy = result?.enemy || event?.enemy || {};
  const enemyName = sourceEnemy.name || base.name;
  const resolvedIsMonster = resolveEnemyIsMonster(sourceEnemy, enemyName);
  const hp = sourceEnemy.hp || sourceEnemy.maxHp || base.hp;
  const reward = sourceEnemy.reward || base.reward || { gold: [20, 40] };
  const rewardGold = Array.isArray(reward.gold) ? reward.gold : [20, 40];
  const enemy = {
    ...base,
    ...sourceEnemy,
    id: sourceEnemy.id || sourceEnemy.name || base.name,
    name: sourceEnemy.name || base.name,
    hp: hp,
    maxHp: sourceEnemy.maxHp || hp,
    attack: sourceEnemy.attack || base.attack,
    defense: sourceEnemy.defense ?? base.defense,
    moves: sourceEnemy.moves || base.moves,
    reward: { ...reward, gold: rewardGold },
    isMonster: resolvedIsMonster,
    companionPet: sourceEnemy.companionPet
  };
  applyNpcCompanionPet(enemy, player);
  applyBeginnerZoneEnemyBalance(enemy, player);
  applyBeginnerZoneDangerVariant(enemy, player);
  return enemy;
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

function getMergedWorldEvents(limit = 3) {
  const targetLimit = Math.max(1, Number(limit) || 3);
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
  const hints = [];
  if (status?.orderHere) hints.push('正派巡行隊在此活動');
  if (status?.chaosHere) hints.push('Digital 斥候在此活動');
  if (hints.length === 0) return '目前無明確勢力目擊';
  return hints.join('；');
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

function getCombatantMoves(combatant, pet) {
  if (!combatant) return [];
  if (combatant.isHuman) return [HUMAN_COMBAT_MOVE];
  return (pet?.moves || []).filter(m => !(m?.effect && m.effect.flee));
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

function saveMapReturnSnapshot(player, message) {
  if (!player || !message) return;
  const embeds = Array.isArray(message.embeds) ? message.embeds.map(e => e.toJSON()) : [];
  const components = Array.isArray(message.components) ? message.components.map(r => r.toJSON()) : [];
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

function buildPortalUsageGuide(player) {
  const destinations = typeof getPortalDestinations === 'function'
    ? getPortalDestinations(player?.location || '')
    : [];
  const preview = destinations.length > 0 ? destinations.slice(0, 3).join('、') : '未知';
  return `🌀 **傳送門操作：** 先按「🗺️ 地圖」→ 再按「🌀 傳送門」→ 選目的地（如：${preview}）。`;
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

function buildMapComponents(page, currentLocation, canOpenPortal = false) {
  const maxPage = Math.max(0, Math.ceil(MAP_LOCATIONS.length / MAP_PAGE_SIZE) - 1);
  const safePage = Math.max(0, Math.min(page, maxPage));
  const start = safePage * MAP_PAGE_SIZE;
  const pageLocations = MAP_LOCATIONS.slice(start, start + MAP_PAGE_SIZE);

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
  const { rows, safePage, maxPage, pageLocations } = buildMapComponents(page, player.location, canOpenPortal);
  const renderedMap = typeof buildIslandMapAnsi === 'function'
    ? buildIslandMapAnsi(player.location)
    : ISLAND_MAP_TEXT;
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
    const nearby = Array.isArray(profile?.nearby) && profile.nearby.length > 0
      ? profile.nearby.slice(0, 2).join('、')
      : '未知';
    return `• ${loc}（${region}｜D${difficulty}）附近：${nearby}`;
  }).join('\n');
  const mapDesc =
    '```ansi\n' + renderedMap + '\n```' +
    `\n**目前位置：** @ ${player.location || '未知'}` +
    `\n**區域難度：** ${currentProfile ? `D${currentProfile.difficulty}` : '未知'}` +
    (locationContext ? `\n**當前地區情報：** ${locationContext}` : '') +
    `\n**地圖頁數：** ${safePage + 1}/${maxPage + 1}` +
    (pageSummary ? `\n\n**本頁地區情報**\n${pageSummary}` : '') +
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
      '你身在 Renaiss 海域，這裡同時被「秩序市場 Renaiss」與「混亂市場 Digital」拉扯。',
      '這是開放世界，沒有固定主線按鈕；你的行動會被動觸發章節、流言、戰爭與終局分歧。',
      '你能培養夥伴、解鎖技能模組、追逐財富，也可能被暗網獵手與高階頭目盯上。',
      '世界會記住你做過的事，並把影響擴散到其他玩家可見的傳聞中。'
    ].join('\n'),
    'zh-CN': [
      '你身在 Renaiss 海域，这里同时被「秩序市场 Renaiss」与「混乱市场 Digital」拉扯。',
      '这是开放世界，没有固定主线按钮；你的行动会被动触发章节、流言、战争与终局分歧。',
      '你能培养伙伴、解锁技能模组、追逐财富，也可能被暗网猎手与高阶头目盯上。',
      '世界会记住你做过的事，并把影响扩散到其他玩家可见的传闻中。'
    ].join('\n'),
    'en': [
      'You are in the Renaiss Sea, pulled between the Order Market (Renaiss) and the Chaos Market (Digital).',
      'This is an open world with no fixed main-story button; your actions passively trigger chapters, rumors, wars, and endings.',
      'You can raise partners, unlock skill modules, chase wealth, and still be hunted by darknet hunters and elite bosses.',
      'The world remembers what you do, then spreads those consequences as public rumors.'
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
  
  // 創建新 thread
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
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;
  
  const { customId, user } = interaction;

  if (await rejectIfNotLatestThread(interaction, user.id)) {
    return;
  }

  // 全域防重複點擊：按到按鈕就先把該訊息按鈕鎖住
  if (interaction.isButton()) {
    await lockPressedButtonImmediately(interaction);
  }
  
  // ===== 錢包 Modal 按鈕 =====
  if (customId === 'open_wallet_modal') {
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
    const player = CORE.loadPlayer(user.id);
    if (player && interaction.message) {
      saveMapReturnSnapshot(player, interaction.message);
    }
    await showIslandMap(interaction, user, 0);
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
    if (snapshot) {
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
        `🎁 目前 RNS: ${assets.rns}\n` +
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
        `🎁 目前 RNS: ${assets.rns}\n` +
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
      .setDescription(`**${user.username}**，你的初始資產已確認！\n\n💰 **初始 RNS：${initialRns}**\n\n在這個世界，你需要：\n• 選擇你的流派（正派/機變派）\n• 培養你的寵物\n• 探索世界、戰鬥、任務\n\n**請選擇你的流派：**`)
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
  const portalGuideBlock = player?.portalMenuOpen ? `\n\n${buildPortalUsageGuide(player)}` : '';

  // 如果沒有暂存的事件選項，才生成新的（防止刷選項）
  // ============================================================
  //  continuity 維護：有 story+choices 就直接顯示，不重新生成
  // ============================================================
  if (player.currentStory && player.eventChoices && player.eventChoices.length > 0) {
    // 直接顯示上次的故事 + 選項（不做任何 AI 呼叫）
    let persisted = false;
    const choices = ensureEarlyGameIncomeChoice(player, normalizeEventChoices(player.eventChoices));
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
    const statusBar = `氣血 ${pet.hp}/${pet.maxHp} | 能量 ${player.stats.內力 || 10}/${player.maxStats.內力 || 10} | 飽腹度 ${player.stats.飽腹度} | Rns ${player.stats.財富} | ${player.location}`;
    
    const optionsText = buildChoiceOptionsText(choices, { player, pet });
    
    const description = `${worldIntroBlock}**狀態：【${statusBar}】**\n\n${storyText}${portalGuideBlock}\n\n**🆕 選項：**${optionsText}\n\n_請選擇編號（1-${CHOICE_DISPLAY_COUNT}）_`;
    
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${player.name} - ${pet.name}`)
      .setColor(getAlignmentColor(player.alignment))
      .setDescription(description)
      .addFields(
        { name: '🐾 寵物', value: `${pet.name} (${pet.type})`, inline: true },
        { name: '⚔️ 氣血', value: `${pet.hp}/${pet.maxHp}`, inline: true },
        { name: '💰 Rns', value: String(player.stats.財富), inline: true }
      )
      .addFields(
        { name: '📍 位置', value: player.location, inline: true },
        { name: '🌟 幸運', value: String(player.stats.運氣), inline: true },
        { name: '📊 等級', value: String(player.level), inline: true }
      );
    
    const buttons = buildEventChoiceButtons(choices);
    buttons.push(
      new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('show_moves').setLabel('📜').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_character').setLabel('👤').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_profile').setLabel('💳').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_gacha').setLabel('🎰').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_map').setLabel('🗺️').setStyle(ButtonStyle.Secondary)
    );
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
  const statusBar = `氣血 ${pet.hp}/${pet.maxHp} | 能量 ${player.stats.內力 || 10}/${player.maxStats.內力 || 10} | 飽腹度 ${player.stats.飽腹度} | Rns ${player.stats.財富} | ${player.location}`;

  // 先用 Loading 訊息回覆（先故事、後選項）
  const loadingHint = hasRecoverableStoryOnly
    ? 'AI 說書人正在補齊上次中斷的選項...'
    : 'AI 說書人正在構思故事...';
  const loadingDesc = `${worldIntroBlock}**狀態：【${statusBar}】**\n\n⏳ *${loadingHint}*${portalGuideBlock}`;
  
  const loadingEmbed = new EmbedBuilder()
    .setTitle(`⚔️ ${player.name} - ${pet.name}`)
    .setColor(0x00ff00)
    .setDescription(loadingDesc);
  
  // 構建按鈕
  const buttons = [];
  buttons.push(
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_moves').setLabel('📜').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_character').setLabel('👤').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_profile').setLabel('💳').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_gacha').setLabel('🎰').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_map').setLabel('🗺️').setStyle(ButtonStyle.Secondary)
  );
  
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
        const memoryQueryText = [
          `玩家:${player.name || ''}`,
          `地點:${player.location || ''}`,
          `勢力目擊:${getFactionPresenceHintForPlayer(player)}`,
          `前情:${player.currentStory || ''}`
        ].join('\n');
        memoryContext = await CORE.getPlayerMemoryContextAsync(player.id, {
          location: player.location,
          queryText: memoryQueryText,
          topK: 6
        });
        const npcMemoryContext = await CORE.getNearbyNpcMemoryContextAsync(player.id, {
          location: player.location,
          queryText: memoryQueryText,
          limit: 1,
          topKPrivate: 3,
          topKPublic: 2,
          maxChars: 900
        });
        if (npcMemoryContext) {
          memoryContext = [memoryContext, npcMemoryContext].filter(Boolean).join('\n\n');
        }
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
        `${worldIntroBlock}**狀態：【${statusBar}】**\n\n${storyText}${portalGuideBlock}\n\n` +
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

      const normalizedNewChoices = ensureEarlyGameIncomeChoice(
        player,
        maybeInjectRareCustomInputChoice(normalizeEventChoices(newChoices))
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
      newButtons.push(
        new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('show_moves').setLabel('📜').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('open_character').setLabel('👤').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('open_profile').setLabel('💳').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('open_gacha').setLabel('🎰').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('open_map').setLabel('🗺️').setStyle(ButtonStyle.Secondary)
      );

      const newComponents = [];
      for (let i = 0; i < newButtons.length; i += 5) {
        newComponents.push(new ActionRowBuilder().addComponents(newButtons.slice(i, i + 5)));
      }

      const aiDesc = `${worldIntroBlock}**狀態：【${statusBar}】**\n\n${storyText}${portalGuideBlock}\n\n**🆕 新選項：**${newOptionsText}\n\n_請選擇編號（1-${CHOICE_DISPLAY_COUNT}）_`;

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
    .setDescription('遊戲設置')
    .addFields(
      { name: '🌐 語言 / Language', value: `目前：${langName}`, inline: false },
      { name: '💳 錢包', value: walletStatus, inline: false }
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
      { name: '💰 現金 Rns', value: String(profile.rns), inline: true },
      { name: '📊 總資產', value: String(profile.totalAssets), inline: true },
      { name: '⭐ 升級點數', value: `${profile.upgradePoints} 點 (每點+${gachaConfig.hpPerPoint}HP)`, inline: true }
    )
    .addFields(
      { name: '📦 已開包數', value: `${profile.totalDraws} 包`, inline: true },
      { name: '🐾 寵物', value: String(profile.currentPets), inline: true },
      { name: '📍 位置', value: player.location, inline: true }
    )
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
    .setDescription('花費 Rns 抽招式！')
    .addFields(
      { name: '💰 單抽', value: `${config.singleCost} Rns (1包)`, inline: true },
      { name: '💰 十連', value: `${config.tenPullCost} Rns (10包)`, inline: true },
      { name: '⭐ 升級點數', value: `${profile.upgradePoints} 點`, inline: true }
    )
    .addFields(
      { name: '📊 已開包數', value: `${profile.totalDraws} 包`, inline: true },
      { name: '💡 每點可換', value: `${config.hpPerPoint} HP`, inline: true }
    )
    .addFields({ name: '💡 說明', value: '每開1包 = 1升級點數\n每點 = 0.2 HP（可分配給不同寵物）\n可分配給任何寵物，用完就沒了', inline: false });
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gacha_single').setLabel(`單抽 (${config.singleCost} Rns)`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('gacha_ten').setLabel(`十連 (${config.tenPullCost} Rns)`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('main_menu').setLabel('返回').setStyle(ButtonStyle.Secondary)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
}

// ============== 處理扭蛋結果 ==============
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
  
  const resultsText = result.draws.map((r, i) => 
    `${i + 1}. ${r.tierEmoji} **${r.move.name}** (${r.tierName}) - ${r.move.desc}`
  ).join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle(`🎰 開包結果 x${count}`)
    .setColor(0xffd700)
    .setDescription(`💰 花費 ${result.cost} Rns\n\n**開到以下招式：**\n${resultsText}\n\n**總價值：${result.totalValue} Rns**\n**⭐ 獲得升級點數：+${result.earnedPoints} 點**\n**📊 已開包數：${result.totalDraws} 包**`)
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
    await interaction.update({ content: `❌ ${result.reason}`, components: [] });
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
      { name: t('gold'), value: String(player.stats.財富), inline: true }
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
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back')).setStyle(ButtonStyle.Primary)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
}

function describeMoveEffects(effect = {}) {
  if (!effect || typeof effect !== 'object') return '無效果';
  const notes = [];
  if (effect.burn) notes.push(`灼燒${effect.burn}回（每回約22%持續傷害）`);
  if (effect.poison) notes.push(`中毒${effect.poison}回（每回約16%持續傷害）`);
  if (effect.trap) notes.push(`陷阱${effect.trap}回（每回約18%持續傷害）`);
  if (effect.bleed) notes.push(`流血${effect.bleed}回（每回約24%持續傷害）`);
  if (effect.dot) notes.push(`持續干擾（2回，每回${effect.dot}）`);
  if (effect.stun) notes.push(`暈眩${effect.stun}回（無法行動）`);
  if (effect.freeze) notes.push(`凍結${effect.freeze}回（無法行動）`);
  if (effect.bind) notes.push(`束縛${effect.bind}回（無法逃跑）`);
  if (effect.slow) notes.push(`緩速${effect.slow}回（輸出-20%）`);
  if (effect.fear) notes.push(`恐懼${effect.fear}回（約28%失手）`);
  if (effect.confuse) notes.push(`混亂${effect.confuse}回（約30%失手且自傷）`);
  if (effect.blind) notes.push(`致盲${effect.blind}回（約35%失手）`);
  if (effect.missNext) notes.push(`使對手下次攻擊落空`);
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
async function showMovesList(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  
  if (!pet) {
    await interaction.update({ content: '❌ 沒有寵物！', components: [] });
    return;
  }
  
  // 只顯示已解鎖的招式
  const unlockedMoves = pet.moves.map((m, i) => {
    const dmg = BATTLE.calculatePlayerMoveDamage(m, {}, pet);
    const energyCost = BATTLE.getMoveEnergyCost(m);
    
    // 等級標示
    const tierEmoji = m.tier === 3 ? '🔮' : m.tier === 2 ? '💠' : '⚪';
    const tierName = m.tier === 3 ? '史詩' : m.tier === 2 ? '稀有' : '普通';
    
    const effectStr = describeMoveEffects(m.effect || {});
    
    return `${tierEmoji} ${i+1}. **${m.name}** (${m.element}/${tierName})\n   💥 ${dmg.total}dmg | ⚡${energyCost} | ${effectStr || '無效果'}`;
  }).join('\n\n');
  
  const embed = new EmbedBuilder()
    .setTitle(`📜 ${pet.name} 的招式`)
    .setColor(pet.type === '正派' ? 0x00ff00 : 0xff0000)
    .setDescription(`**${pet.type} - 已解鎖招式 ${pet.moves.length} 個**`)
    .addFields({ name: '招式列表', value: unlockedMoves, inline: false });
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back')).setStyle(ButtonStyle.Primary)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
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
    ? tradeGoods.slice(0, 10).map((g, i) => `${i + 1}. ${g.name}（${g.rarity || '普通'}｜${Number(g.value || 0)} Rns）`).join('\n')
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
    .addFields({ name: t('gold'), value: `${player.stats.財富} Rns`, inline: false });
  
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
    const scratch = ECON.playScratchLottery(player);
    result = {
      type: 'scratch_lottery',
      message: `${scratch.message}\n💰 目前獎池：${Number(scratch.jackpotPool || 0)} Rns`,
      gold: scratch.win ? Number(scratch.reward || 0) : 0,
      scratchWin: Boolean(scratch.win),
      scratchCost: Number(scratch.cost || 0),
      scratchNet: Number(scratch.net || 0),
      scratchJackpot: Number(scratch.jackpotPool || 0),
      skipGoldApply: true
    };
    queueMemory({
      type: '經濟',
      content: `小賣部刮刮樂（投入 ${scratch.cost || 100} Rns）`,
      outcome: scratch.win
        ? `中獎 ${scratch.reward || 0} Rns｜淨 ${scratch.net >= 0 ? '+' : ''}${scratch.net}`
        : `未中獎｜獎池 ${scratch.jackpotPool || 0} Rns`,
      importance: scratch.win ? 2 : 1,
      tags: ['scratch_lottery', scratch.win ? 'win' : 'lose']
    });
  } else if (event.action === 'market_renaiss' || event.action === 'market_digital') {
    const marketType = event.action === 'market_digital' ? 'digital' : 'renaiss';
    const sellResult = await ECON.sellPlayerAtMarket(player, marketType, { worldDay });
    result = {
      type: marketType === 'digital' ? 'market_digital' : 'market_renaiss',
      message: sellResult.message,
      gold: sellResult.totalGold,
      soldCount: sellResult.soldCount,
      marketType,
      npcName: sellResult.npcName,
      avgRate: sellResult.avgRate,
      historyRecall: sellResult.historyRecall,
      digitalRiskScore: sellResult.digitalRiskScore,
      digitalRiskDelta: sellResult.digitalRiskDelta,
      riskHint: sellResult.riskHint,
      skipGoldApply: true
    };
    const digitalRiskText = marketType === 'digital'
      ? `，Digital 詐價風險提示累積值 ${Number(sellResult.digitalRiskScore || 0)}/100（+${Number(sellResult.digitalRiskDelta || 0)}）`
      : '';
    queueMemory({
      type: '交易',
      content: selectedChoice,
      outcome: `售出 ${sellResult.soldCount} 件，結算 ${sellResult.totalGold} Rns${digitalRiskText}`,
      importance: 2,
      tags: ['market', marketType]
    });
    CORE.appendNpcMemory(sellResult.npcName, user.id, {
      type: '交易',
      content: `${player.name} 在${player.location}出售 ${sellResult.soldCount} 件物資`,
      outcome: `結算 ${sellResult.totalGold} Rns`,
      location: player.location,
      tags: ['market', marketType, 'private'],
      importance: marketType === 'digital' ? 3 : 2
    }, { scope: 'private' });
    CORE.appendNpcMemory(sellResult.npcName, user.id, {
      type: '市場見聞',
      content: `${player.location}有玩家完成一筆市場交易`,
      outcome: `${sellResult.soldCount} 件貨物流通`,
      location: player.location,
      tags: ['market', marketType, 'public_event'],
      importance: 1
    }, { scope: 'public' });
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
  } else {
    result = EVENTS.executeEvent(event, player);
    queueMemory({
      type: event.tag ? '行動' : '選擇',
      content: selectedChoice,
      tags: [String(event.action || ''), String(result?.type || '')].filter(Boolean)
    });

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
    }
    const cost = Number(result.cost || 0);
    if (Number.isFinite(cost) && cost > 0) {
      player.stats.財富 = Math.max(0, Number(player.stats.財富 || 0) - cost);
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
      const lootText = `🧰 你取得可交易物：${tradeGood.name}（${tradeGood.rarity}），鑑價參考 ${tradeGood.value} Rns。`;
      result.message = result.message ? `${result.message}\n\n${lootText}` : lootText;
      queueMemory({
        type: '戰利品',
        content: tradeGood.name,
        outcome: `${tradeGood.rarity}｜估值 ${tradeGood.value} Rns`,
        importance: 2,
        tags: ['loot', String(tradeGood.category || 'goods')]
      });
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

  const outcomeParts = [];
  if (result?.type) outcomeParts.push(`類型:${result.type}`);
  if (Number.isFinite(Number(result?.gold)) && Number(result.gold) !== 0) {
    outcomeParts.push(`Rns ${Number(result.gold) > 0 ? '+' : ''}${Number(result.gold)}`);
  }
  if (result?.wantedLevel) outcomeParts.push(`通緝 ${result.wantedLevel}`);
  if (result?.loot?.name) outcomeParts.push(`掉落:${result.loot.name}`);
  if (Number.isFinite(Number(result?.digitalRiskScore))) {
    const score = Number(result.digitalRiskScore);
    const delta = Number(result.digitalRiskDelta || 0);
    outcomeParts.push(`Digital風險 ${score}/100${delta > 0 ? `(+${delta})` : ''}`);
  }
  if (result?.type === 'combat') {
    const enemyName = result?.enemy?.name || event?.enemy?.name || '未知敵人';
    outcomeParts.push(`遭遇:${enemyName}`);
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
  
  // 清除舊選項（必須重新生成）
  player.eventChoices = [];
  
  if (shouldTriggerBattle(event, result)) {
    const enemy = buildEnemyForBattle(event, result, player);
    const fighterType = CORE.canPetFight(pet) ? 'pet' : 'player';
    const battleEstimate = estimateBattleOutcome(player, pet, enemy, fighterType);
    const fighterLabel = fighterType === 'pet'
      ? `🐾 ${pet.name}`
      : `🧍 ${player.name}(ATK 10)`;
    const enemyPetLine = enemy?.npcPet
      ? `🐾 對手寵物：${enemy.npcPet.name}（ATK ${enemy.npcPet.attack}${enemy.npcPet.newbieScaled ? '｜新手區弱化' : ''}）\n`
      : '';
    const beginnerGuardText = enemy.beginnerBalanced
      ? '🛡️ 新手區保護：本場敵人能力已下修\n'
      : '';
    const beginnerDangerText = enemy.beginnerDanger
      ? '⚠️ 危險提示：這是新手區中的偏強敵，建議先評估勝率再決定是否開戰。\n'
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
      humanState: null,
      petState: null
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
    const memoryQueryText = [
      `剛選擇:${selectedChoice}`,
      `當前地點:${player.location || ''}`,
      `勢力目擊:${getFactionPresenceHintForPlayer(player)}`,
      `前一段故事:${player.currentStory || ''}`
    ].join('\n');
    memoryContext = await CORE.getPlayerMemoryContextAsync(user.id, {
      location: player.location,
      previousChoice: selectedChoice,
      previousStory: player.currentStory || '',
      queryText: memoryQueryText,
      topK: 8
    });
    const npcMemoryContext = await CORE.getNearbyNpcMemoryContextAsync(user.id, {
      location: player.location,
      queryText: memoryQueryText,
      limit: 1,
      topKPrivate: 3,
      topKPublic: 2,
      maxChars: 980
    });
    if (npcMemoryContext) {
      memoryContext = [memoryContext, npcMemoryContext].filter(Boolean).join('\n\n');
    }
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
  
  const statusBar = `氣血 ${pet.hp}/${pet.maxHp} | 能量 ${player.stats.內力 || 10}/${player.maxStats.內力 || 10} | 飽腹度 ${player.stats.飽腹度} | Rns ${player.stats.財富} | ${player.location}`;
  
  // 立即確認按鈕（避免 Discord 顯示失敗）
  await interaction.deferUpdate().catch(() => {});
  
  // 發送一個「AI 正在思考」的訊息（帶上舊 story，讓 continuity 明顯）
  // choices 變數在 eventChoices 清除前就 capture 了，所以仍有效
  const prevStory = player.currentStory || '(故事載入中...)';
  const prevOptionsText = buildChoiceOptionsText(normalizeEventChoices(choices), { player, pet });

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
      const storyText = await STORY.generateStory(event, player, pet, event, memoryContext);
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
      if (result.gold) rewardText.push(`💰 +${result.gold} Rns`);
      if (result.wantedLevel) rewardText.push(`⚠️ 通緝等级: ${result.wantedLevel}`);
      if (result.soldCount > 0) rewardText.push(`🏪 已售出 ${result.soldCount} 件`);
      if (result.item && result.success) rewardText.push(`📦 取得 ${result.item}`);
      if (result.loot?.name) rewardText.push(`🧰 ${result.loot.name}（${result.loot.rarity || '普通'}）`);
      if (Number.isFinite(Number(result.digitalRiskScore))) {
        const score = Number(result.digitalRiskScore);
        const delta = Number(result.digitalRiskDelta || 0);
        rewardText.push(`🧠 Digital 詐價風險提示累積值 ${score}/100${delta > 0 ? `（+${delta}）` : ''}`);
      }

      const worldEvents = getMergedWorldEvents(3);
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
          { name: '💰 Rns', value: String(player.stats.財富), inline: true }
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

      player.eventChoices = ensureEarlyGameIncomeChoice(
        player,
        maybeInjectRareCustomInputChoice(normalizeEventChoices(aiChoices))
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
          { name: '💰 Rns', value: String(player.stats.財富), inline: true }
        );

      const buttons = buildEventChoiceButtons(newChoices);
      buttons.push(
        new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('show_moves').setLabel('📜').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('open_character').setLabel('👤').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('open_profile').setLabel('💳').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('open_gacha').setLabel('🎰').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('open_map').setLabel('🗺️').setStyle(ButtonStyle.Secondary)
      );

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
    const effectStr = describeMoveEffects(m.effect || {});
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
    .slice(0, 4);

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

  if (finalResult?.message) {
    lines.push(`**終局：** ${finalResult.message}`);
  }
  return lines.join('\n\n');
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
  const roundText = roundMessage ? `\n\n${roundMessage}\n` : '\n';
  const fighterLabel = combatant.isHuman ? `🧍 ${combatant.name}` : `🐾 ${combatant.name}`;

  await interaction.update({
    content:
      `⚔️ **戰鬥中：${fighterLabel} vs ${enemy.name}**${roundText}\n` +
      `回合：${state.turn} | ⚡ 能量：${state.energy}（每回合 +2，可結轉）\n` +
      `敵人 HP: ${enemy.hp}/${enemy.maxHp} | ATK: ${enemy.attack}\n` +
      `你的 ${combatant.name} HP: ${combatant.hp}/${combatant.maxHp}\n\n` +
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
    const roundResult = BATTLE.executeBattleRound(player, combatant, enemy, selectedMove, enemyMove);
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
    player.stats.財富 += finalResult.gold;
    const battleLoot = ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50);
    ECON.addTradeGood(player, battleLoot);
    player.battleState = null;
    rememberPlayer(player, {
      type: '戰鬥',
      content: `AI 自動戰鬥擊敗 ${enemy.name}`,
      outcome: `獲得 ${finalResult.gold} Rns，掉落 ${battleLoot.name}`,
      importance: 3,
      tags: ['battle', 'victory', 'ai']
    });
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle('🤖 AI戰鬥勝利！')
      .setColor(0x00cc66)
      .setDescription(`**AI 已完成自動作戰**\n\n${buildAIBattleStory(rounds, combatant, enemy, finalResult)}`)
      .addFields(
        { name: '💰 獎勵', value: `${finalResult.gold} Rns`, inline: true },
        { name: '🩸 剩餘 HP', value: `${combatant.hp}/${combatant.maxHp}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLoot.name}（${battleLoot.rarity}｜${battleLoot.value} Rns）`, inline: false }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
    );

    await interaction.update({ embeds: [embed], content: null, components: [row] });
    return;
  }

  if (finalResult?.victory === false || combatant.hp <= 0) {
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
  const result = BATTLE.executeBattleRound(player, combatant, enemy, chosenMove, enemyMove);

  persistCombatantState(player, pet, combatant);
  PET.savePet(pet);
  CORE.savePlayer(player);

  if (result.victory === true) {
    player.stats.財富 += result.gold;
    const battleLoot = ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50);
    ECON.addTradeGood(player, battleLoot);
    player.battleState = null;
    rememberPlayer(player, {
      type: '戰鬥',
      content: `擊敗 ${enemy.name}`,
      outcome: `獲得 ${result.gold} Rns，掉落 ${battleLoot.name}`,
      importance: 3,
      tags: ['battle', 'victory']
    });
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory'))
      .setColor(0x00ff00)
      .setDescription(result.message)
      .addFields(
        { name: t('gold'), value: `${result.gold}`, inline: true },
        { name: t('hp'), value: `${combatant.hp}/${combatant.maxHp}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLoot.name}（${battleLoot.rarity}｜${battleLoot.value} Rns）`, inline: false }
      );
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
    );
    
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  if (result.victory === false) {
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
  const result = BATTLE.executeBattleRound(player, combatant, enemy, WAIT_COMBAT_MOVE, enemyMove);

  persistCombatantState(player, pet, combatant);
  PET.savePet(pet);

  if (result.victory === true) {
    player.stats.財富 += result.gold;
    const battleLoot = ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50);
    ECON.addTradeGood(player, battleLoot);
    player.battleState = null;
    rememberPlayer(player, {
      type: '戰鬥',
      content: `蓄能待機後反殺 ${enemy.name}`,
      outcome: `獲得 ${result.gold} Rns，掉落 ${battleLoot.name}`,
      importance: 3,
      tags: ['battle', 'victory', 'wait_turn']
    });
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory'))
      .setColor(0x00ff00)
      .setDescription(result.message)
      .addFields(
        { name: t('gold'), value: `${result.gold}`, inline: true },
        { name: t('hp'), value: `${combatant.hp}/${combatant.maxHp}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLoot.name}（${battleLoot.rarity}｜${battleLoot.value} Rns）`, inline: false }
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
    );
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  if (result.victory === false || combatant.hp <= 0) {
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
    { name: 'warstatus', description: '查看正派與 Digital 張力、勢力值與最近三次衝突' }
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
