function createThreadLifecycleUtils(deps = {}) {
  const {
    CLIENT,
    ChannelType,
    getPlayerThread = () => null,
    setPlayerThread = () => {}
  } = deps;

  async function closeOldThread(userId) {
    const oldThreadId = getPlayerThread(userId);
    if (!oldThreadId) return;

    const oldThread = CLIENT?.channels?.cache?.get(oldThreadId);
    if (oldThread && oldThread.isThread && oldThread.isThread()) {
      try {
        await oldThread.send({
          content: '👋 這個討論串即將被關閉。\n使用 /start 會開啟新的討論串。'
        });
        await oldThread.setArchived(true, '開啟新討論串');
        console.log(`[遊戲] 已歸檔舊 thread: ${oldThreadId}`);
      } catch (e) {
        console.log(`[遊戲] 歸檔舊 thread 失敗: ${e?.message || e}`);
      }
    }

    setPlayerThread(userId, null);
  }

  async function createNewThread(channel, user) {
    await closeOldThread(user.id);
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

  return {
    closeOldThread,
    createNewThread
  };
}

module.exports = { createThreadLifecycleUtils };
