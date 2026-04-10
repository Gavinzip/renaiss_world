function createMessageFallbackUtils(deps = {}) {
  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
  } = deps;

  function buildRetryGenerationComponents() {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('retry_story_generation').setLabel('🔄 重新生成').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_menu').setLabel('🏠 主選單').setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  async function editOrSendFallback(channel, targetMessage, payload, context = 'story_update') {
    if (targetMessage && typeof targetMessage.edit === 'function') {
      try {
        const edited = await targetMessage.edit(payload);
        return edited || targetMessage;
      } catch (e) {
        console.log(`[UI][${context}] message edit failed, fallback send:`, e?.message || e);
      }
    }
    if (!channel || typeof channel.send !== 'function') return null;
    try {
      return await channel.send(payload);
    } catch (e) {
      console.log(`[UI][${context}] fallback send failed:`, e?.message || e);
      return null;
    }
  }

  return {
    buildRetryGenerationComponents,
    editOrSendFallback
  };
}

module.exports = { createMessageFallbackUtils };
