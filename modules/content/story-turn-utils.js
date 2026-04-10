function createStoryTurnUtils(deps = {}) {
  const {
    QUICK_SHOP_COOLDOWN_TURNS = 5,
    getPlayerUILang,
    getUtilityButtonLabels,
    ButtonBuilder,
    ButtonStyle,
    getMarketTypeLabel
  } = deps;

  function getPlayerStoryTurns(player) {
    const turns = Number(player?.storyTurns || 0);
    return Number.isFinite(turns) ? Math.max(0, Math.floor(turns)) : 0;
  }

  function getQuickShopCooldownInfo(player) {
    const currentTurn = getPlayerStoryTurns(player);
    const lastTurn = Number(player?.lastQuickShopTurn || 0);
    const safeLastTurn = Number.isFinite(lastTurn) ? Math.max(0, Math.floor(lastTurn)) : 0;
    const nextReadyTurn = safeLastTurn > 0
      ? safeLastTurn + QUICK_SHOP_COOLDOWN_TURNS
      : QUICK_SHOP_COOLDOWN_TURNS;
    const remaining = Math.max(0, nextReadyTurn - currentTurn);
    return {
      currentTurn,
      lastTurn: safeLastTurn,
      nextReadyTurn,
      remaining,
      ready: remaining <= 0
    };
  }

  function buildQuickShopButton(player) {
    const cd = getQuickShopCooldownInfo(player);
    const uiLang = typeof getPlayerUILang === 'function' ? getPlayerUILang(player) : 'zh-TW';
    const labels = typeof getUtilityButtonLabels === 'function' ? getUtilityButtonLabels(uiLang) : {
      quickShopReady: '🛒 快速商城',
      quickShopCooldown: (remaining = 0) => `🛒 ${remaining}T`
    };
    const label = cd.ready
      ? labels.quickShopReady
      : labels.quickShopCooldown(cd.remaining);
    return new ButtonBuilder()
      .setCustomId('quick_shop_entry')
      .setLabel(String(label || '').slice(0, 20))
      .setStyle(ButtonStyle.Success)
      .setDisabled(!cd.ready);
  }

  function extractStoryTailLine(story = '', maxChars = 70) {
    const text = String(story || '').trim();
    if (!text) return '';
    const lines = text
      .split('\n')
      .map((line) => line.replace(/\*\*/g, '').trim())
      .filter(Boolean);
    const tail = lines.length > 0 ? lines[lines.length - 1] : text;
    return tail.length > maxChars ? `${tail.slice(0, maxChars)}...` : tail;
  }

  function buildQuickShopNarrativeNotice(player, marketType = 'renaiss') {
    const marketLabel = typeof getMarketTypeLabel === 'function' ? getMarketTypeLabel(marketType) : '鑑價站';
    const location = String(player?.location || '附近據點');
    const tail = extractStoryTailLine(player?.currentStory || '', 76);
    if (tail) {
      return `🧭 你在${location}暫時收束行程，沿著熟悉招牌快步走進${marketLabel}。\n📖 承接前情：${tail}`;
    }
    return `🧭 你在${location}短暫補給，決定先進入${marketLabel}處理交易，再回到原本冒險。`;
  }

  function incrementPlayerStoryTurns(player, amount = 1) {
    if (!player || typeof player !== 'object') return 0;
    const next = getPlayerStoryTurns(player) + Math.max(0, Number(amount) || 0);
    player.storyTurns = next;
    return next;
  }

  return {
    getPlayerStoryTurns,
    getQuickShopCooldownInfo,
    buildQuickShopButton,
    extractStoryTailLine,
    buildQuickShopNarrativeNotice,
    incrementPlayerStoryTurns
  };
}

module.exports = { createStoryTurnUtils };
