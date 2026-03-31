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
  CHANNEL_ID: '1473610463244849388',
  GUILD_ID: '1469685526427734181',
  LANGUAGE: 'zh-TW' // 預設語言
};

const DATA_DIR = path.join(__dirname, 'data');
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
const { ISLAND_MAP_TEXT, MAP_LOCATIONS } = require('./world-map');

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

function shouldTriggerBattle(event, result) {
  if (!event) return false;
  if (result?.type === 'combat') return true;
  if (event.action === 'fight') return true;
  const tag = (event.tag || '').toString();
  return tag.includes('⚔️會戰鬥');
}

function getBattleEnemyName(event, result) {
  const explicit = result?.enemy?.name || event?.enemy?.name;
  if (explicit) return explicit;
  const fallback = ['哥布林', '狼人', '巫師學徒', '殭屍'];
  return fallback[Math.floor(Math.random() * fallback.length)];
}

function buildEnemyForBattle(event, result, player) {
  const level = Math.max(1, player?.level || 1);
  const base = BATTLE.createEnemy(getBattleEnemyName(event, result), level);
  const sourceEnemy = result?.enemy || event?.enemy || {};
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
    isMonster: sourceEnemy.isMonster !== false
  };
  return enemy;
}

function pickBestMoveForAI(player, pet, enemy) {
  const candidateMoves = (pet?.moves || []).filter(m => !(m?.effect && m.effect.flee));
  if (candidateMoves.length === 0) return null;

  let best = candidateMoves[0];
  let bestScore = -1;
  for (const move of candidateMoves) {
    const dmg = BATTLE.calculatePlayerMoveDamage(move, player, pet);
    const score = Math.max(1, (dmg.total || 0) - (enemy?.defense || 0));
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

const MAP_PAGE_SIZE = 8;

function buildMapComponents(page, currentLocation) {
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
        .setCustomId(`map_goto_${absoluteIdx}`)
        .setLabel(loc.substring(0, 10))
        .setStyle(loc === currentLocation ? ButtonStyle.Primary : ButtonStyle.Secondary);
    });
    rows.push(new ActionRowBuilder().addComponents(buttons));
  }

  rows.push(
    new ActionRowBuilder().addComponents(
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
      new ButtonBuilder().setCustomId('map_back_main').setLabel('🏠 返回冒險').setStyle(ButtonStyle.Success)
    )
  );

  return { rows, safePage, maxPage };
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

  const { rows, safePage, maxPage } = buildMapComponents(page, player.location);
  const mapDesc =
    '```text\n' + ISLAND_MAP_TEXT + '\n```' +
    `\n**目前位置：** @ ${player.location || '未知'}` +
    `\n**地圖頁數：** ${safePage + 1}/${maxPage + 1}` +
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

function buildRetryGenerationComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('retry_story_generation').setLabel('🔄 重新生成').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('main_menu').setLabel('🏠 主選單').setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ============== 語言文字取得 ==============
function getLanguageText(lang) {
  const texts = {
    'zh-TW': {
      welcome: '歡迎來到 Renaiss 星球！',
      welcomeDesc: '在這個世界，你需要：\n• 選擇你的陣營（正派/反派）\n• 培養你的寵物\n• 探索世界、戰鬥、任務',
      choosePathHint: '請選擇你的陣營：',
      positive: '正派',
      positiveDesc: '行俠仗義，廣結善緣\n招式：治療、護盾、正義之擊',
      negative: '反派',
      negativeDesc: '心狠手辣，為所欲為\n招式：毒術、偷襲、暗黑之力'
    },
    'zh-CN': {
      welcome: '欢迎来到 Renaiss 星球！',
      welcomeDesc: '在这个世界，你需要：\n• 选择你的阵营（正派/反派）\n• 培养你的宠物\n• 探索世界、战斗、任务',
      choosePathHint: '请选择你的阵营：',
      positive: '正派',
      positiveDesc: '行侠仗义，广结善缘\n招式：治疗、护盾、正义之击',
      negative: '反派',
      negativeDesc: '心狠手辣，为所欲为\n招式：毒术、偷袭、暗黑之力'
    },
    'en': {
      welcome: 'Welcome to Renaiss Planet!',
      welcomeDesc: 'In this world, you need to:\n• Choose your alignment (Hero/Villain)\n• Raise your pet\n• Explore, battle, and complete quests',
      choosePathHint: 'Please choose your alignment:',
      positive: 'Hero',
      positiveDesc: 'Protect the innocent, spread kindness\nMoves: Heal, Shield, Justice Strike',
      negative: 'Villain',
      negativeDesc: 'Cruel and ruthless, do as you wish\nMoves: Poison, Ambush, Dark Force'
    }
  };
  return texts[lang] || texts['zh-TW'];
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
    const channel = CLIENT.channels.cache.get(CONFIG.CHANNEL_ID);
    if (!channel) return;
    
    CORE.worldTick(false, null);
    const world = CORE.getWorld();
    
    const embed = new EmbedBuilder()
      .setTitle(`🌍 Day ${world.day} - ${world.season} ${world.weather}`)
      .setColor(0x0099ff)
      .setFooter({ text: '🤖 自動運行 | 每24小時' });
    
    await channel.send({ embeds: [embed] }).catch(() => {});
  }, 86400000);
}

