function createWorldTickUtils(deps = {}) {
  const {
    CLIENT,
    CORE,
    EVENTS,
    EmbedBuilder,
    loadPlayerThreads = () => ({}),
    getIsRunning = () => true
  } = deps;

  function startAutoTick() {
    console.log('[自動] 世界結算啟動（每24小時）');

    setInterval(async () => {
      if (!getIsRunning()) return;

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

      const threadIds = Object.values(loadPlayerThreads()).filter(Boolean);
      const targetThreadIds = Array.from(new Set(threadIds));
      for (const threadId of targetThreadIds) {
        try {
          let ch = CLIENT.channels.cache.get(threadId) || null;
          if (!ch) ch = await CLIENT.channels.fetch(threadId);
          if (!ch || typeof ch.send !== 'function') continue;
          await ch.send({ embeds: [embed] }).catch(() => {});
        } catch {
          // ignore single-thread failure
        }
      }
    }, 86400000);
  }

  return {
    startAutoTick
  };
}

module.exports = { createWorldTickUtils };
