function createThreadGuardUtils(deps = {}) {
  const shouldBypassThreadGuardForOnlineFriendDuel = typeof deps.shouldBypassThreadGuardForOnlineFriendDuel === 'function'
    ? deps.shouldBypassThreadGuardForOnlineFriendDuel
    : (() => false);
  const getThreadOwnerUserId = typeof deps.getThreadOwnerUserId === 'function'
    ? deps.getThreadOwnerUserId
    : (() => '');

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

  async function rejectIfNotLatestThread(interaction, userId, getPlayerThread) {
    if (shouldBypassThreadGuardForOnlineFriendDuel(interaction, userId)) return false;
    if (typeof getPlayerThread !== 'function') return false;
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
    const ownerId = getThreadOwnerUserId(interaction.channelId);
    if (ownerId && ownerId === userId) {
      await interaction.message?.edit({ components: [] }).catch(() => {});
    }
    return true;
  }

  return {
    rejectIfNotThreadOwner,
    rejectIfNotLatestThread
  };
}

module.exports = { createThreadGuardUtils };
