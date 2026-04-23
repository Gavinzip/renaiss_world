const {
  computeAlignmentProfileFromDynamicState
} = require('./alignment-profile-utils');

function clampNumber(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max, fallback = min) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizeLocationName(raw = '') {
  return String(raw || '').trim().slice(0, 40);
}

function normalizeFaction(raw = '') {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return 'none';
  if (['beacon', 'alliance', 'order', '正派', '信標聯盟', '信标联盟'].includes(text)) return 'beacon';
  if (['gray', 'neutral', '灰域', '機變派', '机变派', '灰域協定', '灰域协定'].includes(text)) return 'gray';
  if (['digital', 'dark', '反派', '暗潮', '黑市'].includes(text)) return 'digital';
  if (['civic', 'civil', 'city', 'citywatch', '市民', '居民'].includes(text)) return 'civic';
  return 'none';
}

function normalizeStyleTag(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return '';
  const clean = text.replace(/[\[\]【】]/g, '').trim();
  return clean.slice(0, 8);
}

const SECRET_REALM_COOLDOWN_TURNS = clampInt(process.env.SECRET_REALM_COOLDOWN_TURNS, 3, 30, 8);
const COMBAT_WANTED_CUE_RE = /(⚔️會戰鬥|⚔️会战斗|會進入戰鬥|会进入战斗|戰鬥|战斗|交戰|交战|battle|搏鬥|搏斗|對戰|对战|전투|교전|전투\s*진입)/iu;
const ROBBERY_WANTED_CUE_RE = /(強奪|搶奪|搶劫|打劫|劫掠|掠奪|勒索|劫道)/u;
const AGGRESSIVE_WANTED_CUE_RE = /(🔥高風險|攔截|突襲|夜襲|伏擊|劫)/u;
const SOCIAL_SOFT_CUE_RE = /(🤝需社交|談判|協商|拜訪|詢問|聯絡|交涉)/u;

function buildDefaultState() {
  return {
    factionRep: {
      beacon: 0,
      gray: 0,
      digital: 0,
      civic: 0
    },
    moralityAxes: {
      law: 0,
      harm: 0,
      trust: 0,
      selfInterest: 0
    },
    wantedByLocation: {},
    pressureByLocation: {},
    recentEvents: [],
    activeChainByLocation: {},
    lastGeneratedTurn: 0,
    lastSecretRealmTurn: 0
  };
}

