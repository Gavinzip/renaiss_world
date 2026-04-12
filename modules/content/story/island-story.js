/**
 * 🧭 Island Story State Manager
 * 管理每個地點（島）劇情階段、完成狀態與地點解鎖
 */

const { getLocationStoryMetadata, getLocationPortalHub, MAP_LOCATIONS } = require('../world-map');

const DEFAULT_STAGE_COUNT = Math.max(8, Number(process.env.ISLAND_STORY_STAGE_COUNT || 8));
const KING_GATE_REGION_ID = 'island_routes';
const KING_GATE_REQUIRED = 4;

const REGION_STORY_CHAPTER = Object.freeze({
  central_core: '第一島：鑑定公信裂痕',
  west_desert: '第二島：供應鏈破口',
  southern_delta: '第三島：偽造工坊',
  northern_highland: '第四島：滲透網篩查',
  island_routes: '第五島：四巨頭控制鏈',
  hidden_deeps: '第六島：真相公開與新平衡'
});

const REGION_REVEAL_ROADMAP = Object.freeze({
  central_core: [
    '遇到一組看起來過度友善且低價的鑑定服務，先保持觀察',
    '做一次正規鑑定，發現與低價站結果出現明顯衝突',
    '鎖定第一批可疑物證（標籤、印記或序號）',
    '把可疑物證送去第二來源複核，確認不是單點誤差',
    '訪談現場相關者，收集「誰提供服務、何時出現、在哪裡收貨」',
    '比對說法與物證，找出第一個關鍵矛盾點',
    '把矛盾整理成可追查線，定位下一島物流入口',
    '收尾：沿主傳送門前往下一島，繼續追查收藏品供應來源'
  ],
  west_desert: [
    '追查貨物流向，先把倉儲、碼頭、轉運的節點關係畫清楚',
    '在節點中找時間異常與編號異常，縮小可疑批次',
    '訪談 NPC-A，取得第一版口供',
    '訪談 NPC-B，取得第二版口供並比對落差',
    '確認兩份口供互相矛盾，建立矛盾索引',
    '追到「中間人」洗來源紀錄的操作方式',
    '拿到一段被加密的交易名單（尚未可讀）',
    '收尾：帶著加密名單前往下一島，準備解碼與驗證'
  ],
  southern_delta: [
    '以潛入或交易方式，取得第一份偽造樣本',
    '與真品做結構比對，確認不是單純瑕疵而是偽造',
    '拆出造假技術關鍵（工藝、材料、流程）',
    '追查造假樣本的上游供應與下游分發',
    '找到外圍幹部活動窗口並觀察其節奏',
    '設局攔截外圍幹部，取得其聯絡憑證',
    '幹部供出上層代號（不透露真名）',
    '收尾：依代號線索前往下一島，追查滲透網核心'
  ],
  northern_highland: [
    '發現「友善隊伍」其實在收集新手資料而非單純服務',
    '追查資料流向，定位內部被滲透的入口',
    '找到第一份內應名單片段，確認不是單一個案',
    '補齊名單缺口，辨識被滲透的好人陣營節點',
    '執行一次反滲透行動（非正面決戰）',
    '驗證反滲透成果，清掉至少一條被污染通道',
    '鎖定四大幹部之一的活動區域',
    '收尾：沿幹部活動線前往下一島，進入四巨頭戰線'
  ],
  island_routes: [
    '建立四巨頭目標板，先確認四人分工與弱點差異',
    '擊敗或逼退幹部 A，取得第一份核心憑證',
    '擊敗或逼退幹部 B，拼出帳本關聯的一半',
    '追查帳本缺口，鎖定幕後操作模型關鍵欄位',
    '擊敗或逼退幹部 C，補齊控制鏈的一段',
    '擊敗或逼退幹部 D，取得最後比對憑證',
    '彙整成「真相包」並評估公開後的全域動盪風險',
    '收尾：帶著真相包進入第六島，準備公開與穩定平衡'
  ],
  hidden_deeps: [
    '選擇公開方式：全面公開或分段公開（各有代價）',
    '盤點必須先守住的民生節點，避免秩序瞬間崩盤',
    '佈署保護行動，確保公開同時仍能維持供應穩定',
    '釋出第一波真相並監測市場與群眾反應',
    '處理反制與反撲，避免輿論被再次操控',
    '進入最終對峙：目標是壓制其網路，不是擊殺終結',
    '完成平衡重建，建立可長期運作的對抗機制',
    '收尾：世界進入新平衡，保留長期對抗與持續冒險'
  ]
});

