function createWalletInteractionUtils(deps = {}) {
  const {
    showWalletBindModal = async () => {},
    handleWalletSyncNow = async () => {},
    handleWalletBind = async () => {}
  } = deps;

  async function handleWalletInteractions(interaction, user, customId) {
    if (customId === 'open_wallet_modal') {
      await showWalletBindModal(interaction);
      return true;
    }

    if (customId === 'sync_wallet_now') {
      await handleWalletSyncNow(interaction, user);
      return true;
    }

    if (customId === 'wallet_bind_modal') {
      await handleWalletBind(interaction, user);
      return true;
    }

    return false;
  }

  return {
    handleWalletInteractions
  };
}

module.exports = {
  createWalletInteractionUtils
};