function ensureDynamicWorldState(player = null) {
  if (!player || typeof player !== 'object') return { changed: false, state: buildDefaultState() };
  const before = JSON.stringify(player.dynamicWorld || null);
  const raw = player.dynamicWorld && typeof player.dynamicWorld === 'object' && !Array.isArray(player.dynamicWorld)
    ? player.dynamicWorld
    : {};

  const state = buildDefaultState();
  const rep = raw.factionRep && typeof raw.factionRep === 'object' ? raw.factionRep : {};
  state.factionRep.beacon = clampInt(rep.beacon, -120, 120, 0);
  state.factionRep.gray = clampInt(rep.gray, -120, 120, 0);
  state.factionRep.digital = clampInt(rep.digital, -120, 120, 0);
  state.factionRep.civic = clampInt(rep.civic, -120, 120, 0);

  const axes = raw.moralityAxes && typeof raw.moralityAxes === 'object' ? raw.moralityAxes : {};
  state.moralityAxes.law = clampInt(axes.law, -120, 120, 0);
  state.moralityAxes.harm = clampInt(axes.harm, -120, 120, 0);
  state.moralityAxes.trust = clampInt(axes.trust, -120, 120, 0);
  state.moralityAxes.selfInterest = clampInt(axes.selfInterest, -120, 120, 0);

  const wantedByLocation = raw.wantedByLocation && typeof raw.wantedByLocation === 'object' ? raw.wantedByLocation : {};
  for (const [loc, val] of Object.entries(wantedByLocation)) {
    const key = normalizeLocationName(loc);
    if (!key) continue;
    state.wantedByLocation[key] = clampInt(val, 0, 12, 0);
  }

  const pressureByLocation = raw.pressureByLocation && typeof raw.pressureByLocation === 'object' ? raw.pressureByLocation : {};
  for (const [loc, val] of Object.entries(pressureByLocation)) {
    const key = normalizeLocationName(loc);
    if (!key) continue;
    state.pressureByLocation[key] = clampNumber(val, 0, 24, 0);
  }

  const recentEvents = Array.isArray(raw.recentEvents) ? raw.recentEvents : [];
  state.recentEvents = recentEvents
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      location: normalizeLocationName(row.location || ''),
      archetype: String(row.archetype || '').trim().slice(0, 32),
      phase: String(row.phase || '').trim().slice(0, 20),
      turn: Math.max(0, Number(row.turn || 0)),
      at: Math.max(0, Number(row.at || 0))
    }))
    .filter((row) => row.location && row.archetype)
    .slice(-18);

  const chains = raw.activeChainByLocation && typeof raw.activeChainByLocation === 'object' ? raw.activeChainByLocation : {};
  for (const [loc, row] of Object.entries(chains)) {
    const key = normalizeLocationName(loc);
    if (!key || !row || typeof row !== 'object') continue;
    state.activeChainByLocation[key] = {
      archetype: String(row.archetype || '').trim().slice(0, 32),
      stage: clampInt(row.stage, 1, 6, 1),
      intensity: clampInt(row.intensity, 1, 5, 1),
      lastPhase: String(row.lastPhase || '').trim().slice(0, 20),
      updatedTurn: Math.max(0, Number(row.updatedTurn || 0)),
      expiresTurn: Math.max(0, Number(row.expiresTurn || 0))
    };
  }

  state.lastGeneratedTurn = Math.max(0, Number(raw.lastGeneratedTurn || 0));
  state.lastSecretRealmTurn = Math.max(0, Number(raw.lastSecretRealmTurn || 0));

  player.dynamicWorld = state;
  const after = JSON.stringify(state);
  return { changed: before !== after, state };
}

function inferHiddenMetaFromText(choice = {}, options = {}) {
  const text = [choice?.styleTag || '', choice?.tag || '', choice?.name || '', choice?.choice || '', choice?.desc || ''].join(' ');
  let law = 0;
  let harm = 0;
  let trust = 0;
  let selfInterest = 0;
  let witnessRisk = 0.25;

  if (/(搶|搶奪|強奪|奪取|脅迫|勒索|夜襲|劫|埋伏|偷走|私吞|占為己有|佔為己有)/u.test(text)) {
    law -= 2;
    harm += 1;
    trust -= 2;
    selfInterest += 2;
    witnessRisk = 0.68;
  }
  if (/(救援|護送|保護|交還|回報|協助|通報|作證|驗證|公開|調查|查核|核對)/u.test(text)) {
    law += 1;
    trust += 1;
    harm -= 1;
    witnessRisk = Math.min(witnessRisk, 0.32);
  }
  if (/(談判|交涉|協商|交換|套話|拜訪|詢問)/u.test(text)) {
    trust += 1;
    witnessRisk = Math.min(witnessRisk, 0.4);
  }
  if (/(潛入|跟蹤|尾隨|監視|設局|攔截|伏擊)/u.test(text)) {
    law -= 1;
    selfInterest += 1;
    witnessRisk = Math.max(witnessRisk, 0.55);
  }

  const locationWanted = Math.max(0, Number(options.locationWanted || 0));
  if (locationWanted >= 4) witnessRisk = Math.max(witnessRisk, 0.62);

  return {
    law: clampInt(law, -2, 2, 0),
    harm: clampInt(harm, -2, 2, 0),
    trust: clampInt(trust, -2, 2, 0),
    selfInterest: clampInt(selfInterest, -2, 2, 0),
    targetFaction: 'none',
    witnessRisk: clampNumber(witnessRisk, 0, 1, 0.3)
  };
}