const DEFAULT_REVEAL_ROADMAP = Object.freeze([
  '先建立在地關係，辨認誰在提供「過度優惠」',
  '確認第一次異常：價格與品質或來源對不上',
  '取得可驗證物證（序號、印記、封條）',
  '追查貨物流向與中間轉運節點',
  '交叉比對口供，找出矛盾敘述',
  '逼近外圍執行者，確認其上游存在',
  '整理證據鏈與後續風險',
  '收尾並走向主傳送門'
]);

function normalizeLocation(location = '') {
  return String(location || '').trim();
}

function ensureUnlockedLocations(player) {
  if (!player || typeof player !== 'object') return [];
  if (!Array.isArray(player.unlockedLocations)) {
    player.unlockedLocations = [];
  }
  const uniq = [];
  const seen = new Set();
  for (const loc of player.unlockedLocations) {
    const name = normalizeLocation(loc);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    uniq.push(name);
  }
  player.unlockedLocations = uniq;
  return player.unlockedLocations;
}

function unlockLocation(player, location = '') {
  if (!player || typeof player !== 'object') return false;
  const loc = normalizeLocation(location || player.location || player.spawnLocation || '');
  if (!loc) return false;
  const list = ensureUnlockedLocations(player);
  if (list.includes(loc)) return false;
  list.push(loc);
  return true;
}

function isLocationUnlocked(player, location = '') {
  const loc = normalizeLocation(location);
  if (!loc) return false;
  const list = ensureUnlockedLocations(player);
  return list.includes(loc);
}

function getUnlockedLocations(player) {
  const list = ensureUnlockedLocations(player);
  return [...list];
}

function ensureIslandStoryState(player) {
  if (!player || typeof player !== 'object') return {};
  if (!player.islandStoryState || typeof player.islandStoryState !== 'object' || Array.isArray(player.islandStoryState)) {
    player.islandStoryState = {};
  }
  const state = player.islandStoryState;
  for (const key of Object.keys(state)) {
    const loc = normalizeLocation(key);
    if (!loc || loc !== key) {
      delete state[key];
      continue;
    }
    const meta = getLocationStoryMetadata(loc);
    const stageCount = Math.max(1, Number(meta?.stageCount || DEFAULT_STAGE_COUNT));
    const row = state[loc];
    if (!row || typeof row !== 'object') {
      state[loc] = {
        stage: 0,
        stageCount,
        completed: false,
        completedAt: 0,
        lastUpdatedAt: Date.now()
      };
      continue;
    }
    if (!Number.isFinite(Number(row.stage))) row.stage = 0;
    // 強制同步到地圖 metadata 的段數，避免舊存檔殘留 3 段等過期設定
    row.stageCount = stageCount;
    if (typeof row.completed !== 'boolean') row.completed = false;
    if (!Number.isFinite(Number(row.completedAt))) row.completedAt = 0;
    if (!Number.isFinite(Number(row.lastUpdatedAt))) row.lastUpdatedAt = Date.now();
  }
  return state;
}

function ensureIslandStoryEntry(player, location = '') {
  if (!player || typeof player !== 'object') return null;
  const loc = normalizeLocation(location || player.location || '');
  if (!loc) return null;
  const state = ensureIslandStoryState(player);
  const meta = getLocationStoryMetadata(loc);
  const stageCount = Math.max(1, Number(meta?.stageCount || DEFAULT_STAGE_COUNT));
  if (!state[loc] || typeof state[loc] !== 'object') {
    state[loc] = {
      stage: 0,
      stageCount,
      completed: false,
      completedAt: 0,
      lastUpdatedAt: Date.now()
    };
  }
  const row = state[loc];
  if (!Number.isFinite(Number(row.stage))) row.stage = 0;
  // 強制同步到地圖 metadata 的段數，避免舊存檔殘留 3 段等過期設定
  row.stageCount = stageCount;
  if (typeof row.completed !== 'boolean') row.completed = false;
  if (!Number.isFinite(Number(row.completedAt))) row.completedAt = 0;
  if (!Number.isFinite(Number(row.lastUpdatedAt))) row.lastUpdatedAt = Date.now();
  return row;
}

