function createResumeOrGameUtils(deps = {}) {
  const {
    CLIENT,
    CORE,
    PET,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    WORLD_BACKUP_NOTIFY_CHANNEL_ID = 0
  } = deps;

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

  return {
    notifyWorldBackupSuccess,
    resumeExistingOnboardingOrGame
  };
}

module.exports = {
  createResumeOrGameUtils
};