function normalizeChoiceHiddenMeta(raw = null, fallbackChoice = null, options = {}) {
  let meta = raw;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = null;
    }
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return inferHiddenMetaFromText(fallbackChoice || {}, options);
  }

  const normalized = {
    law: clampInt(meta.law, -2, 2, 0),
    harm: clampInt(meta.harm, -2, 2, 0),
    trust: clampInt(meta.trust, -2, 2, 0),
    selfInterest: clampInt(meta.selfInterest, -2, 2, 0),
    targetFaction: normalizeFaction(meta.targetFaction || meta.faction || 'none'),
    witnessRisk: clampNumber(meta.witnessRisk, 0, 1, 0.3),
    eventArchetype: String(meta.eventArchetype || meta.archetype || '').trim().slice(0, 32),
    intensity: clampInt(meta.intensity, 1, 5, 2)
  };

  const allZero =
    normalized.law === 0 &&
    normalized.harm === 0 &&
    normalized.trust === 0 &&
    normalized.selfInterest === 0;
  if (allZero) {
    return inferHiddenMetaFromText(fallbackChoice || {}, options);
  }
  return normalized;
}

function inferStyleTag(choice = {}, hiddenMeta = null) {
  const styleRaw = normalizeStyleTag(choice?.styleTag || choice?.style || '');
  if (styleRaw) return styleRaw;
  const meta = hiddenMeta || normalizeChoiceHiddenMeta(choice?.hiddenMeta, choice, {});
  if (meta.harm >= 1 && meta.selfInterest >= 1) return '強奪';
  if (meta.law >= 1 && meta.trust >= 1) return '穩健';
  if (meta.trust >= 1 && meta.law <= 0) return '交涉';
  if (meta.selfInterest >= 1 && meta.law <= 0) return '灰線';
  if (meta.harm >= 1) return '追獵';
  return '佈局';
}

function extractWantedChoiceCues(actionText = '') {
  const text = String(actionText || '');
  const combat = COMBAT_WANTED_CUE_RE.test(text);
  const robbery = ROBBERY_WANTED_CUE_RE.test(text);
  return {
    combat,
    robbery,
    aggressive: AGGRESSIVE_WANTED_CUE_RE.test(text) || combat || robbery,
    socialSoft: SOCIAL_SOFT_CUE_RE.test(text)
  };
}

function computeChoiceWantedDelta(hiddenMeta = {}, cues = {}) {
  const lawRisk = Math.max(0, -Number(hiddenMeta.law || 0));
  const harmRisk = Math.max(0, Number(hiddenMeta.harm || 0));
  const witnessAdd = hiddenMeta.witnessRisk >= 0.66 ? 2 : (hiddenMeta.witnessRisk >= 0.4 ? 1 : 0);
  const isMajorCrime = Boolean(cues.combat || cues.robbery);

  let wantedDelta = 0;
  if (isMajorCrime) {
    const majorCrimeScore =
      0.95 +
      lawRisk * 0.35 +
      harmRisk * 0.6 +
      witnessAdd * 0.45 +
      (cues.robbery ? 0.35 : 0) +
      (cues.combat ? 0.25 : 0);
    wantedDelta = clampInt(majorCrimeScore, 1, 4, 1);
  } else {
    // Keep normal choices close to zero; non-combat actions should rarely spike wanted.
    const generalRiskScore =
      lawRisk * 0.22 +
      harmRisk * 0.34 +
      witnessAdd * 0.24 +
      (cues.aggressive ? 0.2 : 0);
    wantedDelta = clampInt(Math.floor(generalRiskScore), 0, 1, 0);
    if (harmRisk >= 2 && witnessAdd >= 1) wantedDelta = 1;
  }

  if (hiddenMeta.law >= 1 && hiddenMeta.harm <= 0 && cues.socialSoft) {
    wantedDelta = Math.max(0, wantedDelta - 1);
  }

  return wantedDelta;
}

