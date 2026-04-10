/**
 * 📖 Renaiss 主線（被動觸發版）
 * 不提供固定主線按鈕，隨玩家遊玩行為自然推進。
 */

const { sanitizeWorldObject } = require('../../core/style-sanitizer');
const BATTLE = require('../../systems/battle/battle-system');
const ISLAND_STORY = require('./island-story');
const { getLocationPortalHub, getLocationStoryMetadata } = require('../world-map');

const STORY_ACTS = {
  1: 'Act 1 誘惑（The Cheap Choice）',
  2: 'Act 2 流言（Whispers）',
  3: 'Act 3 狩獵（Marked）',
  4: 'Act 4 市場戰爭（War）',
  5: 'Act 5 四巨頭（Endgame）',
  6: 'Act 6 Winchman 抉擇'
};

const DIGITAL_KINGS = ['Nemo', 'Wolf', 'Adaloc', 'Hom'];
const KING_ENCOUNTER_GAP_EVENTS = Math.max(1, Number(process.env.KING_ENCOUNTER_GAP_EVENTS || 2));
const ASSASSIN_PRESSURE_GAP_EVENTS = Math.max(2, Number(process.env.ASSASSIN_PRESSURE_GAP_EVENTS || 4));

const ENDING_RULES = {
  order: { fakeRate: 0.12, ambushRate: 0.15, volatility: 0.08, rewardVariance: 0.2 },
  chaos: { fakeRate: 0.48, ambushRate: 0.42, volatility: 0.35, rewardVariance: 0.65 },
  controller: { fakeRate: 0.28, ambushRate: 0.24, volatility: 0.18, rewardVariance: 0.4 }
};

const REGION_SEQUENCE = Object.freeze([
  'central_core',
  'west_desert',
  'southern_delta',
  'northern_highland',
  'island_routes',
  'hidden_deeps'
]);

const REGION_KEY_MISSIONS = Object.freeze({
  central_core: {
    npcName: '灰帳記錄員',
    npcLocation: '洛陽城',
    evidenceName: '雙鑑衝突原始單',
    actionKeywords: ['雙鑑', '鑑定衝突', '正規鑑定', '低價鑑定', '原始單', '灰帳'],
    enemyAliases: ['灰帳記錄員'],
    minStoryTurns: 3,
    minTurnsInLocation: 2,
    leadGraceTurns: 3
  },
  west_desert: {
    npcName: '轉運站調度員',
    npcLocation: '喀什爾',
    evidenceName: '異常轉運時間鏈',
    actionKeywords: ['轉運', '時間鏈', '貨流', '洗來源', '調度', '碼頭紀錄'],
    enemyAliases: ['轉運站調度員'],
    minStoryTurns: 8,
    minTurnsInLocation: 2,
    leadGraceTurns: 3
  },
  southern_delta: {
    npcName: '工坊試樣師',
    npcLocation: '鏡湖渡口',
    evidenceName: '偽造樣本與製程片段',
    actionKeywords: ['偽造樣本', '製程片段', '試樣', '工坊', '仿品', '樣本'],
    enemyAliases: ['工坊試樣師'],
    minStoryTurns: 13,
    minTurnsInLocation: 2,
    leadGraceTurns: 3
  },
  northern_highland: {
    npcName: '滲透聯絡員',
    npcLocation: '雪白山莊',
    evidenceName: '夜冕主宰鏈路密鑰',
    actionKeywords: ['鏈路密鑰', '上級節點', '聯絡密鑰', '夜冕', '滲透聯絡'],
    enemyAliases: ['滲透聯絡員'],
    minStoryTurns: 18,
    minTurnsInLocation: 2,
    leadGraceTurns: 3
  },
  island_routes: {
    npcName: '四巨頭',
    npcLocation: '桃花島',
    evidenceName: '核心憑證（四巨頭鏈）',
    actionKeywords: [],
    enemyAliases: [...DIGITAL_KINGS]
  }
});

const MISSION_LEAD_LINES = Object.freeze({
  central_core: [
    '你在洛陽城反覆聽到同一句低聲提醒：想核對衝突原單，去找灰帳記錄員。',
    '洛陽城的攤販對你使了個眼色：雙鑑衝突原始單不在檯面上，只能找灰帳記錄員。'
  ],
  west_desert: [
    '喀什爾轉運區有人壓低聲線告訴你：要看異常時間鏈，得直接問轉運站調度員。',
    '喀什爾巴扎後巷傳來一句暗語：異常轉運時間鏈只在調度員手上，別找錯人。'
  ],
  southern_delta: [
    '鏡湖渡口有人遞來一句話：偽造樣本與製程片段，只有工坊試樣師敢拿出來。',
    '渡口修復臺後方傳來提醒：別再兜圈，工坊試樣師手上才有你要的製程片段。'
  ],
  northern_highland: [
    '雪白山莊的巡線員低聲說：夜冕主宰鏈路密鑰只在滲透聯絡員那裡。',
    '寒原風聲裡夾著一句警告：想接上四巨頭戰線，先拿到夜冕主宰鏈路密鑰。'
  ]
});

const TRUTH_TIERS = Object.freeze([
  {
    level: 1,
    allow: '只可確認「過度友善低價服務 + 同件物品雙鑑衝突」',
    forbid: '禁止把供應鏈洗來源、偽造工坊、滲透網、四巨頭當成既定事實'
  },
  {
    level: 2,
    allow: '可確認「來源流向異常、轉運紀錄被洗」',
    forbid: '禁止把偽造工坊技術細節、滲透名單、四巨頭控制鏈當成既定事實'
  },
  {
    level: 3,
    allow: '可確認「存在偽造樣本與製程能力」',
    forbid: '禁止把滲透網完整名單與四巨頭核心鏈當成既定事實'
  },
  {
    level: 4,
    allow: '可確認「滲透聯絡員持有夜冕主宰鏈路密鑰，能直通四巨頭戰線」',
    forbid: '禁止把四巨頭全部關聯與最終公開方案當成既定事實'
  },
  {
    level: 5,
    allow: '可確認「四巨頭控制鏈與核心憑證關聯」',
    forbid: '禁止直接宣告終局公開後的世界結局'
  },
  {
    level: 6,
    allow: '可進入終局層：公開方式、平衡重建、長期對抗',
    forbid: '無'
  }
]);

const MISSION_REGION_ORDER = Object.freeze([
  'central_core',
  'west_desert',
  'southern_delta',
  'northern_highland',
  'island_routes'
]);

