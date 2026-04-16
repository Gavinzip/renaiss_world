function createSlashCommandListenerUtils() {
  function registerSlashCommandListener(CLIENT, deps = {}) {
    const {
      handleStart = async () => {},
      handleWarStatus = async () => {},
      handleResetData = async () => {},
      handleResetPlayerHistory = async () => {},
      handleResetWorld = async () => {},
      handleBackupWorld = async () => {},
      handleBackupCheck = async () => {},
      handlePullWorldData = async () => {},
      handleInteractionCoverage = async () => {}
    } = deps;

    CLIENT.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const { commandName, user } = interaction;

      try {
        if (commandName === 'start') await handleStart(interaction, user);
        if (commandName === 'warstatus') await handleWarStatus(interaction);
        if (commandName === 'resetdata') await handleResetData(interaction, user);
        if (commandName === 'resetplayerhistory') await handleResetPlayerHistory(interaction, user);
        if (commandName === 'resetworld') await handleResetWorld(interaction, user);
        if (commandName === 'backupworld') await handleBackupWorld(interaction, user);
        if (commandName === 'backupcheck') await handleBackupCheck(interaction, user);
        if (commandName === 'pullworlddata') await handlePullWorldData(interaction, user);
        if (commandName === 'interactioncoverage') await handleInteractionCoverage(interaction, user);
      } catch (err) {
        console.error(`[Slash] 指令處理失敗 ${commandName}:`, err?.message || err);
        if (err?.stack) {
          console.error(`[Slash] stack ${commandName}:\n${err.stack}`);
        }
        const msg = `❌ 指令執行失敗：${err?.message || err}`;
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
        } else {
          await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
        }
      }
    });
  }

  return {
    registerSlashCommandListener
  };
}

module.exports = {
  createSlashCommandListenerUtils
};
