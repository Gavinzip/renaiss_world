function createMarketSessionUtils(deps = {}) {
  const {
    normalizeEventChoices = (_player, choices) => (Array.isArray(choices) ? choices : [])
  } = deps;

  function cloneChoicesForSnapshot(choices = []) {
    const list = normalizeEventChoices(null, Array.isArray(choices) ? choices : []);
    return list.map((choice) => JSON.parse(JSON.stringify(choice)));
  }

  function openShopSession(player, marketType = 'renaiss', sourceChoice = '') {
    if (!player || typeof player !== 'object') return;
    player.shopSession = {
      open: true,
      marketType: marketType === 'digital' ? 'digital' : 'renaiss',
      enteredAt: Date.now(),
      sourceChoice: String(sourceChoice || ''),
      preStory: String(player.currentStory || ''),
      preChoices: cloneChoicesForSnapshot(player.eventChoices || []),
      sellDraftOptions: [],
      pendingSellSpec: null,
      haggleDraftOptions: [],
      haggleBulkSelectedSpecs: [],
      pendingHaggleOffer: null
    };
  }

  function leaveShopSession(player) {
    if (!player || !player.shopSession) return false;
    const session = player.shopSession;
    if (String(session.preStory || '').trim()) {
      player.currentStory = String(session.preStory || '');
    }
    if (Array.isArray(session.preChoices) && session.preChoices.length > 0) {
      player.eventChoices = cloneChoicesForSnapshot(session.preChoices);
    }
    delete player.shopSession;
    return true;
  }

  return {
    cloneChoicesForSnapshot,
    openShopSession,
    leaveShopSession
  };
}

module.exports = { createMarketSessionUtils };