function getCompletedLocationCount(player) {
  if (ISLAND_STORY && typeof ISLAND_STORY.countCompletedIslands === 'function') {
    const total = Number(ISLAND_STORY.countCompletedIslands(player));
    if (Number.isFinite(total) && total >= 0) return total;
  }
  const completed = player?.locationArcState?.completedLocations;
  if (!completed || typeof completed !== 'object' || Array.isArray(completed)) return 0;
  return Object.keys(completed).length;
}

function pickVariant(lines = [], seed = 0) {
  const arr = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (arr.length === 0) return '';
  const idx = Math.abs(Number(seed || 0)) % arr.length;
  return String(arr[idx] || '').trim();
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, Number(num || 0)));
}

function getStoryWantedPressure(player, context = {}) {
  const localWanted = Math.max(0, Number(player?.wanted || 0));
  const resultWanted = Math.max(0, Number(context?.result?.wantedLevel || 0));
  const eventWanted = Math.max(0, Number(context?.event?.wantedLevel || 0));
  return Math.max(localWanted, resultWanted, eventWanted);
}

function getRegionIdByLocation(location = '') {
  const loc = String(location || '').trim();
  if (!loc) return '';
  const meta = getLocationStoryMetadata(loc);
  return String(meta?.regionId || '').trim();
}

function ensureMissionState(state) {
  if (!state || typeof state !== 'object') return null;
  if (!state.mission || typeof state.mission !== 'object' || Array.isArray(state.mission)) {
    state.mission = {
      hunterUnlocked: false,
      regions: {}
    };
  }
  if (!state.mission.regions || typeof state.mission.regions !== 'object' || Array.isArray(state.mission.regions)) {
    state.mission.regions = {};
  }
  for (const regionId of Object.keys(REGION_KEY_MISSIONS)) {
    const current = state.mission.regions[regionId];
    if (!current || typeof current !== 'object') {
      state.mission.regions[regionId] = {
        keyFound: false,
        foundAt: 0,
        method: '',
        npcName: '',
        evidenceName: '',
        leadShownCount: 0,
        lastLeadTurn: -999
      };
      continue;
    }
    current.keyFound = Boolean(current.keyFound);
    if (!Number.isFinite(Number(current.foundAt))) current.foundAt = 0;
    current.method = String(current.method || '').trim();
    current.npcName = String(current.npcName || '').trim();
    current.evidenceName = String(current.evidenceName || '').trim();
    if (!Number.isFinite(Number(current.leadShownCount))) current.leadShownCount = 0;
    if (!Number.isFinite(Number(current.lastLeadTurn))) current.lastLeadTurn = -999;
  }
  return state.mission;
}

function isMissionKeyFound(state, regionId = '') {
  const mission = ensureMissionState(state);
  const rid = String(regionId || '').trim();
  if (!mission || !rid) return false;
  return Boolean(mission.regions?.[rid]?.keyFound);
}

function isMissionRegionOpen(state, regionId = '') {
  const rid = String(regionId || '').trim();
  if (!rid) return false;
  const idx = MISSION_REGION_ORDER.indexOf(rid);
  if (idx <= 0) return true;
  for (let i = 0; i < idx; i += 1) {
    if (!isMissionKeyFound(state, MISSION_REGION_ORDER[i])) return false;
  }
  return true;
}

function updateIslandRoutesMissionFromKings(state) {
  if (!state || typeof state !== 'object') return;
  const mission = ensureMissionState(state);
  if (!mission) return;
  const cleared = Array.isArray(state.defeatedKings)
    ? state.defeatedKings
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .filter((name, idx, arr) => arr.indexOf(name) === idx).length
    : 0;
  if (cleared < DIGITAL_KINGS.length) return;
  const row = mission.regions.island_routes;
  if (!row || row.keyFound) return;
  row.keyFound = true;
  row.foundAt = Date.now();
  row.method = 'combat';
  row.npcName = '四巨頭';
  row.evidenceName = REGION_KEY_MISSIONS.island_routes.evidenceName;
}

function buildMissionEvidenceUnlock(state, regionId, method = 'investigate', sourceNpc = '') {
  const mission = ensureMissionState(state);
  const rid = String(regionId || '').trim();
  const spec = REGION_KEY_MISSIONS[rid];
  if (!mission || !rid || !spec) return null;
  const row = mission.regions[rid];
  if (!row || row.keyFound) return null;
  row.keyFound = true;
  row.foundAt = Date.now();
  row.method = String(method || 'investigate').trim();
  row.npcName = String(sourceNpc || spec.npcName || '').trim();
  row.evidenceName = String(spec.evidenceName || '').trim();
  if (rid === 'central_core') {
    mission.hunterUnlocked = true;
    if (Number(state.act || 1) < 3) {
      state.act = 3;
      state.node = 'act3_marked';
      pushHistory(state, '第一關關鍵證據到手 -> 被盯上');
    }
    state.lastAssassinPressureEventCount = Math.min(
      Number(state.lastAssassinPressureEventCount || -999),
      Number(state.eventCount || 0) - ASSASSIN_PRESSURE_GAP_EVENTS
    );
  }
  const npcText = row.npcName ? `（關鍵人物：${row.npcName}）` : '';
  const hunterLine = rid === 'central_core'
    ? '\n⚠️ 你的行動已被敵對勢力標記，後續將逐步出現跟監與追殺壓力。'
    : '';
  return {
    appendText: `📌 **關鍵證據取得**：${row.evidenceName}${npcText}\n你已拿到本區可驗證核心，主線可往下一島推進。${hunterLine}`,
    announcement: `🧭 ${row.npcName || '在地線人'}交出關鍵證據「${row.evidenceName}」。`,
    memory: `你取得本區關鍵證據：${row.evidenceName}${npcText}。`
  };
}

