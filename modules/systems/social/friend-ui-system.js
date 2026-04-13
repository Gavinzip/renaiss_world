function createFriendUiSystem(deps = {}) {
  const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    updateInteractionMessage,
    loadPlayer,
    loadPet,
    ensurePlayerFriendState,
    getPlayerDisplayNameById,
    normalizeFriendId,
    trimButtonLabel,
    isMutualFriend,
    getFriendBattleRecord
  } = deps;

  async function showFriendAddModal(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('friend_add_modal')
      .setTitle('🤝 新增好友');

    const input = new TextInputBuilder()
      .setCustomId('friend_target_id')
      .setLabel('輸入對方 Discord User ID')
      .setPlaceholder('例如：1051129116419702784')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(15)
      .setMaxLength(22);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    try {
      await interaction.showModal(modal);
    } catch (err) {
      console.error('[Friends] showFriendAddModal failed:', err?.message || err);
      const failMsg = '⚠️ 開啟「新增好友」輸入框失敗，請再按一次。';
      if (interaction?.deferred || interaction?.replied) {
        await interaction.followUp({ content: failMsg, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: failMsg, ephemeral: true }).catch(() => {});
      }
    }
  }

  async function showFriendsMenu(interaction, user, notice = '') {
    const player = loadPlayer(user.id);
    if (!player) {
      await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] }).catch(() => {});
      return;
    }
    const social = ensurePlayerFriendState(player);

    const friends = social.friends
      .map((id) => ({ id, name: getPlayerDisplayNameById(id) }))
      .filter((row) => normalizeFriendId(row.id));
    const incoming = social.friendRequestsIncoming
      .map((id) => ({ id, name: getPlayerDisplayNameById(id) }))
      .filter((row) => normalizeFriendId(row.id));
    const outgoing = social.friendRequestsOutgoing
      .map((id) => ({ id, name: getPlayerDisplayNameById(id) }))
      .filter((row) => normalizeFriendId(row.id));

    const formatList = (rows, emptyText, limit = 6) => {
      if (!Array.isArray(rows) || rows.length === 0) return emptyText;
      const head = rows.slice(0, limit).map((row) => `• ${row.name}`);
      const extra = rows.length > limit ? `\n…還有 ${rows.length - limit} 位` : '';
      return `${head.join('\n')}${extra}`;
    };

    const embed = new EmbedBuilder()
      .setTitle('🤝 好友系統')
      .setColor(0x4caf50)
      .setDescription(`${notice ? `📢 ${notice}\n\n` : ''}使用 Discord User ID 發送好友申請；雙方互加（同意）後，才能查看對方資訊。`)
      .addFields(
        { name: '👥 我的好友', value: `${friends.length} 位`, inline: true },
        { name: '📨 待我同意', value: `${incoming.length} 位`, inline: true },
        { name: '📤 我已送出', value: `${outgoing.length} 位`, inline: true },
        { name: '好友名單（顯示遊戲名）', value: formatList(friends, '目前沒有好友'), inline: false },
        { name: '待同意申請', value: formatList(incoming, '目前沒有待同意申請'), inline: false },
        { name: '已送出申請', value: formatList(outgoing, '目前沒有送出的申請'), inline: false }
      );

    const rows = [];
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_friend_add_modal').setLabel('➕ 新增好友').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('friend_refresh').setLabel('🔄 重新整理').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_menu').setLabel('🔙 返回').setStyle(ButtonStyle.Secondary)
      )
    );

    if (friends.length > 0 && rows.length < 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          friends.slice(0, 5).map((row) =>
            new ButtonBuilder()
              .setCustomId(`friend_view_${row.id}`)
              .setLabel(`👤 ${trimButtonLabel(row.name, 14)}`)
              .setStyle(ButtonStyle.Secondary)
          )
        )
      );
    }

    if (incoming.length > 0 && rows.length < 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          incoming.slice(0, 5).map((row) =>
            new ButtonBuilder()
              .setCustomId(`friend_accept_${row.id}`)
              .setLabel(`✅ 同意 ${trimButtonLabel(row.name, 10)}`)
              .setStyle(ButtonStyle.Success)
          )
        )
      );
    }

    if (outgoing.length > 0 && rows.length < 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          outgoing.slice(0, 5).map((row) =>
            new ButtonBuilder()
              .setCustomId(`friend_cancel_${row.id}`)
              .setLabel(`❌ 撤回 ${trimButtonLabel(row.name, 10)}`)
              .setStyle(ButtonStyle.Danger)
          )
        )
      );
    }

    try {
      await updateInteractionMessage(interaction, { embeds: [embed], components: rows });
    } catch (err) {
      console.error('[Friends] menu update failed:', err?.message || err);
      if (interaction?.channel?.send) {
        await interaction.channel.send({ embeds: [embed], components: rows }).catch(() => {});
      } else {
        throw err;
      }
    }
  }

  async function showFriendCharacter(interaction, user, friendId = '') {
    const viewer = loadPlayer(user.id);
    if (!viewer) {
      await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', embeds: [], components: [] }).catch(() => {});
      return;
    }
    ensurePlayerFriendState(viewer);
    const targetId = normalizeFriendId(friendId);
    if (!targetId || !isMutualFriend(viewer, targetId)) {
      await showFriendsMenu(interaction, user, '你們尚未互加好友，無法查看對方資料。');
      return;
    }

    const target = loadPlayer(targetId);
    if (!target) {
      await showFriendsMenu(interaction, user, '該玩家資料目前不可用，請稍後再試。');
      return;
    }
    const targetPet = loadPet(targetId);
    const duelRecord = getFriendBattleRecord(viewer, targetId);
    const hp = `${Number(target?.stats?.生命 || 0)}/${Number(target?.maxStats?.生命 || 100)}`;
    const energy = `${Number(target?.stats?.能量 || 0)}/${Number(target?.maxStats?.能量 || 100)}`;
    const petText = targetPet
      ? `${targetPet.name || '未命名'}（${targetPet.type || '未知'}） HP ${targetPet.hp || 0}/${targetPet.maxHp || 100}`
      : '尚無寵物資料';

    const embed = new EmbedBuilder()
      .setTitle(`👤 好友資訊：${target.name}`)
      .setColor(0x3f51b5)
      .setDescription('僅互加好友可見')
      .addFields(
        { name: '🏷️ 稱號', value: String(target.title || '冒險者'), inline: false },
        { name: '📍 位置', value: String(target.location || '未知'), inline: true },
        { name: '📊 等級', value: String(target.level || 1), inline: true },
        { name: '💰 Rns', value: String(Math.max(0, Number(target?.stats?.財富 || 0))), inline: true },
        { name: '❤️ 生命', value: hp, inline: true },
        { name: '⚡ 能量', value: energy, inline: true },
        { name: '📊 你對TA戰績', value: `${duelRecord.wins} 勝 / ${duelRecord.losses} 敗`, inline: true },
        { name: '🐾 夥伴', value: petText, inline: false }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`friend_duel_${targetId}`).setLabel('⚔️ 發起友誼戰').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('open_friends').setLabel('🤝 返回好友').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('main_menu').setLabel('🔙 返回主選單').setStyle(ButtonStyle.Secondary)
    );
    try {
      await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
    } catch (err) {
      console.error('[Friends] character update failed:', err?.message || err);
      if (interaction?.channel?.send) {
        await interaction.channel.send({ embeds: [embed], components: [row] }).catch(() => {});
      } else {
        throw err;
      }
    }
  }

  return {
    showFriendAddModal,
    showFriendsMenu,
    showFriendCharacter
  };
}

module.exports = { createFriendUiSystem };
