/**
 * 💹 Renaiss 經濟系統
 * - 產生戰利品/資源品
 * - 正反派鑑價
 * - 出售結算
 */

const { getLocationDifficulty } = require('./world-map');
const PET = require('./pet-system');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PROTECTED_ITEMS = new Set(['乾糧一包', '水囊']);

const LOOT_RARITY_TIERS = [
  { key: '普通', multiplier: 1.0 },
  { key: '稀有', multiplier: 1.0 },
  { key: '史詩', multiplier: 1.0 }
];
const LOOT_BASELINE_RATES = { 普通: 80, 稀有: 15, 史詩: 5 };
const LOOT_DIFFICULTY_SLOPE = Math.max(1, Number(process.env.LOOT_DIFFICULTY_SLOPE || 8));
const LOOT_VALUE_RANGES = {
  普通: { min: 15, max: 100 },
  稀有: { min: 120, max: 500 },
  史詩: { min: 550, max: 2000 }
};

const APPRAISERS = {
  renaiss: {
    npcName: '艾洛・Renaiss鑑價員',
    personality: '審慎、透明、偏重公道與長期信任',
    styleGuide: '語氣專業克制，會解釋估值依據，不誇大承諾',
    minRate: 0.92,
    maxRate: 1.08
  },
  digital: {
    npcName: '摩爾・Digital鑑價員',
    personality: '圓滑狡黠、擅長話術與心理施壓',
    styleGuide: '話要好聽、畫大餅、包裝低價為機會，避免直接承認壓價',
    minRate: 0.45,
    maxRate: 0.72
  }
};

const RARE_PLANTS = ['月影蘭', '霜焰花', '星沙藤', '赤霞芝', '碧麟草'];
const RARE_ORES = ['天隕鐵', '蒼銀礦', '黑曜髓晶', '靈脈銅', '鳳鳴金'];
const TROPHY_PREFIX = ['裂痕', '燃霜', '幽鋒', '荒潮', '銀葬', '玄骨'];
const MAX_APPRAISAL_HISTORY = 28;
const MINIMAX_MODEL = 'MiniMax-M2.5';
const AI_TIMEOUT_MS = 12000;
const LOOT_AI_TIMEOUT_MS = 4500;
const SCRATCH_STATE_FILE = path.join(__dirname, 'data', 'scratch_lottery.json');
const PLAYER_MARKET_FILE = path.join(__dirname, 'data', 'player_market_board.json');
const SCRATCH_COST = 100;
const SCRATCH_WIN_RATE = 0.3;
const SCRATCH_WIN_REWARD = 500;
const DIGITAL_MASK_TURNS = Math.max(1, Number(process.env.DIGITAL_MASK_TURNS || 12));
const MAX_FINANCE_LEDGER = Math.max(40, Number(process.env.MAX_FINANCE_LEDGER || 180));
const MAX_FINANCE_NOTICES = Math.max(6, Number(process.env.MAX_FINANCE_NOTICES || 24));
const MAX_MARKET_OPEN_LISTINGS_PER_PLAYER = Math.max(3, Number(process.env.MAX_MARKET_OPEN_LISTINGS_PER_PLAYER || 40));
const MAX_MARKET_NOTE_LEN = 80;

function ensurePlayerEconomy(player) {
  if (!player || typeof player !== 'object') return;
  if (!Array.isArray(player.tradeGoods)) player.tradeGoods = [];
  if (!player.marketState || typeof player.marketState !== 'object') {
    player.marketState = {
      lastSkillLicenseDay: 0,
      renaissVisits: 0,
      digitalVisits: 0
    };
  }
  if (!Number.isFinite(Number(player.marketState.lastSkillLicenseDay))) player.marketState.lastSkillLicenseDay = 0;
  if (!Number.isFinite(Number(player.marketState.renaissVisits))) player.marketState.renaissVisits = 0;
  if (!Number.isFinite(Number(player.marketState.digitalVisits))) player.marketState.digitalVisits = 0;
  if (!Number.isFinite(Number(player.marketState.digitalRiskScore))) player.marketState.digitalRiskScore = 0;
  if (!Array.isArray(player.marketState.appraisalHistory)) player.marketState.appraisalHistory = [];
  if (!player.stats) player.stats = {};
  if (!Number.isFinite(Number(player.stats.財富))) player.stats.財富 = 0;
  ensurePlayerFinanceLedger(player);
}

function ensurePlayerFinanceLedger(player) {
  if (!player || typeof player !== 'object') return;
  if (!Array.isArray(player.financeLedger)) player.financeLedger = [];
  if (!Array.isArray(player.financeNotices)) player.financeNotices = [];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeMarketType(marketType = 'renaiss') {
  return String(marketType || '').trim().toLowerCase() === 'digital' ? 'digital' : 'renaiss';
}

function normalizeText(text = '', maxLen = 80) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, Math.max(1, Number(maxLen) || 80));
}

function makeFinanceNotice(entry = {}) {
  const amount = Number(entry.amount || 0);
  const source = normalizeText(entry.source || entry.category || '資金變動', 80);
  const sign = amount > 0 ? '+' : '';
  return `💸 ${source}：${sign}${amount} Rns`;
}

function appendFinanceLedger(player, entry = {}) {
  ensurePlayerEconomy(player);
  const amount = Math.floor(Number(entry.amount || 0));
  if (!Number.isFinite(amount) || amount === 0) return null;
  const now = Date.now();
  const record = {
    id: `flow_${now}_${Math.random().toString(36).slice(2, 7)}`,
    amount,
    balanceAfter: Math.floor(Number(player?.stats?.財富 || 0)),
    category: normalizeText(entry.category || 'misc', 32) || 'misc',
    source: normalizeText(entry.source || '', 120),
    marketType: normalizeMarketType(entry.marketType || 'renaiss'),
    counterpartyId: normalizeText(entry.counterpartyId || '', 36),
    counterpartyName: normalizeText(entry.counterpartyName || '', 36),
    refId: normalizeText(entry.refId || '', 36),
    note: normalizeText(entry.note || '', 160),
    at: now
  };
  player.financeLedger.unshift(record);
  if (player.financeLedger.length > MAX_FINANCE_LEDGER) {
    player.financeLedger.length = MAX_FINANCE_LEDGER;
  }
  if (!entry.silentNotice) {
    player.financeNotices.unshift(makeFinanceNotice(record));
    if (player.financeNotices.length > MAX_FINANCE_NOTICES) {
      player.financeNotices.length = MAX_FINANCE_NOTICES;
    }
  }
  return record;
}

function pushFinanceNotice(player, text = '') {
  ensurePlayerEconomy(player);
  const note = normalizeText(text, 180);
  if (!note) return;
  player.financeNotices.unshift(note);
  if (player.financeNotices.length > MAX_FINANCE_NOTICES) {
    player.financeNotices.length = MAX_FINANCE_NOTICES;
  }
}

function consumeFinanceNotices(player, limit = 3) {
  ensurePlayerEconomy(player);
  const take = Math.max(1, Math.min(8, Number(limit) || 3));
  return player.financeNotices.splice(0, take);
}