function inferMissionUnlockByAction(state, context = {}) {
  if (!state || typeof state !== 'object') return null;
  const regionId = String(context?.regionId || '').trim();
  const spec = REGION_KEY_MISSIONS[regionId];
  if (!regionId || !spec) return null;
  if (regionId === 'island_routes' || regionId === 'hidden_deeps') return null;
  if (isMissionKeyFound(state, regionId)) return null;
  if (!isMissionRegionOpen(state, regionId)) return null;
  const mission = ensureMissionState(state);
  const row = mission?.regions?.[regionId];
  if (!row) return null;
  const location = String(context?.location || '').trim();
  const requiredLocation = String(spec.npcLocation || '').trim();
  if (requiredLocation && location !== requiredLocation) return null;

  const storyTurns = Math.max(0, Number(context?.storyTurns ?? state?.eventCount ?? 0));
  const turnsInLocation = Math.max(0, Number(context?.turnsInLocation || 0));
  const minStoryTurns = Math.max(0, Number(spec?.minStoryTurns || 0));
  const minTurnsInLocation = Math.max(0, Number(spec?.minTurnsInLocation || 0));
  const leadGraceTurns = Math.max(0, Math.min(6, Number(spec?.leadGraceTurns ?? 1)));
  if (storyTurns < minStoryTurns) return null;
  if (turnsInLocation < minTurnsInLocation) return null;
  const hasLeadHint = Number(row?.leadShownCount || 0) > 0;
  if (!hasLeadHint && turnsInLocation < (minTurnsInLocation + leadGraceTurns)) return null;

  const npcName = String(context?.npcName || '').trim();
  const actionText = [
    String(context?.selectedChoice || ''),
    String(context?.eventAction || ''),
    String(context?.resultType || ''),
    String(context?.resultMessage || '')
  ].join('\n');
  const hasNpcTrace = Boolean(
    (npcName && npcName.includes(spec.npcName)) ||
    (String(context?.enemyName || '').trim() && String(context.enemyName).includes(spec.npcName)) ||
    (spec.npcName && actionText.includes(spec.npcName))
  );
  const inMissionCity = location === requiredLocation;
  // 在唯一來源城市、且已出過關鍵線索時，允許「不含 NPC 全名」的調查推進，避免卡關。
  const relaxedNpcTrace = hasLeadHint && inMissionCity && turnsInLocation >= minTurnsInLocation;
  if (!hasNpcTrace && !relaxedNpcTrace) return null;

  const enemyName = String(context?.enemyName || '').trim();
  const victory = Boolean(context?.victory);
  if (victory && enemyName) {
    const hitEnemy = Array.isArray(spec.enemyAliases) && spec.enemyAliases.some((name) => enemyName.includes(name));
    if (hitEnemy) return buildMissionEvidenceUnlock(state, regionId, 'combat', enemyName);
  }
  if (!actionText.trim()) return null;
  const matched = Array.isArray(spec.actionKeywords)
    && spec.actionKeywords.some((kw) => kw && actionText.includes(kw));
  const isMainStoryPush = String(context?.eventAction || '').trim() === 'main_story';
  const relaxedMainStoryUnlock = isMainStoryPush && inMissionCity && hasLeadHint;
  const relaxedInvestigateUnlock = inMissionCity
    && hasLeadHint
    && turnsInLocation >= minTurnsInLocation
    && /(詢問|问|訪談|访谈|追查|追蹤|追踪|查證|查证|核對|核对|比對|比对|尾隨|尾随|堵點|堵点|約見|约见|交涉|對質|对质|對接|对接)/u.test(actionText);
  if (!matched && !relaxedMainStoryUnlock && !relaxedInvestigateUnlock) return null;
  return buildMissionEvidenceUnlock(state, regionId, 'investigate', spec.npcName);
}

function maybeTriggerMissionNpcLead(player, context = {}) {
  const state = ensureMainStoryState(player);
  if (!state || state.completed) return null;
  const location = String(context?.location || player?.location || '').trim();
  if (!location) return null;
  const regionId = String(context?.regionId || getRegionIdByLocation(location)).trim();
  const spec = REGION_KEY_MISSIONS[regionId];
  if (!spec || regionId === 'island_routes' || regionId === 'hidden_deeps') return null;
  if (isMissionKeyFound(state, regionId)) return null;
  if (!isMissionRegionOpen(state, regionId)) return null;
  if (location !== String(spec.npcLocation || '').trim()) return null;

  const mission = ensureMissionState(state);
  const row = mission?.regions?.[regionId];
  if (!row) return null;
  const storyTurns = Math.max(0, Number(context?.storyTurns ?? player?.storyTurns ?? 0));
  const turnsInLocation = Math.max(0, Number(context?.turnsInLocation || 0));
  const minStoryTurns = Math.max(0, Number(spec?.minStoryTurns || 2));
  const minTurnsInLocation = Math.max(0, Number(spec?.minTurnsInLocation || 2));
  if (storyTurns < minStoryTurns) return null;
  if (turnsInLocation < Math.max(1, minTurnsInLocation - 1)) return null;
  if (storyTurns - Number(row.lastLeadTurn || -999) < 1) return null;

  const baseChance = clamp(
    0.2 + Number(row.leadShownCount || 0) * 0.14 + Math.max(0, turnsInLocation - minTurnsInLocation) * 0.05,
    0.2,
    0.78
  );
  const firstLead = Number(row.leadShownCount || 0) <= 0;
  if (firstLead) {
    row.leadShownCount = 1;
    row.lastLeadTurn = storyTurns;
    const lines = MISSION_LEAD_LINES[regionId] || [];
    const line = lines.length > 0
      ? String(lines[0] || '').trim()
      : '';
    if (!line) return null;
    return {
      appendText: `🎯 **關鍵人物線索**：${line}`,
      memory: `你在${location}首次鎖定「${spec.npcName}」線索，目標證據是「${spec.evidenceName}」。`
    };
  }
  const chance = Number(row.leadShownCount || 0) <= 0
    ? clamp(baseChance + 0.48, 0.85, 0.98)
    : clamp(baseChance + 0.08, 0.28, 0.86);
  if (Math.random() > chance) return null;

  row.leadShownCount = Math.max(0, Number(row.leadShownCount || 0)) + 1;
  row.lastLeadTurn = storyTurns;
  const lines = MISSION_LEAD_LINES[regionId] || [];
  const line = lines.length > 0
    ? String(lines[(row.leadShownCount - 1) % lines.length] || '').trim()
    : '';
  if (!line) return null;
  return {
    appendText: `🎯 **關鍵人物線索**：${line}`,
    memory: `你在${location}再次聽到「${spec.npcName}」線索，目標證據是「${spec.evidenceName}」。`
  };
}

function getSequentialMissionLevel(state) {
  const mission = ensureMissionState(state);
  if (!mission) return 0;
  const ordered = ['central_core', 'west_desert', 'southern_delta', 'northern_highland', 'island_routes'];
  let cleared = 0;
  for (const regionId of ordered) {
    if (!mission.regions?.[regionId]?.keyFound) break;
    cleared += 1;
  }
  return cleared;
}