function applyChoiceConsequences(player = null, choice = {}, options = {}) {
  const ensured = ensureDynamicWorldState(player);
  const state = ensured.state;
  const location = normalizeLocationName(options.location || player?.location || '未知地點');
  if (!location) return {
    changed: ensured.changed,
    hiddenMeta: normalizeChoiceHiddenMeta(choice?.hiddenMeta, choice),
    styleTag: inferStyleTag(choice),
    factionDelta: { beacon: 0, gray: 0, digital: 0, civic: 0 },
    wantedDelta: 0,
    pressureDelta: 0,
    locationWanted: 0,
    locationPressure: 0
  };

  const hiddenMeta = normalizeChoiceHiddenMeta(choice?.hiddenMeta, choice, {
    locationWanted: Number(state.wantedByLocation[location] || 0)
  });
  const styleTag = inferStyleTag(choice, hiddenMeta);

  const actionText = [choice?.tag || '', choice?.name || '', choice?.choice || '', choice?.desc || '', styleTag].join(' ');
  const cues = extractWantedChoiceCues(actionText);
  const aggressiveCue = cues.aggressive ? 1 : 0;
  const socialSoftCue = cues.socialSoft ? 1 : 0;

  const factionDelta = {
    beacon: hiddenMeta.law + hiddenMeta.trust - Math.max(0, hiddenMeta.harm),
    gray: hiddenMeta.selfInterest + (hiddenMeta.law < 0 ? 1 : 0),
    digital: Math.max(0, -hiddenMeta.law) + Math.max(0, hiddenMeta.harm) + Math.max(0, hiddenMeta.selfInterest) - Math.max(0, hiddenMeta.trust),
    civic: hiddenMeta.law + hiddenMeta.trust - Math.max(0, hiddenMeta.selfInterest) - Math.max(0, hiddenMeta.harm)
  };

  if (hiddenMeta.targetFaction !== 'none') {
    const target = hiddenMeta.targetFaction;
    const targetDelta = clampInt(hiddenMeta.trust + hiddenMeta.law - hiddenMeta.harm - Math.max(0, hiddenMeta.selfInterest), -4, 4, 0);
    factionDelta[target] = clampInt((factionDelta[target] || 0) + targetDelta, -6, 6, factionDelta[target] || 0);
  }

  const wantedDelta = computeChoiceWantedDelta(hiddenMeta, cues);

  let pressureDelta =
    0.65 +
    Math.max(0, hiddenMeta.harm) * 0.95 +
    Math.max(0, hiddenMeta.selfInterest) * 0.62 +
    aggressiveCue * 0.8;
  if (socialSoftCue > 0) pressureDelta -= 0.18;
  if (hiddenMeta.law >= 1 && hiddenMeta.harm <= 0) pressureDelta -= 0.12;
  pressureDelta = clampNumber(pressureDelta, 0.2, 4.8, 0.6);

  state.factionRep.beacon = clampInt(state.factionRep.beacon + factionDelta.beacon, -120, 120, 0);
  state.factionRep.gray = clampInt(state.factionRep.gray + factionDelta.gray, -120, 120, 0);
  state.factionRep.digital = clampInt(state.factionRep.digital + factionDelta.digital, -120, 120, 0);
  state.factionRep.civic = clampInt(state.factionRep.civic + factionDelta.civic, -120, 120, 0);

  state.moralityAxes.law = clampInt(state.moralityAxes.law + hiddenMeta.law, -120, 120, 0);
  state.moralityAxes.harm = clampInt(state.moralityAxes.harm + hiddenMeta.harm, -120, 120, 0);
  state.moralityAxes.trust = clampInt(state.moralityAxes.trust + hiddenMeta.trust, -120, 120, 0);
  state.moralityAxes.selfInterest = clampInt(state.moralityAxes.selfInterest + hiddenMeta.selfInterest, -120, 120, 0);

  const prevWanted = Number(state.wantedByLocation[location] || 0);
  const prevPressure = Number(state.pressureByLocation[location] || 0);
  const nextWanted = clampInt(prevWanted + wantedDelta, 0, 12, prevWanted);
  const nextPressure = clampNumber(prevPressure + pressureDelta, 0, 24, prevPressure);
  state.wantedByLocation[location] = nextWanted;
  state.pressureByLocation[location] = nextPressure;

  const alignment = computeAlignmentProfileFromDynamicState(state, location);
  const topWanted = Object.values(state.wantedByLocation)
    .map((v) => Math.max(0, Number(v || 0)))
    .reduce((acc, cur) => Math.max(acc, cur), 0);
  player.wanted = Math.max(0, Math.floor(topWanted), Number(alignment.wantedFloor || 0));

  return {
    changed: true,
    hiddenMeta,
    styleTag,
    factionDelta,
    wantedDelta,
    pressureDelta: Number(pressureDelta.toFixed(2)),
    locationWanted: nextWanted,
    locationPressure: Number(nextPressure.toFixed(2))
  };
}

