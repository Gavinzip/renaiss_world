function createMarketSelectUtils(deps = {}) {
  const {
    CORE,
    ECON,
    parseMarketTypeFromCustomId = () => 'renaiss',
    showPlayerMarketMenu = async () => {},
    showWorldShopBuyPanel = async () => {},
    showWorldShopSellModal = async () => {},
    showWorldShopHaggleOffer = async () => {},
    showWorldShopHaggleAllOffer = async () => {}
  } = deps;

  async function replyOrFollowUp(interaction, payload = {}) {
    if (!interaction) return false;
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
      return true;
    } catch {
      return false;
    }
  }

  async function deferSelectIfNeeded(interaction) {
    if (!interaction?.isStringSelectMenu?.()) return;
    if (interaction.deferred || interaction.replied) return;
    await interaction.deferUpdate().catch(() => {});
  }

  async function handleMarketSelectMenu(interaction, user, customId) {
    if (customId.startsWith('pmkt_buy_select_')) {
      await deferSelectIfNeeded(interaction);
      const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
      const raw = String(interaction.values?.[0] || '').trim();
      const listingId = raw.startsWith('pmktbuy_') ? raw.slice('pmktbuy_'.length) : raw;
      if (!listingId) {
        await replyOrFollowUp(interaction, { content: '⚠️ 請先選擇要購買的商品。', ephemeral: true });
        return true;
      }
      const buyer = CORE.loadPlayer(user.id);
      if (!buyer) {
        await replyOrFollowUp(interaction, { content: '❌ 找不到角色！', ephemeral: true });
        return true;
      }
      ECON.ensurePlayerEconomy(buyer);
      const outcome = ECON.buyFromSellListing(buyer, listingId, {
        loadPlayerById: (id) => CORE.loadPlayer(id),
        savePlayerById: (p) => CORE.savePlayer(p)
      });
      if (!outcome?.success) {
        await replyOrFollowUp(interaction, { content: `❌ 成交失敗：${outcome?.reason || '未知錯誤'}`, ephemeral: true });
        return true;
      }
      CORE.savePlayer(buyer);
      const deliveryText = Array.isArray(outcome.deliveryNotes) && outcome.deliveryNotes.length > 0
        ? `｜${outcome.deliveryNotes.join('；')}`
        : '';
      const deferredHint = outcome.deliveryDeferred ? '｜櫃檯表示將於下一回合配送' : '';
      await showPlayerMarketMenu(
        interaction,
        user,
        outcome.marketType || marketType || 'renaiss',
        `成交成功：買入 ${outcome.itemName} x${outcome.quantity}，支出 ${outcome.totalPrice} Rns${deliveryText}${deferredHint}`
      );
      return true;
    }

    if (customId.startsWith('shop_buy_select_')) {
      await deferSelectIfNeeded(interaction);
      const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
      const raw = String(interaction.values?.[0] || '').trim();
      const listingId = raw.startsWith('shopbuy_') ? raw.slice('shopbuy_'.length) : raw;
      if (!listingId) {
        await replyOrFollowUp(interaction, { content: '⚠️ 請先選擇要購買的商品。', ephemeral: true });
        return true;
      }
      const buyer = CORE.loadPlayer(user.id);
      if (!buyer) {
        await replyOrFollowUp(interaction, { content: '❌ 找不到角色！', ephemeral: true });
        return true;
      }
      ECON.ensurePlayerEconomy(buyer);
      const outcome = ECON.buyFromSellListing(buyer, listingId, {
        loadPlayerById: (id) => CORE.loadPlayer(id),
        savePlayerById: (p) => CORE.savePlayer(p)
      });
      if (!outcome?.success) {
        await replyOrFollowUp(interaction, { content: `❌ 購買失敗：${outcome?.reason || '未知錯誤'}`, ephemeral: true });
        return true;
      }
      CORE.savePlayer(buyer);
      const deliveryText = Array.isArray(outcome.deliveryNotes) && outcome.deliveryNotes.length > 0
        ? `｜${outcome.deliveryNotes.join('；')}`
        : '';
      const deferredHint = outcome.deliveryDeferred ? '｜櫃檯表示將於下一回合配送' : '';
      await showWorldShopBuyPanel(
        interaction,
        user,
        outcome.marketType || marketType || 'renaiss',
        `成交成功：${outcome.itemName} x${outcome.quantity}（-${outcome.totalPrice} Rns）${deliveryText}${deferredHint}`
      );
      return true;
    }

    if (customId.startsWith('shop_sell_select_')) {
      const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
      const player = CORE.loadPlayer(user.id);
      if (!player) {
        await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
        return true;
      }
      if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || 'renaiss')) {
        await interaction.reply({ content: '⚠️ 請先在商店內操作掛賣。', ephemeral: true }).catch(() => {});
        return true;
      }
      const options = Array.isArray(player.shopSession.sellDraftOptions) ? player.shopSession.sellDraftOptions : [];
      const raw = String(interaction.values?.[0] || '');
      const idx = Number(raw.replace('sellidx_', ''));
      if (!Number.isFinite(idx) || idx < 0 || idx >= options.length) {
        await interaction.reply({ content: '⚠️ 掛賣選項已失效，請重新打開掛賣選單。', ephemeral: true }).catch(() => {});
        return true;
      }
      const spec = options[idx];
      if (!spec || typeof spec !== 'object') {
        await interaction.reply({ content: '⚠️ 掛賣選項資料錯誤，請重新選擇。', ephemeral: true }).catch(() => {});
        return true;
      }
      player.shopSession.pendingSellSpec = spec;
      CORE.savePlayer(player);
      await showWorldShopSellModal(interaction, marketType, spec);
      return true;
    }

    if (customId.startsWith('shop_haggle_select_')) {
      const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
      const player = CORE.loadPlayer(user.id);
      if (!player) {
        await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
        return true;
      }
      if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || 'renaiss')) {
        await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
        return true;
      }
      const options = Array.isArray(player.shopSession.haggleDraftOptions) ? player.shopSession.haggleDraftOptions : [];
      const raw = String(interaction.values?.[0] || '');
      const idx = Number(raw.replace('haggleidx_', ''));
      if (!Number.isFinite(idx) || idx < 0 || idx >= options.length) {
        await interaction.reply({ content: '⚠️ 議價選項已失效，請重新打開議價選單。', ephemeral: true }).catch(() => {});
        return true;
      }
      const spec = options[idx];
      if (!spec || typeof spec !== 'object') {
        await interaction.reply({ content: '⚠️ 議價選項資料錯誤，請重新選擇。', ephemeral: true }).catch(() => {});
        return true;
      }
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => {});
      }
      await showWorldShopHaggleOffer(interaction, user, marketType, spec);
      return true;
    }

    if (customId.startsWith('shop_haggle_bulk_select_')) {
      const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
      const player = CORE.loadPlayer(user.id);
      if (!player) {
        await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
        return true;
      }
      if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || 'renaiss')) {
        await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
        return true;
      }
      const options = Array.isArray(player.shopSession.haggleDraftOptions) ? player.shopSession.haggleDraftOptions : [];
      const rawValues = Array.isArray(interaction.values) ? interaction.values : [];
      const selectedSpecs = [];
      const used = new Set();
      for (const raw of rawValues) {
        const idx = Number(String(raw || '').replace('bulkidx_', ''));
        if (!Number.isFinite(idx) || idx < 0 || idx >= options.length) continue;
        const spec = options[idx];
        const key = `${String(spec?.itemName || '').trim()}::${String(spec?.itemRef?.source || '')}`;
        if (!spec || typeof spec !== 'object' || !String(spec?.itemName || '').trim() || used.has(key)) continue;
        used.add(key);
        selectedSpecs.push(spec);
      }
      if (selectedSpecs.length <= 0) {
        await interaction.reply({ content: '⚠️ 請至少選擇 1 件商品。', ephemeral: true }).catch(() => {});
        return true;
      }
      player.shopSession.haggleBulkSelectedSpecs = selectedSpecs.map((spec) => JSON.parse(JSON.stringify(spec)));
      CORE.savePlayer(player);
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => {});
      }
      await showWorldShopHaggleAllOffer(interaction, user, marketType, selectedSpecs);
      return true;
    }

    return false;
  }

  return {
    handleMarketSelectMenu
  };
}

module.exports = {
  createMarketSelectUtils
};