function getTruthDisclosureLevel(player = null) {
  const state = ensureMainStoryState(player);
  if (!state) return 1;
  updateIslandRoutesMissionFromKings(state);
  const sequential = getSequentialMissionLevel(state);
  return Math.max(1, Math.min(6, sequential + 1));
}

function getCurrentRegionMission(player = null, location = '') {
  const state = ensureMainStoryState(player);
  if (!state) return null;
  const regionId = getRegionIdByLocation(location || player?.location || '');
  if (!regionId) return null;
  const spec = REGION_KEY_MISSIONS[regionId];
  if (!spec) return null;
  const mission = ensureMissionState(state);
  const row = mission?.regions?.[regionId] || null;
  return {
    regionId,
    npcName: String(spec.npcName || '').trim(),
    npcLocation: String(spec.npcLocation || '').trim(),
    evidenceName: String(spec.evidenceName || '').trim(),
    keyFound: Boolean(row?.keyFound),
    method: String(row?.method || '').trim()
  };
}

function suggestMissionAutoTravel(player = null, context = {}) {
  const state = ensureMainStoryState(player);
  if (!state || state.completed) return null;
  const currentLocation = String(context?.location || player?.location || '').trim();
  if (!currentLocation) return null;
  const mission = getCurrentRegionMission(player, currentLocation);
  if (!mission || mission.keyFound) return null;

  const targetLocation = String(mission.npcLocation || '').trim();
  if (!targetLocation || targetLocation === currentLocation) return null;
  const fromRegion = String(getRegionIdByLocation(currentLocation) || '').trim();
  const toRegion = String(getRegionIdByLocation(targetLocation) || '').trim();
  if (!fromRegion || !toRegion || fromRegion !== toRegion) return null;

  const missionState = ensureMissionState(state);
  const row = missionState?.regions?.[mission.regionId] || null;
  const spec = REGION_KEY_MISSIONS[String(mission.regionId || '').trim()] || null;
  if (!row || !spec) return null;

  const storyTurns = Math.max(0, Number(context?.storyTurns ?? player?.storyTurns ?? state?.eventCount ?? 0));
  const turnsInLocation = Math.max(0, Number(context?.turnsInLocation || 0));
  const minTurnsInLocation = Math.max(1, Number(spec?.minTurnsInLocation || 1));
  const leadShownCount = Math.max(0, Number(row?.leadShownCount || 0));
  const cooldownTurns = Math.max(2, Number(context?.cooldownTurns || 2));
  const lastAutoTurn = Number(state?.lastMissionAutoTravelTurn || -999);
  if (leadShownCount <= 0) return null;
  if (turnsInLocation < minTurnsInLocation) return null;
  if (storyTurns - lastAutoTurn < cooldownTurns) return null;

  state.lastMissionAutoTravelTurn = storyTurns;
  const npcName = String(mission.npcName || '關鍵NPC').trim() || '關鍵NPC';
  const evidenceName = String(mission.evidenceName || '關鍵證據').trim() || '關鍵證據';
  const appendText = (storyTurns % 2 === 0)
    ? `🧭 你把 ${currentLocation} 的線索先收束，沿著在地口供與物流路徑，低調轉往 **${targetLocation}**。\n🎯 目前目標鎖定：接觸 **${npcName}**，補齊「${evidenceName}」。`
    : `🧭 你沒有硬闖下一段戰線，而是依照前面蒐到的口供，先移動到 **${targetLocation}** 佈點。\n🎯 下一步：在當地接觸 **${npcName}**，把「${evidenceName}」拿到手。`;
  return {
    fromLocation: currentLocation,
    targetLocation,
    npcName,
    evidenceName,
    appendText,
    memory: `你為了本區主線，從 ${currentLocation} 轉往 ${targetLocation} 追查 ${npcName}。`
  };
}

function getTruthGatePrompt(player = null, location = '') {
  const state = ensureMainStoryState(player);
  if (!state) return '';
  updateIslandRoutesMissionFromKings(state);
  const level = getTruthDisclosureLevel(player);
  const allow = TRUTH_TIERS[Math.max(0, level - 1)] || TRUTH_TIERS[0];
  const next = TRUTH_TIERS[Math.min(TRUTH_TIERS.length - 1, level)] || null;
  const mission = getCurrentRegionMission(player, location || player?.location || '');
  let missionLine = '本區關鍵任務：先用在地線索接近關鍵人物，再推進證據鏈。請以自然敘事表達，勿把規則句直接寫進故事或選項。';
  if (mission) {
    if (mission.regionId === 'island_routes') {
      missionLine = `本區關鍵任務：四巨頭戰線必須在「群島航線」完成；在此之前只能鋪陳追蹤/備戰，不能寫成已取得「${mission.evidenceName}」。狀態：${mission.keyFound ? '已完成' : '未完成'}`;
    } else {
      missionLine = `本區關鍵任務：僅在「${mission.npcLocation || '指定地點'}」與「${mission.npcName}」這條線能推進到「${mission.evidenceName}」；其他地點最多只能拿到過渡線索。狀態：${mission.keyFound ? '已完成' : '未完成'}`;
    }
  }
  const nextLine = next ? `下一層僅可做懷疑預告：${next.allow}` : '你已在終局層，可進入平衡重建敘事。';
  return [
    '【跨島真相邊界（硬規則）】',
    `目前真相層級：L${level}/6`,
    `可當既定事實：${allow.allow}`,
    `禁止當既定事實：${allow.forbid}`,
    nextLine,
    missionLine
  ].join('\n');
}

function recordActionEvidence(player, context = {}) {
  const state = ensureMainStoryState(player);
  if (!state || state.completed) return null;
  const regionId = String(context?.regionId || getRegionIdByLocation(context?.location || player?.location || '')).trim();
  if (!regionId) return null;
  updateIslandRoutesMissionFromKings(state);
  return inferMissionUnlockByAction(state, {
    regionId,
    location: String(context?.location || player?.location || '').trim(),
    selectedChoice: context?.selectedChoice,
    eventAction: context?.eventAction,
    resultType: context?.resultType,
    resultMessage: context?.resultMessage,
    npcName: context?.npcName,
    enemyName: context?.enemyName,
    victory: context?.victory,
    storyTurns: context?.storyTurns,
    turnsInLocation: context?.turnsInLocation
  });
}