function advanceDynamicStateTurn(player = null, options = {}) {
  const ensured = ensureDynamicWorldState(player);
  const state = ensured.state;
  const location = normalizeLocationName(options.location || player?.location || '');
  const currentTurn = Math.max(0, Number(options.storyTurn || player?.storyTurns || 0));

  for (const [loc, value] of Object.entries(state.pressureByLocation || {})) {
    if (!loc) continue;
    const isCurrent = location && loc === location;
    const decay = isCurrent ? 0.03 : 0.09;
    const next = Math.max(0, Number(value || 0) * (1 - decay));
    state.pressureByLocation[loc] = Number(next.toFixed(2));
  }
  for (const [loc, value] of Object.entries(state.wantedByLocation || {})) {
    if (!loc) continue;
    const isCurrent = location && loc === location;
    const decay = isCurrent ? 0 : 0.05;
    const next = Math.max(0, Number(value || 0) - decay);
    state.wantedByLocation[loc] = Number(next.toFixed(2));
  }

  if (location) {
    const wanted = Math.max(0, Number(state.wantedByLocation[location] || 0));
    const passivePressureGain = clampNumber(0.22 + wanted * 0.09, 0.16, 1.36, 0.2);
    state.pressureByLocation[location] = clampNumber(
      Number(state.pressureByLocation[location] || 0) + passivePressureGain,
      0,
      24,
      0
    );
  }

  for (const [loc, chain] of Object.entries(state.activeChainByLocation || {})) {
    if (!chain || typeof chain !== 'object') continue;
    const expires = Math.max(0, Number(chain.expiresTurn || 0));
    if (expires > 0 && currentTurn > expires) {
      delete state.activeChainByLocation[loc];
    }
  }

  const alignment = computeAlignmentProfileFromDynamicState(state, location);
  const topWanted = Object.values(state.wantedByLocation)
    .map((v) => Math.max(0, Number(v || 0)))
    .reduce((acc, cur) => Math.max(acc, cur), 0);
  if (location) {
    const wantedFloor = Math.max(0, Number(alignment.wantedFloor || 0));
    const localWanted = Math.max(0, Number(state.wantedByLocation[location] || 0));
    if (localWanted < wantedFloor) {
      state.wantedByLocation[location] = wantedFloor;
    }
  }
  player.wanted = Math.max(0, Math.floor(topWanted), Number(alignment.wantedFloor || 0));

  return {
    changed: true,
    location,
    locationWanted: location ? Number(state.wantedByLocation[location] || 0) : 0,
    locationPressure: location ? Number(state.pressureByLocation[location] || 0) : 0
  };
}

