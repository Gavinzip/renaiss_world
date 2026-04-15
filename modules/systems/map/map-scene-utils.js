function createMapSceneUtils(deps = {}) {
  const {
    CORE,
    ISLAND_STORY = null,
    getPlayerUILang = () => 'zh-TW',
    getMapText = () => ({}),
    ensurePlayerIslandState = () => {},
    buildRegionMapSnapshot = () => null,
    getRegionLocationsByLocation = () => [],
    getPortalDestinations = () => [],
    getPortalAccessContext = () => ({ atPortalHub: false, crossRegionUnlocked: false, destinations: [] }),
    isMainPortalHubLocation = () => false,
    playerOwnsTeleportDevice = () => false,
    getPlayerMapViewMode = () => 'text',
    buildMapComponents = () => ({ rows: [], safePage: 0, maxPage: 0, pageLocations: [] }),
    buildRegionMoveSelectRow = () => null,
    buildIslandMapAnsi = () => '',
    ISLAND_MAP_TEXT = '',
    getLocationProfile = () => null,
    getLocationStoryContext = () => '',
    joinByLang = () => '',
    renderRegionMapImageBuffer = () => ({ buffer: null, error: '' }),
    formatPortalDestinationDisplay = (v) => String(v || ''),
    getLocationPortalHub = () => '',
    getRegionPortalHubs = () => [],
    buildPortalUsageGuide = () => '',
    buildDeviceUsageGuide = () => '',
    updateInteractionMessage = async () => {},
    trackActiveGameMessage = () => {},
    getTeleportDeviceStockInfo = () => ({ count: 0, soonestRemainingMs: 0 }),
    formatTeleportDeviceRemaining = () => 'N/A',
    EmbedBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
  } = deps;

  function isComponentInteraction(interaction) {
    return Boolean(
      (interaction?.isButton && interaction.isButton()) ||
      (interaction?.isStringSelectMenu && interaction.isStringSelectMenu())
    );
  }

  async function deferComponentIfNeeded(interaction, context = 'map') {
    if (!isComponentInteraction(interaction)) return;
    if (interaction.deferred || interaction.replied) return;
    try {
      await interaction.deferUpdate();
    } catch (err) {
      console.error(`[MapScene] ${context} deferUpdate failed:`, err?.message || err);
    }
  }

  async function safeUpdateComponent(interaction, payload, context = 'map') {
    try {
      await updateInteractionMessage(interaction, payload);
      return { ok: true, msg: null };
    } catch (err) {
      console.error(`[MapScene] ${context} update failed:`, err?.message || err);
    }

    try {
      const msg = (interaction.deferred || interaction.replied)
        ? await interaction.followUp(payload)
        : await interaction.reply(payload);
      return { ok: true, msg };
    } catch (fallbackErr) {
      console.error(`[MapScene] ${context} fallback send failed:`, fallbackErr?.message || fallbackErr);
      return { ok: false, msg: null };
    }
  }

async function showIslandMap(interaction, user, page = 0, notice = '') {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const tx = getMapText(uiLang);
  if (!player) {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
    }
    return;
  }
  ensurePlayerIslandState(player);
  CORE.savePlayer(player);
  await deferComponentIfNeeded(interaction, 'showIslandMap');
  const currentIslandState = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
    ? ISLAND_STORY.getIslandStoryState(player, player.location)
    : null;
  const islandCompleted = Boolean(currentIslandState?.completed);
  const regionSnapshot = typeof buildRegionMapSnapshot === 'function'
    ? buildRegionMapSnapshot(player.location || '')
    : null;
  const regionLocations = typeof getRegionLocationsByLocation === 'function'
    ? getRegionLocationsByLocation(player.location || '')
    : [];

  const nearbyPortals = typeof getPortalDestinations === 'function'
    ? getPortalDestinations(player.location || '')
    : [];
  const portalAccess = getPortalAccessContext(player);
  const atPortalHub = isMainPortalHubLocation(player.location || '');
  const canOpenPortal = Boolean(atPortalHub && Array.isArray(nearbyPortals) && nearbyPortals.length > 0);
  const canOpenDevice = playerOwnsTeleportDevice(player);
  const mapViewMode = getPlayerMapViewMode(player);
  const { rows, safePage, maxPage, pageLocations } = buildMapComponents(
    page,
    player.location,
    canOpenPortal,
    canOpenDevice,
    mapViewMode,
    regionLocations,
    uiLang
  );
  rows.push(buildRegionMoveSelectRow(player, regionSnapshot, islandCompleted, uiLang));
  const useWideAnsiMap = mapViewMode === 'ascii';
  const renderedMap = useWideAnsiMap && !regionSnapshot
    ? (typeof buildIslandMapAnsi === 'function'
      ? buildIslandMapAnsi(player.location)
      : ISLAND_MAP_TEXT)
    : '';
  const currentProfile = typeof getLocationProfile === 'function'
    ? getLocationProfile(player.location)
    : null;
  const locationContext = typeof getLocationStoryContext === 'function'
    ? getLocationStoryContext(player.location)
    : '';
  const pageSummary = pageLocations.map((loc) => {
    const profile = typeof getLocationProfile === 'function' ? getLocationProfile(loc) : null;
    const region = profile?.region || tx.mapNoRegion;
    const difficulty = Number(profile?.difficulty || 3);
    const marker = loc === player.location ? '◉' : '•';
    if (!useWideAnsiMap) {
      return `${marker} ${loc}（${region}｜D${difficulty}）`;
    }
    const nearby = Array.isArray(profile?.nearby) && profile.nearby.length > 0
      ? joinByLang(profile.nearby.slice(0, 2), uiLang)
      : tx.mapNoNearby;
    return `${marker} ${loc}（${region}｜D${difficulty}）${tx.mapInfoNearbyPrefix}：${nearby}`;
  }).join('\n');
  const compactMap = useWideAnsiMap
    ? ''
    : `**${tx.mapSectionPageMap}**\n${pageSummary || tx.mapNoCities}`;
  const locationSummary = Array.isArray(regionSnapshot?.locations)
    ? regionSnapshot.locations
      .map((row) => `${row.isCurrent ? '◉' : (row.isPortalHub ? '◎' : '●')} ${row.location}`)
      .join(uiLang === 'en' ? ', ' : '、')
    : '';
  const mapBlock = useWideAnsiMap
    ? (regionSnapshot
      ? '```' + regionSnapshot.mapRows.join('\n') + '\n```'
      : ('```ansi\n' + renderedMap + '\n```'))
    : compactMap;
  const mapImageStatus = tx.mapLegendImage;
  const shouldRenderImage = !useWideAnsiMap;
  const mapRenderResult = shouldRenderImage && regionSnapshot
    ? renderRegionMapImageBuffer(regionSnapshot, mapImageStatus, uiLang)
    : { buffer: null, error: shouldRenderImage ? '缺少區域地圖資料' : '' };
  const renderedMapImage = mapRenderResult?.buffer || null;
  const hasRenderedMapImage = shouldRenderImage && Boolean(renderedMapImage);
  const renderErrorText = !hasRenderedMapImage ? String(mapRenderResult?.error || '').trim() : '';
  const visibleMapBlock = hasRenderedMapImage ? '' : mapBlock;
  const mapDisplayLabel = hasRenderedMapImage
    ? tx.mapDisplayImage
    : (useWideAnsiMap ? (tx.mapDisplayAscii || tx.mapDisplayAsciiFallback) : tx.mapDisplayTextFallback);
  const nearbyPlaces = Array.isArray(currentProfile?.nearby) && currentProfile.nearby.length > 0
    ? joinByLang(currentProfile.nearby.slice(0, 4), uiLang)
    : tx.mapNoNearby;
  const nearbyLandmarks = Array.isArray(currentProfile?.landmarks) && currentProfile.landmarks.length > 0
    ? joinByLang(currentProfile.landmarks.slice(0, 3), uiLang)
    : tx.mapNoNearby;
  const nearbyResources = Array.isArray(currentProfile?.resources) && currentProfile.resources.length > 0
    ? joinByLang(currentProfile.resources.slice(0, 4), uiLang)
    : tx.mapNoNearby;
  const nearbyPortalsText = portalAccess.crossRegionUnlocked
    ? (
      Array.isArray(portalAccess.destinations) && portalAccess.destinations.length > 0
        ? joinByLang(portalAccess.destinations.slice(0, 6).map((loc) => formatPortalDestinationDisplay(loc, uiLang)), uiLang)
        : tx.mapNoPortal
    )
    : tx.portalDesc3Locked;
  const navTargetText = String(player.navigationTarget || '').trim() || tx.mapNoNavTarget;
  const currentLocationText = player.location || tx.mapNoProfile;
  const regionNameText = regionSnapshot?.regionName || currentProfile?.region || tx.mapNoRegion;
  const difficultyText = currentProfile ? `D${currentProfile.difficulty}` : tx.mapNoProfile;
  const portalHubText = typeof getLocationPortalHub === 'function'
    ? (getLocationPortalHub(player.location || '') || tx.mapNoPortalHub)
    : tx.mapNoPortalHub;
  const mainPortalHubList = typeof getRegionPortalHubs === 'function' ? getRegionPortalHubs() : [];
  const mainPortalHubText = joinByLang(mainPortalHubList, uiLang) || tx.mapNoPortalHub;
  const freeExploreText = islandCompleted ? tx.mapFreeExploreOpen : tx.mapFreeExploreLocked;
  const mapDesc = hasRenderedMapImage
    ? (
      `**${tx.mapFieldMapDisplay}：** ${mapDisplayLabel}` +
      `\n**${tx.mapFieldNavTarget}：** ${navTargetText}` +
      `\n**${tx.mapFieldFreeExplore}：** ${freeExploreText}` +
      `\n**${tx.mapFieldNearbyInteractive}：**` +
      `\n- ${tx.mapFieldNearbyScenes}：${nearbyPlaces}` +
      `\n- ${tx.mapFieldLandmarks}：${nearbyLandmarks}` +
      `\n- ${tx.mapFieldResources}：${nearbyResources}` +
      `\n- ${tx.mapFieldPortalTo}：${nearbyPortalsText}` +
      `\n**${tx.mapFieldMapPages}：** ${safePage + 1}/${maxPage + 1}` +
      (canOpenPortal ? `\n\n${buildPortalUsageGuide(player, uiLang)}` : '') +
      (canOpenDevice ? `\n${buildDeviceUsageGuide(player, uiLang)}` : '') +
      `\n${tx.mapHintMoveRule}` +
      (notice ? `\n${notice}` : '')
    )
    : (
      visibleMapBlock +
      `\n**${tx.mapFieldCurrentLocation}：** ◉${currentLocationText}◉ ${tx.mapCurrentLocationSuffix}` +
      `\n**${tx.mapFieldMapDisplay}：** ${mapDisplayLabel}` +
      `\n**${tx.mapFieldCurrentRegion}：** ${regionNameText}` +
      `\n**${tx.mapFieldDifficulty}：** ${difficultyText}` +
      `\n**${tx.mapFieldNavTarget}：** ${navTargetText}` +
      `\n**${tx.mapFieldCurrentPortalHub}：** ${portalHubText}` +
      `\n**${tx.mapFieldMainPortalHubs}：** ${mainPortalHubText}` +
      `\n**${tx.mapFieldFreeExplore}：** ${freeExploreText}` +
      (renderErrorText ? `\n**${tx.mapFieldRenderError}：** ${renderErrorText}` : '') +
      `\n**${tx.mapFieldLegend}：** ${tx.mapLegendText}` +
      `\n**${tx.mapFieldNearbyInteractive}：**` +
      `\n- ${tx.mapFieldNearbyScenes}：${nearbyPlaces}` +
      `\n- ${tx.mapFieldLandmarks}：${nearbyLandmarks}` +
      `\n- ${tx.mapFieldResources}：${nearbyResources}` +
      `\n- ${tx.mapFieldPortalTo}：${nearbyPortalsText}` +
      (locationContext ? `\n**${tx.mapSectionAreaIntel}：** ${locationContext}` : '') +
      `\n**${tx.mapFieldMapPages}：** ${safePage + 1}/${maxPage + 1}` +
      (locationSummary ? `\n\n**${tx.mapSectionRegionCities}**\n${locationSummary}` : '') +
      (!hasRenderedMapImage && useWideAnsiMap && pageSummary ? `\n\n**${tx.mapSectionRegionInfo}**\n${pageSummary}` : '') +
      (canOpenPortal ? `\n\n${buildPortalUsageGuide(player, uiLang)}` : '') +
      (canOpenDevice ? `\n${buildDeviceUsageGuide(player, uiLang)}` : '') +
      `\n${tx.mapHintMoveRule}` +
      (notice ? `\n${notice}` : '')
    );

  const embed = new EmbedBuilder()
    .setTitle(tx.mapTitle)
    .setColor(0x4da6ff)
    .setDescription(mapDesc);
  if (renderedMapImage) {
    embed.setImage('attachment://region-map.png');
  }
  const files = renderedMapImage
    ? [new AttachmentBuilder(renderedMapImage, { name: 'region-map.png' })]
    : [];
  const payload = { embeds: [embed], components: rows, files };

  if (isComponentInteraction(interaction)) {
    const result = await safeUpdateComponent(interaction, payload, 'showIslandMap');
    const messageId = result.msg?.id || interaction.message?.id;
    if (messageId) {
      trackActiveGameMessage(player, interaction.channel?.id, messageId);
    }
    return;
  }

  if (interaction.deferred || interaction.replied) {
    const msg = await interaction.followUp(payload).catch(() => null);
    if (msg) trackActiveGameMessage(player, interaction.channel?.id, msg.id);
  } else {
    const msg = await interaction.reply(payload).catch(() => null);
    if (msg) trackActiveGameMessage(player, interaction.channel?.id, msg.id);
  }
}