// ============== 斜線指令 ==============
CLIENT.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName, user } = interaction;
  
  if (commandName === 'start') await handleStart(interaction, user);
});

// ============== 開始遊戲（統一入口）=============
async function handleStart(interaction, user) {
  // 先回覆用戶說正在準備（ephemeral，不會出現在頻道）
  await interaction.reply({ 
    content: '🎮 正在開啟新討論串...', 
    ephemeral: true 
  });
  
  // 統一在頻道創建新 thread
  const channel = CLIENT.channels.cache.get(CONFIG.CHANNEL_ID);
  if (!channel) {
    return;
  }
  
  // 關閉舊 thread 並創建新的
  const thread = await createNewThread(channel, user);
  
  // 檢查是否有存檔
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);

  // Bug Fix: 新 thread 啟動時清除舊的 activeMessageId，避免新按鈕被判斷為過期
  if (player) {
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
    await interaction.reply({ content: '❌ 創建討論串失敗', ephemeral: true });
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
    const alignment = customId.replace('name_submit_', '');
    const charName = interaction.fields.getTextInputValue('player_name').trim();
    const finalName = charName || user.username;
    await createCharacterWithName(interaction, user, alignment, finalName);
    return;
  }
  
  // ===== 選擇正派/反派 =====
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
        await interaction.message.delete().catch(() => {});
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

  if (customId.startsWith('map_page_')) {
    const page = parseInt(customId.split('_')[2]);
    await showIslandMap(interaction, user, Number.isNaN(page) ? 0 : page);
    return;
  }

  if (customId.startsWith('map_goto_')) {
    const idx = parseInt(customId.split('_')[2]);
    if (Number.isNaN(idx) || idx < 0 || idx >= MAP_LOCATIONS.length) {
      await interaction.reply({ content: '⚠️ 無效的地點按鈕。', ephemeral: true }).catch(() => {});
      return;
    }

    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色資料，請先 /start', ephemeral: true }).catch(() => {});
      return;
    }

    const targetLocation = MAP_LOCATIONS[idx];
    player.location = targetLocation;
    player.eventChoices = [];
    player.currentStory = '';
    CORE.addPlayerMemory(user.id, { type: '移動', content: `前往${targetLocation}` });
    CORE.savePlayer(player);

    const page = Math.floor(idx / MAP_PAGE_SIZE);
    await showIslandMap(interaction, user, page, `✅ 你已航行至 **${targetLocation}**`);
    return;
  }

  if (customId === 'map_back_main') {
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (!player || !pet || !interaction.channel?.isThread()) {
      await interaction.reply({ content: '⚠️ 請回到遊戲討論串使用。', ephemeral: true }).catch(() => {});
      return;
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
      .setDescription(`**${user.username}**，你的初始資產已確認！\n\n💰 **初始 RNS：${initialRns}**\n\n在這個世界，你需要：\n• 選擇你的陣營（正派/反派）\n• 培養你的寵物\n• 探索世界、戰鬥、任務\n\n**請選擇你的陣營：**`)
      .addFields(
        { name: '☀️ 正派', value: '行俠仗義，廣結善緣\n招式：治療、護盾、正義之擊', inline: true },
        { name: '🌙 反派', value: '心狠手辣，為所欲為\n招式：毒術、偷襲、暗黑之力', inline: true }
      );
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('choose_positive').setLabel('☀️ 選擇正派').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('choose_negative').setLabel('🌙 選擇反派').setStyle(ButtonStyle.Danger)
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
  const alignment = customId === 'choose_positive' ? '正派' : '反派';

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
  player.alignment = alignment;
  player.wanted = 0;
  player.stats.財富 = pendingRNS; // 使用暫時 RNS（0 或上次保存的值）
  
  // 取得選擇的語言
  const selectedLang = getPlayerTempData(user.id, 'language') || 'zh-TW';
  player.language = selectedLang;
  CORE.savePlayer(player);
  
  // 清除臨時資料
  clearPlayerTempData(user.id);
  
  const egg = PET.createPetEgg(user.id, alignment);
  PET.savePet(egg);
  
  const embed = new EmbedBuilder()
    .setTitle(`🎉 歡迎 ${alignment}！`)
    .setColor(alignment === '正派' ? 0x00ff00 : 0xff0000)
    .setDescription(`**${player.name}**，你的Renaiss星球之旅開始了！\n\n🥚 寵物蛋已獲得！\n\n🔨 敲開寵物蛋，看看你的天賦！`)
    .addFields(
      { name: '📍 位置', value: player.location, inline: true },
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
      ? ['小白', '小青', '俠仔', '靈兒', '阿正'][Math.floor(Math.random() * 5)]
      : ['小黑', '邪仔', '夜影', '惡獸', '阿修'][Math.floor(Math.random() * 5)];
  }
  
  pet.name = name;
  pet.waitingForName = false;
  PET.savePet(pet);
  
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
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 開始探險！').setStyle(ButtonStyle.Success)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
}

// ============== 跳過名字（隨機）==============
CLIENT.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'skip_name') return;
  
  const userId = interaction.user.id;
  const pet = PET.loadPet(userId);
  
  if (!pet || !pet.waitingForName) return;
  
  const name = pet.type === '正派' 
    ? ['小白', '小青', '俠仔', '靈兒', '阿正'][Math.floor(Math.random() * 5)]
    : ['小黑', '邪仔', '夜影', '惡獸', '阿修'][Math.floor(Math.random() * 5)];
  
  pet.name = name;
  pet.waitingForName = false;
  PET.savePet(pet);
  
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
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 開始探險！').setStyle(ButtonStyle.Success)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
});

