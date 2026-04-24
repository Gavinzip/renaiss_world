function createMarketHelperUtils(deps = {}) {
  const {
    ECON,
    PET,
    getMarketTypeLabel = (marketType = 'renaiss') => (marketType === 'digital' ? '神秘鑑價站' : 'Renaiss鑑價站'),
    rememberPlayer = () => {},
    recordCashflow = () => {},
    SHOP_HEAL_CRYSTAL_COST = 200,
    SHOP_HEAL_CRYSTAL_RECOVER = 30,
    SHOP_ENERGY_CRYSTAL_COST = 2000,
    SHOP_ENERGY_CRYSTAL_RECOVER = 100,
    DIGITAL_CRYSTAL_EFFECT_FAIL_RATE = 0.5,
    SHOP_HAGGLE_BLOCKED_ITEMS = new Set(),
    getPlayerOwnedPets = () => [],
    normalizePetMoveLoadout = (pet) => ({ activeMoveIds: Array.isArray(pet?.activeMoveIds) ? pet.activeMoveIds : [] }),
    getPetAttackMoves = (pet) => Array.isArray(pet?.moves) ? pet.moves : []
  } = deps;
const {
    getLocalizedItemName,
    localizeScriptOnly,
    formatSkillChipDisplay,
    getSkillChipUiText
  } = require('../runtime/utils/global-language-resources');

  function parseMarketTypeFromCustomId(customId = '', fallback = 'renaiss') {
    if (String(customId || '').includes('_digital')) return 'digital';
    if (String(customId || '').includes('_renaiss')) return 'renaiss';
    return fallback === 'digital' ? 'digital' : 'renaiss';
  }

  function parseMarketAndPageFromCustomId(customId = '', prefix = '', fallbackMarket = 'renaiss') {
    const raw = String(customId || '');
    const body = prefix && raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
    const matched = body.match(/^(renaiss|digital)(?:_(\d+))?$/i);
    if (!matched) {
      return { marketType: fallbackMarket === 'digital' ? 'digital' : 'renaiss', page: 0 };
    }
    const marketType = String(matched[1] || fallbackMarket).toLowerCase() === 'digital' ? 'digital' : 'renaiss';
    const page = Math.max(0, Number(matched[2] || 0));
    return { marketType, page };
  }

  function paginateList(list = [], page = 0, pageSize = 6) {
    const source = Array.isArray(list) ? list : [];
    const size = Math.max(1, Number(pageSize || 6));
    const totalPages = Math.max(1, Math.ceil(source.length / size));
    const safePage = Math.max(0, Math.min(totalPages - 1, Number(page || 0)));
    const start = safePage * size;
    return {
      items: source.slice(start, start + size),
      page: safePage,
      totalPages,
      total: source.length,
      start
    };
  }

  function buildPagedFieldChunks(lines = [], maxLen = 1000, emptyText = '（空）') {
    const entries = Array.isArray(lines)
      ? lines.map((line) => String(line ?? '')).filter((line) => line.length > 0)
      : [];
    if (entries.length <= 0) return [String(emptyText || '（空）')];

    const chunks = [];
    let current = '';
    const hardLimit = Math.max(120, Number(maxLen || 1000));

    const appendLine = (line) => {
      if (!line) return;
      if (!current) {
        current = line;
        return;
      }
      if (current.length + 1 + line.length <= hardLimit) {
        current += `\n${line}`;
        return;
      }
      chunks.push(current);
      current = line;
    };

    for (const rawLine of entries) {
      if (rawLine.length <= hardLimit) {
        appendLine(rawLine);
        continue;
      }
      let remain = rawLine;
      let seg = 0;
      while (remain.length > 0) {
        const room = Math.max(24, hardLimit - (seg > 0 ? 3 : 0));
        const part = remain.slice(0, room);
        const line = seg > 0 ? `↪ ${part}` : part;
        appendLine(line);
        remain = remain.slice(room);
        seg += 1;
      }
    }

    if (current) chunks.push(current);
    return chunks.length > 0 ? chunks : [String(emptyText || '（空）')];
  }

  function buildMarketListingLine(listing = {}, idx = 0, lang = 'zh-TW') {
    const qty = Math.max(1, Number(listing?.quantity || 1));
    const unitPrice = Math.max(1, Number(listing?.unitPrice || 0));
    const total = Math.max(1, Number(listing?.totalPrice || qty * unitPrice));
    const owner = String(listing?.ownerName || '匿名玩家');
    const note = String(listing?.note || '').trim();
    const noteText = note ? `｜備註:${note}` : '';
    const itemName = getLocalizedItemName(listing, lang) || String(listing?.itemName || '商品');
    const line = `${idx + 1}. ${itemName} x${qty}｜單價 ${unitPrice}｜總價 ${total}｜掛單:${owner}${noteText}`;
    return line.length > 180 ? `${line.slice(0, 177)}...` : line;
  }

  function buyShopCrystal(player, pet, marketType = 'renaiss', crystalType = 'heal') {
    const safeType = crystalType === 'energy' ? 'energy' : 'heal';
    const isDigital = marketType === 'digital';
    const cost = safeType === 'energy' ? SHOP_ENERGY_CRYSTAL_COST : SHOP_HEAL_CRYSTAL_COST;
    const currentGold = Math.max(0, Number(player?.stats?.財富 || 0));
    if (currentGold < cost) {
      return {
        success: false,
        reason: `❌ Rns 不足，購買${safeType === 'energy' ? '回能水晶' : '回血水晶'}需要 ${cost} Rns。`
      };
    }

    player.stats.財富 = Math.max(0, currentGold - cost);
    const effectFailed = isDigital && Math.random() < DIGITAL_CRYSTAL_EFFECT_FAIL_RATE;
    const marketLabel = getMarketTypeLabel(marketType);

    recordCashflow(player, {
      amount: -cost,
      category: safeType === 'energy' ? 'shop_energy_crystal' : 'shop_heal_crystal',
      source: `${marketLabel} 購買${safeType === 'energy' ? '回能水晶' : '回血水晶'}`,
      marketType
    });

    if (effectFailed) {
      rememberPlayer(player, {
        type: '商店',
        content: `在${marketLabel}購買${safeType === 'energy' ? '回能水晶' : '回血水晶'}`,
        outcome: '水晶脈衝紊亂，這次未產生效果',
        importance: 1,
        tags: ['shop', marketType, 'crystal', 'effect_failed']
      });
      return {
        success: true,
        cost,
        effectFailed: true,
        message: `你購買了${safeType === 'energy' ? '回能水晶' : '回血水晶'}，但水晶脈衝紊亂，這次沒有產生效果。`
      };
    }

    if (safeType === 'energy') {
      if (!player.stats || typeof player.stats !== 'object') player.stats = {};
      if (!player.maxStats || typeof player.maxStats !== 'object') player.maxStats = {};
      const before = Math.max(0, Number(player.stats.能量 || 0));
      const maxEnergy = Math.max(1, Number(player.maxStats.能量 || 100));
      const after = Math.min(maxEnergy, before + SHOP_ENERGY_CRYSTAL_RECOVER);
      player.stats.能量 = after;
      const gain = Math.max(0, after - before);
      rememberPlayer(player, {
        type: '商店',
        content: `在${marketLabel}購買回能水晶`,
        outcome: gain > 0 ? `能量恢復 +${gain}` : '能量已滿，無需恢復',
        importance: gain > 0 ? 2 : 1,
        tags: ['shop', marketType, 'energy_crystal']
      });
      return {
        success: true,
        cost,
        effectFailed: false,
        message: gain > 0
          ? `回能水晶生效：能量 +${gain}（${after}/${maxEnergy}）。`
          : `回能水晶生效：目前能量已滿（${after}/${maxEnergy}）。`
      };
    }

    const targetPet = pet && typeof pet === 'object' ? pet : null;
    if (!targetPet) {
      rememberPlayer(player, {
        type: '商店',
        content: `在${marketLabel}購買回血水晶`,
        outcome: '未找到寵物，無法作用',
        importance: 1,
        tags: ['shop', marketType, 'heal_crystal', 'no_pet']
      });
      return {
        success: true,
        cost,
        effectFailed: false,
        message: '你購買了回血水晶，但目前沒有可恢復的寵物對象。'
      };
    }

    const beforeHp = Math.max(0, Number(targetPet.hp || 0));
    const maxHp = Math.max(1, Number(targetPet.maxHp || 100));
    const afterHp = Math.min(maxHp, beforeHp + SHOP_HEAL_CRYSTAL_RECOVER);
    targetPet.hp = afterHp;
    const gain = Math.max(0, afterHp - beforeHp);
    rememberPlayer(player, {
      type: '商店',
      content: `在${marketLabel}購買回血水晶`,
      outcome: gain > 0 ? `${targetPet.name || '寵物'} 回復 +${gain} HP` : `${targetPet.name || '寵物'} 已滿血`,
      importance: gain > 0 ? 2 : 1,
      tags: ['shop', marketType, 'heal_crystal']
    });
    return {
      success: true,
      cost,
      effectFailed: false,
      message: gain > 0
        ? `回血水晶生效：${targetPet.name || '寵物'} 回復 +${gain} HP（${afterHp}/${maxHp}）。`
        : `回血水晶生效：${targetPet.name || '寵物'} 目前已滿血（${afterHp}/${maxHp}）。`
    };
  }

  function getRarityRank(raw = '') {
    const normalized = String(raw || '').trim();
    if (normalized === '史詩') return 3;
    if (normalized === '稀有') return 2;
    return 1;
  }

  function normalizeListingRarity(raw = '') {
    const text = String(raw || '').trim();
    if (!text) return '普通';
    if (/史詩|傳說|legend/i.test(text)) return '史詩';
    if (/稀有|精良|罕見|rare/i.test(text)) return '稀有';
    return '普通';
  }

  function estimateStoryReferencePriceByName(name = '') {
    const text = String(name || '');
    let value = 18;
    if (/靈芝|人參|雪蓮|仙草|稀有|秘笈|核心|晶|寶|礦/u.test(text)) value += 65;
    if (/肉|魚|野兔|野雞|野豬|鹿/u.test(text)) value += 18;
    if (/毒|斷腸|曼陀羅/u.test(text)) value += 12;
    if (/乾糧|水囊/u.test(text)) value = 5;
    return Math.max(1, Math.floor(value));
  }

  function estimateMoveReferencePriceByTier(tier = 1) {
    const safeTier = Math.max(1, Number(tier) || 1);
    if (safeTier >= 3) return 520;
    if (safeTier >= 2) return 280;
    return 130;
  }

  function getDraftItemName(raw = null) {
    if (typeof raw === 'string') return raw.trim();
    return String(raw?.name || '').trim();
  }

  function buildShopSellDraftOptions(player, ownerId) {
    ECON.ensurePlayerEconomy(player);
    const uiLang = String(player?.language || 'zh-TW').trim() || 'zh-TW';
    const stacked = new Map();

    const addStack = (rawName, source, amount = 1, extra = {}) => {
      const name = String(rawName || '').trim();
      if (!name) return;
      const key = name;
      const qty = Math.max(1, Math.floor(Number(amount || 1)));
      const rarity = normalizeListingRarity(extra?.rarity || '');
      const refPrice = Math.max(1, Math.floor(Number(extra?.referencePrice || 0))) || estimateStoryReferencePriceByName(name);
      const prev = stacked.get(key);
      if (prev) {
        prev.quantity += qty;
        if (!prev.sources.includes(source)) prev.sources.push(source);
        if (refPrice > Number(prev.referencePrice || 0)) prev.referencePrice = refPrice;
        if (getRarityRank(rarity) > getRarityRank(prev.rarity)) prev.rarity = rarity;
        return;
      }
      stacked.set(key, {
        kind: 'item',
        sources: [source],
        itemName: name,
        itemNames: extra?.itemNames && typeof extra.itemNames === 'object' ? extra.itemNames : null,
        quantity: qty,
        rarity,
        referencePrice: refPrice
      });
    };

    for (const good of Array.isArray(player.tradeGoods) ? player.tradeGoods : []) {
      const goodName = typeof good === 'string' ? good : (good?.name || '');
      addStack(goodName, 'tradeGoods', 1, {
        itemNames: good?.names || good?.itemNames || null,
        rarity: good?.rarity || '普通',
        referencePrice: Number(good?.value || 0)
      });
    }
    for (const herb of Array.isArray(player.herbs) ? player.herbs : []) {
      const herbName = typeof herb === 'string' ? herb : herb?.name || '';
      addStack(herbName, 'herbs', 1, {
        rarity: /稀有|靈|仙|神/u.test(String(herbName || '')) ? '稀有' : '普通',
        referencePrice: estimateStoryReferencePriceByName(herbName)
      });
    }
    for (const inv of Array.isArray(player.inventory) ? player.inventory : []) {
      const itemName = typeof inv === 'string' ? inv : inv?.name || '';
      addStack(itemName, 'inventory', 1, {
        rarity: /史詩|傳說|神話/u.test(String(itemName || ''))
          ? '史詩'
          : (/稀有|精良|秘|寶/u.test(String(itemName || '')) ? '稀有' : '普通'),
        referencePrice: estimateStoryReferencePriceByName(itemName)
      });
    }

    const options = Array.from(stacked.values())
      .sort((a, b) => String(a.itemName || '').localeCompare(String(b.itemName || '')))
      .map((entry) => {
        const normalizedName = String(entry.itemName || '').trim();
        const localizedName = getLocalizedItemName({ itemName: normalizedName, itemNames: entry.itemNames || null }, uiLang) || normalizedName;
        return {
          kind: 'item',
          itemName: normalizedName,
          itemNames: entry.itemNames || null,
          itemDisplayName: localizedName,
          quantityMax: Math.max(1, Number(entry.quantity || 1)),
          itemRef: { kind: 'item', source: Array.isArray(entry.sources) ? entry.sources[0] : 'inventory' },
          rarity: normalizeListingRarity(entry.rarity || '普通'),
          referencePrice: Math.max(1, Math.floor(Number(entry.referencePrice || estimateStoryReferencePriceByName(entry.itemName || '')))),
          label: `[${normalizeListingRarity(entry.rarity || '普通')}] ${localizedName}`.slice(0, 100),
          description: localizeScriptOnly(
            `庫存 ${Math.max(1, Number(entry.quantity || 1))}｜參考價 ${Math.max(1, Math.floor(Number(entry.referencePrice || 1)))} Rns`,
            uiLang
          )
        };
      });

    let blockedActiveSkillCount = 0;
    const ownedPets = getPlayerOwnedPets(ownerId);
    for (const pet of ownedPets) {
      if (!pet || !pet.id) continue;
      const loadout = normalizePetMoveLoadout(pet, true);
      const activeSet = new Set(loadout.activeMoveIds || []);
      const attackMoves = getPetAttackMoves(pet);
      for (const move of attackMoves) {
        const moveId = String(move?.id || '').trim();
        if (!moveId) continue;
        if (activeSet.has(moveId)) {
          blockedActiveSkillCount += 1;
          continue;
        }
        const moveName = String(move?.name || moveId).trim();
        if (!moveName) continue;
        const moveRarity = normalizeListingRarity(
          typeof PET.getMoveRarityByTier === 'function'
            ? PET.getMoveRarityByTier(Number(move?.tier || 1))
            : '普通'
        );
        const moveRefPrice = estimateMoveReferencePriceByTier(Number(move?.tier || 1));
        const canonicalItemName = formatSkillChipDisplay(moveId, moveName, 'zh-TW');
        const localizedItemName = getLocalizedItemName(canonicalItemName, uiLang) || canonicalItemName;
        const chipText = getSkillChipUiText(uiLang);
        options.push({
          kind: 'pet_move',
          itemName: canonicalItemName,
          itemDisplayName: localizedItemName,
          quantityMax: 1,
          rarity: moveRarity,
          referencePrice: moveRefPrice,
          itemRef: {
            kind: 'pet_move',
            petId: String(pet.id),
            petName: String(pet.name || '寵物').slice(0, 48),
            moveId,
            moveName
          },
          label: `[${moveRarity}] ${pet.name}｜${localizedItemName}`.slice(0, 100),
          description: chipText.notEquippedYet(moveRefPrice)
        });
      }
    }

    return {
      options: options.slice(0, 80),
      blockedActiveSkillCount
    };
  }

  function buildShopHaggleDraftOptions(player, ownerId) {
    const draft = buildShopSellDraftOptions(player, ownerId);
    const options = (draft.options || [])
      .filter((entry) => String(entry?.kind || '') === 'item')
      .filter((entry) => !SHOP_HAGGLE_BLOCKED_ITEMS.has(String(entry?.itemName || '').trim()));
    return {
      ...draft,
      options: options.slice(0, 80)
    };
  }

  function getHaggleCandidateFromPlayer(player, spec = {}) {
    const itemName = String(spec?.itemName || '').trim();
    const preferSource = String(spec?.itemRef?.source || '').trim();
    if (!itemName) return null;

    const tradeGoods = Array.isArray(player?.tradeGoods) ? player.tradeGoods : [];
    const herbs = Array.isArray(player?.herbs) ? player.herbs : [];
    const inventory = Array.isArray(player?.inventory) ? player.inventory : [];

    const fromTrade = tradeGoods.find((good) => String(good?.name || '').trim() === itemName);
    const fromHerb = herbs.find((herb) => getDraftItemName(herb) === itemName);
    const fromInv = inventory.find((item) => getDraftItemName(item) === itemName && !SHOP_HAGGLE_BLOCKED_ITEMS.has(getDraftItemName(item)));

    const bySource = {
      tradeGoods: fromTrade
        ? {
          source: 'tradeGoods',
          itemName,
          itemNames: fromTrade?.names || fromTrade?.itemNames || null,
          tradeGoodId: String(fromTrade?.id || '').trim(),
          tradeGood: JSON.parse(JSON.stringify(fromTrade))
        }
        : null,
      herbs: fromHerb
        ? { source: 'herbs', itemName }
        : null,
      inventory: fromInv
        ? { source: 'inventory', itemName }
        : null
    };

    if (preferSource && bySource[preferSource]) return bySource[preferSource];
    return bySource.tradeGoods || bySource.herbs || bySource.inventory || null;
  }

  function buildHaggleShadowPlayer(player, spec = {}, worldDay = 1) {
    const candidate = getHaggleCandidateFromPlayer(player, spec);
    if (!candidate) return { error: '找不到可議價的物品，請重新選擇。' };

    const shadow = JSON.parse(JSON.stringify(player || {}));
    ECON.ensurePlayerEconomy(shadow);
    shadow.tradeGoods = [];
    shadow.herbs = [];
    shadow.inventory = [];
    if (!shadow.marketState || typeof shadow.marketState !== 'object') shadow.marketState = {};
    shadow.marketState.lastSkillLicenseDay = Number(worldDay || 1);

    if (candidate.source === 'tradeGoods' && candidate.tradeGood) {
      shadow.tradeGoods.push(candidate.tradeGood);
    } else if (candidate.source === 'herbs') {
      shadow.herbs.push(candidate.itemName);
    } else {
      shadow.inventory.push(candidate.itemName);
    }

    return { shadow, candidate };
  }

  function buildHaggleBulkShadowPlayer(player, specs = [], worldDay = 1) {
    const input = Array.isArray(specs) ? specs : [];
    if (input.length <= 0) return { error: '請先選擇要批次議價的商品。' };

    const shadow = JSON.parse(JSON.stringify(player || {}));
    ECON.ensurePlayerEconomy(shadow);
    shadow.tradeGoods = [];
    shadow.herbs = [];
    shadow.inventory = [];
    if (!shadow.marketState || typeof shadow.marketState !== 'object') shadow.marketState = {};
    shadow.marketState.lastSkillLicenseDay = Number(worldDay || 1);

    const tradeGoods = Array.isArray(player?.tradeGoods) ? player.tradeGoods : [];
    const herbs = Array.isArray(player?.herbs) ? player.herbs : [];
    const inventory = Array.isArray(player?.inventory) ? player.inventory : [];

    const normalizedSpecs = [];
    const usedName = new Set();
    for (const raw of input) {
      const itemName = String(raw?.itemName || '').trim();
      if (!itemName || usedName.has(itemName)) continue;
      usedName.add(itemName);

      let matched = 0;
      for (const good of tradeGoods) {
        if (String(good?.name || '').trim() !== itemName) continue;
        shadow.tradeGoods.push(JSON.parse(JSON.stringify(good)));
        matched += 1;
      }
      for (const herb of herbs) {
        if (getDraftItemName(herb) !== itemName) continue;
        shadow.herbs.push(typeof herb === 'string' ? herb : JSON.parse(JSON.stringify(herb)));
        matched += 1;
      }
      for (const item of inventory) {
        const name = getDraftItemName(item);
        if (!name || SHOP_HAGGLE_BLOCKED_ITEMS.has(name) || name !== itemName) continue;
        shadow.inventory.push(typeof item === 'string' ? item : JSON.parse(JSON.stringify(item)));
        matched += 1;
      }
      if (matched <= 0) continue;

      normalizedSpecs.push({
        kind: 'item',
        itemName,
        itemNames: raw?.itemNames && typeof raw.itemNames === 'object' ? raw.itemNames : null,
        quantityMax: matched,
        itemRef: { kind: 'item', source: String(raw?.itemRef?.source || 'inventory') }
      });
    }

    if (normalizedSpecs.length <= 0) {
      return { error: '你選的商品目前已不存在，請重新選擇。' };
    }

    return { shadow, specs: normalizedSpecs };
  }

  function consumeHaggleItemFromPlayer(player, spec = {}) {
    const itemName = String(spec?.itemName || '').trim();
    const tradeGoodId = String(spec?.itemRef?.tradeGoodId || '').trim();
    const preferSource = String(spec?.itemRef?.source || '').trim();
    if (!itemName) return { success: false, reason: '物品名稱缺失' };

    const tryTradeGoods = () => {
      const list = Array.isArray(player?.tradeGoods) ? player.tradeGoods : [];
      let idx = -1;
      if (tradeGoodId) idx = list.findIndex((good) => String(good?.id || '').trim() === tradeGoodId);
      if (idx < 0) idx = list.findIndex((good) => String(good?.name || '').trim() === itemName);
      if (idx < 0) return false;
      list.splice(idx, 1);
      return true;
    };
    const tryHerbs = () => {
      const list = Array.isArray(player?.herbs) ? player.herbs : [];
      const idx = list.findIndex((herb) => getDraftItemName(herb) === itemName);
      if (idx < 0) return false;
      list.splice(idx, 1);
      return true;
    };
    const tryInventory = () => {
      const list = Array.isArray(player?.inventory) ? player.inventory : [];
      const idx = list.findIndex((item) => {
        const name = getDraftItemName(item);
        if (!name || SHOP_HAGGLE_BLOCKED_ITEMS.has(name)) return false;
        return name === itemName;
      });
      if (idx < 0) return false;
      list.splice(idx, 1);
      return true;
    };

    const ordered = preferSource === 'tradeGoods'
      ? [tryTradeGoods, tryHerbs, tryInventory]
      : preferSource === 'herbs'
        ? [tryHerbs, tryTradeGoods, tryInventory]
        : preferSource === 'inventory'
          ? [tryInventory, tryTradeGoods, tryHerbs]
          : [tryTradeGoods, tryHerbs, tryInventory];
    for (const fn of ordered) {
      if (fn()) return { success: true, itemName };
    }
    return { success: false, reason: `物品「${itemName}」已不存在或已被移除` };
  }

  function consumeHaggleBulkItemsFromPlayer(player, specs = []) {
    const input = Array.isArray(specs) ? specs : [];
    if (input.length <= 0) return { success: false, reason: '缺少批次議價項目' };

    const countAvailable = (itemName) => {
      let count = 0;
      for (const good of Array.isArray(player?.tradeGoods) ? player.tradeGoods : []) {
        if (String(good?.name || '').trim() === itemName) count += 1;
      }
      for (const herb of Array.isArray(player?.herbs) ? player.herbs : []) {
        if (getDraftItemName(herb) === itemName) count += 1;
      }
      for (const item of Array.isArray(player?.inventory) ? player.inventory : []) {
        const name = getDraftItemName(item);
        if (!name || SHOP_HAGGLE_BLOCKED_ITEMS.has(name)) continue;
        if (name === itemName) count += 1;
      }
      return count;
    };

    for (const raw of input) {
      const itemName = String(raw?.itemName || '').trim();
      const need = Math.max(1, Number(raw?.quantityMax || 1));
      if (!itemName) continue;
      const available = countAvailable(itemName);
      if (available < need) {
        return { success: false, reason: `商品「${itemName}」數量已變動，請重新議價。` };
      }
    }

    const consumed = [];
    for (const raw of input) {
      const itemName = String(raw?.itemName || '').trim();
      const need = Math.max(1, Number(raw?.quantityMax || 1));
      if (!itemName) continue;
      let remaining = need;

      const tryTrade = () => {
        const list = Array.isArray(player?.tradeGoods) ? player.tradeGoods : [];
        for (let i = list.length - 1; i >= 0 && remaining > 0; i--) {
          if (String(list[i]?.name || '').trim() !== itemName) continue;
          list.splice(i, 1);
          remaining -= 1;
        }
      };
      const tryHerbs = () => {
        const list = Array.isArray(player?.herbs) ? player.herbs : [];
        for (let i = list.length - 1; i >= 0 && remaining > 0; i--) {
          if (getDraftItemName(list[i]) !== itemName) continue;
          list.splice(i, 1);
          remaining -= 1;
        }
      };
      const tryInv = () => {
        const list = Array.isArray(player?.inventory) ? player.inventory : [];
        for (let i = list.length - 1; i >= 0 && remaining > 0; i--) {
          const name = getDraftItemName(list[i]);
          if (!name || SHOP_HAGGLE_BLOCKED_ITEMS.has(name) || name !== itemName) continue;
          list.splice(i, 1);
          remaining -= 1;
        }
      };

      const prefer = String(raw?.itemRef?.source || '').trim();
      const chain = prefer === 'tradeGoods'
        ? [tryTrade, tryHerbs, tryInv]
        : prefer === 'herbs'
          ? [tryHerbs, tryTrade, tryInv]
          : prefer === 'inventory'
            ? [tryInv, tryTrade, tryHerbs]
            : [tryTrade, tryHerbs, tryInv];
      for (const fn of chain) {
        if (remaining <= 0) break;
        fn();
      }

      const removed = need - remaining;
      if (removed < need) {
        return { success: false, reason: `商品「${itemName}」數量已變動，請重新議價。` };
      }
      consumed.push({ itemName, quantity: removed });
    }

    const totalRemoved = consumed.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    if (totalRemoved <= 0) return { success: false, reason: '沒有可成交商品' };
    return { success: true, consumed, totalRemoved };
  }

  function extractPitchFromHaggleMessage(message = '') {
    const text = String(message || '');
    const match = text.match(/🏪\s*[^：:\n]+[：:]\s*([^\n]+)/u);
    return String(match?.[1] || '').trim();
  }

  return {
    parseMarketTypeFromCustomId,
    parseMarketAndPageFromCustomId,
    paginateList,
    buildPagedFieldChunks,
    buildMarketListingLine,
    buyShopCrystal,
    getRarityRank,
    normalizeListingRarity,
    estimateStoryReferencePriceByName,
    estimateMoveReferencePriceByTier,
    buildShopSellDraftOptions,
    buildShopHaggleDraftOptions,
    getDraftItemName,
    getHaggleCandidateFromPlayer,
    buildHaggleShadowPlayer,
    buildHaggleBulkShadowPlayer,
    consumeHaggleItemFromPlayer,
    consumeHaggleBulkItemsFromPlayer,
    extractPitchFromHaggleMessage
  };
}

module.exports = { createMarketHelperUtils };
