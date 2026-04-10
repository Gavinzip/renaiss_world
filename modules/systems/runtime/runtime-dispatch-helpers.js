function createRuntimeDispatchHelpers(deps = {}) {
  const {
    CORE,
    PET,
    ECON,
    resolvePlayerMainPet = () => ({ pet: null, changed: false }),
    sendMainMenuToThread = async () => {},
    handleGachaResult = async () => {}
  } = deps;

  function trackActiveGameMessage(player, channelId, messageId) {
    if (!player) return;
    player.activeThreadId = channelId || null;
    player.activeMessageId = messageId || null;
    CORE.savePlayer(player);
  }

  function consumeFinanceNotices(player, limit = 3) {
    if (!ECON || typeof ECON.consumeFinanceNotices !== 'function') return [];
    return ECON.consumeFinanceNotices(player, limit);
  }

  async function handleDrawMove(interaction, user) {
    const cid = String(interaction?.customId || '');
    const tail = cid.split('_').pop();
    const parsed = Number(tail);
    const count = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    return handleGachaResult(interaction, user, count >= 10 ? 10 : 1);
  }

  async function tryRecoverMainMenuAfterFailure(interaction, userId) {
    if (!interaction?.channel?.isThread?.()) return false;
    const playerId = String(userId || '').trim();
    if (!playerId) return false;
    const player = CORE.loadPlayer(playerId);
    if (!player) return false;
    const fallbackPet = PET.loadPet(playerId);
    const petResolved = resolvePlayerMainPet(player, { fallbackPet });
    const pet = petResolved?.pet || fallbackPet;
    if (!pet) return false;
    if (petResolved?.changed) {
      CORE.savePlayer(player);
    }
    await sendMainMenuToThread(interaction.channel, player, pet, null);
    return true;
  }

  return {
    trackActiveGameMessage,
    consumeFinanceNotices,
    handleDrawMove,
    tryRecoverMainMenuAfterFailure
  };
}

module.exports = {
  createRuntimeDispatchHelpers
};
