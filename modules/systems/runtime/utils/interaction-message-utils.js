function createInteractionMessageUtils() {
  const ALWAYS_KEEP_VISIBLE_BUTTONS = new Set([
    'open_friend_add_modal',
    'open_wallet_modal'
  ]);

  const shouldKeepModalLauncherVisible = (() => {
    const raw = String(process.env.BUTTON_HIDE_KEEP_MODAL_LAUNCHERS || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  })();

  async function findMessageInChannel(channel, messageId) {
    if (!channel || !messageId || typeof messageId !== 'string') return null;
    if (!channel.messages) return null;
    const cached = channel.messages.cache?.get(messageId);
    if (cached) return cached;
    try {
      return await channel.messages.fetch(messageId);
    } catch {
      return null;
    }
  }

  async function disableMessageComponents(channel, messageId, messageRef = null) {
    if (!messageId || messageId.startsWith('instant_')) return;
    const directMsg = messageRef && typeof messageRef.edit === 'function' ? messageRef : null;
    if (directMsg) {
      await directMsg.edit({ components: [] }).catch(() => {});
      return;
    }
    const msg = await findMessageInChannel(channel, messageId);
    if (!msg) return;
    await msg.edit({ components: [] }).catch(() => {});
  }

  async function lockPressedButtonImmediately(interaction) {
    const message = interaction?.message;
    if (!interaction?.isButton?.() || !message?.id) return;
    await disableMessageComponents(interaction.channel, message.id, message);
  }

  function isModalLauncherButtonId(customId = '') {
    const cid = String(customId || '').trim();
    if (!cid) return false;
    if (ALWAYS_KEEP_VISIBLE_BUTTONS.has(cid)) return true;
    if (cid.startsWith('alloc_hp_open_')) return true;
    if (!shouldKeepModalLauncherVisible) return false;
    return (
      cid === 'open_profile' ||
      cid === 'open_character' ||
      cid === 'open_friends' ||
      cid === 'open_settings' ||
      cid === 'open_gacha' ||
      cid === 'main_menu' ||
      cid === 'open_friend_add_modal' ||
      cid === 'sync_wallet_now' ||
      cid.startsWith('claim_new_pet_element_')
    );
  }

  function snapshotMessageComponentsForRestore(message) {
    if (!message || !Array.isArray(message.components)) return [];
    return message.components
      .map((row) => {
        try {
          return typeof row?.toJSON === 'function' ? row.toJSON() : row;
        } catch {
          return null;
        }
      })
      .filter((row) => row && Array.isArray(row.components) && row.components.length > 0);
  }

  function createButtonInteractionTemplateContext(interaction, customId = '') {
    const context = {
      enabled: false,
      restored: false,
      customId: String(customId || '').trim(),
      messageId: String(interaction?.message?.id || '').trim(),
      snapshot: []
    };
    if (!interaction?.isButton?.() || !context.messageId) return context;
    if (isModalLauncherButtonId(customId)) return context;
    const snapshot = snapshotMessageComponentsForRestore(interaction.message);
    if (!Array.isArray(snapshot) || snapshot.length <= 0) return context;
    context.enabled = true;
    context.snapshot = snapshot;
    return context;
  }

  function attachButtonTemplateReplyAutoRestore(interaction, context) {
    if (!interaction || !context?.enabled || context?._hooked) return;
    context._hooked = true;
    const wrapMethod = (methodName) => {
      const original = interaction?.[methodName];
      if (typeof original !== 'function') return;
      interaction[methodName] = async (...args) => {
        try {
          return await original.apply(interaction, args);
        } finally {
          await restoreButtonTemplateSnapshot(interaction, context).catch(() => {});
        }
      };
    };
    wrapMethod('reply');
    wrapMethod('followUp');
  }

  async function restoreButtonTemplateSnapshot(interaction, context) {
    if (!context?.enabled || context?.restored) return false;
    if (!Array.isArray(context.snapshot) || context.snapshot.length <= 0) return false;
    const channel = interaction?.channel;
    if (!channel) return false;
    const messageId = String(context.messageId || interaction?.message?.id || '').trim();
    if (!messageId) return false;
    const msg = await findMessageInChannel(channel, messageId);
    if (!msg) return false;
    const ok = await msg.edit({ components: context.snapshot }).then(() => true).catch(() => false);
    if (ok) context.restored = true;
    return ok;
  }

  async function updateInteractionMessage(interaction, payload) {
    if (!interaction) return;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
      return;
    }
    await interaction.update(payload);
  }

  return {
    findMessageInChannel,
    disableMessageComponents,
    lockPressedButtonImmediately,
    isModalLauncherButtonId,
    snapshotMessageComponentsForRestore,
    createButtonInteractionTemplateContext,
    attachButtonTemplateReplyAutoRestore,
    restoreButtonTemplateSnapshot,
    updateInteractionMessage
  };
}

module.exports = {
  createInteractionMessageUtils
};