// ============== 主選單（發送到 Thread）==============
async function sendMainMenuToThread(thread, player, pet, interaction = null) {
  // 如果沒有暂存的事件選項，才生成新的（防止刷選項）
  // ============================================================
  //  continuity 維護：有 story+choices 就直接顯示，不重新生成
  // ============================================================
  if (player.currentStory && player.eventChoices && player.eventChoices.length > 0) {
    // 直接顯示上次的故事 + 選項（不做任何 AI 呼叫）
    const choices = player.eventChoices;
    const storyText = player.currentStory;
    
    player.stats.飽腹度 = player.stats.飽腹度 || 100;
    const statusBar = `氣血 ${pet.hp}/${pet.maxHp} | 內力 ${player.stats.內力 || 10}/${player.maxStats.內力 || 10} | 飽腹度 ${player.stats.飽腹度} | Rns ${player.stats.財富} | ${player.location}`;
    
    let optionsText = '';
    choices.slice(0, 7).forEach((c, i) => {
      const tag = c.tag || '';
      const text = (c.choice || c.name || '').toString();
      if (text && text !== 'true' && text !== 'false') {
        optionsText += `\n${i+1}. ${tag} ${text}`;
      }
    });
    
    const description = `**狀態：【${statusBar}】**\n\n${storyText}\n\n**🆕 選項：**${optionsText}\n\n_請選擇編號（1-7）_`;
    
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${player.name} - ${pet.name}`)
      .setColor(player.alignment === '正派' ? 0x00ff00 : 0xff0000)
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
    
    const buttons = choices.slice(0, 7).map((c, i) => {
      const label = ((c.tag || '') + ' ' + (c.name || `${i+1}`)).substring(0, 20).trim();
      return new ButtonBuilder()
        .setCustomId(`event_${i}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary);
    });
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
  if (!player.eventChoices || player.eventChoices.length === 0) {
    const aiChoices = await STORY.generateInitialChoices(player, pet);
    if (!aiChoices || aiChoices.length === 0) {
      const failMsg = await thread.send({
        content: '❌ AI 選項生成失敗，請點「重新生成」再試。',
        components: buildRetryGenerationComponents()
      }).catch(() => null);
      if (failMsg) {
        trackActiveGameMessage(player, thread.id, failMsg.id);
      }
      return;
    }
    player.eventChoices = aiChoices;
    // 初始故事用一句話代替
    player.currentStory = '你來到了' + player.location + '，展開了新的冒險！';
    CORE.savePlayer(player);
  }
  
  const choices = player.eventChoices;
  
  // ===== 狀態列 =====
  player.stats.飽腹度 = player.stats.飽腹度 || 100;
  const statusBar = `氣血 ${pet.hp}/${pet.maxHp} | 內力 ${player.stats.內力 || 10}/${player.maxStats.內力 || 10} | 飽腹度 ${player.stats.飽腹度} | Rns ${player.stats.財富} | ${player.location}`;
  
  // ===== 構建選項文字 =====
  let optionsText = '';
  choices.slice(0, 7).forEach((choice, i) => {
    const text = choice.choice || choice.name;
    optionsText += `\n${i+1}. ${text}`;
  });
  
  // 先用 Loading 訊息回覆（用 interaction.deferUpdate 避免超時）
  const loadingDesc = `**狀態：【${statusBar}】**\n\n⏳ *AI 說書人正在構思故事...*\n\n**選項：**${optionsText}\n\n_請選擇編號（1-7）_`;
  
  const loadingEmbed = new EmbedBuilder()
    .setTitle(`⚔️ ${player.name} - ${pet.name}`)
    .setColor(0x00ff00)
    .setDescription(loadingDesc);
  
  // 構建按鈕
  const buttons = choices.slice(0, 7).map((choice, i) => {
    const label = (choice.tag || '') + ' ' + (choice.name || `${i+1}`).substring(0, 15);
    return new ButtonBuilder()
      .setCustomId(`event_${i}`)
      .setLabel(label.trim())
      .setStyle(ButtonStyle.Primary);
  });
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
  const stopLoadingAnimation = startLoadingAnimation(loadingMsg, 'AI 說書人正在構思故事');

  // 如果有 interaction（按鈕觸發），立即確認避免超時
  if (interaction) {
    await interaction.deferUpdate().catch(() => {});
  }
  
  // 背景 AI 生成：先出故事，再補按鈕
  (async () => {
    try {
      const storyText = await STORY.generateStory(null, player, pet, null);
      if (!storyText) {
        stopLoadingAnimation();
        await loadingMsg.edit({
          content: '❌ AI 故事生成失敗，請點「重新生成」再試。',
          embeds: [],
          components: buildRetryGenerationComponents()
        }).catch(() => {});
        trackActiveGameMessage(player, thread.id, loadingMsg.id);
        return;
      }

      player.currentStory = storyText;
      player.eventChoices = [];
      CORE.savePlayer(player);

      const storyFirstDesc =
        `**狀態：【${statusBar}】**\n\n${storyText}\n\n` +
        `⏳ *故事已送達，正在生成選項...*`;

      const storyFirstEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(0x00ff00)
        .setDescription(storyFirstDesc);

      stopLoadingAnimation();
      await loadingMsg.edit({ content: null, embeds: [storyFirstEmbed], components: [] }).catch(() => {});
      trackActiveGameMessage(player, thread.id, loadingMsg.id);

      const newChoices = await STORY.generateChoicesWithAI(player, pet, storyText, '');
      if (!newChoices || newChoices.length === 0) {
        await loadingMsg.edit({
          content: '⚠️ 故事已生成，但選項生成失敗，請點「重新生成」。',
          embeds: [storyFirstEmbed],
          components: buildRetryGenerationComponents()
        }).catch(() => {});
        trackActiveGameMessage(player, thread.id, loadingMsg.id);
        return;
      }

      player.eventChoices = newChoices;
      CORE.savePlayer(player);

      let newOptionsText = '';
      newChoices.slice(0, 7).forEach((c, i) => {
        const tag = c.tag || '';
        const text = c.choice || c.name || '';
        newOptionsText += `\n${i+1}. ${tag} ${text}`;
      });

      const newButtons = newChoices.slice(0, 7).map((c, i) => {
        const label = ((c.tag || '') + ' ' + (c.name || `${i+1}`)).substring(0, 20).trim();
        return new ButtonBuilder()
          .setCustomId(`event_${i}`)
          .setLabel(label)
          .setStyle(ButtonStyle.Primary);
      });
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

      const aiDesc = `**狀態：【${statusBar}】**\n\n${storyText}\n\n**🆕 新選項：**${newOptionsText}\n\n_請選擇編號（1-7）_`;

      const aiEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(0x00ff00)
        .setDescription(aiDesc);

      await loadingMsg.edit({ content: null, embeds: [aiEmbed], components: newComponents }).catch(e => console.log('[發送錯誤]', e.message));
      trackActiveGameMessage(player, thread.id, loadingMsg.id);
    } catch (err) {
      stopLoadingAnimation();
      console.log('[AI] 故事生成失敗:', err.message);
      await loadingMsg.edit({
        content: `❌ AI 失敗：${err.message}\n請點「重新生成」再試。`,
        embeds: [],
        components: buildRetryGenerationComponents()
      }).catch(() => {});
      trackActiveGameMessage(player, thread.id, loadingMsg.id);
    }
  })();
  
  return;
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
  const langName = currentLang === 'zh-TW' ? '中文（繁體）' : currentLang === 'en' ? 'English' : '中文（繁體）';
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
    .setColor(player.alignment === '正派' ? 0x00ff00 : 0xff0000)
    .setDescription(`**${player.title}**`)
    .addFields(
      { name: '🏷️ 陣營', value: player.alignment, inline: true },
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
    
    // 等級標示
    const tierEmoji = m.tier === 3 ? '🔮' : m.tier === 2 ? '💠' : '⚪';
    const tierName = m.tier === 3 ? '史詩' : m.tier === 2 ? '稀有' : '普通';
    
    let effectStr = '';
    if (m.effect.burn) effectStr += '燃燒' + m.effect.burn + '回合 ';
    if (m.effect.poison) effectStr += '中毒' + m.effect.poison + '回合 ';
    if (m.effect.stun) effectStr += '暈眩' + m.effect.stun + '回合 ';
    if (m.effect.freeze) effectStr += '凍結' + m.effect.freeze + '回合 ';
    if (m.effect.bind) effectStr += '困綁' + m.effect.bind + '回合 ';
    if (m.effect.shield) effectStr += '護盾' + m.effect.shield + '回合 ';
    if (m.effect.heal) effectStr += '治療' + m.effect.heal + ' ';
    if (m.effect.drain) effectStr += '吸血' + m.effect.drain + ' ';
    if (m.effect.selfDamage) effectStr += '自損' + m.effect.selfDamage + ' ';
    if (m.effect.reflect) effectStr += '反傷' + m.effect.reflect + '回合 ';
    if (m.effect.armorBreak) effectStr += '無視防禦 ';
    if (m.effect.missNext) effectStr += '攻擊落空 ';
    if (m.effect.slow) effectStr += '緩速' + m.effect.slow + '回合 ';
    if (m.effect.bleed) effectStr += '流血' + m.effect.bleed + '回合 ';
    if (m.effect.confuse) effectStr += '混亂' + m.effect.confuse + '回合 ';
    if (m.effect.defenseDown) effectStr += '防禦下降' + m.effect.defenseDown + '回合 ';
    if (m.effect.trap) effectStr += '陷阱' + m.effect.trap + '回合 ';
    if (m.effect.ignoreResistance) effectStr += '無視抗性 ';
    if (m.effect.dot) effectStr += '持續傷害' + m.effect.dot + ' ';
    if (m.effect.blind) effectStr += '致盲' + m.effect.blind + '回合 ';
    if (m.effect.taunt) effectStr += '嘲諷' + m.effect.taunt + '回合 ';
    if (m.effect.thorns) effectStr += '反傷' + m.effect.thorns + '回合 ';
    if (m.effect.flee) effectStr += '100%逃跑 ';
    
    return `${tierEmoji} ${i+1}. **${m.name}** (${m.element}/${tierName})\n   💥 ${dmg.total}dmg | ${effectStr || '無效果'}`;
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
  
  // 顯示物品
  const items = player.inventory || [];
  const herbs = player.herbs || [];
  
  const itemsList = items.length > 0 ? items.map((item, i) => `${i+1}. ${item}`).join('\n') : '（空）';
  const herbsList = herbs.length > 0 ? herbs.map((h, i) => `${i+1}. ${h}`).join('\n') : '（空）';
  
  const embed = new EmbedBuilder()
    .setTitle(`🎒 ${player.name} 的行囊`)
    .setColor(0x8B4513)
    .setDescription('你身上攜帶的物品')
    .addFields(
      { name: '📦 物品', value: itemsList, inline: true },
      { name: '🌿 草藥', value: herbsList, inline: true }
    )
    .addFields({ name: t('gold'), value: `${player.stats.財富} Rns`, inline: false });
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back')).setStyle(ButtonStyle.Primary)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
}

