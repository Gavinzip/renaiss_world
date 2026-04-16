/**
 * 💳 錢包系統 v3
 * - 綁定 Discord user ID + BSC 錢包地址
 * - 從 Renaiss API 讀取卡牌 FMV
 * - 從 BSCScan 讀取開包數量、總花費
 */

const path = require('path');
const { loadProjectEnv } = require('../../core/load-env');

loadProjectEnv();

const CORE = require('../../core/game-core');
const { LEGACY_DATA_DIR } = require('../../core/storage-paths');
const { createWalletSettingsRepository } = require('../data/wallet-settings-repository');

// ============== Renaiss API 配置 ==============
const RENAISS_CONFIG = {
  collectibleListUrl: 'https://www.renaiss.xyz/api/trpc/collectible.list',
  collectibleByTokenUrl: 'https://www.renaiss.xyz/api/trpc/collectible.getCollectibleByTokenId',
};

// ============== BSCScan API 配置 ==============
const BSC_CONFIG = {
  apiUrl: 'https://api.etherscan.io/v2/api',
  chainId: 56,
  apiKey: process.env.BSCSCAN_API_KEY || '',
  
  // 合約地址（寫死，與 TCG Pro onchain_metrics 保持一致）
  usdtContract: '0x55d398326f99059ff775485246999027b3197955',
  packContracts: [
    '0xaab5f5fa75437a6e9e7004c12c9c56cda4b4885a',
    '0x94e7732b0b2e7c51ffd0d56580067d9c2e2b7910',
    '0xb2891022648c5fad3721c42c05d8d283d4d53080'
  ],
  marketplaceContract: '0xae3e7268ef5a062946216a44f58a8f685ffd11d0',
};

// ============== 用戶錢包設定檔路徑 ==============
const WALLET_DATA_DIR = LEGACY_DATA_DIR;
const WALLET_DATA_FILE = path.join(WALLET_DATA_DIR, 'user_wallets.json');
const WALLET_SETTINGS_REPO = createWalletSettingsRepository({
  filePath: WALLET_DATA_FILE
});

// ============== 讀取/寫入錢包設定 ==============
function loadWalletSettings() {
  return WALLET_SETTINGS_REPO.getAll();
}

function saveWalletSettings(settings) {
  WALLET_SETTINGS_REPO.replaceAll(settings);
  return true;
}

function replaceWalletSettings(settings) {
  return WALLET_SETTINGS_REPO.replaceAll(settings);
}

function deleteWalletBinding(discordUserId) {
  return WALLET_SETTINGS_REPO.deleteWallet(discordUserId);
}

async function flushWalletSettings() {
  await WALLET_SETTINGS_REPO.flush();
}

// ============== 綁定錢包地址 ==============
function bindWallet(discordUserId, walletAddress) {
  const normalizedAddress = walletAddress.toLowerCase().trim();
  
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
    return { success: false, reason: '無效的 BSC 錢包地址格式！' };
  }
  
  const existed = WALLET_SETTINGS_REPO.getWalletAddress(discordUserId);
  if (existed) {
    return { success: false, reason: `你已綁定錢包：${existed}，目前不允許重綁。` };
  }

  WALLET_SETTINGS_REPO.setWallet(discordUserId, {
    walletAddress: normalizedAddress,
    boundAt: new Date().toISOString(),
    pendingRNS: 0,
    walletRnsClaimed: 0,
    walletRnsLastSyncedAt: null,
    maxPetsUnlocked: 1,
    walletRnsCreditedTotal: 0,
    walletRnsLastCredited: 0,
    walletRnsLastCreditedAt: null
  });

  return { success: true, address: normalizedAddress };
}

// ============== 取得用戶錢包地址 ==============
function getWalletAddress(discordUserId) {
  return WALLET_SETTINGS_REPO.getWalletAddress(discordUserId);
}

function extractCollectibleRows(result) {
  if (Array.isArray(result?.collection)) return result.collection;
  if (Array.isArray(result?.collectibles)) return result.collectibles;
  return [];
}

function parseFmvUSD(card) {
  const fmvCentRaw = card?.fmvPriceInUSD ?? card?.fmvPriceInUsd;
  const fmvCent = Number(fmvCentRaw);
  if (Number.isFinite(fmvCent) && fmvCent >= 0) {
    return fmvCent / 100;
  }

  const legacyRaw = card?.fmv ?? card?.value ?? card?.price ?? 0;
  const legacyValue = Number(legacyRaw);
  return Number.isFinite(legacyValue) ? legacyValue : 0;
}