function getIslandContext(player, location = '') {
  const loc = String(location || player?.location || '').trim() || '當前地區';
  const islandState = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
    ? ISLAND_STORY.getIslandStoryState(player, loc)
    : null;
  const stageCount = Math.max(1, Number(islandState?.stageCount || 8));
  const stage = Math.max(1, Number(islandState?.stage || 1));
  const chapter = ISLAND_STORY && typeof ISLAND_STORY.getStoryChapterTitle === 'function'
    ? String(ISLAND_STORY.getStoryChapterTitle(loc) || '島內篇章').trim()
    : '島內篇章';
  const roadmap = ISLAND_STORY && typeof ISLAND_STORY.getStoryRoadmap === 'function'
    ? ISLAND_STORY.getStoryRoadmap(loc, stageCount)
    : [];
  const stageIdx = Math.max(0, Math.min(Math.max(0, stageCount - 1), stage - 1));
  const stageGoal = String((Array.isArray(roadmap) && roadmap[stageIdx]) || '').trim();
  const nextPrimary = ISLAND_STORY && typeof ISLAND_STORY.getNextPrimaryLocation === 'function'
    ? String(ISLAND_STORY.getNextPrimaryLocation(loc) || '').trim()
    : '';
  const nextPortalHub = nextPrimary ? String(getLocationPortalHub(nextPrimary) || '').trim() : '';

  return {
    location: loc,
    chapter,
    stage,
    stageCount,
    stageGoal,
    nextPrimary,
    nextPortalHub
  };
}

function buildMainlineBeatText(player, state, beat, extras = {}) {
  const ctx = getIslandContext(player, extras.location || player?.location || '');
  const seed = Number(state?.eventCount || 0);
  const goalLine = ctx.stageGoal ? `當前落點：${ctx.stageGoal}` : '';

  switch (beat) {
    case 'act1_anomaly':
      return pickVariant([
        `📖 **主線異動**：你在${ctx.location}發現一支「新手友善供應」隊伍正快速收客，開價低得不尋常。${goalLine ? `\n${goalLine}` : ''}`,
        `📖 **主線異動**：${ctx.location}出現過度友善的低價服務，吸走了大量注意力。${goalLine ? `\n${goalLine}` : ''}`
      ], seed);
    case 'act2_whispers':
      return pickVariant([
        `📖 **主線異動**：${ctx.location}流言升溫，有人回報「上架很快、成交很慢」，低價供應線的貨流開始不對勁。`,
        `📖 **主線異動**：你在${ctx.location}聽見相同傳聞反覆出現：價格漂亮，但實際流動性很差。`
      ], seed);
    case 'act3_marked':
      return pickVariant([
        `📖 **主線異動**：你追查到「宣稱有貨、實際無貨」的交易糾紛後，行蹤開始被人標記。`,
        `📖 **主線異動**：你剛靠近供應鏈缺口，就察覺有人在記錄你的路線與停留節點。`
      ], seed);
    case 'act4_pressure':
      return pickVariant([
        `📖 **主線異動**：跟監壓力升高，對方開始試探你的節奏，還沒正面動手。`,
        `📖 **主線異動**：你在${ctx.location}明顯感到尾隨存在，對手正在等你露出破口。`
      ], seed);
    case 'act4_probe':
      return pickVariant([
        `📖 **主線異動**：追兵已貼近，但仍停在試探距離；你有一個短窗口可先佈局。`,
        `📖 **主線異動**：對方沒有立刻開戰，卻持續壓縮你的活動空間。`
      ], seed);
    case 'act4_side': {
      const side = String(extras.side || '未定').trim();
      return pickVariant([
        `📖 **主線異動**：市場戰況升級，你目前的行動傾向被判定為「${side}」。`,
        `📖 **主線異動**：你的決策軌跡已形成明顯立場：${side}。`
      ], seed);
    }
    case 'act5_all_defeated':
      return pickVariant([
        '📖 **主線異動**：四巨頭已全數潰退，終章入口正在打開。',
        '📖 **主線異動**：四巨頭戰線收束完成，最終抉擇階段即將展開。'
      ], seed);
    case 'act5_king_hunt': {
      const king = String(extras.king || '目標').trim();
      const cleared = Math.max(0, Number(extras.cleared || 0));
      return pickVariant([
        `📖 **主線異動**：四巨頭追擊戰鎖定「${king}」，目前擊破進度 ${cleared}/${DIGITAL_KINGS.length}。`,
        `📖 **主線異動**：你鎖定四巨頭「${king}」活動區，戰線進度 ${cleared}/${DIGITAL_KINGS.length}。`
      ], seed);
    }
    case 'act6_remaining_kings': {
      const remaining = Array.isArray(extras.remaining) ? extras.remaining.filter(Boolean).join('、') : '';
      return `📖 **主線線索**：終章前仍需清掉未完成目標：${remaining || '四巨頭殘餘'}。`;
    }
    case 'act6_ending': {
      const ending = String(extras.ending || '未定').trim();
      return `📖 **主線終局**：真相公開後，你把世界線收束到【${ending}】。`;
    }
    default:
      return '';
  }
}

function buildTravelGateHint(state, required, completed, player = null) {
  const need = Math.max(0, Number(required || 0) - Number(completed || 0));
  if (need <= 0) return '';
  const eventCount = Number(state?.eventCount || 0);
  const lastHintAt = Number(state?.lastTravelHintEventCount || -999);
  if (eventCount - lastHintAt < 2) return '';
  state.lastTravelHintEventCount = eventCount;
  const ctx = getIslandContext(player, player?.location || '');
  const portalTarget = ctx.nextPortalHub || ctx.nextPrimary || '下一個可用地區';
  return [
    `📖 **主線線索**：你在${ctx.location}已拿到可延伸線索，下一步需要跨區驗證。`,
    ctx.stageGoal ? `當前落點：${ctx.stageGoal}` : '',
    `請靠近主傳送門，朝「${portalTarget}」推進；尚需完成 ${need} 個地區篇章。`,
    `${ctx.chapter}｜${ctx.stage}/${ctx.stageCount}`
  ].filter(Boolean).join('\n');
}