function loadMarketBoard() {
  if (!fs.existsSync(PLAYER_MARKET_FILE)) {
    return { version: 1, updatedAt: Date.now(), listings: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(PLAYER_MARKET_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid board');
    if (!Array.isArray(parsed.listings)) parsed.listings = [];
    return parsed;
  } catch {
    return { version: 1, updatedAt: Date.now(), listings: [] };
  }
}

function saveMarketBoard(board) {
  const safe = board && typeof board === 'object' ? board : { version: 1, listings: [] };
  if (!Array.isArray(safe.listings)) safe.listings = [];
  safe.version = 1;
  safe.updatedAt = Date.now();
  const dir = path.dirname(PLAYER_MARKET_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PLAYER_MARKET_FILE, JSON.stringify(safe, null, 2));
  return safe;
}

function createListingId() {
  return `mk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function countOpenListingsByOwner(board, ownerId) {
  const id = String(ownerId || '').trim();
  if (!id) return 0;
  return (board?.listings || []).filter((l) => l && l.status === 'open' && String(l.ownerId || '') === id).length;
}

function getOpenListingById(board, listingId) {
  const id = String(listingId || '').trim();
  if (!id) return null;
  return (board?.listings || []).find((l) => l && l.status === 'open' && String(l.id || '') === id) || null;
}

function findAndRemoveNamedItems(list = [], targetName = '', quantity = 1) {
  const normalized = normalizeText(targetName, 120);
  const need = Math.max(1, Math.floor(Number(quantity || 1)));
  const taken = [];
  if (!normalized || !Array.isArray(list)) return { ok: false, taken };

  for (let i = list.length - 1; i >= 0 && taken.length < need; i -= 1) {
    const item = list[i];
    const name = normalizeText(typeof item === 'string' ? item : item?.name || '', 120);
    if (!name || name !== normalized) continue;
    taken.push(list[i]);
    list.splice(i, 1);
  }
  return { ok: taken.length >= need, taken };
}

function reservePetMoveForListing(player, itemRef = {}, itemName = '') {
  ensurePlayerEconomy(player);
  const ownerId = normalizeText(player?.id || '', 36);
  const petId = normalizeText(itemRef.petId || '', 64);
  const moveId = normalizeText(itemRef.moveId || '', 64);
  const moveNameHint = normalizeText(itemRef.moveName || itemName || '', 80);
  if (!ownerId) return { success: false, reason: '找不到玩家資訊。' };
  if (!petId || !moveId) return { success: false, reason: '技能晶片掛賣資料不完整。' };

  const pet = typeof PET.getPetById === 'function' ? PET.getPetById(petId) : null;
  if (!pet || String(pet.ownerId || '') !== ownerId) {
    return { success: false, reason: '找不到可掛賣的技能晶片來源。' };
  }
  if (!Array.isArray(pet.moves)) pet.moves = [];

  const idx = pet.moves.findIndex((m) => String(m?.id || '').trim() === moveId);
  if (idx < 0) {
    return { success: false, reason: `技能「${moveNameHint || moveId}」不存在或已被移除。` };
  }
  const move = pet.moves[idx];
  if (move?.effect?.flee) {
    return { success: false, reason: '逃跑技能不可掛賣。' };
  }

  const activeIds = Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds.map((id) => String(id || '').trim()) : [];
  if (activeIds.includes(moveId)) {
    return { success: false, reason: `請先把「${move.name || moveId}」從上陣招式卸下，再掛賣。` };
  }

  const [removed] = pet.moves.splice(idx, 1);
  if (Array.isArray(pet.activeMoveIds) && pet.activeMoveIds.length > 0) {
    pet.activeMoveIds = pet.activeMoveIds
      .map((id) => String(id || '').trim())
      .filter((id) => id && id !== moveId);
  }
  if (typeof PET.savePet === 'function') PET.savePet(pet);

  const displayName = normalizeText(itemName || `技能晶片：${removed?.name || moveId}`, 120);
  return {
    success: true,
    targetName: displayName,
    quantity: 1,
    itemKind: 'pet_move',
    reserved: [{
      source: 'pet_move',
      item: {
        petId,
        petName: normalizeText(pet.name || '寵物', 48),
        moveId,
        moveName: normalizeText(removed?.name || moveNameHint || moveId, 80),
        moveSnapshot: removed && typeof removed === 'object'
          ? JSON.parse(JSON.stringify(removed))
          : null
      }
    }]
  };
}

function reserveItemsForListing(player, itemName, quantity, itemRef = null) {
  ensurePlayerEconomy(player);
  const refKind = String(itemRef?.kind || '').trim();
  if (refKind === 'pet_move') {
    return reservePetMoveForListing(player, itemRef, itemName);
  }
  const target = normalizeText(itemName, 120);
  const qty = Math.max(1, Math.floor(Number(quantity || 1)));
  if (!target) return { success: false, reason: '請輸入物品名稱。' };

  const backup = {
    tradeGoods: [...(player.tradeGoods || [])],
    herbs: [...(player.herbs || [])],
    inventory: [...(player.inventory || [])]
  };

  let remaining = qty;
  const reserved = [];

  if (Array.isArray(player.tradeGoods) && remaining > 0) {
    for (let i = player.tradeGoods.length - 1; i >= 0 && remaining > 0; i -= 1) {
      const good = player.tradeGoods[i];
      const name = normalizeText(good?.name || '', 120);
      if (!name || name !== target) continue;
      const [picked] = player.tradeGoods.splice(i, 1);
      reserved.push({ source: 'tradeGoods', item: picked });
      remaining -= 1;
    }
  }

  if (remaining > 0) {
    const herbResult = findAndRemoveNamedItems(player.herbs, target, remaining);
    for (const herb of herbResult.taken) reserved.push({ source: 'herbs', item: herb });
    remaining -= herbResult.taken.length;
  }

  if (remaining > 0) {
    const invResult = findAndRemoveNamedItems(player.inventory, target, remaining);
    for (const inv of invResult.taken) reserved.push({ source: 'inventory', item: inv });
    remaining -= invResult.taken.length;
  }

  if (remaining > 0) {
    player.tradeGoods = backup.tradeGoods;
    player.herbs = backup.herbs;
    player.inventory = backup.inventory;
    return { success: false, reason: `你沒有足夠的「${target}」，目前數量不足 ${qty} 件。` };
  }

  return { success: true, targetName: target, quantity: qty, reserved };
}

function restoreReservedItemsToOwner(player, reservedItems = []) {
  ensurePlayerEconomy(player);
  const items = Array.isArray(reservedItems) ? reservedItems : [];
  for (const payload of items) {
    if (!payload || typeof payload !== 'object') continue;
    const source = String(payload.source || '');
    if (source === 'tradeGoods') {
      if (!Array.isArray(player.tradeGoods)) player.tradeGoods = [];
      if (payload.item) player.tradeGoods.unshift(payload.item);
      continue;
    }
    if (source === 'herbs') {
      if (!Array.isArray(player.herbs)) player.herbs = [];
      if (payload.item) player.herbs.unshift(String(payload.item));
      continue;
    }
    if (source === 'pet_move') {
      const info = payload.item && typeof payload.item === 'object' ? payload.item : {};
      const petId = normalizeText(info.petId || '', 64);
      const moveId = normalizeText(info.moveId || '', 64);
      const moveName = normalizeText(info.moveName || '技能', 80);
      const targetPet = petId && typeof PET.getPetById === 'function' ? PET.getPetById(petId) : null;
      let restored = false;
      if (targetPet && String(targetPet.ownerId || '') === String(player.id || '')) {
        if (!Array.isArray(targetPet.moves)) targetPet.moves = [];
        const exists = targetPet.moves.some((m) => String(m?.id || '').trim() === moveId || String(m?.name || '').trim() === moveName);
        if (!exists) {
          const learn = moveId && typeof PET.learnMove === 'function' ? PET.learnMove(targetPet, moveId) : null;
          if (learn?.success) {
            restored = true;
          } else if (info.moveSnapshot && typeof info.moveSnapshot === 'object') {
            if (targetPet.moves.length < Math.max(1, Number(targetPet.maxMoves || 10))) {
              targetPet.moves.push(JSON.parse(JSON.stringify(info.moveSnapshot)));
              restored = true;
            }
          }
        } else {
          restored = true;
        }
        if (typeof PET.savePet === 'function') PET.savePet(targetPet);
      }
      if (!restored) {
        if (!Array.isArray(player.inventory)) player.inventory = [];
        player.inventory.unshift(`技能晶片：${moveName}`);
      }
      continue;
    }
    if (!Array.isArray(player.inventory)) player.inventory = [];
    if (payload.item) player.inventory.unshift(typeof payload.item === 'string' ? payload.item : String(payload.item?.name || '未知物品'));
  }
}

function transferReservedItemsToBuyer(player, reservedItems = []) {
  ensurePlayerEconomy(player);
  const items = Array.isArray(reservedItems) ? reservedItems : [];
  const transferNotes = [];
  for (const payload of items) {
    if (!payload || typeof payload !== 'object') continue;
    const source = String(payload.source || '');
    if (source === 'tradeGoods') {
      if (!Array.isArray(player.tradeGoods)) player.tradeGoods = [];
      if (payload.item) {
        const cloned = { ...(payload.item || {}) };
        if (!cloned.id) cloned.id = `good_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        player.tradeGoods.unshift(cloned);
      }
      continue;
    }
    if (source === 'herbs') {
      if (!Array.isArray(player.herbs)) player.herbs = [];
      if (payload.item) player.herbs.unshift(String(payload.item));
      continue;
    }
    if (source === 'pet_move') {
      const info = payload.item && typeof payload.item === 'object' ? payload.item : {};
      const moveId = normalizeText(info.moveId || '', 64);
      const moveName = normalizeText(info.moveName || '技能', 80);
      const buyerPet = typeof PET.loadPet === 'function' ? PET.loadPet(player.id) : null;
      if (buyerPet && moveId) {
        if (!Array.isArray(buyerPet.moves)) buyerPet.moves = [];
        const alreadyHas = buyerPet.moves.some((m) => String(m?.id || '').trim() === moveId);
        if (!alreadyHas && buyerPet.moves.length < Math.max(1, Number(buyerPet.maxMoves || 10))) {
          const learned = typeof PET.learnMove === 'function' ? PET.learnMove(buyerPet, moveId) : null;
          if (learned?.success) {
            if (typeof PET.savePet === 'function') PET.savePet(buyerPet);
            transferNotes.push(`已學會技能：${moveName}`);
            continue;
          }
        }
      }
      if (!Array.isArray(player.inventory)) player.inventory = [];
      player.inventory.unshift(`技能晶片：${moveName}`);
      transferNotes.push(`獲得技能晶片：${moveName}`);
      continue;
    }
    if (!Array.isArray(player.inventory)) player.inventory = [];
    if (payload.item) player.inventory.unshift(typeof payload.item === 'string' ? payload.item : String(payload.item?.name || '未知物品'));
  }
  return transferNotes;
}

