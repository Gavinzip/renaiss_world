/**
 * 🗡️ 刀鋒 BLADE - Discord Bot v4
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
  console.log('[Bot] 🗡️ 刀鋒 BLADE 上線！');
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
  // 先回覆用戶說正在準備
  await interaction.reply({ 
    content: '🎮 正在開啟新討論串...', 
    ephemeral: true 
  });
  
  // 統一在頻道創建新 thread
  const channel = CLIENT.channels.cache.get(CONFIG.CHANNEL_ID);
  if (!channel) {
    await interaction.editReply({ content: '❌ 找不到頻道' });
    return;
  }
  
  // 關閉舊 thread 並創建新的
  const thread = await createNewThread(channel, user);
  
  // 檢查是否有存檔
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  
  if (player && pet && pet.hatched) {
    // 有存檔 → 在 thread 繼續遊戲
    await thread.send({ 
      content: `👋 <@${user.id}> 你回來了！繼續你的冒險吧！` 
    });
    await sendMainMenuToThread(thread, player, pet, null);
    await interaction.editReply({ content: '✅ 已開啟新討論串！' });
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
    await interaction.editReply({ content: '✅ 已開啟新討論串！' });
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
    await interaction.editReply({ content: '✅ 已開啟新討論串！' });
    return;
  }
  
  // 沒有存檔 → 檢查錢包綁定
  if (!WALLET.isWalletBound(user.id)) {
    const embed = new EmbedBuilder()
      .setTitle('💳 綁定你的 BSC 錢包')
      .setColor(0xffd700)
      .setDescription(`**${user.username}**，在開始你的 Renaiss 星球的冒險之前，需要先綁定你的 BSC 錢包來計算你的初始資產！\n\n**💰 資產規則：**`)
      .addFields(
        { name: '📊 < 1000 RNS', value: '1 隻寵物', inline: true },
        { name: '📊 1000+ RNS', value: '2 隻寵物', inline: true },
        { name: '📊 5000+ RNS', value: '3 隻寵物', inline: true }
      )
      .addFields({ name: '🔗 請粘貼你的 BSC 錢包地址', value: '（開頭為 0x，42個字符）', inline: false })
      .setFooter({ text: '錢包只用於讀取資產，不會進行任何轉帳' });
    
    // 發送錢包绑定消息到 thread（带按钮触发 modal）
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_wallet_modal').setLabel('💳 綁定錢包').setStyle(ButtonStyle.Primary)
    );
    
    setPlayerThread(user.id, thread.id);
    await thread.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: '✅ 已開啟新討論串！' });
    return;
  }
  
  // 有錢包但還沒讀取資產 → 讀取並創建角色（不需新建 thread）
  const walletAssets = await WALLET.getPlayerWalletAssets(user.id);
  
  // 發送到當前 thread
  const threadChannel = interaction.channel;
  
  try {
    const embed = new EmbedBuilder()
      .setTitle(`🌟 ${t('welcome')}`)
      .setColor(0x00ff00)
      .setDescription(`**${user.username}**，歡迎來到 Renaiss 星球！\n\n在這個世界，你需要：\n• 選擇你的陣營（正派/反派）\n• 培養你的寵物\n• 探索世界、戰鬥、任務\n\n**${t('choosePath')}：**`)
      .addFields(
        { name: '☀️ 正派', value: '行俠仗義，廣結善緣\n招式：治療、護盾、正義之擊', inline: true },
        { name: '🌙 反派', value: '心狠手辣，為所欲為\n招式：毒術、偷襲、暗黑之力', inline: true }
      );
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('choose_positive').setLabel('☀️ 選擇正派').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('choose_negative').setLabel('🌙 選擇反派').setStyle(ButtonStyle.Danger)
    );
    
    await threadChannel.send({ 
      content: `👋 <@${user.id}> 這是你的專屬討論串！開始你的Renaiss探險之旅！`,
      embeds: [embed], 
      components: [row] 
    });
    
    await interaction.update({ content: '✅ 角色創建完成！', components: [] });
    
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
  
  // ===== 錢包綁定 Modal =====
  if (customId === 'wallet_bind_modal') {
    await handleWalletBind(interaction, user);
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
      // 在 thread 裡用 sendMainMenuToThread，在外面用 showMainMenu
      if (interaction.channel?.isThread()) {
        await sendMainMenuToThread(interaction.channel, player, pet, interaction);
        await interaction.message.delete().catch(() => {});
      } else {
        await showMainMenu(interaction, player, pet);
      }
    }
    return;
  }
  
  // ===== 設置 =====
  if (customId === 'open_settings') {
    await showSettings(interaction, user);
    return;
  }
  
  // ===== 切換語言 =====
  if (customId === 'lang_zh' || customId === 'lang_en') {
    const player = CORE.loadPlayer(user.id);
    if (player) {
      player.language = customId === 'lang_zh' ? 'zh-TW' : 'en';
      CORE.savePlayer(player);
    }
    await showSettings(interaction, user);
    return;
  }
  
  // ===== 角色資訊 =====
  if (customId === 'open_character') {
    await showCharacter(interaction, user);
    return;
  }
  
  // ===== 事件按鈕 =====
  if (customId.startsWith('event_')) {
    const idx = parseInt(customId.split('_')[1]);
    await handleEvent(interaction, user, idx);
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
async function handleWalletBind(interaction, user) {
  const walletAddress = interaction.fields.getTextInputValue('wallet_address').trim();
  
  const result = WALLET.bindWallet(user.id, walletAddress);
  
  if (!result.success) {
    await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
    return;
  }
  
  // 設置初始 pendingRNS 為 0，等背景掃描完成後更新
  WALLET.updatePendingRNS(user.id, 0);
  
  // 立即顯示綁定成功，背景掃描開始
  const embed = new EmbedBuilder()
    .setTitle('✅ 錢包綁定成功！')
    .setColor(0x00ff00)
    .setDescription(`錢包地址：\`${result.address}\`\n\n📊 **正在掃描 Renaiss 卡牌價值...**\n\n⏳ 請點擊繼續，遊戲將即時開始！\n💰 掃描完成後（約2-5分鐘），RNS 會自動入帳到你的帳戶。`);
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('continue_with_wallet').setLabel('🚀 繼續遊戲 →').setStyle(ButtonStyle.Primary)
  );
  
  await interaction.update({ embeds: [embed], components: [row] });
  
  // 背景掃描錢包資產（不阻塞遊戲）
  setImmediate(() => {
    scanWalletBackground(user.id);
  });
}

// ============== 背景掃描錢包 ==============
async function scanWalletBackground(discordUserId) {
  try {
    console.log(`[錢包] 開始背景掃描: ${discordUserId}`);
    
    const assets = await WALLET.getPlayerWalletAssets(discordUserId);
    
    // 保存到錢包設定（用於下次快速讀取）
    WALLET.updatePendingRNS(discordUserId, assets.rns);
    WALLET.updateWalletData(discordUserId, {
      cardFMV: assets.assets.cardFMV,
      cardCount: assets.assets.cardCount,
      packTxCount: assets.assets.packTxCount,
      packSpentUSDT: assets.assets.packSpentUSDT
    });
    
    // 更新玩家 RNS
    const player = CORE.loadPlayer(discordUserId);
    if (player) {
      player.stats.財富 = assets.rns;
      CORE.savePlayer(player);
      console.log(`[錢包] ${discordUserId} RNS 已更新: ${assets.rns}`);
      console.log(`[錢包] ${discordUserId} FMV: ${assets.assets.cardFMV}, 可擁有 ${WALLET.getMaxPetsByFMV(assets.assets.cardFMV)} 隻寵物`);
      
      // 如果用戶在線，發送通知
      const threadId = getPlayerThread(discordUserId);
      if (threadId) {
        const thread = CLIENT.channels.cache.get(threadId);
        if (thread) {
          const maxPets = WALLET.getMaxPetsByFMV(assets.assets.cardFMV);
          const cardInfo = assets.assets.cardCount > 0 
            ? `📦 卡片 FMV: $${assets.assets.cardFMV.toFixed(2)} USD (${assets.assets.cardCount}張)\n`
            : '';
          
          thread.send({
            embeds: [{
              title: '💰 RNS 已入帳！',
              color: 0x00ff00,
              description: `背景掃描完成！\n\n${cardInfo}📊 開包數量: ${assets.assets.packTxCount} 次\n🎁 初始 RNS: ${assets.rns}\n🐾 可擁有寵物: ${maxPets} 隻\n\n*你可以繼續遊戲了！*`
            }]
          }).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error(`[錢包] 背景掃描失敗: ${e.message}`);
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
    await showMainMenu(interaction, player, PET.loadPet(user.id));
    return;
  }
  
  // 繼續新角色流程（在當前 thread）
  await interaction.update({ content: '正在創建角色...', components: [] });
  
  try {
    // 讀取錢包資產
    const assets = await WALLET.getPlayerWalletAssets(user.id);
    
    // 根據 RNS 計算初始金錢
    const initialRns = assets.rns;
    
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
    
    await interaction.update({ content: '✅ 角色創建完成！', components: [] });
  } catch (err) {
    console.error('[錯誤] 創建角色失敗:', err.message);
    await interaction.update({ content: '❌ 創建失敗，請重試', components: [] });
  }
});

// ============== 選擇陣營 ==============
async function handleChooseAlignment(interaction, user, customId) {
  const alignment = customId === 'choose_positive' ? '正派' : '反派';
  
  // 使用暫時 RNS（背景掃描完成後會更新）
  const pendingRNS = WALLET.getPendingRNS(user.id);
  
  const player = CORE.createPlayer(user.id, user.username, '男', '無門無派');
  player.alignment = alignment;
  player.wanted = 0;
  player.stats.財富 = pendingRNS; // 使用暫時 RNS（0 或上次保存的值）
  CORE.savePlayer(player);
  
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
  
  await interaction.update({ embeds: [embed], components: [row] });
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
  if (!player.eventChoices || player.eventChoices.length === 0) {
    player.eventChoices = EVENTS.generateEventChoices(player, {});
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
    return new ButtonBuilder()
      .setCustomId(`event_${i}`)
      .setLabel(`${i+1}`)
      .setStyle(ButtonStyle.Primary);
  });
  buttons.push(
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_moves').setLabel('📜').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_character').setLabel('👤').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_profile').setLabel('💳').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_gacha').setLabel('🎰').setStyle(ButtonStyle.Secondary)
  );
  
  const components = [];
  for (let i = 0; i < buttons.length; i += 5) {
    components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  
  // 發送 Loading 訊息到 thread
  const loadingMsg = await thread.send({ embeds: [loadingEmbed], components });
  
  // 如果有 interaction（按鈕觸發），立即確認避免超時
  if (interaction) {
    await interaction.deferUpdate().catch(() => {});
  }
  
  // 背景 AI 生成故事
  STORY.generateStory(null, player, pet, null).then(storyText => {
    // 更新為 AI 生成的內容
    const aiDesc = `**狀態：【${statusBar}】**\n\n${storyText}\n\n**選項：**${optionsText}\n\n_請選擇編號（1-7）_`;
    
    const aiEmbed = new EmbedBuilder()
      .setTitle(`⚔️ ${player.name} - ${pet.name}`)
      .setColor(0x00ff00)
      .setDescription(aiDesc);
    
    loadingMsg.edit({ embeds: [aiEmbed], components }).catch(() => {});
  }).catch(() => {});
  
  return;
}

// ============== 主選單 ===============
async function showMainMenu(interaction, player, pet) {
  choices.slice(0, 7).forEach((choice, i) => {
    const text = choice.choice || choice.name;
    optionsText += `\n${i+1}. ${text}`;
  });
  
  const description = `**狀態：【${statusBar}】**\n\n${openingNarrative}\n\n**選項：**${optionsText}\n\n_請選擇編號（1-7）_`;
  
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
  
  // ===== 生成7個數字按鈕 =====
  const buttons = choices.slice(0, 7).map((choice, i) => {
    return new ButtonBuilder()
      .setCustomId(`event_${i}`)
      .setLabel(`${i+1}`)
      .setStyle(ButtonStyle.Primary);
  });
  
  // ===== 底部快捷欄 =====
  buttons.push(
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_moves').setLabel('📜').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_character').setLabel('👤').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_profile').setLabel('💳').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_gacha').setLabel('🎰').setStyle(ButtonStyle.Secondary)
  );
  
  // 每行最多5個
  const components = [];
  for (let i = 0; i < buttons.length; i += 5) {
    components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  
  await interaction.reply({ embeds: [embed], components });
}

// ============== 設置選單 ==============
async function showSettings(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const currentLang = player?.language || 'zh-TW';
  const langName = currentLang === 'zh-TW' ? '中文（繁體）' : currentLang === 'en' ? 'English' : '中文（繁體）';
  
  const embed = new EmbedBuilder()
    .setTitle(`⚙️ ${t('settings')}`)
    .setColor(0x0099ff)
    .setDescription('遊戲設置')
    .addFields(
      { name: '🌐 語言', value: `目前：${langName}`, inline: false }
    );
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lang_zh').setLabel('🇹🇼 中文').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('lang_en').setLabel('🇺🇸 English').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back')).setStyle(ButtonStyle.Secondary)
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
  
  // 減少飽腹度
  player.stats.飽腹度 = Math.max(0, (player.stats.飽腹度 || 100) - Math.floor(Math.random() * 5 + 3));
  CORE.savePlayer(player);
  
  const statusBar = `氣血 ${pet.hp}/${pet.maxHp} | 內力 ${player.stats.內力 || 10}/${player.maxStats.內力 || 10} | 飽腹度 ${player.stats.飽腹度} | Rns ${player.stats.財富} | ${player.location}`;
  
  // 取得選擇的名稱
  const selectedChoice = event.choice || event.name || '未知選擇';
  
  // 直接回覆並創建新訊息（不用 deferUpdate，避免按鈕過期）
  await interaction.reply({
    content: `**📍 你選擇了：** ${selectedChoice}\n\n⏳ *AI 說書人正在構思故事...*\n\n_請稍候..._`,
    ephemeral: false
  }).catch(() => {
    // 如果 reply 失敗，嘗試 update
    interaction.update({
      content: `**📍 你選擇了：** ${selectedChoice}\n\n⏳ *AI 說書人正在構思故事...*`,
      components: []
    }).catch(() => {});
  });
  
  // 背景 AI 生成故事和選項
  STORY.generateStory(event, player, pet, event).then(storyText => {
    return STORY.generateChoicesWithAI(player, pet, storyText).then(aiChoices => {
      return { storyText, aiChoices };
    }).catch(() => {
      return { storyText, aiChoices: null };
    });
  }).then(({ storyText, aiChoices }) => {
    // 使用 AI 選項或生成新的
    if (aiChoices && aiChoices.length > 0) {
      player.eventChoices = aiChoices;
    } else {
      player.eventChoices = EVENTS.generateEventChoices(player, {});
    }
    CORE.savePlayer(player);
    
    const newChoices = player.eventChoices;
    
    // 構建新選項文字（避免顯示 "true"）
    let optionsText = '';
    newChoices.slice(0, 7).forEach((c, i) => {
      const text = (c.choice || c.name || '').toString();
      if (text && text !== 'true' && text !== 'false') {
        optionsText += `\n${i+1}. ${text}`;
      }
    });
    
    // 構建獎勵文字
    const rewardText = [];
    if (result.gold) rewardText.push(`💰 +${result.gold} Rns`);
    if (result.wantedLevel) rewardText.push(`⚠️ 通緝等级: ${result.wantedLevel}`);
    
    // 世界事件
    const worldEvents = CORE.getRecentWorldEvents(3);
    let worldEventsText = '';
    if (worldEvents.length > 0) {
      worldEventsText = '\n\n📢 **世界事件：**\n' + worldEvents.map(e => e.message || e).join('\n');
    }
    
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
    
    // 生成按鈕
    const buttons = newChoices.slice(0, 7).map((c, i) => {
      const label = (c.choice || c.name || `選項${i+1}`).toString();
      return new ButtonBuilder()
        .setCustomId(`event_${i}`)
        .setLabel(label.substring(0, 20)) // 限制長度
        .setStyle(ButtonStyle.Primary);
    });
    buttons.push(
      new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('show_moves').setLabel('📜').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_character').setLabel('👤').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_settings').setLabel('⚙️').setStyle(ButtonStyle.Secondary)
    );
    
    const components = [];
    for (let i = 0; i < buttons.length; i += 5) {
      components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    
    // 發送新訊息到 thread
    interaction.channel.send({ embeds: [embed], components }).catch(() => {});
  }).catch((err) => {
    console.error('[事件] 處理失敗:', err);
    // 失敗時用模板並發送到 thread
    player.eventChoices = EVENTS.generateEventChoices(player, {});
    CORE.savePlayer(player);
  });
  
  return;
}

// ============== 戰鬥 ==============
async function handleFight(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  
  if (!pet || pet.moves.length === 0) {
    await interaction.update({ content: '❌ 沒有招式！', components: [] });
    return;
  }
  
  const enemy = BATTLE.createEnemy('哥布林', 1);
  
  const moveButtons = pet.moves.slice(0, 4).map((m, i) => {
    const d = BATTLE.calculatePlayerMoveDamage(m, player, pet);
    return new ButtonBuilder()
      .setCustomId(`use_move_${i}`)
      .setLabel(`${m.name} (${d.total})`)
      .setStyle(ButtonStyle.Danger);
  });
  
  const moveRow = new ActionRowBuilder().addComponents(moveButtons);
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('flee_0').setLabel(`${t('flee')} (70%×2)`).setStyle(ButtonStyle.Secondary)
  );
  
  // 詳細招式資訊
  const dmgInfo = pet.moves.map(m => {
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
    return `⚔️ ${m.name} | ${d.total}dmg | ${effectStr || '無'}`;
  }).join('\n');
  
  await interaction.update({
    content: `⚔️ **戰鬥！${enemy.name}**\n\n敵人 HP: ${enemy.hp} | ATK: ${enemy.attack}\n你的 ${pet.name} HP: ${pet.hp}\n\n**招式：**\n${dmgInfo}`,
    components: [moveRow, actionRow]
  });
}

// ============== 使用招式 ==============
async function handleUseMove(interaction, user, moveIndex) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  const enemy = BATTLE.createEnemy('哥布林', 1);
  
  if (!pet || !pet.moves[moveIndex]) {
    await interaction.update({ content: '❌ 招式不存在！', components: [] });
    return;
  }
  
  const chosenMove = pet.moves[moveIndex];
  const enemyMove = BATTLE.enemyChooseMove(enemy);
  
  const result = BATTLE.executeBattleRound(player, pet, enemy, chosenMove, enemyMove);
  
  PET.savePet(pet);
  
  if (result.victory === true) {
    player.stats.財富 += result.gold;
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
  
  // 繼續戰鬥
  const moveButtons = pet.moves.slice(0, 4).map((m, i) => {
    const d = BATTLE.calculatePlayerMoveDamage(m, player, pet);
    return new ButtonBuilder()
      .setCustomId(`use_move_${i}`)
      .setLabel(`${m.name} (${d.total})`)
      .setStyle(ButtonStyle.Danger);
  });
  
  const moveRow = new ActionRowBuilder().addComponents(moveButtons);
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('flee_0').setLabel(`${t('flee')} (70%×2)`).setStyle(ButtonStyle.Secondary)
  );
  
  await interaction.update({
    content: `⚔️ **${pet.name} vs ${enemy.name}**\n\n${result.message}\n\n敵人 HP: ${enemy.hp}\n你的 HP: ${pet.hp}`,
    components: [moveRow, actionRow]
  });
}

// ============== 逃跑 ==============
async function handleFlee(interaction, user, attemptNum) {
  const player = CORE.loadPlayer(user.id);
  const pet = PET.loadPet(user.id);
  const enemy = BATTLE.createEnemy('哥布林', 1);
  enemy.hp = 50;
  
  const result = BATTLE.attemptFlee(player, pet, enemy, attemptNum + 1);
  
  if (result.success) {
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
  
  // 可以再試一次
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`flee_${attemptNum + 1}`).setLabel('🏃 再逃一次！').setStyle(ButtonStyle.Danger),
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
