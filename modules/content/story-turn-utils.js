function createStoryTurnUtils(deps = {}) {
  const {
    QUICK_SHOP_COOLDOWN_TURNS = 5,
    getPlayerUILang,
    getUtilityButtonLabels,
    ButtonBuilder,
    ButtonStyle,
    getMarketTypeLabel,
    getLocationDisplayName = (v = '') => String(v || ''),
    localizeDisplayText = (v = '') => String(v || '')
  } = deps;

  function getQuickShopNarrativeText(lang = 'zh-TW') {
    const code = String(lang || 'zh-TW').trim().toLowerCase();
    if (code === 'en' || code.startsWith('en-')) {
      return {
        enter: (location, market) => `🧭 You pause at ${location} for a quick detour and head straight into the familiar ${market} sign.`,
        context: (tail) => `📖 Continuing from: ${tail}`,
        fallback: (location, market) => `🧭 You stop briefly at ${location}, step into the ${market} to handle trade matters, and plan to return to the adventure right after.`
      };
    }
    if (code === 'ko' || code === 'ko-kr' || code === 'kr') {
      return {
        enter: (location, market) => `🧭 당신은 ${location}에서 잠시 동선을 정리하고 익숙한 간판을 따라 ${market} 안으로 빠르게 들어간다.`,
        context: (tail) => `📖 앞선 흐름 이어받기: ${tail}`,
        fallback: (location, market) => `🧭 당신은 ${location}에서 잠시 보급을 정리하고 ${market}에 들러 거래를 처리한 뒤 다시 모험으로 돌아가려 한다.`
      };
    }
    if (code === 'zh-cn' || code === 'zh_cn' || code === 'zh-hans') {
      return {
        enter: (location, market) => `🧭 你在${location}暂时收束行程，沿着熟悉招牌快步走进${market}。`,
        context: (tail) => `📖 承接前情：${tail}`,
        fallback: (location, market) => `🧭 你在${location}短暂补给，决定先进入${market}处理交易，再回到原本冒险。`
      };
    }
    return {
      enter: (location, market) => `🧭 你在${location}暫時收束行程，沿著熟悉招牌快步走進${market}。`,
      context: (tail) => `📖 承接前情：${tail}`,
      fallback: (location, market) => `🧭 你在${location}短暫補給，決定先進入${market}處理交易，再回到原本冒險。`
    };
  }

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
    const uiLang = typeof getPlayerUILang === 'function' ? getPlayerUILang(player) : 'zh-TW';
    const tx = getQuickShopNarrativeText(uiLang);
    const marketLabel = localizeDisplayText(
      typeof getMarketTypeLabel === 'function' ? getMarketTypeLabel(marketType) : '鑑價站',
      uiLang
    ) || '鑑價站';
    const location = getLocationDisplayName(String(player?.location || '附近據點'), uiLang)
      || localizeDisplayText(String(player?.location || '附近據點'), uiLang)
      || String(player?.location || '附近據點');
    const tail = localizeDisplayText(extractStoryTailLine(player?.currentStory || '', 76), uiLang);
    if (tail) {
      return `${tx.enter(location, marketLabel)}\n${tx.context(tail)}`;
    }
    return tx.fallback(location, marketLabel);
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