function getMarketListingsView(options = {}) {
  const board = loadMarketBoard();
  const marketType = options.marketType === 'all' ? 'all' : normalizeMarketType(options.marketType || 'renaiss');
  const listingType = String(options.type || 'sell').trim().toLowerCase() === 'buy' ? 'buy' : 'sell';
  const ownerId = normalizeText(options.ownerId || '', 36);
  const excludeOwnerId = normalizeText(options.excludeOwnerId || '', 36);
  const limit = Math.max(1, Math.min(20, Number(options.limit || 8)));
  const now = Date.now();

  return (board.listings || [])
    .filter((listing) => listing && listing.status === 'open')
    .filter((listing) => listing.type === listingType)
    .filter((listing) => marketType === 'all' ? true : String(listing.marketType || 'renaiss') === marketType)
    .filter((listing) => ownerId ? String(listing.ownerId || '') === ownerId : true)
    .filter((listing) => excludeOwnerId ? String(listing.ownerId || '') !== excludeOwnerId : true)
    .sort((a, b) => Number(b.createdAt || now) - Number(a.createdAt || now))
    .slice(0, limit);
}

function createSellListing(player, marketType = 'renaiss', payload = {}) {
  ensurePlayerEconomy(player);
  const board = loadMarketBoard();
  const ownerId = normalizeText(player?.id || '', 36);
  if (!ownerId) return { success: false, reason: '找不到玩家 ID。' };
  const openCount = countOpenListingsByOwner(board, ownerId);
  if (openCount >= MAX_MARKET_OPEN_LISTINGS_PER_PLAYER) {
    return { success: false, reason: `你的掛單已達上限 ${MAX_MARKET_OPEN_LISTINGS_PER_PLAYER}。` };
  }

  const itemRef = payload?.itemRef && typeof payload.itemRef === 'object' ? payload.itemRef : null;
  const isPetMoveListing = String(itemRef?.kind || '').trim() === 'pet_move';
  const qty = isPetMoveListing
    ? 1
    : Math.max(1, Math.floor(Number(payload.quantity || payload.qty || 1)));
  const unitPrice = Math.max(1, Math.floor(Number(payload.unitPrice || payload.price || 0)));
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return { success: false, reason: '單價必須大於 0。' };
  }

  const reserve = reserveItemsForListing(player, payload.itemName, qty, itemRef);
  if (!reserve.success) return reserve;
  const normalizedMarket = normalizeMarketType(marketType);
  const finalQty = Math.max(1, Math.floor(Number(reserve.quantity || qty || 1)));
  const finalItemName = normalizeText(reserve.targetName || payload.itemName || '', 120);

  const listing = {
    id: createListingId(),
    type: 'sell',
    marketType: normalizedMarket,
    ownerId,
    ownerName: normalizeText(player.name || `玩家${ownerId.slice(-4)}`, 36),
    itemName: finalItemName,
    itemKind: String(reserve.itemKind || (isPetMoveListing ? 'pet_move' : 'item')),
    quantity: finalQty,
    unitPrice,
    totalPrice: finalQty * unitPrice,
    note: normalizeText(payload.note || '', MAX_MARKET_NOTE_LEN),
    status: 'open',
    reservedItems: reserve.reserved,
    reservedGold: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  board.listings.unshift(listing);
  saveMarketBoard(board);
  return { success: true, listing };
}