async function showPortalSelection(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const tx = getMapText(uiLang);
  if (!player) {
    await interaction.reply({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
    return;
  }
  ensurePlayerIslandState(player);

  const access = getPortalAccessContext(player);
  if (!access.atPortalHub) {
    await interaction.reply({
      content: tx.portalNotReady,
      ephemeral: true
    }).catch(() => {});
    return;
  }
  if (!access.crossRegionUnlocked) {
    await interaction.reply({
      content: tx.portalStoryLocked,
      ephemeral: true
    }).catch(() => {});
    return;
  }
  const destinationEntries = Array.isArray(access.destinationEntries) ? access.destinationEntries : [];
  if (destinationEntries.length === 0) {
    await interaction.reply({
      content: tx.portalNoDestination,
      ephemeral: true
    }).catch(() => {});
    return;
  }
  const rows = [];
  for (let i = 0; i < destinationEntries.length; i += 4) {
    const buttons = destinationEntries.slice(i, i + 4).map((row, idx) => {
      const absoluteIdx = i + idx;
      const loc = String(row?.location || '');
      const enabled = Boolean(row?.enabled);
      const state = String(row?.state || '');
      const statePrefix = enabled ? '' : '🔒';
      const stateStyle = enabled
        ? (state === 'next' ? ButtonStyle.Success : ButtonStyle.Primary)
        : ButtonStyle.Secondary;
      return new ButtonBuilder()
        .setCustomId(`portal_jump_${absoluteIdx}`)
        .setLabel(`${statePrefix}${loc}`.substring(0, 12))
        .setStyle(stateStyle)
        .setDisabled(!enabled);
    });
    rows.push(new ActionRowBuilder().addComponents(buttons));
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('map_page_0').setLabel(tx.portalBackMap).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('map_back_main').setLabel(tx.portalBackStory).setStyle(ButtonStyle.Success)
    )
  );

  const embed = new EmbedBuilder()
    .setTitle(tx.portalTitle)
    .setColor(0x7b68ee)
    .setDescription(
      `${tx.portalDesc1} ${player.location} ${tx.portalDesc2}\n` +
      `${tx.portalDesc3Open}\n` +
      `${tx.portalDescRule || ''}\n` +
      `${tx.portalDesc4}\n\n` +
      destinationEntries.map((row, idx) => {
        const loc = String(row?.location || '');
        const state = String(row?.state || '');
        const enabled = Boolean(row?.enabled);
        const stateLabel = state === 'next'
          ? (tx.portalStateNext || '下一關')
          : (state === 'completed'
            ? (tx.portalStateCompleted || '已完成')
            : (tx.portalStateLocked || '未解鎖'));
        return `${idx + 1}. ${formatPortalDestinationDisplay(loc, uiLang)} ${enabled ? '✅' : '🔒'} ${stateLabel}`;
      }).join('\n')
    );

  await deferComponentIfNeeded(interaction, 'showPortalSelection');
  const result = await safeUpdateComponent(interaction, { embeds: [embed], components: rows }, 'showPortalSelection');
  const messageId = result.msg?.id || interaction.message?.id;
  if (messageId) {
    trackActiveGameMessage(player, interaction.channel?.id, messageId);
  }
}

async function showTeleportDeviceSelection(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const tx = getMapText(uiLang);
  if (!player) {
    await interaction.reply({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
    return;
  }
  const stockInfo = getTeleportDeviceStockInfo(player);
  if (stockInfo.count <= 0) {
    await interaction.reply({
      content: tx.deviceNotOwned,
      ephemeral: true
    }).catch(() => {});
    return;
  }
  const rawDestinations = typeof getRegionLocationsByLocation === 'function'
    ? getRegionLocationsByLocation(player.location || '')
    : [];
  const destinations = Array.isArray(rawDestinations) ? rawDestinations.filter(Boolean) : [];
  if (destinations.length === 0) {
    await interaction.reply({
      content: tx.mapInvalidDestination,
      ephemeral: true
    }).catch(() => {});
    return;
  }

  const rows = [];
  for (let i = 0; i < destinations.length; i += 4) {
    const buttons = destinations.slice(i, i + 4).map((loc, idx) => {
      const absoluteIdx = i + idx;
      const isCurrent = String(loc || '').trim() === String(player.location || '').trim();
      return new ButtonBuilder()
        .setCustomId(`device_jump_${absoluteIdx}`)
        .setLabel(String(loc || '').substring(0, 12))
        .setStyle(isCurrent ? ButtonStyle.Success : ButtonStyle.Primary);
    });
    rows.push(new ActionRowBuilder().addComponents(buttons));
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('map_page_0').setLabel(tx.deviceBackMap).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('map_back_main').setLabel(tx.deviceBackStory).setStyle(ButtonStyle.Success)
    )
  );

  const embed = new EmbedBuilder()
    .setTitle(tx.deviceTitle)
    .setColor(0x22c55e)
    .setDescription(
      `${tx.deviceDesc(stockInfo.count, formatTeleportDeviceRemaining(stockInfo.soonestRemainingMs))}\n\n` +
      destinations.map((loc, idx) => `${idx + 1}. ${loc}`).join('\n')
    );

  await deferComponentIfNeeded(interaction, 'showTeleportDeviceSelection');
  const result = await safeUpdateComponent(interaction, { embeds: [embed], components: rows }, 'showTeleportDeviceSelection');
  const messageId = result.msg?.id || interaction.message?.id;
  if (messageId) {
    trackActiveGameMessage(player, interaction.channel?.id, messageId);
  }
}


  return {
    showIslandMap,
    showPortalSelection,
    showTeleportDeviceSelection
  };
}

module.exports = {
  createMapSceneUtils
};
