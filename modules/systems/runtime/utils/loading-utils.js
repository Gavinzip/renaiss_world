const { getLoadingAnimationText } = require('./global-language-resources');

function createLoadingUtils() {
  function startLoadingAnimation(message, label = '', lang = 'zh-TW') {
    if (!message) return () => {};

    const loadingText = getLoadingAnimationText(lang);
    const frames = ['⏳', '⌛', '🌀'];
    const phases = Array.isArray(loadingText?.phases) && loadingText.phases.length > 0
      ? loadingText.phases
      : ['鋪陳場景', '安排角色互動', '生成分支選項', '補完世界細節'];
    const displayLabel = String(label || loadingText?.defaultLabel || 'Loading').trim();
    const startAt = Date.now();
    let tick = 0;

    message.edit({ content: `⏳ ${displayLabel}...（${phases[0]}）` }).catch(() => {});

    const timer = setInterval(() => {
      tick += 1;
      const icon = frames[tick % frames.length];
      const dots = '.'.repeat((tick % 3) + 1);
      const elapsed = Math.floor((Date.now() - startAt) / 1000);
      const phase = phases[tick % phases.length];
      message.edit({ content: `${icon} ${displayLabel}${dots}（${phase}｜${elapsed}s）` }).catch(() => {});
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