function normalizeWalletAddress(walletAddress) {
  return String(walletAddress || '').toLowerCase().trim();
}

function dedupeCollectibles(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const tokenId = String(row.tokenId || '').trim();
    const id = String(row.id || '').trim();
    const ownerAddress = normalizeWalletAddress(row.ownerAddress);
    const key = tokenId || id || `${ownerAddress}:${map.size}`;
    if (!map.has(key)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
}

async function trpcCollectibleList(queryPayload) {
  const maxRetries = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const inputJson = JSON.stringify({ 0: { json: queryPayload } });
      const url = `${RENAISS_CONFIG.collectibleListUrl}?batch=1&input=${encodeURIComponent(inputJson)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`collectible.list HTTP ${response.status}`);
      }

      const data = await response.json();
      const root = Array.isArray(data) ? data[0] : data;
      if (!root) {
        throw new Error('collectible.list empty response');
      }
      if (root.error) {
        const errMsg = root.error?.json?.message || root.error?.message || 'unknown error';
        throw new Error(`collectible.list error: ${errMsg}`);
      }

      const result = root?.result?.data?.json;
      if (!result || typeof result !== 'object') {
        throw new Error('collectible.list missing result json');
      }
      return result;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 300));
      }
    }
  }

  throw lastErr || new Error('collectible.list unknown failure');
}

async function resolveUserFromWallet(walletAddress) {
  const wallet = normalizeWalletAddress(walletAddress);
  if (!wallet) return { userId: null, matchedRows: [] };

  const limit = Math.max(10, Math.min(100, Number(process.env.WALLET_RESOLVE_PAGE_LIMIT || 100)));
  const maxPagesByAddress = Math.max(1, Math.min(80, Number(process.env.WALLET_RESOLVE_ADDRESS_MAX_PAGES || 8)));
  const maxOffsetGlobal = Math.max(limit, Number(process.env.WALLET_RESOLVE_GLOBAL_MAX_OFFSET || 5000));
  const matchedRows = [];

  const scanRowsForOwner = (rows = []) => {
    for (const row of rows) {
      const ownerAddress = normalizeWalletAddress(row?.ownerAddress);
      if (ownerAddress !== wallet) continue;
      matchedRows.push(row);
      const userId = row?.owner?.id;
      if (typeof userId === 'string' && userId.trim()) {
        return userId.trim();
      }
    }
    return null;
  };

  // 快路徑：先嘗試 address 查詢（部分時段 API 可直接命中）。
  for (let page = 0, offset = 0; page < maxPagesByAddress; page += 1) {
    const result = await trpcCollectibleList({
      address: wallet,
      filter: 'all',
      isHolding: true,
      limit,
      offset,
      sortBy: 'mintDate',
      sortOrder: 'desc',
      includeOpenCardPackRecords: true
    });
    const rows = extractCollectibleRows(result);
    const found = scanRowsForOwner(rows);
    if (found) return { userId: found, matchedRows };
    const pagination = result?.pagination || {};
    if (!pagination.hasMore) break;
    const step = Number(pagination.limit) || limit;
    if (step <= 0) break;
    offset += step;
  }

  // 慢路徑：address 查詢偶發回傳非持倉專屬清單時，掃描全局分頁找 ownerAddress。
  for (let offset = 0; offset <= maxOffsetGlobal; offset += limit) {
    const result = await trpcCollectibleList({
      limit,
      offset,
      sortBy: 'mintDate',
      sortOrder: 'desc',
      includeOpenCardPackRecords: true
    });
    const rows = extractCollectibleRows(result);
    const found = scanRowsForOwner(rows);
    if (found) return { userId: found, matchedRows };
    const pagination = result?.pagination || {};
    if (!pagination.hasMore) break;
  }

  return { userId: null, matchedRows };
}

async function fetchUserCollection(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return [];

  const limit = 100;
  const firstResult = await trpcCollectibleList({
    limit,
    offset: 0,
    sortBy: 'mintDate',
    sortOrder: 'desc',
    userId: uid,
    includeOpenCardPackRecords: true
  });

  const firstRows = extractCollectibleRows(firstResult);
  const pagination = firstResult?.pagination || {};
  if (!pagination.hasMore) {
    return dedupeCollectibles(firstRows);
  }

  const total = Number(pagination.total) || firstRows.length;
  const step = Number(pagination.limit) || limit;
  const allRows = [...firstRows];
  const maxPages = 100;

  for (let offset = step, i = 0; offset < total && i < maxPages; offset += step, i++) {
    const result = await trpcCollectibleList({
      limit: step,
      offset,
      sortBy: 'mintDate',
      sortOrder: 'desc',
      userId: uid,
      includeOpenCardPackRecords: true
    });
    const rows = extractCollectibleRows(result);
    allRows.push(...rows);
    const hasMore = Boolean(result?.pagination?.hasMore);
    if (!hasMore && rows.length === 0) break;
  }

  return dedupeCollectibles(allRows);
}

// ============== 從 Renaiss API 讀取卡片 FMV ==============
async function fetchCardFMV(walletAddress) {
  try {
    const wallet = normalizeWalletAddress(walletAddress);
    if (!wallet) {
      return { totalFMV: 0, cardCount: 0 };
    }

    let userId = null;
    let matchedRows = [];
    try {
      const resolved = await resolveUserFromWallet(wallet);
      userId = resolved.userId;
      matchedRows = resolved.matchedRows;
    } catch (e) {
      console.error('[錢包] 解析 userId 失敗，改用 fallback:', e.message);
    }

    let collectibles = [];
    if (userId) {
      try {
        collectibles = await fetchUserCollection(userId);
      } catch (e) {
        console.error('[錢包] userId 收藏分頁讀取失敗，改用 fallback:', e.message);
      }
    }

    // fallback: 如果 userId 取不到，至少保留掃描過程中找到的同地址卡片
    if (collectibles.length === 0 && matchedRows.length > 0) {
      collectibles = dedupeCollectibles(matchedRows);
    }

    // fallback: 補一輪 address 查詢，防止前面流程因短暫 API 異常而回傳空資料
    if (collectibles.length === 0) {
      const fallbackResult = await trpcCollectibleList({
        address: wallet,
        filter: 'all',
        isHolding: true,
        limit: 100,
        offset: 0,
        sortBy: 'mintDate',
        sortOrder: 'desc',
        includeOpenCardPackRecords: true
      });
      const fallbackRows = extractCollectibleRows(fallbackResult).filter(
        card => normalizeWalletAddress(card?.ownerAddress) === wallet
      );
      collectibles = dedupeCollectibles(fallbackRows);
    }

    let totalFMV = 0;
    for (const card of collectibles) {
      totalFMV += parseFmvUSD(card);
    }

    return {
      totalFMV: Number(totalFMV.toFixed(2)),
      cardCount: collectibles.length
    };
  } catch (e) {
    console.error('[錢包] 讀取 Renaiss FMV 失敗:', e.message);
    return { totalFMV: 0, cardCount: 0 };
  }
}

// ============== 從 BSCScan 讀取 USDT 交易歷史 ==============
function classifyUSDTTransfer(from, to, wallet, packSet, marketplace) {
  if (from === wallet && packSet.has(to)) return 'open_pack';
  if (packSet.has(from) && to === wallet) return 'buyback';
  if (from === wallet && to === marketplace) return 'mp_buy';
  if (from === marketplace && to === wallet) return 'mp_sell';
  return 'other';
}

async function fetchUSDTTransfers(walletAddress) {
  if (!BSC_CONFIG.apiKey) {
    throw new Error('BSCSCAN_API_KEY 未設定');
  }
  
  try {
    const wallet = normalizeWalletAddress(walletAddress);
    const offset = Math.max(1, Math.min(10000, Number(process.env.ONCHAIN_PAGE_SIZE || 10000)));
    const packSet = new Set(BSC_CONFIG.packContracts.map((x) => String(x || '').toLowerCase()));
    const marketplace = normalizeWalletAddress(BSC_CONFIG.marketplaceContract);

    let page = 1;
    const allRows = [];
    while (true) {
      const params = new URLSearchParams({
        chainid: String(BSC_CONFIG.chainId),
        module: 'account',
        action: 'tokentx',
        address: wallet,
        contractaddress: BSC_CONFIG.usdtContract,
        page: String(page),
        offset: String(offset),
        sort: 'asc',
        apikey: BSC_CONFIG.apiKey
      });

      const url = `${BSC_CONFIG.apiUrl}?${params}`;
      const response = await fetch(url);
      const data = await response.json();
      const status = String(data?.status ?? '').trim();
      const message = String(data?.message || '');
      const resultRaw = data?.result;
      const rows = Array.isArray(resultRaw) ? resultRaw : [];
      const noTransactions =
        /No transactions found/i.test(message) ||
        /No transactions found/i.test(String(resultRaw || ''));

      if (status === '0' && !noTransactions) {
        throw new Error(`BSCScan tokentx NOTOK: ${message || String(resultRaw || 'unknown error')}`);
      }

      if (rows.length === 0) {
        if (noTransactions) {
          break;
        }
        // 非預期格式：當成無資料，避免中斷主流程
        break;
      }

      allRows.push(...rows);
      if (rows.length < offset) break;
      page += 1;
    }

    // 計算開包 / 市場買入 / buyback / 市場賣出
    let packTxCount = 0;
    let packSpentUSDT = 0;
    let tradeSpentUSDT = 0;
    let tradeEarnedUSDT = 0;
    let buybackEarnedUSDT = 0;

    for (const tx of allRows) {
      const from = normalizeWalletAddress(tx?.from);
      const to = normalizeWalletAddress(tx?.to);
      const decimals = Number(tx?.tokenDecimal ?? 18);
      const raw = Number(tx?.value ?? 0);
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const divisor = 10 ** (Number.isFinite(decimals) && decimals > 0 ? decimals : 18);
      const amount = raw / divisor;
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const kind = classifyUSDTTransfer(from, to, wallet, packSet, marketplace);
      if (kind === 'open_pack') {
        packTxCount++;
        packSpentUSDT += amount;
      } else if (kind === 'mp_buy') {
        tradeSpentUSDT += amount;
      } else if (kind === 'buyback') {
        buybackEarnedUSDT += amount;
      } else if (kind === 'mp_sell') {
        tradeEarnedUSDT += amount;
      }
    }

    const totalSpentUSDT = packSpentUSDT + tradeSpentUSDT;
    const totalEarnedUSDT = buybackEarnedUSDT + tradeEarnedUSDT;
    const cashNetUSDT = totalEarnedUSDT - totalSpentUSDT;
    const tradeVolumeUSDT = tradeSpentUSDT + tradeEarnedUSDT;

    return {
      packTxCount,
      packSpentUSDT: Number(packSpentUSDT.toFixed(2)),
      tradeSpentUSDT: Number(tradeSpentUSDT.toFixed(2)),
      tradeEarnedUSDT: Number(tradeEarnedUSDT.toFixed(2)),
      buybackEarnedUSDT: Number(buybackEarnedUSDT.toFixed(2)),
      totalSpentUSDT: Number(totalSpentUSDT.toFixed(2)),
      totalEarnedUSDT: Number(totalEarnedUSDT.toFixed(2)),
      cashNetUSDT: Number(cashNetUSDT.toFixed(2)),
      tradeVolumeUSDT: Number(tradeVolumeUSDT.toFixed(2))
    };
  } catch (e) {
    console.error('[錢包] 讀取 USDT 交易失敗:', e.message);
    throw e;
  }
}

// ============== 計算玩家總資產 ==============
async function calculateTotalAssets(walletAddress) {
  // 並行讀取 FMV 和 鏈上數據
  const [fmvData, onchainData] = await Promise.all([
    fetchCardFMV(walletAddress),
    fetchUSDTTransfers(walletAddress)
  ]);
  
  return {
    // 卡片 FMV（用於決定寵物數量）
    cardFMV: fmvData.totalFMV,
    cardCount: fmvData.cardCount,
    
    // 開包數量（用於升級點數）
    packTxCount: onchainData.packTxCount,
    
    // 開包花費
    packSpentUSDT: onchainData.packSpentUSDT,
    // 市場買入花費
    tradeSpentUSDT: onchainData.tradeSpentUSDT,
    // 真正總花費（開包 + 市場買入，對齊 TCG Pro 海報第 3 欄）
    totalSpentUSDT: onchainData.totalSpentUSDT,
    
    // 計算後的 RNS：總花費（USDT）* 0.5
    initialRNS: Math.floor(onchainData.totalSpentUSDT * 0.5)
  };
}

// ============== 取得玩家錢包資產 ==============
async function getPlayerWalletAssets(discordUserId) {
  const walletAddress = getWalletAddress(discordUserId);
  
  if (!walletAddress) {
    return { success: false, reason: '尚未綁定錢包！', rns: 0 };
  }
  
  const assets = await calculateTotalAssets(walletAddress);
  const cached = WALLET_SETTINGS_REPO.getWallet(discordUserId) || {};

  const cachedCount = Math.max(0, Number(cached.cardCount || 0));
  const cachedFMV = Math.max(0, Number(cached.cardFMV || 0));
  const freshCount = Math.max(0, Number(assets.cardCount || 0));
  const freshFMV = Math.max(0, Number(assets.cardFMV || 0));
  const likelyTransientFmvMiss = freshCount <= 0 && freshFMV <= 0 && cachedCount > 0 && cachedFMV > 0;
  if (likelyTransientFmvMiss) {
    assets.cardCount = cachedCount;
    assets.cardFMV = cachedFMV;
  }
  
  return {
    success: true,
    walletAddress,
    assets,
    rns: assets.initialRNS
  };
}

// ============== 根據 FMV 計算可擁有寵物數 ==============
function getMaxPetsByFMV(cardFMV) {
  const fmv = Number(cardFMV || 0);
  if (fmv > 1000) return 3; // > 1000U → 3 隻
  if (fmv > 100) return 2;  // > 100U  → 2 隻
  return 1;                 // 其餘 → 1 隻
}

// ============== 取得玩家當前可擁有寵物數（含歷史最高解鎖，不回退） ==============
function getMaxPetsForUser(discordUserId) {
  const userData = WALLET_SETTINGS_REPO.getWallet(discordUserId) || {};
  const byFMV = getMaxPetsByFMV(userData.cardFMV || 0);
  const unlocked = Math.max(1, Math.floor(Number(userData.maxPetsUnlocked || 1)));
  return Math.max(byFMV, unlocked);
}

// ============== 根據 RNS 計算可擁有寵物數（向後兼容）==============
function getMaxPetsByRNS(rns) {
  // 如果有 FMV 記錄，用 FMV
  const settings = loadWalletSettings();
  for (const [userId, data] of Object.entries(settings)) {
    if (data.cardFMV !== undefined) {
      return getMaxPetsByFMV(data.cardFMV);
    }
  }
  // 否則用 RNS（舊方式）
  if (rns >= 500000) return 3;
  if (rns >= 100000) return 2;
  return 1;
}

// ============== 檢查是否已綁定錢包 ==============
function isWalletBound(discordUserId) {
  return getWalletAddress(discordUserId) !== null;
}

// ============== 取得暫時 RNS ==============
function getPendingRNS(discordUserId) {
  const walletData = WALLET_SETTINGS_REPO.getWallet(discordUserId) || {};
  return Math.max(0, Math.floor(Number(walletData.pendingRNS || 0)));
}

// ============== 更新暫時 RNS ==============
function updatePendingRNS(discordUserId, rns) {
  const walletData = WALLET_SETTINGS_REPO.getWallet(discordUserId);
  if (!walletData) return;
  WALLET_SETTINGS_REPO.updateWallet(discordUserId, (draft) => ({
    ...draft,
    pendingRNS: Math.max(0, Math.floor(Number(rns || 0)))
  }));
}

// ============== 同步錢包 RNS（只入帳新增差額） ==============
function applyWalletRnsDelta(discordUserId, latestRns, options = {}) {
  const userData = WALLET_SETTINGS_REPO.getWallet(discordUserId);
  if (!userData) {
    return { success: false, reason: '尚未綁定錢包！' };
  }

  const walletTotalRns = Math.max(0, Math.floor(Number(latestRns || 0)));
  const forceResetClaimedBaseline = Boolean(options?.forceResetClaimedBaseline);
  const pendingBefore = forceResetClaimedBaseline
    ? 0
    : Math.max(0, Math.floor(Number(userData.pendingRNS || 0)));

  const rawClaimed = Number(userData.walletRnsClaimed);
  const hasClaimed = Number.isFinite(rawClaimed) && rawClaimed >= 0;
  const assumeClaimedIfMissing = Boolean(options?.assumeClaimedIfMissing);
  const migrateAsClaimed = !hasClaimed && (assumeClaimedIfMissing || pendingBefore > 0);
  const claimedBeforeBase = hasClaimed
    ? Math.max(0, Math.floor(rawClaimed))
    : (migrateAsClaimed ? walletTotalRns : 0);
  const claimedBefore = forceResetClaimedBaseline ? 0 : claimedBeforeBase;

  // 已領基準只能前進，避免鏈上暫時低值/異常把基準回寫成更小值，造成重複領取。
  const claimedAfter = Math.max(claimedBefore, walletTotalRns);
  const delta = Math.max(0, claimedAfter - claimedBefore);
  const pendingAfter = pendingBefore + delta;

  WALLET_SETTINGS_REPO.updateWallet(discordUserId, (draft) => ({
    ...draft,
    walletRnsClaimed: claimedAfter,
    walletRnsLastSyncedAt: new Date().toISOString(),
    pendingRNS: pendingAfter
  }));

  return {
    success: true,
    resetApplied: forceResetClaimedBaseline,
    migrated: !hasClaimed,
    walletTotalRns,
    claimedBefore,
    claimedAfter,
    delta,
    pendingBefore,
    pendingAfter
  };
}

// ============== 更新錢包完整資料 ==============
function updateWalletData(discordUserId, data) {
  const userData = WALLET_SETTINGS_REPO.getWallet(discordUserId);
  if (!userData) return;
  const prevCount = Math.max(0, Number(userData.cardCount || 0));
  const prevFMV = Math.max(0, Number(userData.cardFMV || 0));
  const nextCountRaw = Math.max(0, Number(data.cardCount || 0));
  const nextFMVRaw = Math.max(0, Number(data.cardFMV || 0));
  const likelyTransientFmvMiss = nextCountRaw <= 0 && nextFMVRaw <= 0 && prevCount > 0 && prevFMV > 0;

  const safeCardCount = likelyTransientFmvMiss ? prevCount : nextCountRaw;
  const safeCardFMV = likelyTransientFmvMiss ? prevFMV : nextFMVRaw;
  const prevUnlocked = Math.max(1, Math.floor(Number(userData.maxPetsUnlocked || 1)));
  const unlockedByNow = getMaxPetsByFMV(safeCardFMV);

  WALLET_SETTINGS_REPO.updateWallet(discordUserId, (draft) => ({
    ...draft,
    cardFMV: safeCardFMV,
    cardCount: safeCardCount,
    packTxCount: data.packTxCount,
    packSpentUSDT: data.packSpentUSDT,
    tradeSpentUSDT: data.tradeSpentUSDT,
    totalSpentUSDT: data.totalSpentUSDT,
    maxPetsUnlocked: Math.max(prevUnlocked, unlockedByNow)
  }));
}

// ============== 記錄同步實際入帳 ==============
function recordWalletCredit(discordUserId, amount) {
  const userData = WALLET_SETTINGS_REPO.getWallet(discordUserId);
  if (!userData) {
    return { success: false, reason: '尚未綁定錢包！' };
  }
  const credited = Math.max(0, Math.floor(Number(amount || 0)));
  if (credited <= 0) {
    return {
      success: true,
      creditedNow: 0,
      creditedTotal: Math.max(0, Math.floor(Number(userData.walletRnsCreditedTotal || 0))),
      lastCredited: Math.max(0, Math.floor(Number(userData.walletRnsLastCredited || 0))),
      lastCreditedAt: userData.walletRnsLastCreditedAt || null
    };
  }
  const totalBefore = Math.max(0, Math.floor(Number(userData.walletRnsCreditedTotal || 0)));
  const lastCreditedAt = new Date().toISOString();
  WALLET_SETTINGS_REPO.updateWallet(discordUserId, (draft) => ({
    ...draft,
    walletRnsCreditedTotal: totalBefore + credited,
    walletRnsLastCredited: credited,
    walletRnsLastCreditedAt: lastCreditedAt
  }));
  return {
    success: true,
    creditedNow: credited,
    creditedTotal: totalBefore + credited,
    lastCredited: credited,
    lastCreditedAt
  };
}

// ============== 取得錢包完整資料 ==============
function getWalletData(discordUserId) {
  return WALLET_SETTINGS_REPO.getWallet(discordUserId) || null;
}

module.exports = {
  RENAISS_CONFIG,
  BSC_CONFIG,
  loadWalletSettings,
  saveWalletSettings,
  replaceWalletSettings,
  deleteWalletBinding,
  flushWalletSettings,
  bindWallet,
  getWalletAddress,
  fetchCardFMV,
  fetchUSDTTransfers,
  calculateTotalAssets,
  getPlayerWalletAssets,
  getMaxPetsByFMV,
  getMaxPetsForUser,
  getMaxPetsByRNS,
  isWalletBound,
  getPendingRNS,
  updatePendingRNS,
  applyWalletRnsDelta,
  updateWalletData,
  recordWalletCredit,
  getWalletData
};