function buildDynamicWorldContext(player = null, location = '', options = {}) {
  const ensured = ensureDynamicWorldState(player);
  const state = ensured.state;
  const loc = normalizeLocationName(location || player?.location || '');

  const rep = state.factionRep;
  const axes = state.moralityAxes;
  const wanted = Math.max(0, Number(state.wantedByLocation[loc] || 0));
  const pressure = Math.max(0, Number(state.pressureByLocation[loc] || 0));
  const alignment = computeAlignmentProfileFromDynamicState(state, loc);
  const recent = state.recentEvents
    .filter((row) => row.location === loc)
    .slice(-3)
    .map((row) => row.archetype)
    .filter(Boolean);
  const chain = state.activeChainByLocation[loc];

  const playerLang = String(options.playerLang || 'zh-TW').trim();
  if (playerLang === 'en') {
    const summary = `Dynamic pressure=${pressure.toFixed(2)} | local wanted=${wanted.toFixed(2)} | rep(beacon/gray/digital/civic)=${rep.beacon}/${rep.gray}/${rep.digital}/${rep.civic} | morality(law/harm/trust/self)=${axes.law}/${axes.harm}/${axes.trust}/${axes.selfInterest}${recent.length > 0 ? ` | recent=${recent.join('>')}` : ''}${chain?.archetype ? ` | chain=${chain.archetype}#${chain.stage}` : ''} | alignment(good/bad)=${alignment.goodScore}/${alignment.badScore}`;
    return {
      pressure,
      wanted,
      summary
    };
  }
  if (playerLang === 'zh-CN') {
    return {
      pressure,
      wanted,
      summary: `动态压力=${pressure.toFixed(2)}｜本区通缉热度=${wanted.toFixed(2)}｜阵营声望(联/灰/Digital/市民)=${rep.beacon}/${rep.gray}/${rep.digital}/${rep.civic}｜倾向(合法/伤害/守信/利己)=${axes.law}/${axes.harm}/${axes.trust}/${axes.selfInterest}｜善恶分=${alignment.goodScore}/${alignment.badScore}${recent.length > 0 ? `｜最近事件=${recent.join('>')}` : ''}${chain?.archetype ? `｜事件链=${chain.archetype}#${chain.stage}` : ''}`
    };
  }
  return {
    pressure,
    wanted,
    summary: `動態壓力=${pressure.toFixed(2)}｜本區通緝熱度=${wanted.toFixed(2)}｜陣營聲望(聯/灰/Digital/市民)=${rep.beacon}/${rep.gray}/${rep.digital}/${rep.civic}｜傾向(合法/傷害/守信/利己)=${axes.law}/${axes.harm}/${axes.trust}/${axes.selfInterest}｜善惡分=${alignment.goodScore}/${alignment.badScore}${recent.length > 0 ? `｜最近事件=${recent.join('>')}` : ''}${chain?.archetype ? `｜事件鏈=${chain.archetype}#${chain.stage}` : ''}`
  };
}

function weightedPick(entries = [], seedRand = Math.random()) {
  const list = Array.isArray(entries) ? entries.filter((x) => x && Number(x.weight) > 0) : [];
  if (list.length === 0) return null;
  const total = list.reduce((sum, row) => sum + Number(row.weight || 0), 0);
  if (total <= 0) return list[0] || null;
  let roll = clampNumber(seedRand, 0, 0.999999, 0.5) * total;
  for (const row of list) {
    roll -= Number(row.weight || 0);
    if (roll <= 0) return row;
  }
  return list[list.length - 1] || null;
}