function getIslandStoryState(player, location = '') {
  const entry = ensureIslandStoryEntry(player, location || player?.location || '');
  if (!entry) return null;
  return { ...entry };
}

function countCompletedIslands(player) {
  const state = ensureIslandStoryState(player);
  let total = 0;
  for (const loc of Object.keys(state)) {
    if (state[loc]?.completed) total += 1;
  }
  return total;
}

function calculateStageByTurns(turnsInLocation = 0, targetTurns = 6, stageCount = DEFAULT_STAGE_COUNT) {
  const safeTurns = Math.max(0, Number(turnsInLocation || 0));
  const safeTarget = Math.max(1, Number(targetTurns || 6));
  const safeStageCount = Math.max(1, Number(stageCount || DEFAULT_STAGE_COUNT));
  if (safeTurns <= 0) return 0;
  // 以更平滑的方式遞增階段，避免前幾回合就跳太多階
  const progress = Math.max(0, Math.min(safeTarget, safeTurns));
  const raw = Math.floor(((progress - 1) / safeTarget) * safeStageCount) + 1;
  return Math.max(1, Math.min(safeStageCount, raw));
}

function resolveStageGoal(stage = 0, stageCount = DEFAULT_STAGE_COUNT, location = '') {
  const meta = getLocationStoryMetadata(location || '') || {};
  const regionId = String(meta.regionId || '').trim();
  const revealRoadmap = Array.isArray(REGION_REVEAL_ROADMAP[regionId]) && REGION_REVEAL_ROADMAP[regionId].length > 0
    ? REGION_REVEAL_ROADMAP[regionId]
    : DEFAULT_REVEAL_ROADMAP;
  const safeStage = Math.max(0, Number(stage || 0));
  const safeStageCount = Math.max(1, Number(stageCount || DEFAULT_STAGE_COUNT));
  if (safeStage <= 0) return revealRoadmap[0];
  const bucketSize = Math.max(1, safeStageCount / revealRoadmap.length);
  const idx = Math.min(revealRoadmap.length - 1, Math.floor((safeStage - 1) / bucketSize));
  return revealRoadmap[idx];
}

function getStoryChapterTitle(location = '') {
  const meta = getLocationStoryMetadata(location || '') || {};
  const regionId = String(meta.regionId || '').trim();
  return String(REGION_STORY_CHAPTER[regionId] || '島內篇章').trim();
}

function getStoryRoadmap(location = '', stageCount = DEFAULT_STAGE_COUNT) {
  const meta = getLocationStoryMetadata(location || '') || {};
  const regionId = String(meta.regionId || '').trim();
  const revealRoadmap = Array.isArray(REGION_REVEAL_ROADMAP[regionId]) && REGION_REVEAL_ROADMAP[regionId].length > 0
    ? REGION_REVEAL_ROADMAP[regionId]
    : DEFAULT_REVEAL_ROADMAP;
  const safeStageCount = Math.max(1, Number(stageCount || DEFAULT_STAGE_COUNT));
  const lines = [];
  for (let s = 1; s <= safeStageCount; s++) {
    const bucketSize = Math.max(1, safeStageCount / revealRoadmap.length);
    const idx = Math.min(revealRoadmap.length - 1, Math.floor((s - 1) / bucketSize));
    lines.push(String(revealRoadmap[idx] || revealRoadmap[revealRoadmap.length - 1] || '').trim());
  }
  return lines;
}

