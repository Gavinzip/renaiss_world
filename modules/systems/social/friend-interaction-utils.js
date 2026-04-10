function createFriendInteractionUtils(deps = {}) {
  const {
    CORE,
    normalizeFriendId = () => '',
    createFriendRequest = () => ({ ok: false, code: 'unknown' }),
    getPlayerDisplayNameById = () => 'Unknown',
    ensurePlayerFriendState = () => ({ friends: [] })
  } = deps;

  async function handleFriendInteractions(interaction, user, customId) {
    if (customId !== 'friend_add_modal') return false;

    const targetIdRaw = interaction.fields.getTextInputValue('friend_target_id');
    const targetId = normalizeFriendId(targetIdRaw);
    if (!targetId) {
      await interaction.reply({ content: '❌ ID 格式錯誤，請輸入有效的 Discord User ID。', ephemeral: true }).catch(() => {});
      return true;
    }

    const result = createFriendRequest(user.id, targetId);
    let notice = '處理失敗。';
    if (result.ok && result.code === 'requested') {
      notice = `已送出好友申請給 ${result.targetName}。`;
    } else if (result.ok && result.code === 'auto_accepted') {
      notice = `${result.targetName} 也曾送出申請，已自動互加成功。`;
    } else if (result.code === 'already_friends') {
      notice = `你和 ${result.targetName} 已是好友。`;
    } else if (result.code === 'already_requested') {
      notice = `你已經送出申請給 ${result.targetName}，等待對方同意。`;
    } else if (result.code === 'target_not_found') {
      notice = '找不到該玩家（對方可能尚未建立角色）。';
    } else if (result.code === 'self') {
      notice = '不能把自己加為好友。';
    } else if (result.code === 'invalid_id') {
      notice = 'ID 格式不正確。';
    }

    const base = CORE.loadPlayer(user.id);
    if (!base) {
      await interaction.reply({ content: `⚠️ ${notice}`, ephemeral: true }).catch(() => {});
      return true;
    }
    const social = ensurePlayerFriendState(base);
    CORE.savePlayer(base);
    const friends = social.friends
      .slice(0, 6)
      .map((id) => `• ${getPlayerDisplayNameById(id)}`)
      .join('\n') || '目前沒有好友';
    await interaction.reply({
      content: `✅ ${notice}\n\n目前好友：\n${friends}\n\n回到面板請按「🤝 好友」。`,
      ephemeral: true
    }).catch(() => {});
    return true;
  }

  return {
    handleFriendInteractions
  };
}

module.exports = {
  createFriendInteractionUtils
};