function normalizeKingProgressState(state) {
  if (!state || typeof state !== 'object') return;
  if (!Array.isArray(state.defeatedKings)) state.defeatedKings = [];
  state.defeatedKings = state.defeatedKings
    .map((name) => String(name || '').trim())
    .filter((name, idx, arr) => DIGITAL_KINGS.includes(name) && arr.indexOf(name) === idx);
  if (!Number.isFinite(Number(state.lastKingEncounterEventCount))) {
    state.lastKingEncounterEventCount = -999;
  }
  if (state.pendingKing != null) {
    const pending = String(state.pendingKing || '').trim();
    state.pendingKing = DIGITAL_KINGS.includes(pending) ? pending : null;
  } else {
    state.pendingKing = null;
  }
}

function getRemainingKings(state) {
  normalizeKingProgressState(state);
  const defeated = new Set(state.defeatedKings || []);
  return DIGITAL_KINGS.filter((name) => !defeated.has(name));
}

function ensureMainStoryState(player) {
  if (!player) return null;
  if (!player.mainStory || typeof player.mainStory !== 'object') {
    player.mainStory = {
      act: 1,
      node: 'act1_market',
      side: null,
      completed: false,
      ending: null,
      history: [],
      pressure: 0,
      eventCount: 0,
      lastTravelHintEventCount: -999,
      lastAssassinPressureEventCount: -999,
      lastMissionAutoTravelTurn: -999,
      defeatedKings: [],
      lastKingEncounterEventCount: -999,
      pendingKing: null,
      signals: {
        order: 0,
        chaos: 0,
        control: 0
      }
    };
  }
  if (!player.mainStory.signals) {
    player.mainStory.signals = { order: 0, chaos: 0, control: 0 };
  }
  if (typeof player.mainStory.eventCount !== 'number') {
    player.mainStory.eventCount = 0;
  }
  if (!Number.isFinite(Number(player.mainStory.lastTravelHintEventCount))) {
    player.mainStory.lastTravelHintEventCount = -999;
  }
  if (!Number.isFinite(Number(player.mainStory.lastAssassinPressureEventCount))) {
    player.mainStory.lastAssassinPressureEventCount = -999;
  }
  if (!Number.isFinite(Number(player.mainStory.lastMissionAutoTravelTurn))) {
    player.mainStory.lastMissionAutoTravelTurn = -999;
  }
  normalizeKingProgressState(player.mainStory);
  ensureMissionState(player.mainStory);
  updateIslandRoutesMissionFromKings(player.mainStory);
  if (player.mainStory.mission?.regions?.central_core?.keyFound) {
    player.mainStory.mission.hunterUnlocked = true;
  }
  return player.mainStory;
}

function getMainStoryBrief(player) {
  const state = ensureMainStoryState(player);
  if (!state) return '主線未初始化';
  const endingText = state.ending ? `｜結局：${state.ending}` : '';
  const kingProgressText =
    Number(state.act || 1) >= 5 || state.node === 'act6_winchman'
      ? `｜四巨頭：${Number((state.defeatedKings || []).length)}/${DIGITAL_KINGS.length}`
      : '';
  const truthLevel = getTruthDisclosureLevel(player);
  return `${STORY_ACTS[state.act] || '未知章節'}｜節點：${state.node}${kingProgressText}｜真相L${truthLevel}${endingText}`;
}

function pushHistory(state, text) {
  state.history.unshift({ text, at: Date.now() });
  if (state.history.length > 24) state.history.pop();
}

function markNode(state, act, node, note) {
  state.act = act;
  state.node = node;
  if (note) pushHistory(state, note);
}

function addSignal(state, key, amount) {
  state.signals[key] = (state.signals[key] || 0) + amount;
}

function absorbPlayerBehavior(state, event, result) {
  const action = String(event?.action || '');
  const type = String(result?.type || '');

  state.eventCount += 1;

  if (['gossip', 'social', 'quest', 'help', 'rest', 'meditate', 'forage', 'hunt'].includes(action)) {
    addSignal(state, 'order', 2);
  }
  if (['fight', 'rob', 'assassinate', 'extort', 'wish_pool'].includes(action)) {
    addSignal(state, 'chaos', 2);
  }
  if (['explore', 'teleport', 'treasure', 'wish_pool', 'shop'].includes(action)) {
    addSignal(state, 'control', 1);
  }

  if (type === 'combat') addSignal(state, 'chaos', 1);
  if (type === 'wish_pool') addSignal(state, 'control', 2);
}

function chooseEnding(state) {
  const order = state.signals.order || 0;
  const chaos = state.signals.chaos || 0;
  const control = state.signals.control || 0;

  if (control >= Math.max(order, chaos) + 2) return '控制者';
  if (order >= chaos) return '秩序';
  return '混亂';
}

function finalizeEnding(state, player) {
  const ending = chooseEnding(state);
  state.ending = ending;
  state.completed = true;
  state.node = 'epilogue';

  if (ending === '秩序') {
    state.worldRule = { mode: 'order', ...ENDING_RULES.order };
  } else if (ending === '混亂') {
    state.worldRule = { mode: 'chaos', ...ENDING_RULES.chaos };
  } else {
    state.worldRule = { mode: 'controller', ...ENDING_RULES.controller, controllerId: player?.id || '' };
  }

  pushHistory(state, `Act 6 結局：${ending}`);
  return ending;
}

function buildMaskedAssassinEncounter() {
  const enemy = {
    id: 'masked_assassin_story',
    name: '覆面獵手',
    hp: 130,
    maxHp: 130,
    attack: 32,
    defense: 12,
    moves: BATTLE.buildEnemyMoveLoadout('覆面獵手', 12, ['突襲', '奪包', '煙霧'], {
      villain: true,
      attack: 32
    }),
    reward: { gold: [70, 130] },
    isMonster: true
  };
  return sanitizeWorldObject({
    type: 'combat',
    message: '💀 你被暗潮勢力注意到了。覆面獵手夜襲而來，先試你深淺。',
    enemy,
    canFlee: true,
    fleeRate: 0.7,
    fleeAttempts: 2
  });
}

function buildKingEncounter(forcedKing = '') {
  const king = DIGITAL_KINGS.includes(String(forcedKing || '').trim())
    ? String(forcedKing || '').trim()
    : DIGITAL_KINGS[Math.floor(Math.random() * DIGITAL_KINGS.length)];
  const kingEnemy = BATTLE.createDigitalKingEnemy(king);
  return sanitizeWorldObject({
    king,
    encounter: {
      type: 'combat',
      message: `👑 四巨頭「${king}」現身，變異寵物在你面前失控咆哮。`,
      enemy: kingEnemy,
      canFlee: true,
      fleeRate: 0.7,
      fleeAttempts: 2
    }
  });
}