function createBuyListing(player, marketType = 'renaiss', payload = {}) {
  ensurePlayerEconomy(player);
  const board = loadMarketBoard();
  const ownerId = normalizeText(player?.id || '', 36);
  if (!ownerId) return { success: false, reason: '找不到玩家 ID。' };
  const openCount = countOpenListingsByOwner(board, ownerId);
  if (openCount >= MAX_MARKET_OPEN_LISTINGS_PER_PLAYER) {
    return { success: false, reason: `你的掛單已達上限 ${MAX_MARKET_OPEN_LISTINGS_PER_PLAYER}。` };
  }

  const itemName = normalizeText(payload.itemName || '', 120);
  const qty = Math.max(1, Math.floor(Number(payload.quantity || payload.qty || 1)));
  const unitPrice = Math.max(1, Math.floor(Number(payload.unitPrice || payload.price || 0)));
  const totalPrice = qty * unitPrice;
  if (!itemName) return { success: false, reason: '請輸入想收購的物品名稱。' };
  if (!Number.isFinite(totalPrice) || totalPrice <= 0) return { success: false, reason: '價格設定無效。' };

  const currentGold = Math.floor(Number(player?.stats?.財富 || 0));
  if (currentGold < totalPrice) {
    return { success: false, reason: `Rns 不足。你需要 ${totalPrice}，目前只有 ${currentGold}。` };
  }
  player.stats.財富 = currentGold - totalPrice;
  appendFinanceLedger(player, {
    amount: -totalPrice,
    category: 'market_buy_order_lock',
    source: `掛買單保證金：${itemName} x${qty}`,
    marketType: normalizeMarketType(marketType)
  });

  const listing = {
    id: createListingId(),
    type: 'buy',
    marketType: normalizeMarketType(marketType),
    ownerId,
    ownerName: normalizeText(player.name || `玩家${ownerId.slice(-4)}`, 36),
    itemName,
    quantity: qty,
    unitPrice,
    totalPrice,
    note: normalizeText(payload.note || '', MAX_MARKET_NOTE_LEN),
    status: 'open',
    reservedItems: [],
    reservedGold: totalPrice,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  board.listings.unshift(listing);
  saveMarketBoard(board);
  return { success: true, listing };
}

function buyFromSellListing(buyer, listingId, options = {}) {
  ensurePlayerEconomy(buyer);
  const loadPlayerById = options.loadPlayerById;
  const savePlayerById = options.savePlayerById;
  if (typeof loadPlayerById !== 'function' || typeof savePlayerById !== 'function') {
    return { success: false, reason: '缺少玩家讀寫函式。' };
  }

  const board = loadMarketBoard();
  const listing = getOpenListingById(board, listingId);
  if (!listing || listing.type !== 'sell') return { success: false, reason: '賣單不存在或已下架。' };
  const buyerId = normalizeText(buyer?.id || '', 36);
  if (!buyerId) return { success: false, reason: '找不到購買者。' };
  if (String(listing.ownerId || '') === buyerId) return { success: false, reason: '不能購買自己的賣單。' };

  const total = Math.max(1, Number(listing.totalPrice || 0));
  const buyerGold = Math.floor(Number(buyer?.stats?.財富 || 0));
  if (buyerGold < total) return { success: false, reason: `Rns 不足，需 ${total}。` };

  const seller = loadPlayerById(listing.ownerId);
  if (!seller) return { success: false, reason: '賣家目前不存在，請稍後重試。' };
  ensurePlayerEconomy(seller);

  buyer.stats.財富 = buyerGold - total;
  seller.stats.財富 = Math.floor(Number(seller?.stats?.財富 || 0)) + total;
  const transferNotes = transferReservedItemsToBuyer(buyer, listing.reservedItems || []);
  listing.reservedItems = [];
  listing.status = 'filled';
  listing.updatedAt = Date.now();
  listing.filledAt = Date.now();
  listing.buyerId = buyerId;
  listing.buyerName = normalizeText(buyer.name || `玩家${buyerId.slice(-4)}`, 36);

  appendFinanceLedger(buyer, {
    amount: -total,
    category: 'market_buy',
    source: `購買 ${listing.itemName} x${listing.quantity}`,
    marketType: listing.marketType,
    counterpartyId: listing.ownerId,
    counterpartyName: listing.ownerName,
    refId: listing.id
  });
  appendFinanceLedger(seller, {
    amount: total,
    category: 'market_sell',
    source: `售出 ${listing.itemName} x${listing.quantity}`,
    marketType: listing.marketType,
    counterpartyId: buyerId,
    counterpartyName: normalizeText(buyer.name || '', 36),
    refId: listing.id
  });
  pushFinanceNotice(
    seller,
    `📬 你的賣單已成交：${listing.itemName} x${listing.quantity}，入帳 +${total} Rns（買家：${normalizeText(buyer.name || '匿名玩家', 24)}）`
  );

  savePlayerById(seller);
  saveMarketBoard(board);

  return {
    success: true,
    listingId: listing.id,
    marketType: listing.marketType,
    itemName: listing.itemName,
    quantity: Number(listing.quantity || 1),
    totalPrice: total,
    sellerName: listing.ownerName,
    deliveryNotes: Array.isArray(transferNotes) ? transferNotes : []
  };
}

function fulfillBuyListing(seller, listingId, options = {}) {
  ensurePlayerEconomy(seller);
  const loadPlayerById = options.loadPlayerById;
  const savePlayerById = options.savePlayerById;
  if (typeof loadPlayerById !== 'function' || typeof savePlayerById !== 'function') {
    return { success: false, reason: '缺少玩家讀寫函式。' };
  }

  const board = loadMarketBoard();
  const listing = getOpenListingById(board, listingId);
  if (!listing || listing.type !== 'buy') return { success: false, reason: '買單不存在或已下架。' };
  const sellerId = normalizeText(seller?.id || '', 36);
  if (!sellerId) return { success: false, reason: '找不到出售者。' };
  if (String(listing.ownerId || '') === sellerId) return { success: false, reason: '不能成交自己的買單。' };

  const buyer = loadPlayerById(listing.ownerId);
  if (!buyer) return { success: false, reason: '買家目前不存在，請稍後重試。' };
  ensurePlayerEconomy(buyer);

  const reserve = reserveItemsForListing(seller, listing.itemName, Number(listing.quantity || 1));
  if (!reserve.success) return reserve;

  transferReservedItemsToBuyer(buyer, reserve.reserved);
  const payout = Math.max(0, Number(listing.reservedGold || listing.totalPrice || 0));
  seller.stats.財富 = Math.floor(Number(seller?.stats?.財富 || 0)) + payout;
  listing.reservedGold = 0;
  listing.reservedItems = reserve.reserved;
  listing.status = 'filled';
  listing.updatedAt = Date.now();
  listing.filledAt = Date.now();
  listing.sellerId = sellerId;
  listing.sellerName = normalizeText(seller.name || `玩家${sellerId.slice(-4)}`, 36);

  appendFinanceLedger(seller, {
    amount: payout,
    category: 'market_sell_to_buy_order',
    source: `完成買單：${listing.itemName} x${listing.quantity}`,
    marketType: listing.marketType,
    counterpartyId: listing.ownerId,
    counterpartyName: listing.ownerName,
    refId: listing.id
  });
  pushFinanceNotice(
    buyer,
    `📬 你的買單已完成：${listing.itemName} x${listing.quantity}（成交價 ${payout} Rns，賣家：${normalizeText(seller.name || '匿名玩家', 24)}）`
  );

  savePlayerById(buyer);
  saveMarketBoard(board);
  return {
    success: true,
    listingId: listing.id,
    marketType: listing.marketType,
    itemName: listing.itemName,
    quantity: Number(listing.quantity || 1),
    totalPrice: payout,
    buyerName: listing.ownerName
  };
}

function cancelMyListing(player, listingId) {
  ensurePlayerEconomy(player);
  const board = loadMarketBoard();
  const listing = getOpenListingById(board, listingId);
  if (!listing) return { success: false, reason: '掛單不存在或已結束。' };
  const ownerId = normalizeText(player?.id || '', 36);
  if (!ownerId || String(listing.ownerId || '') !== ownerId) {
    return { success: false, reason: '只能取消自己的掛單。' };
  }

  if (listing.type === 'sell') {
    restoreReservedItemsToOwner(player, listing.reservedItems || []);
    listing.reservedItems = [];
  } else if (listing.type === 'buy') {
    const refund = Math.max(0, Number(listing.reservedGold || 0));
    if (refund > 0) {
      player.stats.財富 = Math.floor(Number(player?.stats?.財富 || 0)) + refund;
      appendFinanceLedger(player, {
        amount: refund,
        category: 'market_buy_order_refund',
        source: `取消買單退款：${listing.itemName} x${listing.quantity}`,
        marketType: listing.marketType,
        refId: listing.id
      });
    }
    listing.reservedGold = 0;
  }

  listing.status = 'cancelled';
  listing.updatedAt = Date.now();
  saveMarketBoard(board);
  return {
    success: true,
    listingId: listing.id,
    marketType: listing.marketType,
    type: listing.type,
    itemName: listing.itemName,
    quantity: Number(listing.quantity || 1)
  };
}

function isDigitalMaskPhase(player) {
  return Number(player?.storyTurns || 0) <= DIGITAL_MASK_TURNS;
}

function getRecentHistoryByMarket(player, marketType = 'renaiss', limit = 2) {
  ensurePlayerEconomy(player);
  return (player.marketState.appraisalHistory || [])
    .filter(entry => entry && entry.marketType === marketType)
    .slice(0, Math.max(1, Number(limit) || 2));
}

function formatHistoryRecall(player, marketType = 'renaiss') {
  const recent = getRecentHistoryByMarket(player, marketType, 2);
  if (recent.length === 0) {
    return marketType === 'digital'
      ? '第一次合作我會幫你快速處理這批貨，流程絕對漂亮。'
      : '初次合作，我會把你的貨按規格逐件評估。';
  }
  const last = recent[0];
  const avgRatePct = Math.round(Number(last.avgRate || 1) * 100);
  if (marketType === 'digital') {
    return `上次你在 Day ${last.worldDay} 讓我處理 ${last.soldCount} 件，結算 ${last.quotedTotal} Rns 代幣；這次我再幫你「優化」一次。`;
  }
  return `我記得你上次 Day ${last.worldDay} 出貨 ${last.soldCount} 件，結算 ${last.quotedTotal} Rns 代幣（估值率約 ${avgRatePct}%）。`;
}

function buildDigitalRiskHint(riskScore) {
  const score = clamp(riskScore, 0, 100);
  if (score >= 80) return '你幾乎能確認：對方長期用話術壓價。';
  if (score >= 60) return '你開始抓到規律：他常把價格壓在你不容易察覺的區間。';
  if (score >= 35) return '你隱約察覺報價偏低，但對方總能把理由說得很好聽。';
  if (score >= 15) return '你感覺哪裡怪怪的，卻一時找不出破綻。';
  return '目前你還看不清其中的價差套路。';
}

function computeDigitalRiskDelta(fairTotal, quotedTotal, soldCount) {
  const fair = Math.max(1, Number(fairTotal || 1));
  const quoted = Math.max(0, Number(quotedTotal || 0));
  const underpayRatio = clamp(1 - quoted / fair, 0, 1);
  const loadFactor = clamp((Number(soldCount || 0) / 12), 0, 1);
  const delta = Math.round(underpayRatio * 22 + loadFactor * 6);
  return Math.max(0, delta);
}

function appendAppraisalHistory(player, entry) {
  ensurePlayerEconomy(player);
  const history = player.marketState.appraisalHistory;
  history.unshift(entry);
  if (history.length > MAX_APPRAISAL_HISTORY) history.length = MAX_APPRAISAL_HISTORY;
}

function loadScratchState() {
  if (!fs.existsSync(SCRATCH_STATE_FILE)) {
    return {
      jackpotPool: 0,
      plays: 0,
      wins: 0,
      losses: 0,
      updatedAt: Date.now()
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(SCRATCH_STATE_FILE, 'utf8'));
    return {
      jackpotPool: Math.max(0, Number(parsed?.jackpotPool || 0)),
      plays: Math.max(0, Number(parsed?.plays || 0)),
      wins: Math.max(0, Number(parsed?.wins || 0)),
      losses: Math.max(0, Number(parsed?.losses || 0)),
      updatedAt: Number(parsed?.updatedAt || Date.now())
    };
  } catch {
    return {
      jackpotPool: 0,
      plays: 0,
      wins: 0,
      losses: 0,
      updatedAt: Date.now()
    };
  }
}

function saveScratchState(state) {
  const dir = path.dirname(SCRATCH_STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const safe = {
    jackpotPool: Math.max(0, Number(state?.jackpotPool || 0)),
    plays: Math.max(0, Number(state?.plays || 0)),
    wins: Math.max(0, Number(state?.wins || 0)),
    losses: Math.max(0, Number(state?.losses || 0)),
    updatedAt: Date.now()
  };
  fs.writeFileSync(SCRATCH_STATE_FILE, JSON.stringify(safe, null, 2));
  return safe;
}

function playScratchLottery(player, options = {}) {
  ensurePlayerEconomy(player);
  const state = loadScratchState();
  const currentGold = Number(player?.stats?.財富 || 0);
  const marketType = String(options?.marketType || '').trim().toLowerCase() === 'digital' ? 'digital' : 'renaiss';
  const forceLose = marketType === 'digital' || options?.forceLose === true;

  if (currentGold < SCRATCH_COST) {
    return {
      success: false,
      type: 'scratch_lottery',
      cost: SCRATCH_COST,
      reward: 0,
      win: false,
      jackpotPool: state.jackpotPool,
      message: `🎟️ 小賣部老闆搖頭：刮刮樂要 ${SCRATCH_COST} Rns 代幣，你目前只有 ${currentGold} Rns 代幣。`
    };
  }

  player.stats.財富 = currentGold - SCRATCH_COST;
  state.plays += 1;

  const win = !forceLose && Math.random() < SCRATCH_WIN_RATE;
  let reward = 0;
  if (win) {
    reward = SCRATCH_WIN_REWARD;
    player.stats.財富 += reward;
    state.wins += 1;
  } else {
    state.losses += 1;
    state.jackpotPool += SCRATCH_COST;
  }

  const saved = saveScratchState(state);
  const net = reward - SCRATCH_COST;
  return {
    success: true,
    type: 'scratch_lottery',
    marketType,
    cost: SCRATCH_COST,
    reward,
    net,
    win,
    jackpotPool: saved.jackpotPool,
    message: win
      ? `🎟️ 你刮中了！本次投入 ${SCRATCH_COST} Rns 代幣，回收 ${reward} Rns 代幣（淨 +${net}）。`
      : (marketType === 'digital'
        ? `🎟️ 你在神秘鑑價站買的刮刮樂沒有中獎，本次投入 ${SCRATCH_COST} Rns 代幣已投入獎池。`
        : `🎟️ 未中獎。本次投入 ${SCRATCH_COST} Rns 代幣已投入獎池。`)
  };
}

function randInt(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function pickOne(arr, fallback = '') {
  if (!Array.isArray(arr) || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
}

function requestMiniMax(body, apiKey, timeoutMs = AI_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.minimax.io',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`MiniMax HTTP ${res.statusCode}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const statusCode = Number(parsed?.base_resp?.status_code ?? 0);
          if (!Number.isNaN(statusCode) && statusCode !== 0) {
            reject(new Error(parsed?.base_resp?.status_msg || `MiniMax status_code=${statusCode}`));
            return;
          }
          const content = parsed?.choices?.[0]?.message?.content;
          const text = typeof content === 'string'
            ? content.trim()
            : Array.isArray(content)
              ? content.map(item => (typeof item === 'string' ? item : item?.text || item?.content || '')).join('\n').trim()
              : String(content || '').trim();
          if (!text) {
            reject(new Error('MiniMax empty content'));
            return;
          }
          resolve(text);
        } catch (e) {
          reject(new Error(`MiniMax parse failed: ${e?.message || e}`));
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`MiniMax timeout ${timeoutMs}ms`)));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function buildFallbackAppraiserPitch(options = {}) {
  const marketType = options.marketType === 'digital' ? 'digital' : 'renaiss';
  const soldCount = Number(options.soldCount || 0);
  const total = Number(options.total || 0);
  const avgRatePct = Math.max(1, Math.round(Number(options.avgRate || 1) * 100));
  const digitalMasked = Boolean(options.digitalMasked);
  const lang = String(options.playerLang || 'zh-TW');
  if (lang === 'en') {
    if (soldCount <= 0) return 'No sellable items right now. Come back after collecting more materials.';
    if (marketType === 'digital') {
      return digitalMasked
        ? `You moved ${soldCount} items for ${total} Rns. Quick lane complete, but compare a second quote before your next sale.`
        : `I can close ${soldCount} items at ${total} Rns now. It looks efficient, but this quote favors the desk.`;
    }
    return `Appraised ${soldCount} items at ${total} Rns (about ${avgRatePct}% of baseline).`;
  }
  if (lang === 'zh-CN') {
    if (soldCount <= 0) return '你现在没有可出售物品，整理背包后再来。';
    if (marketType === 'digital') {
      return digitalMasked
        ? `这批 ${soldCount} 件我先按 ${total} Rns 代币帮你快速成交；想更稳，下一笔再去另一家比价。`
        : `这批 ${soldCount} 件我给你 ${total} Rns 代币，成交很快；不过你也知道，这种报价会偏向柜台。`;
    }
    return `这批 ${soldCount} 件估值 ${total} Rns 代币，约为基准价的 ${avgRatePct}%。`;
  }
  if (soldCount <= 0) return '你現在沒有可出售物品，整理背包後再來。';
  if (marketType === 'digital') {
    return digitalMasked
      ? `這批 ${soldCount} 件我先按 ${total} Rns 代幣幫你快速成交；想更穩，下一筆再去別家比價。`
      : `這批 ${soldCount} 件我給你 ${total} Rns 代幣，成交很快；不過你也知道，這種報價會偏向櫃台。`;
  }
  return `這批 ${soldCount} 件估值 ${total} Rns 代幣，約為基準價的 ${avgRatePct}%。`;
}

async function generateAppraiserPitch(options = {}) {
  const fallbackPitch = buildFallbackAppraiserPitch(options);
  const apiKey = String(process.env.MINIMAX_API_KEY || '').trim();
  if (!apiKey) {
    return fallbackPitch;
  }
  const marketType = options.marketType === 'digital' ? 'digital' : 'renaiss';
  const appraiser = APPRAISERS[marketType] || APPRAISERS.renaiss;
  const playerName = String(options.playerName || '旅人');
  const location = String(options.location || '未知地點');
  const soldCount = Number(options.soldCount || 0);
  const total = Number(options.total || 0);
  const avgRate = Number(options.avgRate || 1);
  const historyRecall = String(options.historyRecall || '');
  const riskScore = Number(options.digitalRiskScore || 0);
  const digitalMasked = Boolean(options.digitalMasked);
  const lang = String(options.playerLang || 'zh-TW');
  const languageRule = lang === 'en'
    ? 'Please output in English.'
    : lang === 'zh-CN'
      ? '请使用简体中文输出。'
      : '請使用繁體中文輸出。';
  const marketLens = marketType === 'digital'
    ? (
      digitalMasked
        ? `市場屬性：新手友善估值窗口（外在親切、快速成交）\n市場異常指標：${riskScore}/100`
        : `市場屬性：反派賣場（偏向低估玩家貨物）\nDigital 風險值：${riskScore}/100`
    )
    : '市場屬性：Renaiss 商城（偏向公道估值）';

  const prompt = `你要扮演遊戲中的鑑價 NPC 並產生一段即時台詞（僅一段，不要條列）。

【NPC】
名字：${appraiser.npcName}
人格：${appraiser.personality}
說話規範：${appraiser.styleGuide}

【玩家與交易】
玩家：${playerName}
地點：${location}
本次件數：${soldCount}
本次結算：${total} Rns 代幣
平均估值率：約 ${Math.round(avgRate * 100)}%
上次互動摘要：${historyRecall || '無'}
${marketLens}

【輸出要求】
1. 40~90字。
2. 必須像真人談判，不要模板腔。
3. ${marketType === 'digital'
    ? (digitalMasked
      ? 'Digital 版本在新手期必須像熱心店員，先營造友善與照顧新手感。'
      : 'Digital 版本必須有「聽起來對玩家好、實際偏向鑑價員」的話術。')
    : '語氣要專業而透明。'}
4. 不要使用引號，不要加 NPC 名稱前綴。
5. ${languageRule}`;

  const body = JSON.stringify({
    model: MINIMAX_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.95,
    top_p: 0.9,
    max_tokens: 220
  });
  try {
    const raw = await requestMiniMax(body, apiKey, AI_TIMEOUT_MS);
    const cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .trim();
    if (cleaned.length < 12) return fallbackPitch;
    return cleaned.slice(0, 180);
  } catch (_) {
    return fallbackPitch;
  }
}

function buildRarityWeights(luck = 50, difficulty = 1) {
  const rates = { ...LOOT_BASELINE_RATES };
  const safeDifficulty = clamp(Number(difficulty || 1), 1, 6);
  const safeLuck = clamp(Number(luck || 50), 1, 100);

  // 難度越高，從普通轉移到稀有/史詩，基準仍是 D1=80/15/5
  const difficultyShift = (safeDifficulty - 1) * LOOT_DIFFICULTY_SLOPE;
  rates.普通 -= difficultyShift;
  rates.稀有 += Math.round(difficultyShift * 0.65);
  rates.史詩 += difficultyShift - Math.round(difficultyShift * 0.65);

  // 幸運值僅影響稀有度分佈，不影響是否掉落
  const luckShift = clamp((safeLuck - 50) / 2.5, -10, 10);
  rates.普通 -= luckShift * 0.8;
  rates.稀有 += luckShift * 0.5;
  rates.史詩 += luckShift * 0.3;

  rates.普通 = Math.max(20, rates.普通);
  rates.稀有 = Math.max(5, rates.稀有);
  rates.史詩 = Math.max(2, rates.史詩);

  const total = rates.普通 + rates.稀有 + rates.史詩;
  if (total <= 0) return { 普通: 80, 稀有: 15, 史詩: 5 };
  return {
    普通: (rates.普通 / total) * 100,
    稀有: (rates.稀有 / total) * 100,
    史詩: (rates.史詩 / total) * 100
  };
}

function rollRarity(luck = 50, difficulty = 1) {
  const weights = buildRarityWeights(luck, difficulty);
  const bag = LOOT_RARITY_TIERS.map((r) => ({
    ...r,
    weight: Number(weights[r.key] || 0)
  }));
  const total = bag.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * Math.max(1, total);
  for (const item of bag) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return bag[0];
}

function getLootValueRange(rarityKey = '普通') {
  return LOOT_VALUE_RANGES[rarityKey] || LOOT_VALUE_RANGES.普通;
}

function rollValueByRarity(rarityKey = '普通') {
  const range = getLootValueRange(rarityKey);
  return randInt(range.min, range.max);
}

function parseJsonFromText(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonText = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function sanitizeLootName(name = '', fallback = '未知素材') {
  const cleaned = String(name || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[「」"']/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 18);
  return cleaned || fallback;
}

function sanitizeLootDesc(desc = '', fallback = '') {
  const cleaned = String(desc || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return cleaned || fallback;
}

function buildFallbackLootFlavor(meta = {}) {
  const rarity = String(meta.rarity || '普通');
  const enemyName = String(meta.enemyName || '敵人').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '') || '敵人';
  const location = String(meta.location || '未知地點');
  const category = String(meta.category || '素材');
  const value = rollValueByRarity(rarity);

  if (meta.sourceType === 'combat') {
    return {
      name: `${pickOne(TROPHY_PREFIX, '碎影')}${enemyName}${pickOne(['徽章', '碎片', '核心', '殘晶'], '碎片')}`,
      desc: `來自 ${enemyName} 的${rarity}戰鬥證物。`,
      value
    };
  }
  if (meta.sourceType === 'forage') {
    return {
      name: `${pickOne(RARE_PLANTS, '野生草藥')}${pickOne(['葉', '莖', '萃露', '花粉'], '萃露')}`,
      desc: `${location} 採集取得的${rarity}${category}。`,
      value
    };
  }
  if (meta.sourceType === 'hunt') {
    const animalName = String(meta.animalName || '獵物');
    return {
      name: `${animalName}${pickOne(['皮毛', '骨片', '腺囊', '紋刺'], '素材')}`,
      desc: `${location} 狩獵取得的${rarity}${category}。`,
      value
    };
  }
  return {
    name: `${pickOne(RARE_ORES, '古礦石')}${pickOne(['原礦', '晶核', '紋印', '殘片'], '原礦')}`,
    desc: `${location} 探索發現的${rarity}${category}。`,
    value
  };
}

async function generateLootFlavorWithAI(meta = {}) {
  const fallback = buildFallbackLootFlavor(meta);
  const apiKey = String(process.env.MINIMAX_API_KEY || '').trim();
  if (!apiKey) return fallback;

  const rarity = String(meta.rarity || '普通');
  const valueRange = getLootValueRange(rarity);
  const lang = String(meta.lang || 'zh-TW');
  const languageRule = lang === 'en'
    ? 'Output in English.'
    : lang === 'zh-CN'
      ? '请使用简体中文输出。'
      : '請使用繁體中文輸出。';
  const sourceType = String(meta.sourceType || 'combat');
  const category = String(meta.category || '素材');
  const location = String(meta.location || '未知地點');
  const enemyName = String(meta.enemyName || '');
  const animalName = String(meta.animalName || '');
  const sourceHint = sourceType === 'combat'
    ? `戰鬥來源：${enemyName || '敵人'}`
    : sourceType === 'hunt'
      ? `狩獵來源：${animalName || '獵物'}`
      : sourceType === 'forage'
        ? '採集來源：自然資源'
        : '探索來源：遺跡/礦脈';

  const prompt = `你是遊戲掉落命名助手，請回傳 JSON 物件，不要其他文字。
欄位：
- name: 掉落物名稱（2~12字，不要空格、不要引號）
- desc: 一句描述（12~40字）
- value: 整數價格

條件：
- 類型：${category}
- 稀有度：${rarity}
- 地點：${location}
- ${sourceHint}
- 價格必須介於 ${valueRange.min} 到 ${valueRange.max}
- 名稱不要和「${fallback.name}」完全相同
- ${languageRule}`;

  const body = JSON.stringify({
    model: MINIMAX_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 1.0,
    top_p: 0.95,
    max_tokens: 220
  });

  try {
    const raw = await requestMiniMax(body, apiKey, LOOT_AI_TIMEOUT_MS);
    const parsed = parseJsonFromText(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const safeName = sanitizeLootName(parsed.name, fallback.name);
    const safeDesc = sanitizeLootDesc(parsed.desc, fallback.desc);
    const safeValue = clamp(
      Number(parsed.value || fallback.value),
      valueRange.min,
      valueRange.max
    );
    return {
      name: safeName,
      desc: safeDesc,
      value: Math.round(safeValue)
    };
  } catch {
    return fallback;
  }
}

function makeTradeGood(name, category, rarity, value, origin, desc = '') {
  return {
    id: `good_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    category,
    rarity,
    value: Math.max(1, Math.floor(value)),
    origin: origin || '未知來源',
    desc: desc || '',
    createdAt: Date.now()
  };
}

function addTradeGood(player, good) {
  ensurePlayerEconomy(player);
  if (!good || typeof good !== 'object') return null;
  player.tradeGoods.unshift(good);
  if (player.tradeGoods.length > 160) player.tradeGoods.length = 160;
  return good;
}

async function createCombatLoot(enemy, location = '', luck = 50, options = {}) {
  const enemyName = String(enemy?.name || '敵人').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '') || '敵人';
  const difficulty = getLocationDifficulty(location);
  const rarity = rollRarity(luck, difficulty);
  const type = pickOne(['戰利品', '怪物素材', '殘件'], '戰利品');
  const flavored = await generateLootFlavorWithAI({
    sourceType: 'combat',
    rarity: rarity.key,
    category: type,
    location,
    enemyName,
    lang: options.lang || 'zh-TW'
  });
  return makeTradeGood(
    flavored.name,
    type,
    rarity.key,
    flavored.value,
    `${location} 戰鬥掉落`,
    flavored.desc || `從 ${enemyName} 身上取得的戰鬥證物。`
  );
}

async function createForageLoot(location = '', luck = 50, options = {}) {
  const difficulty = getLocationDifficulty(location);
  const rarity = rollRarity(luck, Math.max(2, difficulty));
  const flavored = await generateLootFlavorWithAI({
    sourceType: 'forage',
    rarity: rarity.key,
    category: '草藥',
    location,
    lang: options.lang || 'zh-TW'
  });
  return makeTradeGood(
    flavored.name,
    '草藥',
    rarity.key,
    flavored.value,
    `${location} 採集`,
    flavored.desc || '可作煉藥或交易素材。'
  );
}

async function createHuntLoot(animalName = '獵物', location = '', luck = 50, options = {}) {
  const difficulty = getLocationDifficulty(location);
  const rarity = rollRarity(luck, difficulty);
  const flavored = await generateLootFlavorWithAI({
    sourceType: 'hunt',
    rarity: rarity.key,
    category: '獵物',
    location,
    animalName,
    lang: options.lang || 'zh-TW'
  });
  return makeTradeGood(
    flavored.name,
    '獵物',
    rarity.key,
    flavored.value,
    `${location} 狩獵`,
    flavored.desc || '新鮮獵獲，適合賣給行商或廚商。'
  );
}

async function createTreasureLoot(location = '', luck = 50, options = {}) {
  const difficulty = Math.max(3, getLocationDifficulty(location));
  const rarity = rollRarity(luck + 10, difficulty + 1);
  const flavored = await generateLootFlavorWithAI({
    sourceType: 'treasure',
    rarity: rarity.key,
    category: '寶藏',
    location,
    lang: options.lang || 'zh-TW'
  });
  return makeTradeGood(
    flavored.name,
    '寶藏',
    rarity.key,
    flavored.value,
    `${location} 探索`,
    flavored.desc || '高價值稀有素材。'
  );
}

function estimateLooseItemValue(name = '') {
  const text = String(name || '');
  let value = 18;
  if (/靈芝|人參|雪蓮|仙草|稀有|秘笈|核心|晶|寶|礦/.test(text)) value += 65;
  if (/肉|魚|野兔|野雞|野豬|鹿/.test(text)) value += 18;
  if (/毒|斷腸|曼陀羅/.test(text)) value += 12;
  if (/乾糧|水囊/.test(text)) value = 5;
  return value;
}

function buildSellables(player, worldDay = 1) {
  ensurePlayerEconomy(player);
  const sellables = [];

  for (const good of player.tradeGoods) {
    sellables.push({
      type: 'tradeGood',
      name: good.name,
      rarity: good.rarity || '普通',
      value: Math.max(1, Number(good.value || 1))
    });
  }

  for (const herb of (player.herbs || [])) {
    sellables.push({
      type: 'herb',
      name: herb,
      rarity: /稀有|靈|仙|神/.test(String(herb || '')) ? '稀有' : '普通',
      value: estimateLooseItemValue(herb)
    });
  }

  for (const item of (player.inventory || [])) {
    if (PROTECTED_ITEMS.has(item)) continue;
    sellables.push({
      type: 'inventory',
      name: item,
      rarity: /秘|寶|稀有|傳說/.test(String(item || '')) ? '精良' : '普通',
      value: estimateLooseItemValue(item)
    });
  }

  if (Number(worldDay || 1) > Number(player.marketState.lastSkillLicenseDay || 0)) {
    const skillEntries = Object.entries(player.skills || {})
      .map(([name, meta]) => ({
        name,
        proficiency: Number(meta?.proficiency || 0),
        realm: String(meta?.realm || '入門')
      }))
      .sort((a, b) => b.proficiency - a.proficiency)
      .slice(0, 2);
    for (const skill of skillEntries) {
      const base = 60 + Math.floor(skill.proficiency / 25);
      const realmBonus = /頂尖|傳說/.test(skill.realm) ? 70 : /大師/.test(skill.realm) ? 35 : 10;
      sellables.push({
        type: 'skill_license',
        name: `${skill.name}授權卷`,
        rarity: /頂尖|傳說/.test(skill.realm) ? '史詩' : /大師/.test(skill.realm) ? '稀有' : '精良',
        value: base + realmBonus
      });
    }
  }

  return sellables;
}

function appraiseValue(base, marketType) {
  const appraiser = APPRAISERS[marketType] || APPRAISERS.renaiss;
  const rate = appraiser.minRate + Math.random() * (appraiser.maxRate - appraiser.minRate);
  return Math.max(1, Math.floor(base * rate));
}

async function sellPlayerAtMarket(player, marketType = 'renaiss', options = {}) {
  ensurePlayerEconomy(player);
  const digitalMasked = marketType === 'digital' && isDigitalMaskPhase(player);
  const baseAppraiser = APPRAISERS[marketType] || APPRAISERS.renaiss;
  const appraiser = marketType === 'digital' && digitalMasked
    ? {
      ...baseAppraiser,
      npcName: '摩爾・民生估值員',
      personality: '熱心親切、強調效率與照顧新手',
      styleGuide: '語氣友善，主打先幫你省時間與建立信任'
    }
    : baseAppraiser;
  const worldDay = Number(options.worldDay || 1);
  const sellables = buildSellables(player, worldDay);

  if (sellables.length === 0) {
    const emptyPitch = await generateAppraiserPitch({
      marketType,
      playerName: player.name || '旅人',
      location: player.location || '',
      soldCount: 0,
      total: 0,
      avgRate: 1,
      historyRecall: formatHistoryRecall(player, marketType),
      digitalRiskScore: Number(player.marketState.digitalRiskScore || 0),
      digitalMasked,
      playerLang: player.language || 'zh-TW'
    });
    return {
      totalGold: 0,
      soldCount: 0,
      npcName: appraiser.npcName,
      digitalMasked,
      message: `🏪 ${appraiser.npcName}：${emptyPitch}`
    };
  }

  const lines = [];
  let total = 0;
  let fairTotal = 0;
  for (const item of sellables) {
    fairTotal += Math.max(1, Number(item.value || 1));
    const quote = appraiseValue(item.value, marketType);
    total += quote;
    if (lines.length < 6) {
      lines.push(`• ${item.name}（${item.rarity}）→ ${quote} Rns 代幣`);
    }
  }

  player.tradeGoods = [];
  player.herbs = [];
  player.inventory = (player.inventory || []).filter(item => PROTECTED_ITEMS.has(item));
  player.marketState.lastSkillLicenseDay = worldDay;
  if (marketType === 'digital') player.marketState.digitalVisits = Number(player.marketState.digitalVisits || 0) + 1;
  if (marketType === 'renaiss') player.marketState.renaissVisits = Number(player.marketState.renaissVisits || 0) + 1;
  player.stats.財富 = Number(player.stats.財富 || 0) + total;

  const avgRate = Math.max(0.01, total / Math.max(1, fairTotal));
  const historyRecall = formatHistoryRecall(player, marketType);
  let digitalRiskDelta = 0;
  if (marketType === 'digital') {
    digitalRiskDelta = computeDigitalRiskDelta(fairTotal, total, sellables.length);
    player.marketState.digitalRiskScore = clamp(
      Number(player.marketState.digitalRiskScore || 0) + digitalRiskDelta,
      0,
      100
    );
  } else {
    // 在公道市場交易會讓玩家逐步校準價格認知，緩慢降低詐價風險指標
    player.marketState.digitalRiskScore = clamp(
      Number(player.marketState.digitalRiskScore || 0) - randInt(3, 8),
      0,
      100
    );
  }

  appendAppraisalHistory(player, {
    worldDay,
    marketType,
    soldCount: sellables.length,
    fairTotal,
    quotedTotal: total,
    avgRate,
    riskScoreAfter: Number(player.marketState.digitalRiskScore || 0),
    timestamp: Date.now()
  });

  const pitch = await generateAppraiserPitch({
    marketType,
    playerName: player.name || '旅人',
    location: player.location || '',
    soldCount: sellables.length,
    total,
    avgRate,
    historyRecall,
    digitalRiskScore: Number(player.marketState.digitalRiskScore || 0),
    digitalMasked,
    playerLang: player.language || 'zh-TW'
  });
  const biasNote = marketType === 'digital'
    ? (digitalMasked
      ? '（報價看似照顧新手，細節仍待你自行比對。）'
      : '（你隱約覺得這價不太對，但他說得很有道理。）')
    : '（報價透明，含稀有度與來源加權。）';
  const digitalRiskScore = Number(player.marketState.digitalRiskScore || 0);
  const digitalRiskHint = buildDigitalRiskHint(digitalRiskScore);
  const riskLine = marketType === 'digital'
    ? (digitalMasked
      ? `\n🧠 市場異常指標：${digitalRiskScore}/100（本次 +${digitalRiskDelta}）\n📌 ${digitalRiskHint}`
      : `\n⚠️ Digital 詐價風險提示累積值：${digitalRiskScore}/100（本次 +${digitalRiskDelta}）\n🧠 ${digitalRiskHint}`)
    : `\n🧠 Digital 詐價風險提示累積值：${digitalRiskScore}/100（在公道市場交易後已微幅校準）`;

  return {
    totalGold: total,
    soldCount: sellables.length,
    npcName: appraiser.npcName,
    marketType,
    digitalMasked,
    historyRecall,
    avgRate,
    digitalRiskScore,
    digitalRiskDelta,
    riskHint: digitalRiskHint,
    lines,
    message:
      `🏪 ${appraiser.npcName}：${pitch}\n` +
      `💬 ${historyRecall}\n` +
      `${lines.join('\n')}\n` +
      `\n本次結算：+${total} Rns 代幣（共 ${sellables.length} 件）\n${biasNote}`
      + riskLine
  };
}

module.exports = {
  ensurePlayerEconomy,
  ensurePlayerFinanceLedger,
  appendFinanceLedger,
  consumeFinanceNotices,
  getMarketListingsView,
  createSellListing,
  createBuyListing,
  buyFromSellListing,
  fulfillBuyListing,
  cancelMyListing,
  addTradeGood,
  createCombatLoot,
  createForageLoot,
  createHuntLoot,
  createTreasureLoot,
  sellPlayerAtMarket,
  playScratchLottery
};
