function createStartCommandUtils(deps = {}) {
  const {
    CORE,
    PET,
    MAIN_STORY,
    WALLET,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    createNewThread = async () => null,
    resolvePlayerMainPet = () => ({ pet: null, changed: false }),
    ensurePlayerGenerationSchema = () => {},
    sendMainMenuToThread = async () => {},
    setPlayerThread = () => {},
    t = (key) => key
  } = deps;

  async function handleStart(interaction, user) {
    await interaction.reply({
      content: '🎮 正在開啟新討論串...',
      ephemeral: true
    }).catch(() => {});

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

    const player = CORE.loadPlayer(user.id);
    const fallbackPet = PET.loadPet(user.id);
    const petResolved = resolvePlayerMainPet(player, { fallbackPet });
    const pet = petResolved?.pet || fallbackPet;

    if (player) {
      MAIN_STORY.ensureMainStoryState(player);
      ensurePlayerGenerationSchema(player);
      player.activeMessageId = null;
      player.activeThreadId = null;
      CORE.savePlayer(player);
    }

    if (player && pet && pet.hatched) {
      if (!player.language) {
        player.language = 'zh-TW';
        CORE.savePlayer(player);
      }

      await thread.send({
        content: `👋 <@${user.id}> ${t('welcomeBack', player.language || 'zh-TW')}`
      });
      await sendMainMenuToThread(thread, player, pet, null);
      return;
    }

    if (player && pet && !pet.hatched) {
      const embed = new EmbedBuilder()
        .setTitle('🐾 你的寵物蛋還沒孵化！')
        .setColor(0xffd700)
        .setDescription('讓我們繼續孵化你的寵物吧！');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('hatch_egg').setLabel('🔨 敲開寵物蛋！').setStyle(ButtonStyle.Primary)
      );

      setPlayerThread(user.id, thread.id);
      await thread.send({ embeds: [embed], components: [row] });
      return;
    }

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

    const walletBound = WALLET.isWalletBound(user.id);
    const walletNote = walletBound
      ? '✅ 已綁定錢包：建立角色時會帶入目前錢包資產。'
      : 'ℹ️ 尚未綁定錢包：你可以先玩，之後到設定綁定並即時入帳。';

    try {
      const langEmbed = new EmbedBuilder()
        .setTitle('🌍 選擇你的語言 / Choose Your Language')
        .setColor(0xffd700)
        .setDescription(`**${user.username}**，歡迎來到 Renaiss 星球！\n\nPlease select your language first / 請先選擇語言：\n\n支援的語言：`)
        .addFields(
          { name: '🇹🇼 繁體中文', value: '繁體中文（台灣、香港）', inline: true },
          { name: '🇨🇳 簡體中文', value: '简体中文（中国）', inline: true },
          { name: '🇺🇸 English', value: 'English (US/EU)', inline: true },
          { name: '🇰🇷 한국어', value: '한국어 (Korean)', inline: true },
          { name: '💳 錢包狀態', value: walletNote, inline: false }
        );

      const langRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('select_lang_zh-TW').setLabel('🇹🇼 繁體中文').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('select_lang_zh-CN').setLabel('🇨🇳 簡體中文').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('select_lang_en').setLabel('🇺🇸 English').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('select_lang_ko').setLabel('🇰🇷 한국어').setStyle(ButtonStyle.Secondary)
      );

      await thread.send({
        content: `👋 <@${user.id}> 這是你的專屬討論串！開始你的Renaiss探險之旅！`,
        embeds: [langEmbed],
        components: [langRow]
      });

      setPlayerThread(user.id, thread.id);
    } catch (err) {
      console.error('[錯誤] 創建討論串失敗:', err.message);
      await interaction.followUp({ content: '❌ 創建討論串失敗', ephemeral: true }).catch(() => {});
    }
  }

  return {
    handleStart
  };
}

module.exports = {
  createStartCommandUtils
};