function maybeTriggerPassiveStory(player, context = {}) {
  const state = ensureMainStoryState(player);
  if (!state || state.completed) return null;

  const event = context.event || {};
  const result = context.result || {};
  const wantedPressure = getStoryWantedPressure(player, context);
  state.pressure = Math.max(0, Number(state.pressure || 0), wantedPressure);
  absorbPlayerBehavior(state, event, result);

  const count = state.eventCount;
  const completedLocations = getCompletedLocationCount(player);
  const triggered = {
    appendText: '',
    overrideResult: null,
    announcement: '',
    memory: ''
  };

  if (state.node === 'act1_market' && count >= 2) {
    markNode(state, 1, 'act1_anomaly', 'Act1 -> 市場誘惑被看見');
    triggered.appendText = buildMainlineBeatText(player, state, 'act1_anomaly');
    triggered.memory = '你注意到一股看似友善的新勢力正在搶占市場信任。';
    return triggered;
  }

  if (state.node === 'act1_anomaly' && count >= 4) {
    markNode(state, 2, 'act2_whispers', 'Act2 -> 流言啟動');
    triggered.appendText = buildMainlineBeatText(player, state, 'act2_whispers');
    triggered.announcement = '🗣️ 市場流言升溫：某支常幫新手的隊伍，帳本來源與實際成交量出現異常。';
    triggered.memory = '你聽見「某低價供應線看似熱賣、其實流動性很差」的傳言。';
    return triggered;
  }

  if (state.node === 'act2_whispers' && count >= 6) {
    if (!isMissionKeyFound(state, 'central_core')) {
      triggered.appendText = '📖 **主線線索**：你還缺少第一關可驗證核心（雙鑑衝突原始單），追兵暫未全面出手。';
      triggered.memory = '你尚未掌握第一關核心證據，主線停在觀察與追查。';
      return triggered;
    }
    if (completedLocations < 1) {
      const travelHint = buildTravelGateHint(state, 1, completedLocations, player);
      if (!travelHint) return null;
      triggered.appendText = travelHint;
      triggered.memory = '你需要跨區追查，主線才會繼續推進。';
      return triggered;
    }
    markNode(state, 3, 'act3_marked', 'Act3 -> 被盯上');
    triggered.appendText = buildMainlineBeatText(player, state, 'act3_marked');
    triggered.memory = '你聽見低價供應鏈出現「流動性差、空單偽造」的風聲，並因此被對方注意到。';
    return triggered;
  }

  if (state.node === 'act3_marked' && count >= 8) {
    if (!isMissionKeyFound(state, 'central_core')) {
      triggered.appendText = '📖 **主線線索**：先補齊第一關核心證據，再談追兵壓力升級。';
      triggered.memory = '第一關關鍵證據尚未到位，追兵壓力仍停在試探層。';
      return triggered;
    }
    if (completedLocations < 1) {
      const travelHint = buildTravelGateHint(state, 1, completedLocations, player);
      if (!travelHint) return null;
      triggered.appendText = travelHint;
      triggered.memory = '你仍在同一區，主線暫時卡在追查階段。';
      return triggered;
    }
    markNode(state, 4, 'act4_war', 'Act4 -> 蒙面狩獵觸發');
    state.lastAssassinPressureEventCount = count;
    triggered.appendText = buildMainlineBeatText(player, state, 'act4_pressure');
    triggered.memory = '你被暗潮勢力盯上，追兵開始尾隨試探。';
    return triggered;
  }

  if (state.node === 'act4_war' && count < 10) {
    const sinceLastPressure = count - Number(state.lastAssassinPressureEventCount || -999);
    const pressureLevel = clamp(Math.max(wantedPressure, Number(state.pressure || 0)), 0, 10);
    const dynamicGap = Math.max(1, ASSASSIN_PRESSURE_GAP_EVENTS - Math.floor(pressureLevel / 2));
    const dynamicAmbushChance = clamp(0.38 + pressureLevel * 0.06, 0.38, 0.95);
    if (count >= 9 && sinceLastPressure >= dynamicGap) {
      state.lastAssassinPressureEventCount = count;
      if (Math.random() < dynamicAmbushChance) {
        triggered.overrideResult = buildMaskedAssassinEncounter();
        triggered.announcement = `💀 ${player.name}遭遇了暗潮覆面獵手的狩獵測試。`;
        triggered.memory = `覆面獵手現身並發動突襲（通緝壓力 Lv.${pressureLevel}）。`;
      } else {
        triggered.appendText = buildMainlineBeatText(player, state, 'act4_probe');
        triggered.memory = `追兵尚未開戰，但你確定自己正在被鎖定（通緝壓力 Lv.${pressureLevel}）。`;
      }
      return triggered;
    }
  }

  if (state.node === 'act4_war' && count >= 10) {
    if (!isMissionKeyFound(state, 'northern_highland')) {
      triggered.appendText = '📖 **主線線索**：你還缺「夜冕主宰鏈路密鑰」，四巨頭戰線暫不開啟。先鎖定雪白山莊的滲透聯絡員。';
      triggered.memory = '第四關關鍵證據未到手，尚不能直連四巨頭。';
      return triggered;
    }
    if (completedLocations < 2) {
      const travelHint = buildTravelGateHint(state, 2, completedLocations, player);
      if (!travelHint) return null;
      triggered.appendText = travelHint;
      triggered.memory = '你需要走訪更多地區，市場戰爭才會升級。';
      return triggered;
    }
    state.side = (state.signals.chaos || 0) > (state.signals.order || 0)
      ? 'Digital（機變策略）'
      : 'Renaiss（秩序）';
    markNode(state, 5, 'act5_kings', `Act5 -> 市場戰爭立場：${state.side}`);
    triggered.appendText = buildMainlineBeatText(player, state, 'act4_side', { side: state.side });
    triggered.announcement = `⚔️ 市場戰爭進入白熱化，${player.name}立場傾向 ${state.side}。`;
    triggered.memory = `你在市場戰爭中的傾向為 ${state.side}。`;
    return triggered;
  }

  if (state.node === 'act5_kings' && count >= 13) {
    if (completedLocations < 2) {
      const travelHint = buildTravelGateHint(state, 2, completedLocations, player);
      if (!travelHint) return null;
      triggered.appendText = travelHint;
      triggered.memory = '你尚未累積足夠跨區戰績，四巨頭暫未現身。';
      return triggered;
    }
    normalizeKingProgressState(state);
    const remainingKings = getRemainingKings(state);
    if (remainingKings.length === 0) {
      markNode(state, 6, 'act6_winchman', 'Act6 前置 -> 四巨頭全滅');
      triggered.appendText = buildMainlineBeatText(player, state, 'act5_all_defeated');
      triggered.announcement = `🏁 ${player.name}已擊破四巨頭，最終章即將開啟。`;
      triggered.memory = '你已擊敗四巨頭，終章只差最後抉擇。';
      return triggered;
    }
    const sinceLastEncounter = count - Number(state.lastKingEncounterEventCount || -999);
    if (sinceLastEncounter < KING_ENCOUNTER_GAP_EVENTS) {
      return null;
    }
    const preferredKing = state.pendingKing && remainingKings.includes(state.pendingKing)
      ? state.pendingKing
      : remainingKings[Math.floor(Math.random() * remainingKings.length)];
    state.pendingKing = preferredKing;
    state.lastKingEncounterEventCount = count;
    const kingData = buildKingEncounter(preferredKing);
    triggered.overrideResult = kingData.encounter;
    triggered.appendText = buildMainlineBeatText(player, state, 'act5_king_hunt', {
      king: kingData.king,
      cleared: (state.defeatedKings || []).length
    });
    triggered.announcement = `👑 ${player.name}遭遇四巨頭「${kingData.king}」的追擊。`;
    triggered.memory = `你與四巨頭 ${kingData.king} 交手。`;
    return triggered;
  }

  if (state.node === 'act6_winchman' && count >= 16) {
    const remainingKings = getRemainingKings(state);
    if (remainingKings.length > 0) {
      triggered.appendText = buildMainlineBeatText(player, state, 'act6_remaining_kings', { remaining: remainingKings });
      triggered.memory = `你尚未擊敗全部四巨頭：${remainingKings.join('、')}。`;
      return triggered;
    }
    if (completedLocations < 3) {
      const travelHint = buildTravelGateHint(state, 3, completedLocations, player);
      if (!travelHint) return null;
      triggered.appendText = travelHint;
      triggered.memory = '終局前仍需跨區蒐證，避免在單一地區收束主線。';
      return triggered;
    }
    const ending = finalizeEnding(state, player);
    triggered.appendText = buildMainlineBeatText(player, state, 'act6_ending', { ending });
    triggered.announcement = `🌍 ${player.name}完成主線終局，世界偏向「${ending}」路徑。`;
    triggered.memory = `你完成主線並走向「${ending}」結局。`;
    return triggered;
  }

  return null;
}