function chooseDynamicEventPlan(player = null, location = '', options = {}) {
  const ensured = ensureDynamicWorldState(player);
  const state = ensured.state;
  const loc = normalizeLocationName(location || player?.location || '未知地點');
  const storyTurn = Math.max(0, Number(options.storyTurn || player?.storyTurns || 0));
  const pressure = Math.max(0, Number(state.pressureByLocation[loc] || 0));
  const wanted = Math.max(0, Number(state.wantedByLocation[loc] || 0));
  const alignment = computeAlignmentProfileFromDynamicState(state, loc);
  const chain = state.activeChainByLocation[loc];

  const baseChance = clampNumber(
    0.12 + pressure * 0.035 + wanted * 0.042 + Math.max(0, Number(alignment.badScore || 0) - 55) * 0.0024,
    0.08,
    0.82,
    0.2
  );
  const cooldown = Math.max(0, storyTurn - Number(state.lastGeneratedTurn || 0));
  const cooldownFactor = cooldown <= 1 ? 0.42 : (cooldown === 2 ? 0.72 : 1);
  const chainBoost = chain ? 0.18 : 0;
  const finalChance = clampNumber((baseChance + chainBoost) * cooldownFactor, 0.06, 0.9, baseChance);

  const force = Boolean(options.forceEvent);
  const forceByState = Boolean(
    (chain && pressure >= 3.2) ||
    pressure >= 6 ||
    wanted >= 5 ||
    Number(alignment.badScore || 0) >= 76
  );
  const shouldInject = force || forceByState || Math.random() < finalChance;
  if (!shouldInject) {
    return {
      inject: false,
      chance: Number(finalChance.toFixed(3)),
      pressure,
      wanted,
      archetype: ''
    };
  }

  const recentSameLoc = state.recentEvents
    .filter((row) => row.location === loc)
    .slice(-4)
    .map((row) => row.archetype);
  const storyText = String(options.storyText || '').trim();
  const hasStorageCue = /(封存[艙舱倉藏函]|貨樣|货样|艙體|舱体)/u.test(storyText);
  const hasTradeCue = /(交易|收購|收购|走私|貨流|货流|攤位|开价|開價|黑市)/u.test(storyText);

  const turnsSinceSecretRealm = Math.max(0, storyTurn - Number(state.lastSecretRealmTurn || 0));
  const canOpenSecretRealm = Boolean(
    alignment.secretRealmEligible &&
    turnsSinceSecretRealm >= SECRET_REALM_COOLDOWN_TURNS
  );

  const weightRows = [
    { archetype: 'ambush', weight: 1.2 + wanted * 0.9 + (chain?.archetype === 'ambush' ? 1.2 : 0) + Math.max(0, Number(alignment.badScore || 0) - 60) * 0.05 },
    { archetype: 'smuggling', weight: 1.3 + pressure * 0.28 + (hasTradeCue ? 0.9 : 0) },
    { archetype: 'storage_heist', weight: 1.1 + (hasStorageCue ? 1.35 : 0.2) + Math.max(0, Number(state.moralityAxes.selfInterest || 0)) * 0.08 },
    { archetype: 'bounty_hunt', weight: 1.0 + wanted * 0.72 + Math.max(0, Number(alignment.badScore || 0) - 58) * 0.04 },
    { archetype: 'witness_chase', weight: 1.0 + pressure * 0.24 + (hasTradeCue ? 0.5 : 0) },
    { archetype: 'artifact_dispute', weight: 1.1 + pressure * 0.18 },
    { archetype: 'secret_realm', weight: canOpenSecretRealm ? (0.9 + Math.max(0, Number(alignment.goodScore || 0) - 70) * 0.055) : 0 }
  ];

  for (const row of weightRows) {
    const repeatCount = recentSameLoc.filter((arc) => arc === row.archetype).length;
    if (repeatCount >= 2) row.weight *= 0.25;
    else if (repeatCount === 1) row.weight *= 0.6;
    if (chain?.archetype && chain.archetype === row.archetype) row.weight *= 1.45;
  }

  const picked = weightedPick(weightRows, Math.random());
  return {
    inject: true,
    chance: Number(finalChance.toFixed(3)),
    pressure,
    wanted,
    archetype: picked?.archetype || 'smuggling',
    intensity: clampInt(Math.round(1 + pressure / 5 + wanted / 4), 1, 5, 2),
    hint: picked?.archetype === 'secret_realm'
      ? '善行共鳴觸發的秘境入口'
      : ''
  };
}

function recordDynamicEventOffered(player = null, payload = {}) {
  const ensured = ensureDynamicWorldState(player);
  const state = ensured.state;
  const location = normalizeLocationName(payload.location || player?.location || '');
  const archetype = String(payload.archetype || '').trim().slice(0, 32);
  const storyTurn = Math.max(0, Number(payload.storyTurn || player?.storyTurns || 0));
  const phase = String(payload.phase || 'offered').trim().slice(0, 20) || 'offered';
  if (!location || !archetype) return { changed: ensured.changed };

  state.recentEvents.push({
    location,
    archetype,
    phase,
    turn: storyTurn,
    at: Date.now()
  });
  if (state.recentEvents.length > 18) {
    state.recentEvents = state.recentEvents.slice(state.recentEvents.length - 18);
  }

  const prevChain = state.activeChainByLocation[location] || null;
  const nextStage = prevChain && prevChain.archetype === archetype
    ? clampInt(Number(prevChain.stage || 1) + 1, 1, 6, 2)
    : 1;
  state.activeChainByLocation[location] = {
    archetype,
    stage: nextStage,
    intensity: clampInt(payload.intensity || prevChain?.intensity || 2, 1, 5, 2),
    lastPhase: phase,
    updatedTurn: storyTurn,
    expiresTurn: storyTurn + 5
  };

  state.lastGeneratedTurn = storyTurn;
  if (archetype === 'secret_realm') {
    state.lastSecretRealmTurn = storyTurn;
  }
  return { changed: true };
}

