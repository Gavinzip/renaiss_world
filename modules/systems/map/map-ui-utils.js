function createMapUiUtils(deps = {}) {
  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    getMapText = () => ({}),
    getLocationDisplayName = (value = '') => String(value || ''),
    canFreeRoamCurrentRegion = () => false,
    normalizeMapViewMode = (mode = 'text') => (mode === 'ascii' ? 'ascii' : 'text'),
    MAP_LOCATIONS = [],
    MAP_PAGE_SIZE = 20
  } = deps;

  function buildRegionMoveSelectRow(player, snapshot, islandCompleted, lang = 'zh-TW') {
    const tx = getMapText(lang);
    const locations = Array.isArray(snapshot?.locations) ? snapshot.locations : [];
    const current = String(player?.location || '').trim();
    const freeRoamUnlocked = canFreeRoamCurrentRegion(player);
    const canMoveInRegion = Boolean(islandCompleted || freeRoamUnlocked);
    const options = locations
      .filter((row) => String(row?.location || '').trim() && String(row.location) !== current)
      .slice(0, 25)
      .map((row) => ({
        label: String(getLocationDisplayName(row.location, lang) || row.location).slice(0, 100),
        description: row.isPortalHub ? tx.regionMovePortalHub : tx.regionMoveInRegion,
        value: String(row.location)
      }));

    const placeholder = canMoveInRegion
      ? (options.length > 0 ? tx.regionMovePlaceholderOpen : tx.regionMovePlaceholderEmpty)
      : tx.regionMovePlaceholderLocked;

    const select = new StringSelectMenuBuilder()
      .setCustomId('map_region_move_select')
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(!canMoveInRegion || options.length === 0)
      .addOptions(options.length > 0 ? options : [{
        label: tx.regionMoveLockedLabel,
        description: tx.regionMoveLockedDesc,
        value: '__locked__'
      }]);

    return new ActionRowBuilder().addComponents(select);
  }

  function buildMapComponents(page, currentLocation, canOpenPortal = false, canOpenDevice = false, mapViewMode = 'text', regionLocations = [], lang = 'zh-TW') {
    const tx = getMapText(lang);
    const sourceLocations = Array.isArray(regionLocations) && regionLocations.length > 0
      ? regionLocations
      : MAP_LOCATIONS;
    const maxPage = Math.max(0, Math.ceil(sourceLocations.length / MAP_PAGE_SIZE) - 1);
    const safePage = Math.max(0, Math.min(page, maxPage));
    const start = safePage * MAP_PAGE_SIZE;
    const pageLocations = sourceLocations.slice(start, start + MAP_PAGE_SIZE);
    const safeMapViewMode = normalizeMapViewMode(mapViewMode);

    const rows = [];
    for (let i = 0; i < pageLocations.length; i += 4) {
      const slice = pageLocations.slice(i, i + 4);
      const buttons = slice.map((loc, idx) => {
        const absoluteIdx = start + i + idx;
        return new ButtonBuilder()
          .setCustomId(`map_loc_${absoluteIdx}`)
          .setLabel(String(getLocationDisplayName(loc, lang) || loc).substring(0, 10))
          .setStyle(loc === currentLocation ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(true);
      });
      rows.push(new ActionRowBuilder().addComponents(buttons));
    }

    const navButtons = [
      new ButtonBuilder()
        .setCustomId(`map_page_${safePage - 1}`)
        .setLabel(tx.mapBtnPrev)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`map_page_${safePage + 1}`)
        .setLabel(tx.mapBtnNext)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= maxPage),
      new ButtonBuilder().setCustomId('map_back_main').setLabel(tx.mapBtnBackStory).setStyle(ButtonStyle.Success)
    ];
    if (canOpenPortal) {
      navButtons.splice(2, 0, new ButtonBuilder()
        .setCustomId('map_open_portal')
        .setLabel(tx.mapBtnPortal)
        .setStyle(ButtonStyle.Primary));
    }
    if (canOpenDevice) {
      navButtons.splice(Math.min(3, navButtons.length - 1), 0, new ButtonBuilder()
        .setCustomId('map_open_device')
        .setLabel(tx.mapBtnDevice)
        .setStyle(ButtonStyle.Primary));
    }
    rows.push(new ActionRowBuilder().addComponents(navButtons));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`map_view_text_${safePage}`)
        .setLabel(tx.mapBtnText)
        .setStyle(safeMapViewMode === 'text' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(safeMapViewMode === 'text'),
      new ButtonBuilder()
        .setCustomId(`map_view_ascii_${safePage}`)
        .setLabel(tx.mapBtnAscii)
        .setStyle(safeMapViewMode === 'ascii' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(safeMapViewMode === 'ascii')
    ));

    return { rows, safePage, maxPage, pageLocations };
  }

  return {
    buildRegionMoveSelectRow,
    buildMapComponents
  };
}

module.exports = { createMapUiUtils };
