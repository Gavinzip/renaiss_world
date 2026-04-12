function createChoicePolicyUtils(deps = {}) {
  const {
    CHOICE_POOL_COUNT = 10,
    CHOICE_DISPLAY_COUNT = 5,
    CHOICE_REPEAT_SIMILARITY_THRESHOLD = 0.72,
    LOCATION_ARC_COMPLETE_TURNS = 10,
    PORTAL_RESHOW_COOLDOWN_TURNS = 3,
    PORTAL_GUIDE_MIN_TURNS = 2,
    WISH_POOL_GUIDE_MIN_TURNS = 3,
    MARKET_GUARANTEE_GAP_TURNS = 4,
    EARLY_GAME_GOLD_GUARANTEE_TURNS = 10,
    STORY_THREAT_SCORE_THRESHOLD = 38,
    AGGRESSIVE_CHOICE_TARGET_RATE = 0.4,
    WANTED_AMBUSH_MIN_LEVEL = 3,
    getPortalDestinations,
    getLocationProfile,
    isDigitalMaskPhaseForPlayer,
    syncLocationArcLocation,
    getCurrentLocationExposure,
    getPlayerStoryTurns,
    buildChoiceContextSignals,
    getChoiceRiskCategory,
    computeChoiceContinuityScore,
    normalizeChoiceFingerprintText,
    computeChoiceSimilarityByTokens,
    getNearbySystemAvailabilityForChoiceScoring,
    computeStoryThreatScore,
    isImmediateBattleChoice,
    applyStoryThreatGate,
    hasCurrentLocationStoryBattleDone,
    getBattleCadenceInfo,
    getPlayerWantedPressure,
    getWantedEscalationProfile,
    resolveLocationStoryBattleTarget,
    normalizeConflictTargetName,
    getPendingConflictFollowup,
    clearPendingConflictFollowup,
    markSystemChoiceExposure: markSystemChoiceExposureImpl
  } = deps;

  function isPortalChoice(choice) {
    if (!choice || typeof choice !== 'object') return false;
    const action = String(choice.action || '');
    if (action === 'portal_intent' || action === 'teleport') return true;
    const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
    return /(傳送門|傳送|躍遷|portal|teleport)/i.test(text);
  }

  function isWishPoolChoice(choice) {
    if (!choice || typeof choice !== 'object') return false;
    const action = String(choice.action || '');
    if (action === 'wish_pool') return true;
    const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
    return /(許願池|許願|wish\s*pool)/i.test(text);
  }

  function isMarketChoice(choice) {
    if (!choice || typeof choice !== 'object') return false;
    const action = String(choice.action || '');
    if (action === 'market_renaiss' || action === 'market_digital') return true;
    const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
    return /(鑑價|賣場|市場|收購|估價)/.test(text);
  }

  function getStoryTextForChoicePolicy(player = null) {
    return String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
  }

  function isLikelyLocationName(token = '') {
    const text = String(token || '').trim();
    if (!text || text.length < 2 || text.length > 16) return false;
    return /(城|市|鎮|站|港|島|都|關|關口|關隘|谷|原|渡口|山莊|山城)$/u.test(text);
  }

  function extractStoryDirectedDestinations(story = '', previousAction = '') {
    const source = [story, previousAction].filter(Boolean).join('\n');
    if (!source) return [];
    const tail = source.slice(-560);
    const found = [];
    const seen = new Set();
    const push = (raw = '') => {
      const token = String(raw || '').replace(/[「」『』【】（）()]/g, '').trim();
      if (!isLikelyLocationName(token)) return;
      if (seen.has(token)) return;
      seen.add(token);
      found.push(token);
    };

    const patterns = [
      /(?:得去|要去|需要去|應該去|該去|盡快去|尽快去|前往|趕往|赶往|去)\s*([^\s，。、「」『』【】]{2,16}(?:城|市|鎮|站|港|島|都|關|谷|原|渡口|山莊|山城))/gu,
      /(?:下一站|下一步|下一個目的地|下一个目的地)\s*(?:是|到|往|：|:)?\s*([^\s，。、「」『』【】]{2,16}(?:城|市|鎮|站|港|島|都|關|谷|原|渡口|山莊|山城))/gu,
      /([^\s，。、「」『』【】]{2,16}(?:城|市|鎮|站|港|島|都|關|谷|原|渡口|山莊|山城)).{0,20}(?:才(?:有|能)|才能|可查到|找得到|找到真正)/gu
    ];

    for (const regex of patterns) {
      let match = regex.exec(tail);
      while (match) {
        push(match[1]);
        match = regex.exec(tail);
      }
    }
    return found.slice(0, 3);
  }

  function choiceMentionsDestination(choice = null, destination = '') {
    if (!choice || !destination) return false;
    const text = [choice?.name || '', choice?.choice || '', choice?.desc || '', choice?.tag || ''].join(' ');
    return text.includes(destination);
  }

  function buildDirectedDestinationChoice(player = null, destination = '', storyText = '') {
    const currentLocation = String(player?.location || '').trim();
    const clue = /灰帳|灰账/u.test(storyText)
      ? '灰帳記錄線'
      : (/物流|流向|供應鏈|供应链/u.test(storyText)
        ? '物流流向'
        : (/刻印|零件|後加工|后加工/u.test(storyText)
          ? '零件刻印'
          : '當前線索'));
    const fromHint = currentLocation && currentLocation !== destination ? `離開${currentLocation}，` : '';
    return {
      action: 'travel',
      tag: '[🔍需探索]',
      name: `前往${destination}`,
      choice: `${fromHint}趕往${destination}追查${clue}背後來源`,
      desc: `承接當前劇情，改在${destination}做交叉核對`
    };
  }

  function ensureStoryDirectedDestinationChoice(player = null, choices = [], maxCount = CHOICE_DISPLAY_COUNT) {
    const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, maxCount) : [];
    if (!player || list.length === 0) return list;

    const storyText = getStoryTextForChoicePolicy(player);
    const previousAction = String(player?.generationState?.sourceChoice || '').trim();
    const destinations = extractStoryDirectedDestinations(storyText, previousAction);
    const currentLocation = String(player?.location || '').trim();
    const destination = destinations.find((name) => name && name !== currentLocation);
    if (!destination) return list;
    if (list.some((choice) => choiceMentionsDestination(choice, destination))) return list;

    const injected = buildDirectedDestinationChoice(player, destination, storyText);
    if (list.length < maxCount) {
      list.push(injected);
      return list.slice(0, maxCount);
    }

    const protectedActions = new Set([
      'wish_pool',
      'market_renaiss',
      'market_digital',
      'scratch_lottery',
      'custom_input',
      'mentor_spar',
      'location_story_battle'
    ]);
    const signals = buildChoiceContextSignals(player);
    let replaceIdx = -1;
    let worstScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < list.length; i++) {
      const action = String(list[i]?.action || '').trim();
      if (protectedActions.has(action)) continue;
      const score = computeChoiceContinuityScore(list[i], signals);
      if (score < worstScore) {
        worstScore = score;
        replaceIdx = i;
      }
    }
    if (replaceIdx < 0) replaceIdx = list.length - 1;
    list[replaceIdx] = injected;
    return list.slice(0, maxCount);
  }

  function pickCriticalSystemChoices(pool = [], maxCount = 2) {
    const selected = [];
    const used = new Set();
    const takeOne = (predicate) => {
      if (selected.length >= maxCount) return;
      const found = pool.find((choice) => !used.has(choice) && predicate(choice));
      if (found) {
        selected.push(found);
        used.add(found);
      }
    };

    takeOne(isPortalChoice);
    takeOne(isWishPoolChoice);
    takeOne(choice => String(choice?.action || '') === 'market_renaiss');
    takeOne(choice => String(choice?.action || '') === 'market_digital');
    takeOne(isMarketChoice);

    return selected.slice(0, maxCount);
  }

  function rewriteScratchChoiceToShop(choice, player = null) {
    if (!choice || typeof choice !== 'object') return choice;
    const action = String(choice.action || '').trim();
    if (action !== 'scratch_lottery') return choice;
    const rawText = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
    const preferDigital = /(digital|暗潮|黑市|流動收購|精明殺價)/iu.test(rawText);
    const marketAction = preferDigital ? 'market_digital' : 'market_renaiss';
    const location = String(player?.location || '附近據點');
    return {
      ...choice,
      action: marketAction,
      tag: marketAction === 'market_digital' ? '[🕳️神秘鑑價]' : '[🏪鑑價站]',
      name: marketAction === 'market_digital' ? '前往神秘鑑價站' : '前往附近鑑價站',
      choice: `先進入${location}附近鑑價站，再到櫃檯選擇刮刮樂`,
      desc: '刮刮樂只在鑑價站內操作，不會在主選項直接執行'
    };
  }

  function normalizeEventChoices(player = null, choices = []) {
    const mapped = Array.isArray(choices)
      ? choices
        .filter(Boolean)
        .slice(0, CHOICE_POOL_COUNT)
        .map((choice) => rewriteScratchChoiceToShop(choice, player))
      : [];
    // 傳送改由地圖按鈕（主傳送門/傳送裝置）處理，不再出現在劇情五選項中。
    let pool = mapped.filter((choice) => !isPortalChoice(choice));
    pool = ensureStoryDirectedDestinationChoice(player, pool, CHOICE_DISPLAY_COUNT);
    if (pool.length <= CHOICE_DISPLAY_COUNT) return pool;
    const maxPick = Math.min(CHOICE_DISPLAY_COUNT, pool.length);
    const signals = buildChoiceContextSignals(player);
    const scored = pool
      .map((choice, idx) => ({
        choice,
        idx,
        category: getChoiceRiskCategory(choice),
        score: computeChoiceContinuityScore(choice, signals)
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.idx - b.idx;
      });

    const selected = [];
    const categoryCount = new Map();
    const selectedFingerprints = [];
    const maxPerCategory = 2;
    const isNearDuplicate = (choice) => {
      const text = normalizeChoiceFingerprintText([
        choice?.name || '',
        choice?.choice || '',
        choice?.desc || ''
      ].join(' '));
      if (!text) return false;
      for (const prev of selectedFingerprints) {
        const sim = computeChoiceSimilarityByTokens(text, prev);
        if (sim >= CHOICE_REPEAT_SIMILARITY_THRESHOLD) return true;
      }
      return false;
    };
    const pushSelectedFingerprint = (choice) => {
      const text = normalizeChoiceFingerprintText([
        choice?.name || '',
        choice?.choice || '',
        choice?.desc || ''
      ].join(' '));
      if (text) selectedFingerprints.push(text);
    };
    const preserved = pickCriticalSystemChoices(pool, Math.min(2, maxPick));
    for (const choice of preserved) {
      if (selected.includes(choice)) continue;
      if (isNearDuplicate(choice)) continue;
      selected.push(choice);
      pushSelectedFingerprint(choice);
      const category = getChoiceRiskCategory(choice);
      categoryCount.set(category, Number(categoryCount.get(category) || 0) + 1);
      if (selected.length >= maxPick) return selected.slice(0, maxPick);
    }

    for (const item of scored) {
      const choice = item.choice;
      if (selected.includes(choice)) continue;
      if (isNearDuplicate(choice)) continue;
      const currentCount = Number(categoryCount.get(item.category) || 0);
      if (currentCount >= maxPerCategory && selected.length < Math.max(3, maxPick - 1)) continue;
      selected.push(choice);
      pushSelectedFingerprint(choice);
      categoryCount.set(item.category, currentCount + 1);
      if (selected.length >= maxPick) break;
    }

    if (selected.length < maxPick) {
      for (const item of scored) {
        if (selected.includes(item.choice)) continue;
        if (isNearDuplicate(item.choice) && selected.length >= 3) continue;
        selected.push(item.choice);
        pushSelectedFingerprint(item.choice);
        if (selected.length >= maxPick) break;
      }
    }
    return selected.slice(0, maxPick);
  }

  function createGuaranteedPortalChoice(player) {
    const location = String(player?.location || '附近據點');
    return {
      action: 'portal_intent',
      tag: '[❓有驚喜]',
      name: '靠近傳送門節點',
      choice: `先前往${location}附近的傳送門節點查看可前往的地點`,
      desc: '可開啟主傳送門地圖並選擇下一個區域'
    };
  }

  function createGuaranteedWishPoolChoice(player) {
    const location = String(player?.location || '附近據點');
    return {
      action: 'wish_pool',
      tag: '[❓有驚喜]',
      name: '前往許願池',
      choice: `循著${location}的微光指引，去許願池嘗試許願`,
      desc: '可輸入自訂願望，結果可能實現、反轉或附帶代價'
    };
  }

  function hasPortalTransitionCue(story = '') {
    const text = String(story || '');
    if (!text) return false;
    return /(傳送門|節點|跨區|下一站|離開此地|前往新地區|轉往|空間折疊|航道)/u.test(text);
  }

  function hasMainStoryTravelGateCue(story = '') {
    const text = String(story || '');
    if (!text) return false;
    return /(主線線索|跨區追查|靠近傳送門前往新地區|需要跨區|下一章需要跨區)/u.test(text);
  }

  function hasMarketNarrativeCue(story = '') {
    const text = String(story || '');
    if (!text) return false;
    return /(市集|攤位|商店|商家|交易|收購|鑑價|鑑定|封存艙|修復臺|修復台|倉管|商人|老闆|貨艙|臨時艙)/u.test(text);
  }

  function markPortalChoiceShown(player, exposure = null) {
    if (!player) return;
    const target = exposure || getCurrentLocationExposure(player);
    if (!target) return;
    target.portalShown = true;
    target.portalLastShownTurn = getPlayerStoryTurns(player);
  }

  function ensurePortalChoiceAvailability(player, choices = []) {
    const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
    if (!player || list.length === 0) return list;
    const forceByIslandCompletion = Boolean(player?.forcePortalChoice);
    if (list.some(isPortalChoice)) {
      if (forceByIslandCompletion) player.forcePortalChoice = false;
      markPortalChoiceShown(player);
      return list;
    }

    const destinations = typeof getPortalDestinations === 'function'
      ? getPortalDestinations(player.location || '')
      : [];
    if (!Array.isArray(destinations) || destinations.length === 0) return list;

    const state = syncLocationArcLocation(player);
    const turnsInLocation = Number(state?.turnsInLocation || 0);
    const exposure = getCurrentLocationExposure(player);
    const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
    const portalCue = hasPortalTransitionCue(storyText);
    const travelGateCue = hasMainStoryTravelGateCue(storyText);
    const nearCompletion = turnsInLocation >= Math.max(2, LOCATION_ARC_COMPLETE_TURNS - 1);
    const hardCompletion = turnsInLocation >= LOCATION_ARC_COMPLETE_TURNS;
    const currentTurn = getPlayerStoryTurns(player);
    const lastShownTurn = Number(exposure?.portalLastShownTurn || 0);
    const turnsSinceShown = Math.max(0, currentTurn - lastShownTurn);
    const canReshow = turnsSinceShown >= PORTAL_RESHOW_COOLDOWN_TURNS;

    const shouldGuidePortal = !exposure?.portalShown &&
      turnsInLocation >= PORTAL_GUIDE_MIN_TURNS &&
      (portalCue || travelGateCue || nearCompletion);
    const forcePortal = (travelGateCue && canReshow) || (hardCompletion && (portalCue || canReshow));

    if (!forcePortal && !shouldGuidePortal && !forceByIslandCompletion) return list;

    const injected = createGuaranteedPortalChoice(player);
    const protectedActions = new Set(['wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery', 'custom_input', 'mentor_spar']);
    let replaceIdx = list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!protectedActions.has(String(list[i]?.action || ''))) {
        replaceIdx = i;
        break;
      }
    }
    list[replaceIdx] = injected;
    if (forceByIslandCompletion) player.forcePortalChoice = false;
    markPortalChoiceShown(player, exposure);
    return list.slice(0, CHOICE_DISPLAY_COUNT);
  }

  function ensureWishPoolChoiceAvailability(player, choices = []) {
    const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
    if (!player || list.length === 0) return list;
    if (list.some(isWishPoolChoice)) return list;

    const state = syncLocationArcLocation(player);
    const turnsInLocation = Number(state?.turnsInLocation || 0);
    const exposure = getCurrentLocationExposure(player);
    const shouldGuide = !exposure?.wishPoolShown && turnsInLocation >= WISH_POOL_GUIDE_MIN_TURNS;
    const forceWishPool = !exposure?.wishPoolShown && turnsInLocation >= Math.max(2, LOCATION_ARC_COMPLETE_TURNS - 2);
    if (!shouldGuide && !forceWishPool) return list;

    const injected = createGuaranteedWishPoolChoice(player);
    const protectedActions = new Set(['portal_intent', 'market_renaiss', 'market_digital', 'scratch_lottery', 'custom_input', 'mentor_spar']);
    let replaceIdx = list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!protectedActions.has(String(list[i]?.action || ''))) {
        replaceIdx = i;
        break;
      }
    }
    list[replaceIdx] = injected;
    return list.slice(0, CHOICE_DISPLAY_COUNT);
  }

  function createGuaranteedMarketChoice(player) {
    const location = String(player?.location || '附近據點');
    const newbieMask = isDigitalMaskPhaseForPlayer(player);
    const profile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
    const difficulty = Number(profile?.difficulty || 3);
    const preferRenaiss = newbieMask || difficulty <= 3;
    if (preferRenaiss) {
      return {
        action: 'market_renaiss',
        tag: '[🏪鑑價站]',
        name: '前往附近鑑價站',
        choice: `帶著手邊素材到${location}附近鑑價站先做真偽檢測`,
        desc: '先看檢測結果與行情，再決定是否出售'
      };
    }
    return {
      action: 'market_digital',
      tag: newbieMask ? '[🧩友善鑑價]' : '[🕳️神秘鑑價]',
      name: '前往神秘鑑價站',
      choice: `在${location}附近找一間神秘鑑價站，先做檢測再議價`,
      desc: '表面條件看似優惠，簽之前先看細節'
    };
  }

  function ensureMarketChoiceAvailability(player, choices = []) {
    const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
    if (!player || list.length === 0) return list;
    if (list.some(isMarketChoice)) return list;

    const state = syncLocationArcLocation(player);
    const turnsInLocation = Number(state?.turnsInLocation || 0);
    const exposure = getCurrentLocationExposure(player);
    const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
    const marketCue = hasMarketNarrativeCue(storyText);
    const nearby = getNearbySystemAvailabilityForChoiceScoring(String(player?.location || ''));
    const forceByLocationArc = marketCue && !exposure?.marketShown && turnsInLocation >= 1;
    if (!marketCue && !nearby.nearMarket) return list;

    const currentTurn = getPlayerStoryTurns(player);
    const lastMarketTurn = Number(player.lastMarketTurn || 0);
    const turnsSinceMarket = Math.max(0, currentTurn - lastMarketTurn);
    const hardGap = Math.max(2, MARKET_GUARANTEE_GAP_TURNS * 2);
    if (!marketCue && turnsSinceMarket < hardGap) return list;
    if (marketCue && !forceByLocationArc && turnsSinceMarket < MARKET_GUARANTEE_GAP_TURNS) return list;

    const injected = createGuaranteedMarketChoice(player);
    const protectedActions = new Set(['portal_intent', 'wish_pool', 'scratch_lottery', 'custom_input']);
    let replaceIdx = list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!protectedActions.has(String(list[i]?.action || ''))) {
        replaceIdx = i;
        break;
      }
    }
    list[replaceIdx] = injected;
    return list.slice(0, CHOICE_DISPLAY_COUNT);
  }

  function isGoldMakingChoice(choice) {
    if (!choice || typeof choice !== 'object') return false;
    const action = String(choice.action || '');
    if (['fight', 'forage', 'hunt', 'treasure', 'market_renaiss', 'market_digital', 'scratch_lottery'].includes(action)) {
      return true;
    }
    const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
    return /(Rns(?:\s*代幣)?|RNS|金幣|賺錢|收入|鑑價|交易|戰利品|寶藏|採集|狩獵|刮刮樂|中獎)/i.test(text);
  }

  function createGuaranteedIncomeChoice(player) {
    const location = String(player?.location || '附近');
    const templates = [
      {
        tag: '[🎁高回報]',
        action: 'forage',
        name: '搜索路邊素材',
        choice: `沿著${location}邊緣採集可出售的草藥與素材`,
        desc: '穩定取得可交易物，適合前期快速累積資金'
      },
      {
        tag: '[🔍需探索]',
        action: 'treasure',
        name: '勘查碎礦脈',
        choice: `檢查${location}附近裂隙，嘗試撿到可賣碎晶`,
        desc: '有機會直接撿到高價素材，回報高於一般探索'
      },
      {
        tag: '[⚔️會戰鬥]',
        action: 'hunt',
        name: '追蹤可賣獵物',
        choice: `追蹤附近小型野獸，取得可出售獵物素材`,
        desc: '風險可控，能累積可換現金的獵物資源'
      }
    ];
    const pick = templates[Math.floor(Math.random() * templates.length)];
    return { ...pick };
  }

  function createGuaranteedLocationStoryBattleChoice(player, storyText = '', options = {}) {
    const wantedLevel = Math.max(0, Number(options?.wantedLevel || getPlayerWantedPressure(player) || 0));
    const escalation = getWantedEscalationProfile(wantedLevel);
    const target = resolveLocationStoryBattleTarget(player, storyText, {
      allowLooseSelection: Boolean(options?.allowLooseSelection),
      preferVillain: Boolean(options?.preferVillain),
      wantedLevel
    });
    if (!target?.enemy) return null;
    const location = String(player?.location || '附近據點').trim() || '附近據點';
    const forcedDisplayName = normalizeConflictTargetName(options?.displayName || '');
    const displayNpcName = forcedDisplayName || (
      /匿名滲透者/u.test(String(target.npcName || ''))
        ? '可疑尾隨者'
        : String(target.npcName || '可疑敵手')
    );
    const reason = String(options?.reason || 'story').trim();
    const hunterText = escalation.active && escalation.hunterCount > 1
      ? `${escalation.hunterCount} 組追兵`
      : '追兵';
    const choiceText = reason === 'wanted'
      ? `察覺${location}周邊有${hunterText}盯上你，鎖定${displayNpcName}先發制人（會進入戰鬥）`
      : (reason === 'aggressive_followup'
        ? `攔下剛才出現在${location}的${displayNpcName}，正面逼問來源（會進入戰鬥）`
        : `察覺${location}氣氛不對勁，鎖定${displayNpcName}動向先發制人（會進入戰鬥）`);
    const descText = reason === 'wanted'
      ? `通緝熱度 Lv.${wantedLevel}｜敵對勢力主動接近：${displayNpcName}`
      : (reason === 'aggressive_followup'
        ? '你選擇把剛才的衝突升級為正面交鋒，對方可能當場反擊'
        : `地區篇章關鍵戰：對手來自${location}在地勢力`);
    const enemy = target?.enemy && typeof target.enemy === 'object'
      ? { ...target.enemy, name: displayNpcName, storyPersonaName: displayNpcName }
      : target.enemy;
    return {
      action: 'location_story_battle',
      tag: '[⚔️會戰鬥]',
      name: `攔截 ${displayNpcName}`,
      choice: choiceText,
      desc: descText,
      npcId: target.npcId,
      npcName: displayNpcName,
      enemy,
      locationStoryBattle: true
    };
  }

  function ensureLocationStoryBattleChoiceAvailability(player, choices = []) {
    const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
    if (!player || list.length === 0) return list;
    if (hasCurrentLocationStoryBattleDone(player)) return list;

    const state = syncLocationArcLocation(player);
    const turnsInLocation = Number(state?.turnsInLocation || 0);
    const cadence = getBattleCadenceInfo(player);
    const wantedPressure = getPlayerWantedPressure(player);
    const wantedEscalation = getWantedEscalationProfile(wantedPressure);
    const wantedDriven = wantedEscalation.active;
    if (!wantedDriven && turnsInLocation < 2) return list;
    if (list.some((choice) => String(choice?.action || '').trim() === 'location_story_battle')) return list;

    const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
    const threatScore = computeStoryThreatScore(storyText);
    if (!wantedDriven && threatScore < Math.max(14, STORY_THREAT_SCORE_THRESHOLD - 12)) return list;
    if (wantedDriven) {
      const allowWantedImmediateBattle =
        cadence.dueConflict ||
        threatScore >= Math.max(20, STORY_THREAT_SCORE_THRESHOLD - 6) ||
        Math.random() < wantedEscalation.ambushChance;
      if (!allowWantedImmediateBattle) return list;
    }
    const injected = createGuaranteedLocationStoryBattleChoice(player, storyText, {
      allowLooseSelection: wantedDriven,
      preferVillain: wantedDriven,
      wantedLevel: wantedPressure,
      reason: wantedDriven ? 'wanted' : 'story'
    });
    if (!injected) return list;

    const protectedActions = new Set(['portal_intent', 'wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery', 'custom_input']);
    let replaceIdx = list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!protectedActions.has(String(list[i]?.action || ''))) {
        replaceIdx = i;
        break;
      }
    }
    list[replaceIdx] = injected;
    return list.slice(0, CHOICE_DISPLAY_COUNT);
  }

  function isAggressiveChoice(choice) {
    if (!choice || typeof choice !== 'object') return false;
    const action = String(choice.action || '').trim();
    if (action === 'fight' || action === 'location_story_battle') return true;
    if (isImmediateBattleChoice(choice)) return true;
    const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
    return /(🔥|高風險|會戰鬥|強攻|突襲|追擊|攔截|硬闖|正面交鋒|死鬥|搏命)/u.test(text);
  }

  function createGuaranteedAggressiveChoice(player) {
    const location = String(player?.location || '附近區域').trim() || '附近區域';
    return {
      action: 'location_story_battle',
      tag: '[⚔️會戰鬥]',
      name: '強奪可疑鑑價品',
      choice: `攔下剛在${location}兜售可疑鑑價品的人，直接打倒並奪下貨樣（會進入戰鬥）`,
      desc: '高風險：你選擇正面開打，嘗試奪取對方攜帶的可疑貨樣',
      forceImmediateBattle: true
    };
  }

  function createCadenceConflictPrepChoice(player) {
    const location = String(player?.location || '附近區域').trim() || '附近區域';
    return {
      action: 'conflict',
      tag: '[⚔️會戰鬥]',
      name: '先行佈防追蹤',
      choice: `在${location}提前布置觀測點，追蹤可疑勢力下一步動向`,
      desc: '衝突節奏升溫中：先備戰，必要時再立刻交戰'
    };
  }

  function ensureBattleCadenceChoiceAvailability(player, choices = []) {
    const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
    if (!player || list.length === 0) return list;
    if (list.some(isAggressiveChoice)) return list;

    const cadence = getBattleCadenceInfo(player);
    if (!cadence.nearConflict) return list;

    const wantedPressure = getPlayerWantedPressure(player);
    const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
    let injected = null;
    if (cadence.dueConflict) {
      injected = createGuaranteedLocationStoryBattleChoice(player, storyText, {
        allowLooseSelection: true,
        preferVillain: wantedPressure >= WANTED_AMBUSH_MIN_LEVEL,
        wantedLevel: wantedPressure,
        reason: 'cadence'
      });
      if (!injected) {
        const location = String(player?.location || '附近區域').trim() || '附近區域';
        injected = {
          action: 'fight',
          tag: '[⚔️會戰鬥]',
          name: '主動迎擊可疑勢力',
          choice: `在${location}主動攔截尾隨你的可疑勢力（會進入戰鬥）`,
          desc: `戰鬥節奏點 ${cadence.step}/${cadence.span}：將衝突拉到正面對決`
        };
      }
    } else {
      injected = createCadenceConflictPrepChoice(player);
    }
    if (!injected) return list;

    const protectedActions = new Set(['portal_intent', 'wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery', 'custom_input', 'mentor_spar']);
    let replaceIdx = list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!protectedActions.has(String(list[i]?.action || ''))) {
        replaceIdx = i;
        break;
      }
    }
    list[replaceIdx] = injected;
    return list.slice(0, CHOICE_DISPLAY_COUNT);
  }

  function ensureAggressiveChoiceAvailability(player, choices = []) {
    const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
    if (!player || list.length === 0) return list;
    if (list.some(isAggressiveChoice)) return list;
    const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
    const threatScore = computeStoryThreatScore(storyText);
    if (threatScore < Math.max(16, STORY_THREAT_SCORE_THRESHOLD - 10)) return list;
    if (Math.random() > AGGRESSIVE_CHOICE_TARGET_RATE) return list;

    const injected = createGuaranteedAggressiveChoice(player);
    const protectedActions = new Set(['portal_intent', 'wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery', 'custom_input', 'mentor_spar']);
    let replaceIdx = list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!protectedActions.has(String(list[i]?.action || ''))) {
        replaceIdx = i;
        break;
      }
    }
    list[replaceIdx] = injected;
    return list.slice(0, CHOICE_DISPLAY_COUNT);
  }

  function ensurePendingConflictImmediateBattleChoice(player, choices = []) {
    const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
    if (!player || list.length === 0) return list;

    const pending = getPendingConflictFollowup(player);
    if (!pending?.active) return list;

    const currentTurn = getPlayerStoryTurns(player);
    if (currentTurn < Number(pending.triggerTurn || 0)) return list;
    if (pending.injectedTurn > 0 && pending.injectedTurn === currentTurn) return list;

    const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
    const forcedChoice = createGuaranteedLocationStoryBattleChoice(player, storyText, {
      allowLooseSelection: true,
      preferVillain: true,
      wantedLevel: getPlayerWantedPressure(player),
      reason: 'aggressive_followup',
      displayName: pending.displayName
    });

    if (!forcedChoice) {
      pending.noNpcRetry = Math.max(0, Number(pending.noNpcRetry || 0)) + 1;
      pending.triggerTurn = currentTurn + 1;
      pending.expireTurn = Math.max(Number(pending.expireTurn || currentTurn + 1), currentTurn + 1);
      if (pending.noNpcRetry >= 2) {
        clearPendingConflictFollowup(player);
      } else {
        player.pendingConflictFollowup = pending;
      }
      return list;
    }

    const injected = {
      ...forcedChoice,
      forceImmediateBattle: true,
      action: 'location_story_battle'
    };

    const existingImmediateIdx = list.findIndex((choice) => isImmediateBattleChoice(choice));
    const protectedActions = new Set([
      'portal_intent',
      'wish_pool',
      'market_renaiss',
      'market_digital',
      'scratch_lottery',
      'custom_input',
      'mentor_spar'
    ]);
    let replaceIdx = existingImmediateIdx;
    if (replaceIdx < 0) {
      replaceIdx = list.length - 1;
      for (let i = list.length - 1; i >= 0; i--) {
        if (!protectedActions.has(String(list[i]?.action || '').trim())) {
          replaceIdx = i;
          break;
        }
      }
    }
    list[replaceIdx] = injected;

    clearPendingConflictFollowup(player);
    return list.slice(0, CHOICE_DISPLAY_COUNT);
  }

  function shouldCountCombatForLocationStory(event = {}, result = {}, enemy = null) {
    const action = String(event?.action || '').trim();
    if (action === 'mentor_spar') return false;
    if (action === 'location_story_battle') return true;
    if (Boolean(event?.locationStoryBattle || result?.locationStoryBattle)) return true;
    if (event?.npcId || result?.npcId) return true;
    if (enemy && enemy.isMonster === false) return true;
    return false;
  }

  function ensureEarlyGameIncomeChoice(player, choices = []) {
    const list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
    if (!player || list.length === 0) return list;
    if (getPlayerStoryTurns(player) >= EARLY_GAME_GOLD_GUARANTEE_TURNS) return list;
    if (list.some(isGoldMakingChoice)) return list;

    const injected = createGuaranteedIncomeChoice(player);
    const protectedActions = new Set(['portal_intent', 'wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery', 'custom_input']);
    let replaceIdx = list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!protectedActions.has(String(list[i]?.action || ''))) {
        replaceIdx = i;
        break;
      }
    }
    list[replaceIdx] = injected;
    return list.slice(0, CHOICE_DISPLAY_COUNT);
  }

  function applyChoicePolicy(player, choices = []) {
    let list = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
    if (!player || list.length === 0) return list;
    // Prompt-only 選項策略：
    // 只做安全性修正（如威脅場景下的即時戰鬥降級），不再本地注入模板選項。
    // 所有可玩性/主線/系統可用性由 AI 提示詞直接產生。
    list = ensurePendingConflictImmediateBattleChoice(player, list);
    list = applyStoryThreatGate(player, list);
    if (typeof markSystemChoiceExposureImpl === 'function') {
      markSystemChoiceExposureImpl(player, list);
    }
    return list.slice(0, CHOICE_DISPLAY_COUNT);
  }

  return {
    isPortalChoice,
    isWishPoolChoice,
    pickCriticalSystemChoices,
    rewriteScratchChoiceToShop,
    getStoryTextForChoicePolicy,
    extractStoryDirectedDestinations,
    ensureStoryDirectedDestinationChoice,
    normalizeEventChoices,
    createGuaranteedPortalChoice,
    createGuaranteedWishPoolChoice,
    hasPortalTransitionCue,
    hasMainStoryTravelGateCue,
    markPortalChoiceShown,
    ensurePortalChoiceAvailability,
    ensureWishPoolChoiceAvailability,
    isMarketChoice,
    hasMarketNarrativeCue,
    createGuaranteedMarketChoice,
    ensureMarketChoiceAvailability,
    isGoldMakingChoice,
    createGuaranteedIncomeChoice,
    createGuaranteedLocationStoryBattleChoice,
    ensureLocationStoryBattleChoiceAvailability,
    isAggressiveChoice,
    createGuaranteedAggressiveChoice,
    createCadenceConflictPrepChoice,
    ensureBattleCadenceChoiceAvailability,
    ensureAggressiveChoiceAvailability,
    ensurePendingConflictImmediateBattleChoice,
    shouldCountCombatForLocationStory,
    ensureEarlyGameIncomeChoice,
    applyChoicePolicy
  };
}

module.exports = { createChoicePolicyUtils };
