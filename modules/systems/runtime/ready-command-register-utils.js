function createReadyCommandRegisterUtils(deps = {}) {
  const {
    CLIENT,
    STORAGE,
    startWorldBackupScheduler = () => {},
    notifyWorldBackupSuccess = async () => {},
    startAutoTick = () => {},
    commands = []
  } = deps;

  function registerReadyHandlers() {
    CLIENT.once('ready', () => {
      console.log('[Bot] 🌟 Renaiss World 上線！');
      console.log('[系統] 模組：pet, battle, event, food');
      startAutoTick();
    });

    CLIENT.on('ready', async () => {
      console.log(`[Storage] APP_ENV=${STORAGE.appEnv} data=${STORAGE.dataDir} worldRoot=${STORAGE.worldDataRoot}`);
      startWorldBackupScheduler(notifyWorldBackupSuccess);

      try {
        await CLIENT.application.commands.set(commands);
        console.log('[Slash] 全球指令已註冊');
      } catch (e) {
        console.log('[Slash] 全球註冊失敗:', e.message);
      }

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
  }

  return {
    registerReadyHandlers
  };
}

module.exports = {
  createReadyCommandRegisterUtils
};