function resolveDynamicEventAfterChoice(player = null, choice = {}, result = {}, options = {}) {
  const ensured = ensureDynamicWorldState(player);
  const state = ensured.state;
  const location = normalizeLocationName(options.location || player?.location || '');
  if (!location) return { changed: ensured.changed };

  const dynamicEvent = choice?.dynamicEvent && typeof choice.dynamicEvent === 'object' ? choice.dynamicEvent : null;
  const archetype = String(dynamicEvent?.archetype || choice?.hiddenMeta?.eventArchetype || '').trim().slice(0, 32);
  if (!archetype) return { changed: ensured.changed };

  const storyTurn = Math.max(0, Number(options.storyTurn || player?.storyTurns || 0));
  const success = result?.success !== false;
  const outcomeType = String(result?.type || '').trim();
  const wasCombat = outcomeType === 'combat' || /(會進入戰鬥|会进入战斗|전투\s*진입|battle)/iu.test(String(choice?.choice || ''));

  let pressureAdjust = success ? -0.9 : 0.85;
  let wantedAdjust = success ? -0.4 : 0.9;
  if (wasCombat && success) {
    pressureAdjust += 0.45;
    wantedAdjust += 0.35;
  }

  state.pressureByLocation[location] = clampNumber(
    Number(state.pressureByLocation[location] || 0) + pressureAdjust,
    0,
    24,
    0
  );
  state.wantedByLocation[location] = clampNumber(
    Number(state.wantedByLocation[location] || 0) + wantedAdjust,
    0,
    12,
    0
  );

  const chain = state.activeChainByLocation[location];
  if (chain && chain.archetype === archetype) {
    chain.lastPhase = success ? 'resolved' : 'escalated';
    chain.updatedTurn = storyTurn;
    chain.stage = clampInt(Number(chain.stage || 1) + (success ? 0 : 1), 1, 6, Number(chain.stage || 1));
    chain.expiresTurn = storyTurn + (success ? 3 : 6);
    if (success && !wasCombat && Number(chain.stage || 1) <= 1) {
      delete state.activeChainByLocation[location];
    }
  }

  state.recentEvents.push({
    location,
    archetype,
    phase: success ? 'resolved' : 'escalated',
    turn: storyTurn,
    at: Date.now()
  });
  if (state.recentEvents.length > 18) {
    state.recentEvents = state.recentEvents.slice(state.recentEvents.length - 18);
  }

  const alignment = computeAlignmentProfileFromDynamicState(state, location);
  const topWanted = Object.values(state.wantedByLocation)
    .map((v) => Math.max(0, Number(v || 0)))
    .reduce((acc, cur) => Math.max(acc, cur), 0);
  player.wanted = Math.max(0, Math.floor(topWanted), Number(alignment.wantedFloor || 0));

  return {
    changed: true,
    archetype,
    success,
    locationWanted: Number(state.wantedByLocation[location] || 0),
    locationPressure: Number(state.pressureByLocation[location] || 0)
  };
}

module.exports = {
  ensureDynamicWorldState,
  normalizeChoiceHiddenMeta,
  normalizeStyleTag,
  inferStyleTag,
  applyChoiceConsequences,
  advanceDynamicStateTurn,
  buildDynamicWorldContext,
  chooseDynamicEventPlan,
  recordDynamicEventOffered,
  resolveDynamicEventAfterChoice,
  getDynamicAlignmentProfile: (player = null, location = '') => {
    const ensured = ensureDynamicWorldState(player);
    const loc = normalizeLocationName(location || player?.location || '');
    return computeAlignmentProfileFromDynamicState(ensured.state, loc);
  }
};