// ============== 處理事件 ==============
async function handleEvent(interaction, user, eventIndex) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  
  if (!player || !pet) {
    await interaction.update({ content: '❌ 請重新開始！', components: [] });
    return;
  }
  
  const choices = player.eventChoices || [];
  const event = choices[eventIndex];
  
  if (!event) {
    await interaction.update({ content: '❌ 事件不存在！', components: [] });
    return;
  }
  
  // 執行事件
  const result = EVENTS.executeEvent(event, player);
  const selectedChoice = event.choice || event.name || '未知選擇';
  
  // 減少飽腹度
  player.stats.飽腹度 = Math.max(0, (player.stats.飽腹度 || 100) - Math.floor(Math.random() * 5 + 3));
  
  // 清除舊選項（必須重新生成）
  player.eventChoices = [];
  
  // 加入記憶
  CORE.addPlayerMemory(user.id, {
    type: event.tag ? '行動' : '選擇',
    content: selectedChoice
  });

  if (shouldTriggerBattle(event, result)) {
    const enemy = buildEnemyForBattle(event, result, player);
    player.battleState = {
      enemy,
      mode: null,
      fleeAttempts: 0,
      startedAt: Date.now(),
      sourceChoice: selectedChoice
    };
    player.currentStory = result?.message || event?.desc || `${selectedChoice}`;
    CORE.savePlayer(player);

    await interaction.deferUpdate().catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${player.name} - ${pet.name}`)
      .setColor(0xff6600)
      .setDescription(
        `**戰鬥即將開始！**\n\n${player.currentStory}\n\n` +
        `👹 敵人：**${enemy.name}**\n` +
        `❤️ 敵方 HP：${enemy.hp}/${enemy.maxHp}\n` +
        `⚔️ 敵方攻擊：${enemy.attack}\n\n` +
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
  
  CORE.savePlayer(player);
  
  // 取得記憶上下文
  const memoryContext = CORE.getPlayerMemoryContext(user.id);
  
  const statusBar = `氣血 ${pet.hp}/${pet.maxHp} | 內力 ${player.stats.內力 || 10}/${player.maxStats.內力 || 10} | 飽腹度 ${player.stats.飽腹度} | Rns ${player.stats.財富} | ${player.location}`;
  
  // 立即確認按鈕（避免 Discord 顯示失敗）
  await interaction.deferUpdate().catch(() => {});
  
  // 發送一個「AI 正在思考」的訊息（帶上舊 story，讓 continuity 明顯）
  // choices 變數在 eventChoices 清除前就 capture 了，所以仍有效
  const prevStory = player.currentStory || '(故事載入中...)';
  let prevOptionsText = '';
  choices.slice(0, 7).forEach((c, i) => {
    const tag = c.tag || '';
    const text = (c.choice || c.name || '').toString();
    if (text && text !== 'true' && text !== 'false') {
      prevOptionsText += `\n${i+1}. ${tag} ${text}`;
    }
  });

  const loadingMsg = await interaction.channel.send({
    content: null,
    embeds: [{
      title: `⚔️ ${player.name} - ${pet.name}`,
      color: player.alignment === '正派' ? 0x00ff00 : 0xff0000,
      description: `**📍 上個選擇：** ${selectedChoice}\n\n⏳ *AI 說書人正在構思新故事...*\n\n**📜 前情提要：**\n${prevStory}${prevOptionsText ? '\n\n**🆕 即將更新選項：**' + prevOptionsText : ''}`
    }]
  });

  trackActiveGameMessage(player, interaction.channel?.id, loadingMsg.id);
  const stopLoadingAnimation = startLoadingAnimation(loadingMsg, 'AI 說書人正在構思新故事');
  
  // 背景 AI 生成：先出故事，再補按鈕
  (async () => {
    try {
      const storyText = await STORY.generateStory(event, player, pet, event, memoryContext);
      if (!storyText) {
        stopLoadingAnimation();
        await loadingMsg.edit({
          content: '❌ AI 生成失敗，請點「重新生成」再試。',
          embeds: [],
          components: buildRetryGenerationComponents()
        }).catch(() => {});
        trackActiveGameMessage(player, interaction.channel?.id, loadingMsg.id);
        return;
      }

      player.currentStory = storyText;
      player.eventChoices = [];
      CORE.savePlayer(player);

      const rewardText = [];
      if (result.gold) rewardText.push(`💰 +${result.gold} Rns`);
      if (result.wantedLevel) rewardText.push(`⚠️ 通緝等级: ${result.wantedLevel}`);

      const worldEvents = CORE.getRecentWorldEvents(3);
      let worldEventsText = '';
      if (worldEvents.length > 0) {
        worldEventsText = '\n\n📢 **世界事件：**\n' + worldEvents.map(e => e.message || e).join('\n');
      }

      const storyOnlyDesc =
        `**📍 上個選擇：** ${selectedChoice}\n\n${storyText}` +
        `${rewardText.length > 0 ? '\n\n' + rewardText.join(' | ') : ''}` +
        `${worldEventsText}\n\n⏳ *故事已送達，正在生成選項...*`;

      const storyOnlyEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(player.alignment === '正派' ? 0x00ff00 : 0xff0000)
        .setDescription(storyOnlyDesc)
        .addFields(
          { name: '🐾 寵物', value: `${pet.name} (${pet.type})`, inline: true },
          { name: '⚔️ 氣血', value: `${pet.hp}/${pet.maxHp}`, inline: true },
          { name: '💰 Rns', value: String(player.stats.財富), inline: true }
        );

      stopLoadingAnimation();
      await loadingMsg.edit({ content: null, embeds: [storyOnlyEmbed], components: [] }).catch(() => {});
      trackActiveGameMessage(player, interaction.channel?.id, loadingMsg.id);

      const aiChoices = await STORY.generateChoicesWithAI(player, pet, storyText, memoryContext);
      if (!aiChoices || aiChoices.length === 0) {
        await loadingMsg.edit({
          content: '⚠️ 故事已生成，但選項生成失敗，請點「重新生成」。',
          embeds: [storyOnlyEmbed],
          components: buildRetryGenerationComponents()
        }).catch(() => {});
        trackActiveGameMessage(player, interaction.channel?.id, loadingMsg.id);
        return;
      }

      player.eventChoices = aiChoices;
      CORE.savePlayer(player);

      const newChoices = player.eventChoices;
      let optionsText = '';
      newChoices.slice(0, 7).forEach((c, i) => {
        const tag = c.tag || '';
        const text = (c.choice || c.name || '').toString();
        if (text && text !== 'true' && text !== 'false') {
          optionsText += `\n${i+1}. ${tag} ${text}`;
        }
      });

      const description = `**📍 上個選擇：** ${selectedChoice}\n\n${storyText}${rewardText.length > 0 ? '\n\n' + rewardText.join(' | ') : ''}${worldEventsText}\n\n**🆕 新選項：**${optionsText}\n\n_請選擇編號（1-7）_`;

      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(player.alignment === '正派' ? 0x00ff00 : 0xff0000)
        .setDescription(description)
        .addFields(
          { name: '🐾 寵物', value: `${pet.name} (${pet.type})`, inline: true },
          { name: '⚔️ 氣血', value: `${pet.hp}/${pet.maxHp}`, inline: true },
          { name: '💰 Rns', value: String(player.stats.財富), inline: true }
        );

      const buttons = newChoices.slice(0, 7).map((c, i) => {
        const label = (c.choice || c.name || `選項${i+1}`).toString();
        return new ButtonBuilder()
          .setCustomId(`event_${i}`)
          .setLabel(label.substring(0, 20))
          .setStyle(ButtonStyle.Primary);
      });
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

      await loadingMsg.edit({ content: null, embeds: [embed], components }).catch(() => {});
      trackActiveGameMessage(player, interaction.channel?.id, loadingMsg.id);
    } catch (err) {
      stopLoadingAnimation();
      console.error('[事件] 處理失敗:', err);
      await loadingMsg.edit({
        content: '❌ 事件處理失敗，請點「重新生成」再試。',
        embeds: [],
        components: buildRetryGenerationComponents()
      }).catch(() => {});
      trackActiveGameMessage(player, interaction.channel?.id, loadingMsg.id);
    }
  })();
  
  return;
}

// ============== 戰鬥 ==============
function buildBattleMoveDetails(player, pet) {
  return (pet.moves || []).filter(m => !(m?.effect && m.effect.flee)).map(m => {
    const d = BATTLE.calculatePlayerMoveDamage(m, player, pet);
    let effectStr = '';
    if (m.effect.burn) effectStr += `燃燒${m.effect.burn}回合 `;
    if (m.effect.poison) effectStr += `中毒${m.effect.poison}回合 `;
    if (m.effect.stun) effectStr += `暈眩${m.effect.stun}回合 `;
    if (m.effect.freeze) effectStr += `凍結${m.effect.freeze}回合 `;
    if (m.effect.bind) effectStr += `困綁${m.effect.bind}回合 `;
    if (m.effect.shield) effectStr += `護盾${m.effect.shield}回合 `;
    if (m.effect.heal) effectStr += `治療${m.effect.heal} `;
    if (m.effect.drain) effectStr += `吸血${m.effect.drain} `;
    return `⚔️ ${m.name} | ${d.total} dmg | ${effectStr || '無'}`;
  }).join('\n');
}

function buildBattleActionRows(player, pet) {
  const battleState = player.battleState || {};
  const indexedMoves = (pet.moves || [])
    .map((m, i) => ({ move: m, index: i }))
    .filter(({ move }) => !(move?.effect && move.effect.flee))
    .slice(0, 4);

  const moveButtons = indexedMoves.map(({ move, index }) => {
    const m = move;
    const d = BATTLE.calculatePlayerMoveDamage(m, player, pet);
    return new ButtonBuilder()
      .setCustomId(`use_move_${index}`)
      .setLabel(`${m.name} (${d.total})`)
      .setStyle(ButtonStyle.Danger);
  });

  const moveRow = new ActionRowBuilder().addComponents(
    moveButtons.length > 0
      ? moveButtons
      : [new ButtonBuilder().setCustomId('no_attack_moves').setLabel('無可用攻擊招式').setStyle(ButtonStyle.Secondary).setDisabled(true)]
  );
  const fleeTry = battleState.fleeAttempts || 0;
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`flee_${fleeTry}`).setLabel(`${t('flee')} (70%×2)`).setStyle(ButtonStyle.Secondary)
  );
  return [moveRow, actionRow];
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

  const [moveRow, actionRow] = buildBattleActionRows(player, pet);
  const dmgInfo = buildBattleMoveDetails(player, pet);
  const roundText = roundMessage ? `\n\n${roundMessage}\n` : '\n';

  await interaction.update({
    content:
      `⚔️ **戰鬥中：${pet.name} vs ${enemy.name}**${roundText}\n` +
      `敵人 HP: ${enemy.hp}/${enemy.maxHp} | ATK: ${enemy.attack}\n` +
      `你的 ${pet.name} HP: ${pet.hp}/${pet.maxHp}\n\n` +
      `**招式：**\n${dmgInfo}`,
    embeds: [],
    components: [moveRow, actionRow]
  });
}

async function startManualBattle(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  if (!player || !pet || !pet.moves || pet.moves.length === 0) {
    await interaction.update({ content: '❌ 沒有可用招式，無法開始戰鬥。', components: [] });
    return;
  }

  if (!player.battleState?.enemy) {
    player.battleState = {
      enemy: BATTLE.createEnemy('哥布林', Math.max(1, player.level || 1)),
      mode: 'manual',
      fleeAttempts: 0,
      startedAt: Date.now(),
      sourceChoice: '突發戰鬥'
    };
  } else {
    player.battleState.mode = 'manual';
  }

  CORE.savePlayer(player);
  await handleFight(interaction, user);
}

async function startAutoBattle(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  if (!player || !pet || !pet.moves || pet.moves.length === 0) {
    await interaction.update({ content: '❌ 沒有可用招式，無法開始 AI 戰鬥。', components: [] });
    return;
  }

  if (!player.battleState?.enemy) {
    player.battleState = {
      enemy: BATTLE.createEnemy('哥布林', Math.max(1, player.level || 1)),
      mode: 'ai',
      fleeAttempts: 0,
      startedAt: Date.now(),
      sourceChoice: '突發戰鬥'
    };
  } else {
    player.battleState.mode = 'ai';
  }

  const enemy = player.battleState.enemy;
  const logs = [];
  let finalResult = null;
  const maxTurns = 12;

  for (let turn = 1; turn <= maxTurns; turn++) {
    const aiMove = pickBestMoveForAI(player, pet, enemy);
    if (!aiMove) break;
    const enemyMove = BATTLE.enemyChooseMove(enemy);
    const roundResult = BATTLE.executeBattleRound(player, pet, enemy, aiMove, enemyMove);
    logs.push(`**第 ${turn} 回合**\n${roundResult.message}`);
    if (roundResult.victory !== null) {
      finalResult = roundResult;
      break;
    }
  }

  PET.savePet(pet);

  if (finalResult?.victory === true) {
    player.stats.財富 += finalResult.gold;
    player.battleState = null;
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle('🤖 AI戰鬥勝利！')
      .setColor(0x00cc66)
      .setDescription(
        `**AI 已完成自動作戰**\n\n` +
        `${logs.join('\n\n')}\n\n` +
        `${finalResult.message}`
      )
      .addFields(
        { name: '💰 獎勵', value: `${finalResult.gold} Rns`, inline: true },
        { name: '🐾 剩餘 HP', value: `${pet.hp}/${pet.maxHp}`, inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
    );

    await interaction.update({ embeds: [embed], content: null, components: [row] });
    return;
  }

  if (finalResult?.victory === false || pet.hp <= 0) {
    player.battleState = null;
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle('💀 AI戰鬥失敗...')
      .setColor(0xff0000)
      .setDescription(`${logs.join('\n\n')}\n\n你的旅程就此結束...`);

    CORE.resetPlayerGame(user.id);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('choose_positive').setLabel('🔄 重新開始').setStyle(ButtonStyle.Danger)
    );

    await interaction.update({ embeds: [embed], content: null, components: [row] });
    return;
  }

  player.battleState.enemy = enemy;
  CORE.savePlayer(player);
  await renderManualBattle(interaction, player, pet, logs.join('\n\n'));
}

async function handleFight(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);

  if (!player || !pet || !pet.moves || pet.moves.length === 0) {
    await interaction.update({ content: '❌ 沒有招式！', components: [] });
    return;
  }

  if (!player.battleState?.enemy) {
    player.battleState = {
      enemy: BATTLE.createEnemy('哥布林', Math.max(1, player.level || 1)),
      mode: 'manual',
      fleeAttempts: 0,
      startedAt: Date.now(),
      sourceChoice: '突發戰鬥'
    };
    CORE.savePlayer(player);
  }

  await renderManualBattle(interaction, player, pet);
}

// ============== 使用招式 ==============
async function handleUseMove(interaction, user, moveIndex) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  const enemy = player?.battleState?.enemy;

  if (!player || !pet || !enemy || !pet.moves[moveIndex]) {
    await interaction.update({ content: '❌ 招式不存在！', components: [] });
    return;
  }

  const chosenMove = pet.moves[moveIndex];
  if (chosenMove?.effect?.flee) {
    await renderManualBattle(interaction, player, pet, '⚠️ 請使用下方「逃跑」按鈕，不是招式按鈕。');
    return;
  }
  const enemyMove = BATTLE.enemyChooseMove(enemy);
  const result = BATTLE.executeBattleRound(player, pet, enemy, chosenMove, enemyMove);

  PET.savePet(pet);

  if (result.victory === true) {
    player.stats.財富 += result.gold;
    player.battleState = null;
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory'))
      .setColor(0x00ff00)
      .setDescription(result.message)
      .addFields(
        { name: t('gold'), value: `${result.gold}`, inline: true },
        { name: t('hp'), value: `${pet.hp}/${pet.maxHp}`, inline: true }
      );
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue')).setStyle(ButtonStyle.Success)
    );
    
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  if (result.victory === false) {
    player.battleState = null;
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('defeat'))
      .setColor(0xff0000)
      .setDescription(result.message + '\n\n你的旅程就此結束...');

    CORE.resetPlayerGame(user.id);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('choose_positive').setLabel('🔄 重新開始').setStyle(ButtonStyle.Danger)
    );

    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  player.battleState.enemy = enemy;
  player.battleState.mode = 'manual';
  CORE.savePlayer(player);
  await renderManualBattle(interaction, player, pet, result.message);
}

// ============== 逃跑 ==============
async function handleFlee(interaction, user, attemptNum) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  const enemy = player?.battleState?.enemy;

  if (!player || !pet || !enemy) {
    await interaction.update({ content: '❌ 目前不在戰鬥狀態。', components: [] });
    return;
  }

  const currentAttempt = (player.battleState.fleeAttempts || 0) + 1;
  const result = BATTLE.attemptFlee(player, pet, enemy, currentAttempt);

  if (result.success) {
    player.battleState = null;
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
    player.battleState = null;
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle('💀 逃跑失敗...')
      .setColor(0xff0000)
      .setDescription(result.message + '\n\n你的旅程就此結束...');

    CORE.resetPlayerGame(user.id);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('choose_positive').setLabel('🔄 重新開始').setStyle(ButtonStyle.Danger)
    );

    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  player.battleState.fleeAttempts = currentAttempt;
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
  const commands = [
    { name: 'start', description: '開始你的Renaiss星球冒險！（有存檔則繼續）' }
  ];
  
  try {
    // 全球註冊（不需要伺服器權限）
    await CLIENT.application.commands.set(commands);
    console.log('[Slash] 全球指令已註冊');
  } catch (e) {
    console.log('[Slash] 全球註冊失敗:', e.message);
  }
});

// ============== 啟動 ==============
CLIENT.login(CONFIG.DISCORD_TOKEN).catch(err => {
  console.error('[Bot]', err.message);
});

console.log('[刀鋒] 🗡️ 系統啟動中...');
