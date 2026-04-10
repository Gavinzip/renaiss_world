function createMapSelectUtils(deps = {}) {
  const {
    CORE,
    ISLAND_STORY,
    getLocationProfile = () => null,
    canFreeRoamCurrentRegion = () => false,
    ensurePlayerIslandState = () => {},
    getPlayerUILang = () => 'zh-TW',
    getMapText = () => ({
      mapNotFoundPlayer: '❌ 找不到角色。',
      mapExploreLockedNotice: '⚠️ 尚未解鎖。',
      mapInvalidDestination: '⚠️ 無效目的地。',
      mapCrossRegionBlocked: '⚠️ 無法跨區。',
      mapAlreadyHereNotice: (loc) => `你已在 ${loc}`,
      mapDestinationSetNotice: (loc) => `已設定目的地：${loc}`
    }),
    showIslandMap = async () => {}
  } = deps;

  async function handleMapRegionMoveSelect(interaction, user, customId) {
    if (customId !== 'map_region_move_select') return false;

    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getMapText(uiLang);
    if (!player) {
      await interaction.reply({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
      return true;
    }
    ensurePlayerIslandState(player);
    const islandState = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
      ? ISLAND_STORY.getIslandStoryState(player, player.location)
      : null;
    if (!islandState?.completed && !canFreeRoamCurrentRegion(player)) {
      await interaction.reply({
        content: tx.mapExploreLockedNotice,
        ephemeral: true
      }).catch(() => {});
      return true;
    }
    const target = String(interaction.values?.[0] || '').trim();
    if (!target || target === '__locked__') {
      await interaction.reply({ content: tx.mapInvalidDestination, ephemeral: true }).catch(() => {});
      return true;
    }
    const currentProfile = typeof getLocationProfile === 'function' ? getLocationProfile(player.location || '') : null;
    const targetProfile = typeof getLocationProfile === 'function' ? getLocationProfile(target) : null;
    if (!currentProfile || !targetProfile || String(currentProfile.region || '') !== String(targetProfile.region || '')) {
      await interaction.reply({
        content: tx.mapCrossRegionBlocked,
        ephemeral: true
      }).catch(() => {});
      return true;
    }
    if (target === String(player.location || '')) {
      await showIslandMap(interaction, user, 0, tx.mapAlreadyHereNotice(target));
      return true;
    }
    player.navigationTarget = target;
    CORE.savePlayer(player);
    await showIslandMap(interaction, user, 0, tx.mapDestinationSetNotice(target));
    return true;
  }

  return {
    handleMapRegionMoveSelect
  };
}

module.exports = {
  createMapSelectUtils
};

