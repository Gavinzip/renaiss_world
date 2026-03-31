/**
 * 💳 錢包系統 v3
 * - 綁定 Discord user ID + BSC 錢包地址
 * - 從 Renaiss API 讀取卡牌 FMV
 * - 從 BSCScan 讀取開包數量、總花費
 */

const CORE = require('./game-core');
const fs = require('fs');
const path = require('path');

// 讀取 .env（讓單獨執行 wallet-system 測試時也能拿到 API Key）
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

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
  
  // 合約地址（從 TCG 專案來的）
  usdtContract: '0x55d398326f99059ff775485246999027b3197955',
  packContracts: [
    '0x...', // 需要從 TCG 專案的 .env 填入
  ],
  marketplaceContract: '0xae3e7268ef5a062946216a44f58a8f685ffd11d0',
};

// ============== 用戶錢包設定檔路徑 ==============
const WALLET_DATA_DIR = path.join(__dirname, 'data');
const WALLET_DATA_FILE = path.join(WALLET_DATA_DIR, 'user_wallets.json');

// ============== 讀取/寫入錢包設定 ==============
function loadWalletSettings() {
  try {
    if (!fs.existsSync(WALLET_DATA_FILE)) {
      return {};
    }
    const data = fs.readFileSync(WALLET_DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error('[錢包] 讀取失敗:', e.message);
    return {};
  }
}

function saveWalletSettings(settings) {
  try {
    fs.mkdirSync(WALLET_DATA_DIR, { recursive: true });
    fs.writeFileSync(WALLET_DATA_FILE, JSON.stringify(settings, null, 2));
    return true;
  } catch (e) {
    console.error('[錢包] 儲存失敗:', e.message);
    return false;
  }
}

// ============== 綁定錢包地址 ==============
function bindWallet(discordUserId, walletAddress) {
  const normalizedAddress = walletAddress.toLowerCase().trim();
  
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
    return { success: false, reason: '無效的 BSC 錢包地址格式！' };
  }
  
  const settings = loadWalletSettings();
  const existed = settings[discordUserId]?.walletAddress;
  if (existed) {
    return { success: false, reason: `你已綁定錢包：${existed}，目前不允許重綁。` };
  }

  settings[discordUserId] = {
    walletAddress: normalizedAddress,
    boundAt: new Date().toISOString()
  };
  
  if (saveWalletSettings(settings)) {
    return { success: true, address: normalizedAddress };
  }
  
  return { success: false, reason: '儲存失敗！' };
}