function buildStoryRoadmapPrompt(location = '', currentStage = 0, stageCount = DEFAULT_STAGE_COUNT) {
  const chapter = getStoryChapterTitle(location);
  const roadmap = getStoryRoadmap(location, stageCount);
  if (roadmap.length === 0) return '';
  const safeCurrent = Math.max(1, Math.min(Math.max(1, Number(stageCount || roadmap.length)), Number(currentStage || 1)));
  const lines = roadmap.map((goal, idx) => {
    const n = idx + 1;
    const mark = n === safeCurrent ? '（當前）' : '';
    return `${n}. ${goal}${mark}`;
  });
  return [
    '【地區完整主線段落（必讀）】',
    `章節：${chapter}`,
    `當前進度：第 ${safeCurrent} / ${Math.max(1, Number(stageCount || roadmap.length))} 段`,
    ...lines
  ].join('\n');
}

function updateIslandStoryProgress(player, options = {}) {
  if (!player || typeof player !== 'object') return null;
  const location = normalizeLocation(options.location || player.location || '');
  if (!location) return null;
  const entry = ensureIslandStoryEntry(player, location);
  if (!entry) return null;
  const meta = getLocationStoryMetadata(location);
  const stageCount = Math.max(1, Number(meta?.stageCount || entry.stageCount || DEFAULT_STAGE_COUNT));
  const regionId = String(meta?.regionId || '').trim();
  entry.stageCount = stageCount;
  const missionRow = player?.mainStory?.mission?.regions && regionId
    ? player.mainStory.mission.regions[regionId]
    : null;
  const regionKeyFound = Boolean(missionRow?.keyFound);

  const turnsInLocation = Math.max(0, Number(options.turnsInLocation || 0));
  const targetTurns = Math.max(1, Number(options.targetTurns || 6));
  const battleDone = Boolean(options.battleDone);
  const nextStage = calculateStageByTurns(turnsInLocation, targetTurns, stageCount);
  entry.stage = Math.max(entry.stage, nextStage);

  // 關鍵任務尚未完成時，限制可揭露段落，避免久待就提前知道本島深層真相。
  if (!entry.completed && !regionKeyFound && regionId && regionId !== KING_GATE_REGION_ID && regionId !== 'hidden_deeps') {
    const capStage = Math.max(1, Math.min(stageCount - 1, 3));
    entry.stage = Math.min(entry.stage, capStage);
  }

  if (!entry.completed && regionKeyFound && regionId && regionId !== KING_GATE_REGION_ID && regionId !== 'hidden_deeps') {
    entry.completed = true;
    entry.stage = stageCount;
    entry.completedAt = Date.now();
  } else if (!entry.completed && battleDone && turnsInLocation >= targetTurns) {
    if (regionId === KING_GATE_REGION_ID) {
      const defeatedKings = Array.isArray(player?.mainStory?.defeatedKings)
        ? player.mainStory.defeatedKings
        : [];
      const cleared = defeatedKings
        .map((name) => String(name || '').trim())
        .filter(Boolean)
        .filter((name, idx, arr) => arr.indexOf(name) === idx)
        .length;
      if (cleared >= KING_GATE_REQUIRED) {
        entry.completed = true;
        entry.stage = stageCount;
        entry.completedAt = Date.now();
      } else {
        // 第五關硬門檻：未擊破四巨頭前不可通關，但維持接近收尾的進度手感。
        entry.stage = Math.max(entry.stage, Math.max(1, stageCount - 1));
      }
    } else if (regionId === 'hidden_deeps') {
      entry.completed = true;
      entry.stage = stageCount;
      entry.completedAt = Date.now();
    }
  }
  entry.lastUpdatedAt = Date.now();
  return { ...entry };
}

function getNextPrimaryLocation(location = '') {
  const meta = getLocationStoryMetadata(location);
  return normalizeLocation(meta?.nextPrimary || '');
}

