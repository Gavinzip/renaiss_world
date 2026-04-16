function createSlashAdminUtils(deps = {}) {
  const {
    RESETDATA_PASSWORD = '0121',
    ADMIN_OWNER_USER_ID = '1051129116419702784',
    clearAllCharacterData = () => ({}),
    clearSelfCharacterData = () => ({}),
    clearTargetPlayerAllData = () => ({}),
    clearWorldRuntimeData = () => ({}),
    CORE,
    runWorldBackup = async () => ({ ok: false, error: 'disabled' }),
    runWorldDataPull = async () => ({ ok: false, error: 'disabled' }),
    getBackupDebugStatus = () => ({}),
    getInteractionCoverageReport = () => ({}),
    clearInteractionCoverage = () => false,
    flushInteractionCoverageNow = () => false,
    STORAGE = {},
    EmbedBuilder
  } = deps;

  async function rejectIfNotAdminOwner(interaction, user) {
    const userId = String(user?.id || '').trim();
    const ownerId = String(ADMIN_OWNER_USER_ID || '').trim();
    if (!ownerId || userId === ownerId) return false;
    await interaction.reply({ content: '⛔ 你沒有權限使用這個指令。', ephemeral: true }).catch(() => {});
    return true;
  }

  function normalizeBackupNote(note = '') {
    return String(note || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_\-]/g, '')
      .slice(0, 36);
  }

  async function handleResetData(interaction, user) {
    if (await rejectIfNotAdminOwner(interaction, user)) return;
    const scope = String(interaction.options.getString('scope') || 'self').trim().toLowerCase();
    const password = String(interaction.options.getString('password') || '').trim();

    if (password !== RESETDATA_PASSWORD) {
      await interaction.reply({ content: '❌ 密碼錯誤，無法清空資料。', ephemeral: true });
      return;
    }

    if (scope !== 'self' && scope !== 'all') {
      await interaction.reply({ content: '❌ scope 只能是 self 或 all。', ephemeral: true });
      return;
    }

    if (scope === 'all') {
      const report = clearAllCharacterData({ clearWorld: true, worldMode: 'all' });
      await interaction.reply({
        content:
          `✅ 已清空【所有人】角色資料。\n` +
          `- 玩家檔：${report.removedPlayerFiles} 筆\n` +
          `- 舊記憶檔：${report.removedLegacyMemoryFiles} 筆\n` +
          `- 向量記憶刪除：${report.clearedSemanticMemory} 筆\n` +
          `- NPC 引言記憶刪除：${report.clearedNpcQuotes} 筆\n` +
          `- pets/player_threads/user_wallets/scratch_lottery 已重置\n` +
          `- 世界重置：core=${report.resetWorldCore ? '已清空' : '略過'}｜公告板=${report.resetWorldBoard ? '已清空' : '略過'}`,
        ephemeral: true
      });
      return;
    }

    const report = clearSelfCharacterData(user.id);
    await interaction.reply({
      content:
        `✅ 已清空你自己的角色資料。\n` +
        `- 玩家檔：${report.removedPlayerFile ? '已刪除' : '無'}\n` +
        `- 寵物：${report.removedPet ? '已刪除' : '無'}\n` +
        `- 討論串綁定：${report.removedThread ? '已清除' : '無'}\n` +
        `- 錢包綁定：${report.removedWallet ? '已清除' : '無'}\n` +
        `- 向量記憶刪除：${report.clearedSemanticMemory} 筆\n` +
        `- NPC 引言記憶刪除：${report.clearedNpcQuotes} 筆\n` +
        `- 其他玩家好友殘留清理：${report.purgedFriendRefsPlayers} 人（移除 ${report.purgedFriendRefsLinks} 筆）`,
      ephemeral: true
    });
  }

  async function handleResetPlayerHistory(interaction, user) {
    if (await rejectIfNotAdminOwner(interaction, user)) return;
    const playerId = String(interaction.options.getString('player_id') || '').trim();
    const password = String(interaction.options.getString('password') || '').trim();

    if (password !== RESETDATA_PASSWORD) {
      await interaction.reply({ content: '❌ 密碼錯誤，無法清空玩家資料。', ephemeral: true });
      return;
    }

    if (!playerId) {
      await interaction.reply({ content: '❌ 請提供 player_id。', ephemeral: true });
      return;
    }

    const report = clearTargetPlayerAllData(playerId);
    await interaction.reply({
      content:
        `✅ 已清空指定玩家資料：${playerId}\n` +
        `- 玩家檔：${report.removedPlayerFile ? '已刪除' : '無'}\n` +
        `- 寵物：${report.removedPet ? '已刪除' : '無'}\n` +
        `- 討論串綁定：${report.removedThread ? '已清除' : '無'}\n` +
        `- 錢包綁定：${report.removedWallet ? '已清除' : '無'}\n` +
        `- 向量記憶刪除：${report.clearedSemanticMemory} 筆\n` +
        `- NPC 引言記憶刪除：${report.clearedNpcQuotes} 筆\n` +
        `- 其他玩家好友殘留清理：${report.purgedFriendRefsPlayers} 人（移除 ${report.purgedFriendRefsLinks} 筆）`,
      ephemeral: true
    });
  }

  async function handleResetWorld(interaction, user) {
    if (await rejectIfNotAdminOwner(interaction, user)) return;
    const mode = String(interaction.options.getString('mode') || 'events').trim().toLowerCase();
    const password = String(interaction.options.getString('password') || '').trim();

    if (password !== RESETDATA_PASSWORD) {
      await interaction.reply({ content: '❌ 密碼錯誤，無法清空世界資料。', ephemeral: true });
      return;
    }

    if (mode !== 'events' && mode !== 'all') {
      await interaction.reply({ content: '❌ mode 只能是 events 或 all。', ephemeral: true });
      return;
    }

    const result = clearWorldRuntimeData(mode);
    const modeLabel = mode === 'all' ? '世界完整狀態（含天數/天氣/傳聞）' : '世界事件與傳聞';
    await interaction.reply({
      content:
        `✅ 已清空【${modeLabel}】。\n` +
        `- core world：${result.core ? '已清空' : '略過'}\n` +
        `- world_events 公告板：${result.board ? '已清空' : '略過'}`,
      ephemeral: true
    });
  }

  async function handleBackupWorld(interaction, user) {
    if (await rejectIfNotAdminOwner(interaction, user)) return;
    const password = String(interaction.options.getString('password') || '').trim();
    const noteRaw = String(interaction.options.getString('note') || '').trim();

    if (password !== RESETDATA_PASSWORD) {
      await interaction.reply({ content: '❌ 密碼錯誤，無法執行手動備份。', ephemeral: true });
      return;
    }

    await interaction.reply({ content: '⏳ 正在執行手動備份（含玩家、世界、記憶資料）...', ephemeral: true });

    try {
      if (typeof CORE.saveWorld === 'function') CORE.saveWorld();
    } catch (e) {
      console.log('[Backup] 手動備份前 saveWorld 失敗:', e?.message || e);
    }

    const note = normalizeBackupNote(noteRaw);
    const reason = note ? `manual:${user.id}:${note}` : `manual:${user.id}`;
    const result = await runWorldBackup(reason);

    if (result?.ok) {
      const changedText = result.changed ? '有新變更並已推送' : '沒有新變更（僅完成檢查）';
      await interaction.followUp({
        content:
          `✅ 手動備份完成\n` +
          `- 狀態：${changedText}\n` +
          `- 分支：${String(result.branch || 'main')}\n` +
          `- 原因標記：${String(result.reason || reason)}`,
        ephemeral: true
      });
      return;
    }

    const failReason = result?.error || result?.reason || 'unknown';
    const hint =
      failReason === 'disabled'
        ? '\n請檢查伺服器環境變數 WORLD_BACKUP_ENABLED=1（修改後需重啟機器人）。'
        : (failReason === 'missing_repo'
          ? '\n請檢查 WORLD_BACKUP_REPO 是否已設定可寫入的 Git 倉庫。'
          : '');
    await interaction.followUp({
      content: `❌ 手動備份失敗：${failReason}${hint}`,
      ephemeral: true
    });
  }

  async function handleBackupCheck(interaction, user) {
    if (await rejectIfNotAdminOwner(interaction, user)) return;
    const password = String(interaction.options.getString('password') || '').trim();
    if (password !== RESETDATA_PASSWORD) {
      await interaction.reply({ content: '❌ 密碼錯誤，無法查看備份狀態。', ephemeral: true });
      return;
    }

    const status = typeof getBackupDebugStatus === 'function'
      ? getBackupDebugStatus()
      : {};
    const worldRoot = STORAGE?.worldDataRoot || '(unknown)';
    const schedule = `${String(Number(status.hour || 0)).padStart(2, '0')}:${String(Number(status.minute || 0)).padStart(2, '0')}`;

    await interaction.reply({
      content:
        `🧪 備份設定檢查\n` +
        `- WORLD_BACKUP_ENABLED：${status.enabled ? '1' : '0'}\n` +
        `- WORLD_BACKUP_REPO：${status.hasRepo ? '已設定' : '未設定'}\n` +
        `- WORLD_BACKUP_PAT：${status.hasPat ? '已設定' : '未設定'}\n` +
        `- repo 解析：${status.hasResolvedRepo ? '成功' : '失敗'}\n` +
        `- repo host：${status.repoHost || '(unknown)'}\n` +
        `- repo path：${status.repoPath || '(unknown)'}\n` +
        `- branch：${status.branch || '(unknown)'}\n` +
        `- subdir：${status.subdir || '(unknown)'}\n` +
        `- 排程：${schedule} (${status.timezone || 'Asia/Taipei'})\n` +
        `- 開機即跑：${status.runOnStartup ? '是' : '否'}\n` +
        `- WORLD_DATA_ROOT(實際)：${worldRoot}`,
      ephemeral: true
    });
  }

  async function handlePullWorldData(interaction, user) {
    if (await rejectIfNotAdminOwner(interaction, user)) return;
    const password = String(interaction.options.getString('password') || '').trim();
    if (password !== RESETDATA_PASSWORD) {
      await interaction.reply({ content: '❌ 密碼錯誤，無法拉取遠端資料。', ephemeral: true });
      return;
    }

    await interaction.reply({
      content: '⏳ 正在從遠端備份 Git 拉取資料並覆蓋伺服器資料...',
      ephemeral: true
    });

    const reason = `manual_pull:${String(user?.id || 'unknown')}`;
    const result = await runWorldDataPull(reason);
    if (result?.ok) {
      await interaction.followUp({
        content:
          `✅ 已完成遠端資料覆蓋\n` +
          `- 分支：${String(result.branch || 'main')}\n` +
          `- 子目錄：${String(result.subdir || '(unknown)')}\n` +
          `- 原因標記：${String(result.reason || reason)}\n` +
          `- 備註：若目前有活躍流程，建議重啟機器人以確保快取狀態一致。`,
        ephemeral: true
      });
      return;
    }

    const failReason = result?.error || result?.reason || 'unknown';
    await interaction.followUp({
      content: `❌ 遠端資料覆蓋失敗：${failReason}`,
      ephemeral: true
    });
  }

  function truncateJoined(lines = [], maxLen = 950) {
    const safe = Array.isArray(lines) ? lines.filter(Boolean).map((v) => String(v)) : [];
    if (safe.length <= 0) return '（無）';
    let out = '';
    for (const line of safe) {
      const next = out ? `${out}\n${line}` : line;
      if (next.length > maxLen) break;
      out = next;
    }
    return out || '（無）';
  }

  async function handleInteractionCoverage(interaction, user) {
    if (await rejectIfNotAdminOwner(interaction, user)) return;
    const mode = String(interaction.options.getString('mode') || 'view').trim().toLowerCase();
    const password = String(interaction.options.getString('password') || '').trim();
    if (password !== RESETDATA_PASSWORD) {
      await interaction.reply({ content: '❌ 密碼錯誤，無法查看互動覆蓋報表。', ephemeral: true });
      return;
    }

    if (mode === 'reset') {
      const ok = Boolean(clearInteractionCoverage());
      await interaction.reply({
        content: ok
          ? '✅ 已清空互動覆蓋報表。'
          : '⚠️ 嘗試清空覆蓋報表，但寫檔失敗，請稍後再試。',
        ephemeral: true
      });
      return;
    }

    flushInteractionCoverageNow();
    const report = getInteractionCoverageReport({ top: 30 }) || {};
    const exact = report.exact || {};
    const prefix = report.prefix || {};
    const totals = report.totals || {};
    const failedTop = Array.isArray(report.failedTop) ? report.failedTop : [];
    const untestedExact = Array.isArray(exact.untested) ? exact.untested : [];
    const untestedPrefix = Array.isArray(prefix.untested) ? prefix.untested : [];
    const updatedAt = Number(report.updatedAt || 0);
    const updatedText = updatedAt > 0 ? `<t:${Math.floor(updatedAt / 1000)}:F>` : '尚未記錄';

    const failedLines = failedTop.slice(0, 12).map((row) => {
      const key = String(row.scope || 'route') === 'prefix'
        ? `prefix:${row.key}`
        : String(row.key || '');
      return `• ${key}｜failed ${Number(row.failed || 0)}｜ok ${Number(row.ok || 0)}`;
    });
    const missingExactLines = untestedExact.slice(0, 18).map((id) => `• ${id}`);
    const missingPrefixLines = untestedPrefix.slice(0, 12).map((id) => `• ${id}`);

    const embed = new EmbedBuilder()
      .setTitle('🧪 互動覆蓋報表 /interactioncoverage')
      .setColor(0x14b8a6)
      .setDescription(
        `最後更新：${updatedText}\n` +
        `總互動：ok ${Number(totals.ok || 0)}｜failed ${Number(totals.failed || 0)}\n` +
        `觀測到 customId：${Number(report.observedCustomIdCount || 0)}`
      )
      .addFields(
        {
          name: 'Exact 路由覆蓋',
          value:
            `已測 ${Number(exact.covered || 0)} / ${Number(exact.total || 0)} ` +
            `（${Number(exact.coverageRate || 0)}%）\n` +
            `ok ${Number(exact.okCount || 0)}｜failed ${Number(exact.failedCount || 0)}`
        },
        {
          name: 'Prefix 路由覆蓋',
          value:
            `已測 ${Number(prefix.covered || 0)} / ${Number(prefix.total || 0)} ` +
            `（${Number(prefix.coverageRate || 0)}%）\n` +
            `ok ${Number(prefix.okCount || 0)}｜failed ${Number(prefix.failedCount || 0)}`
        },
        {
          name: `失敗清單（Top ${failedLines.length || 0}）`,
          value: truncateJoined(failedLines, 950)
        },
        {
          name: `未測 Exact（${untestedExact.length}）`,
          value: truncateJoined(missingExactLines, 950)
        },
        {
          name: `未測 Prefix（${untestedPrefix.length}）`,
          value: truncateJoined(missingPrefixLines, 950)
        }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  function formatFactionWinnerLabel(winner) {
    if (winner === 'order') return '正派';
    if (winner === 'chaos') return 'Digital';
    return '未知';
  }

  async function handleWarStatus(interaction) {
    const world = CORE.getWorld() || {};
    const war = CORE.getFactionWarStatus() || {};
    const presence = typeof CORE.getFactionPresenceStatus === 'function'
      ? CORE.getFactionPresenceStatus()
      : null;

    const today = Number(world.day || 1);
    const nextDay = Number(war.nextSkirmishDay || today);
    const remain = Math.max(0, nextDay - today);

    const recent = Array.isArray(war.history) ? war.history.slice(0, 3) : [];
    const recentText = recent.length > 0
      ? recent.map((item, idx) => {
        const day = Number(item.day || 0);
        const location = item.location || '未知地點';
        const winner = formatFactionWinnerLabel(item.winner);
        const headline = item.headline || '衝突交火';
        return `${idx + 1}. Day ${day}｜${location}｜勝方：${winner}\n${headline}`;
      }).join('\n')
      : '目前尚無衝突紀錄。';

    const orderLocations = Array.isArray(presence?.orderLocations) ? presence.orderLocations : [];
    const chaosLocations = Array.isArray(presence?.chaosLocations) ? presence.chaosLocations : [];
    const orderText = orderLocations.length > 0 ? orderLocations.join('、') : '尚無目擊';
    const chaosText = chaosLocations.length > 0 ? chaosLocations.join('、') : '尚無目擊';

    const embed = new EmbedBuilder()
      .setTitle('⚔️ 正派 vs Digital 戰況 /warstatus')
      .setColor(0xff8c00)
      .setDescription(
        `Day ${today}\n` +
        `正派勢力：${Number(war.orderPower || 50)}\n` +
        `Digital勢力：${Number(war.chaosPower || 50)}\n` +
        `張力：${Number(war.tension || 55)}\n` +
        `下一次大衝突：Day ${nextDay}${remain > 0 ? `（約 ${remain} 天後）` : '（隨時可能爆發）'}`
      )
      .addFields(
        {
          name: '📍 今日勢力出沒',
          value:
            `正派巡行：${orderText}\n` +
            `Digital 蹤跡（高難區限定）：${chaosText}`
        },
        {
          name: '🧾 最近三次衝突',
          value: recentText
        }
      )
      .setFooter({ text: '規則：Digital 僅高難區；正派可全圖但低難區出現頻率已下調' });

    await interaction.reply({ embeds: [embed] }).catch(async () => {
      await interaction.followUp({ embeds: [embed] }).catch(() => {});
    });
  }

  return {
    handleResetData,
    handleResetPlayerHistory,
    handleResetWorld,
    handleBackupWorld,
    handleBackupCheck,
    handlePullWorldData,
    handleInteractionCoverage,
    handleWarStatus
  };
}

module.exports = {
  createSlashAdminUtils
};