function recordCombatOutcome(player, context = {}) {
  const state = ensureMainStoryState(player);
  if (!state || state.completed) return null;
  normalizeKingProgressState(state);

  const victory = Boolean(context?.victory);
  if (!victory) return null;
  const enemyName = String(context?.enemyName || '').trim();
  if (!enemyName) return null;

  const missionTriggered = recordActionEvidence(player, {
    location: context?.location || player?.location || '',
    enemyName,
    victory: true
  });

  const defeatedKing = DIGITAL_KINGS.find((name) => enemyName === name || enemyName.includes(name));
  if (!defeatedKing) return missionTriggered || null;
  if (state.defeatedKings.includes(defeatedKing)) return null;

  state.defeatedKings.push(defeatedKing);
  state.pendingKing = state.pendingKing === defeatedKing ? null : state.pendingKing;
  updateIslandRoutesMissionFromKings(state);
  const cleared = state.defeatedKings.length;
  const remainingKings = getRemainingKings(state);

  const progressLines = [
    `👑 **四巨頭進度更新**：你擊破了「${defeatedKing}」，戰線推進到 ${cleared}/${DIGITAL_KINGS.length}。`,
    `👑 **四巨頭進度更新**：目標「${defeatedKing}」已被你壓制，累積進度 ${cleared}/${DIGITAL_KINGS.length}。`
  ];
  const triggered = {
    appendText: pickVariant(progressLines, Number(state?.eventCount || 0) + cleared),
    announcement: `👑 ${player?.name || '玩家'}擊破四巨頭「${defeatedKing}」。（${cleared}/${DIGITAL_KINGS.length}）`,
    memory: `你擊敗四巨頭 ${defeatedKing}，目前進度 ${cleared}/${DIGITAL_KINGS.length}。`
  };

  if (remainingKings.length === 0 && state.node === 'act5_kings') {
    markNode(state, 6, 'act6_winchman', 'Act6 前置 -> 四巨頭全滅');
    triggered.appendText += '\n📖 四巨頭全滅，終章入口已解鎖。';
    triggered.announcement = `🏁 ${player?.name || '玩家'}已擊破四巨頭，終章入口開啟。`;
    triggered.memory = '你已擊敗全部四巨頭，終章即將展開。';
  }

  if (missionTriggered?.appendText) {
    triggered.appendText = `${triggered.appendText}\n${missionTriggered.appendText}`.trim();
  }
  if (missionTriggered?.memory) {
    triggered.memory = `${triggered.memory}\n${missionTriggered.memory}`.trim();
  }

  return triggered;
}

function getWorldRuleProfile(player) {
  const state = ensureMainStoryState(player);
  return state?.worldRule || null;
}

function getMainStoryChoice() {
  // 被動觸發版：不再提供固定主線按鈕
  return null;
}

function resolveMainStoryAction(player) {
  // 舊流程相容：若玩家點到舊版按鈕，只回提示
  ensureMainStoryState(player);
  return {
    result: {
      type: 'main_story',
      message: '📖 主線已改為被動觸發：你在開放世界行動時會自然推進劇情。'
    },
    announcement: null
  };
}

module.exports = {
  STORY_ACTS,
  DIGITAL_KINGS,
  ENDING_RULES,
  ensureMainStoryState,
  getMainStoryBrief,
  getTruthDisclosureLevel,
  getTruthGatePrompt,
  getCurrentRegionMission,
  suggestMissionAutoTravel,
  recordActionEvidence,
  maybeTriggerMissionNpcLead,
  getMainStoryChoice,
  resolveMainStoryAction,
  maybeTriggerPassiveStory,
  getWorldRuleProfile,
  recordCombatOutcome
};