function buildIslandGuidancePrompt(player, location = '') {
  const loc = normalizeLocation(location || player?.location || '');
  if (!loc) return '';
  const meta = getLocationStoryMetadata(loc) || {};
  const state = ensureIslandStoryEntry(player, loc);
  if (!state) return '';
  if (state.completed) return '';

  const stage = Math.max(0, Number(state.stage || 0));
  const stageCount = Math.max(1, Number(state.stageCount || meta.stageCount || DEFAULT_STAGE_COUNT));
  const nextPrimary = normalizeLocation(meta?.nextPrimary || '');
  const chapterTitle = getStoryChapterTitle(loc);

  const stageGoal = resolveStageGoal(stage, stageCount, loc);
  const missionRow = player?.mainStory?.mission?.regions && String(meta?.regionId || '').trim()
    ? player.mainStory.mission.regions[String(meta.regionId).trim()]
    : null;
  const missionHint = (() => {
    const rid = String(meta?.regionId || '').trim();
    if (!rid || rid === 'hidden_deeps') return '';
    if (rid === 'central_core') {
      return `本島關鍵任務（唯一來源）：僅能在「洛陽城」接觸灰帳記錄員取得「雙鑑衝突原始單」｜狀態：${missionRow?.keyFound ? '已完成' : '未完成'}`;
    }
    if (rid === 'west_desert') {
      return `本島關鍵任務（唯一來源）：僅能在「敦煌」接觸轉運站調度員取得「異常轉運時間鏈」｜狀態：${missionRow?.keyFound ? '已完成' : '未完成'}`;
    }
    if (rid === 'southern_delta') {
      return `本島關鍵任務（唯一來源）：僅能在「廣州」接觸工坊試樣師取得「偽造樣本與製程片段」｜狀態：${missionRow?.keyFound ? '已完成' : '未完成'}`;
    }
    if (rid === 'northern_highland') {
      return `本島關鍵任務（唯一來源）：僅能在「雪白山莊」接觸滲透聯絡員取得「夜冕主宰鏈路密鑰」｜狀態：${missionRow?.keyFound ? '已完成' : '未完成'}`;
    }
    if (rid === KING_GATE_REGION_ID) {
      return `本島關鍵任務：擊敗四巨頭全員，拼出核心憑證鏈｜狀態：${missionRow?.keyFound ? '已完成' : '未完成'}`;
    }
    return '';
  })();
  const kingGateHint = String(meta?.regionId || '').trim() === KING_GATE_REGION_ID
    ? (() => {
      const defeatedKings = Array.isArray(player?.mainStory?.defeatedKings)
        ? player.mainStory.defeatedKings
        : [];
      const cleared = defeatedKings
        .map((name) => String(name || '').trim())
        .filter(Boolean)
        .filter((name, idx, arr) => arr.indexOf(name) === idx)
        .length;
      const remain = Math.max(0, KING_GATE_REQUIRED - cleared);
      return `四巨頭硬門檻：${cleared}/${KING_GATE_REQUIRED}${remain > 0 ? `（仍需擊敗 ${remain} 位）` : '（已達成）'}`;
    })()
    : '';

  const nextPortalHub = normalizeLocation(
    nextPrimary
      ? getLocationPortalHub(nextPrimary)
      : getLocationPortalHub(loc)
  );
  const travelHint = nextPortalHub
    ? `完成後請前往「${nextPortalHub}」主傳送門，再跨區前進`
    : (nextPrimary ? `完成後可引導前往：${nextPrimary}` : '完成後可引導前往下一個已開放地區');
  return [
    `【島內主線引導】`,
    `當前地點：${loc}（${String(meta.storyTag || `D${meta.difficulty || '?'}`)}）`,
    `章節主題：${chapterTitle}`,
    `進度：stage ${stage}/${stageCount}（未完成）`,
    `本階段目標：${stageGoal}`,
    missionHint,
    kingGateHint,
    `收尾方向：${travelHint}`
  ].filter(Boolean).join('\n');
}

function getAllKnownLocations() {
  return Array.isArray(MAP_LOCATIONS) ? [...MAP_LOCATIONS] : [];
}

module.exports = {
  DEFAULT_STAGE_COUNT,
  ensureUnlockedLocations,
  unlockLocation,
  isLocationUnlocked,
  getUnlockedLocations,
  ensureIslandStoryState,
  ensureIslandStoryEntry,
  getIslandStoryState,
  countCompletedIslands,
  updateIslandStoryProgress,
  calculateStageByTurns,
  getStoryChapterTitle,
  getStoryRoadmap,
  buildStoryRoadmapPrompt,
  buildIslandGuidancePrompt,
  getNextPrimaryLocation,
  getAllKnownLocations
};