// ============== 取得用戶錢包地址 ==============
function getWalletAddress(discordUserId) {
  const settings = loadWalletSettings();
  return settings[discordUserId]?.walletAddress || null;
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

  const limit = 100;
  const maxPages = 60;
  let offset = 0;
  const matchedRows = [];

  for (let page = 0; page < maxPages; page++) {
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
    for (const row of rows) {
      const ownerAddress = normalizeWalletAddress(row?.ownerAddress);
      if (ownerAddress !== wallet) continue;
      matchedRows.push(row);
      const userId = row?.owner?.id;
      if (typeof userId === 'string' && userId.trim()) {
        return { userId: userId.trim(), matchedRows };
      }
    }

    const pagination = result?.pagination || {};
    if (!pagination.hasMore) break;
    const step = Number(pagination.limit) || limit;
    if (step <= 0) break;
    offset += step;
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
async function fetchUSDTTransfers(walletAddress) {
  if (!BSC_CONFIG.apiKey) {
    console.log('[錢包] BSCSCAN_API_KEY 未設定');
    return { packTxCount: 0, packSpentUSDT: 0 };
  }
  
  try {
    // 讀取代幣轉帳記錄
    const params = new URLSearchParams({
      chainid: BSC_CONFIG.chainId,
      module: 'account',
      action: 'tokentx',
      address: walletAddress.toLowerCase(),
      contractaddress: BSC_CONFIG.usdtContract,
      page: 1,
      offset: 10000,
      sort: 'desc',
      apikey: BSC_CONFIG.apiKey
    });
    
    const url = `${BSC_CONFIG.apiUrl}?${params}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== '1' || !Array.isArray(data.result)) {
      return { packTxCount: 0, packSpentUSDT: 0 };
    }
    
    // 計算開包數量和花費
    let packTxCount = 0;
    let packSpentUSDT = 0;
    
    const validPackContracts = BSC_CONFIG.packContracts
      .filter(addr => /^0x[a-fA-F0-9]{40}$/.test(addr))
      .map(addr => addr.toLowerCase());
    const marketplace = (BSC_CONFIG.marketplaceContract || '').toLowerCase();
    const userWallet = walletAddress.toLowerCase();

    for (const tx of data.result) {
      const from = tx.from?.toLowerCase();
      const to = tx.to?.toLowerCase();
      const value = parseFloat(tx.value) / 1e18; // USDT 18 位小數
      
      // 往 pack 合約或 marketplace 的轉出，都視為消費/開包相關行為
      const isOutgoing = from === userWallet;
      const isPackSpend = validPackContracts.includes(to);
      const isMarketplaceSpend = marketplace && to === marketplace;
      if (isOutgoing && (isPackSpend || isMarketplaceSpend)) {
        packTxCount++;
        packSpentUSDT += value;
      }
    }
    
    return { packTxCount, packSpentUSDT };
  } catch (e) {
    console.error('[錢包] 讀取 USDT 交易失敗:', e.message);
    return { packTxCount: 0, packSpentUSDT: 0 };
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
    
    // 總花費（用於初始 RNS）
    packSpentUSDT: onchainData.packSpentUSDT,
    
    // 計算後的 RNS
    initialRNS: Math.floor(onchainData.packSpentUSDT)
  };
}

// ============== 取得玩家錢包資產 ==============
async function getPlayerWalletAssets(discordUserId) {
  const walletAddress = getWalletAddress(discordUserId);
  
  if (!walletAddress) {
    return { success: false, reason: '尚未綁定錢包！', rns: 0 };
  }
  
  const assets = await calculateTotalAssets(walletAddress);
  
  return {
    success: true,
    walletAddress,
    assets,
    rns: assets.initialRNS
  };
}

// ============== 根據 FMV 計算可擁有寵物數 ==============
function getMaxPetsByFMV(cardFMV) {
  if (cardFMV >= 5000) return 3;   // FMV 5000+ → 3 隻
  if (cardFMV >= 1000) return 2;  // FMV 1000+ → 2 隻
  return 1;                         // < 1000 → 1 隻
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
  const settings = loadWalletSettings();
  return settings[discordUserId]?.pendingRNS || 0;
}

// ============== 更新暫時 RNS ==============
function updatePendingRNS(discordUserId, rns) {
  const settings = loadWalletSettings();
  if (settings[discordUserId]) {
    settings[discordUserId].pendingRNS = rns;
    saveWalletSettings(settings);
  }
}

// ============== 更新錢包完整資料 ==============
function updateWalletData(discordUserId, data) {
  const settings = loadWalletSettings();
  if (settings[discordUserId]) {
    settings[discordUserId].cardFMV = data.cardFMV;
    settings[discordUserId].cardCount = data.cardCount;
    settings[discordUserId].packTxCount = data.packTxCount;
    settings[discordUserId].packSpentUSDT = data.packSpentUSDT;
    saveWalletSettings(settings);
  }
}

// ============== 取得錢包完整資料 ==============
function getWalletData(discordUserId) {
  const settings = loadWalletSettings();
  return settings[discordUserId] || null;
}

module.exports = {
  RENAISS_CONFIG,
  BSC_CONFIG,
  bindWallet,
  getWalletAddress,
  fetchCardFMV,
  fetchUSDTTransfers,
  calculateTotalAssets,
  getPlayerWalletAssets,
  getMaxPetsByFMV,
  getMaxPetsByRNS,
  isWalletBound,
  getPendingRNS,
  updatePendingRNS,
  updateWalletData,
  getWalletData
};
