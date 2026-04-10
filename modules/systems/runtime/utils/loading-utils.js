function createLoadingUtils() {
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

  return {
    startLoadingAnimation,
    startTypingIndicator
  };
}

module.exports = { createLoadingUtils };
