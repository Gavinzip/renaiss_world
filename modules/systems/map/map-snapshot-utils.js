function createMapSnapshotUtils(deps = {}) {
  const { CORE } = deps;

  function saveMapReturnSnapshot(player, message) {
    if (!player || !message) return;
    const embeds = Array.isArray(message.embeds) ? message.embeds.map(e => e.toJSON()) : [];
    const components = Array.isArray(message.components) ? message.components.map(r => r.toJSON()) : [];
    const hasAnyButtons = components.some((row) => Array.isArray(row?.components) && row.components.length > 0);
    if (!hasAnyButtons) return;

    player.mapReturnSnapshot = {
      messageId: message.id || null,
      content: message.content || null,
      embeds,
      components,
      savedAt: Date.now()
    };
    CORE.savePlayer(player);
  }

  function consumeMapReturnSnapshot(player, messageId) {
    if (!player?.mapReturnSnapshot) return null;
    const snapshot = player.mapReturnSnapshot;
    if (snapshot.messageId && messageId && snapshot.messageId !== messageId) {
      return null;
    }
    delete player.mapReturnSnapshot;
    CORE.savePlayer(player);
    return snapshot;
  }

  function snapshotHasUsableComponents(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.components)) return false;
    for (const row of snapshot.components) {
      const components = Array.isArray(row?.components) ? row.components : [];
      for (const component of components) {
        const customId = String(component?.custom_id || '');
        if (!customId) continue;
        if (customId === 'map_back_main') continue;
        if (customId.startsWith('map_')) continue;
        if (customId.startsWith('portal_')) continue;
        if (customId.startsWith('device_')) continue;
        return true;
      }
    }
    return false;
  }

  return {
    saveMapReturnSnapshot,
    consumeMapReturnSnapshot,
    snapshotHasUsableComponents
  };
}

module.exports = { createMapSnapshotUtils };
