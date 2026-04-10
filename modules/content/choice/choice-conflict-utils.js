function createChoiceConflictUtils(deps = {}) {
  const {
    CORE,
    PET,
    getPlayerStoryTurns,
    getWantedEscalationProfile,
    getLocationDifficultyForPlayer,
    normalizePetElementCode,
    isNpcHostileByProfile,
    normalizeNpcAlignTag,
    extractStoryDialogues,
    extractStoryEndingFocus,
    computeStoryThreatScore,
    AGGRESSIVE_FOLLOWUP_TARGET_MAX_LEN = 24,
    AGGRESSIVE_FOLLOWUP_MIN_TURNS = 1,
    AGGRESSIVE_FOLLOWUP_WINDOW_TURNS = 3,
    STORY_THREAT_SCORE_THRESHOLD = 38,
    WANTED_AMBUSH_MIN_LEVEL = 1
  } = deps;

  function buildStoryBattleEnemyFromNpc(npc = null, player = null, options = {}) {
    if (!npc || typeof npc !== 'object') return null;
    const wantedLevel = Math.max(0, Number(options?.wantedLevel || 0));
    const escalation = getWantedEscalationProfile(wantedLevel);
    const difficulty = getLocationDifficultyForPlayer(player);
    const battle = Math.max(12, Number(npc?.stats?.戰力 || 24));
    const hpBase = Math.max(72, Number(npc?.stats?.生命 || 86));
    const energy = Math.max(10, Number(npc?.stats?.能量 || 24));
    const baselineByDifficulty = {
      1: { hp: 96, attack: 17, defense: 7 },
      2: { hp: 132, attack: 23, defense: 10 },
      3: { hp: 186, attack: 30, defense: 14 },
      4: { hp: 248, attack: 39, defense: 19 },
      5: { hp: 324, attack: 48, defense: 24 }
    };
    const curve = baselineByDifficulty[difficulty] || baselineByDifficulty[3];
    const hpDelta = Math.max(-18, Math.min(34, Math.floor((hpBase - 90) * 0.26)));
    const atkDelta = Math.max(-4, Math.min(10, Math.floor((battle - 26) * 0.12)));
    const defDelta = Math.max(-3, Math.min(8, Math.floor((energy - 26) * 0.1)));
    const baseHp = Math.max(72, Math.min(420, curve.hp + hpDelta));
    const baseAttack = Math.max(14, Math.min(95, curve.attack + atkDelta));
    const baseDefense = Math.max(6, Math.min(52, curve.defense + defDelta));
    const scaledHp = escalation.active ? Math.floor(baseHp * escalation.enemyScale) : baseHp;
    const scaledAttack = escalation.active ? Math.floor(baseAttack * (1 + (escalation.level * 0.06))) : baseAttack;
    const scaledDefense = escalation.active ? Math.floor(baseDefense * (1 + (escalation.level * 0.04))) : baseDefense;
    const hp = Math.max(72, Math.min(520, scaledHp));
    const attack = Math.max(14, Math.min(120, scaledAttack));
    const defense = Math.max(6, Math.min(72, scaledDefense));
    const moveIds = Array.isArray(npc?.battleMoveIds) ? npc.battleMoveIds : [];
    const moveNamesFromIds = moveIds
      .map((id) => (PET && typeof PET.getMoveById === 'function' ? PET.getMoveById(id) : null))
      .map((tpl) => String(tpl?.name || '').trim())
      .filter(Boolean);
    const skillNames = moveNamesFromIds.length > 0
      ? moveNamesFromIds.slice(0, 4)
      : Object.keys(npc?.skills || {}).filter(Boolean).slice(0, 4);
    const npcPet = npc?.petTemplate && typeof npc.petTemplate === 'object'
      ? {
          name: String(npc.petTemplate.name || `${npc.name || '在地勢力'}伴寵`),
          element: normalizePetElementCode(npc.petTemplate.element || npc.petElement || '水'),
          attack: Math.max(8, Number(npc.petTemplate.attack || 16)),
          hp: Math.max(24, Number(npc.petTemplate.hp || npc.petTemplate.maxHp || 58)),
          maxHp: Math.max(24, Number(npc.petTemplate.maxHp || npc.petTemplate.hp || 58))
        }
      : false;
    const villain = isNpcHostileByProfile(npc);
    const rewardMin = Math.max(36, 22 + difficulty * 18 + Math.floor((curve.attack + attack) * 1.4) + (escalation.active ? escalation.level * 14 : 0));
    const rewardMax = rewardMin + 80 + difficulty * 8 + (escalation.active ? escalation.level * 12 : 0);
    const companionPet = npcPet || (escalation.active && escalation.level >= 3 ? true : false);
    return {
      id: String(npc.id || npc.name || 'local_story_enemy').trim(),
      name: String(npc.name || '可疑敵手').trim(),
      hp,
      maxHp: hp,
      attack,
      defense,
      moves: skillNames.length > 0 ? skillNames : ['突襲', '破綻追擊', '壓制'],
      reward: { gold: [rewardMin, rewardMax] },
      faction: villain ? 'digital' : 'neutral',
      villain,
      isMonster: false,
      companionPet,
      wantedLevel: escalation.level,
      hunterCount: escalation.hunterCount
    };
  }

  function getNearbyStoryBattleNpcCandidates(player) {
    if (!player) return [];
    const location = String(player.location || '').trim();
    if (!location) return [];
    const ids = typeof CORE.getNearbyNpcIds === 'function'
      ? CORE.getNearbyNpcIds(location, 8)
      : [];
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const rows = [];
    for (const npcId of ids) {
      const info = typeof CORE.getAgentFullInfo === 'function'
        ? CORE.getAgentFullInfo(npcId)
        : null;
      if (!info) continue;
      if (typeof CORE.isNPCAlive === 'function' && !CORE.isNPCAlive(info.id || npcId)) continue;
      if (String(info.loc || '').trim() !== location) continue;
      rows.push(info);
    }
    return rows;
  }

  function scoreStoryBattleNpcCandidate(npc = null) {
    if (!npc || typeof npc !== 'object') return -999;
    const align = normalizeNpcAlignTag(npc);
    const battle = Number(npc?.stats?.戰力 || 0);
    const sect = [npc.sect || '', npc.title || '', npc.name || ''].join(' ');
    let score = battle;
    if (align === 'evil') score += 120;
    else if (align === 'neutral') score += 26;
    else score += 10;
    if (/digital|暗潮|黑市|滲透|叛徒|賊|匪|殺手|刺客/u.test(sect)) score += 85;
    if (npc.roaming) score += 40;
    return score;
  }

  function collectRecentStorySpeakerHints(player = null, storyText = '') {
    const hints = new Set();
    const dialogues = extractStoryDialogues(storyText);
    for (const row of dialogues) {
      const speaker = String(row?.speaker || '').trim();
      if (speaker) hints.add(speaker);
    }

    const pins = Array.isArray(player?.storyDialoguePins) ? player.storyDialoguePins : [];
    pins
      .slice(-8)
      .forEach((row) => {
        const speaker = String(row?.speaker || '').trim();
        if (speaker) hints.add(speaker);
      });

    const npcLog = Array.isArray(player?.npcDialogueLog) ? player.npcDialogueLog : [];
    npcLog
      .slice(-8)
      .forEach((row) => {
        const speaker = String(row?.speaker || row?.npcName || '').trim();
        if (speaker) hints.add(speaker);
      });

    return hints;
  }

  function normalizeConflictTargetName(name = '') {
    let text = String(name || '')
      .replace(/[「」『』"'`“”‘’\[\]{}<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return '';
    text = text
      .replace(/^(?:那名|那位|剛才那名|剛才那位|刚才那名|刚才那位|一名|一位)\s*/u, '')
      .replace(/^(?:對方|对方)\s*/u, '')
      .trim();
    if (!text) return '';
    return text.slice(0, AGGRESSIVE_FOLLOWUP_TARGET_MAX_LEN);
  }

  function scoreStoryBindingForNpc(npc = null, storyText = '', speakerHints = new Set()) {
    if (!npc || typeof npc !== 'object') return 0;
    const fullText = String(storyText || '').trim();
    if (!fullText) return 0;
    const focus = `${extractStoryEndingFocus(fullText)}\n${fullText.slice(-900)}`;
    const name = String(npc.name || '').trim();
    const title = String(npc.title || '').trim();
    const sect = String(npc.sect || '').trim();
    const identityText = [name, title, sect].filter(Boolean).join(' ');
    let score = 0;

    if (name && fullText.includes(name)) score += 240;
    if (title && fullText.includes(title)) score += 140;
    if (sect && fullText.includes(sect)) score += 90;
    if (name && focus.includes(name)) score += 80;
    if (title && focus.includes(title)) score += 50;

    if (speakerHints instanceof Set && speakerHints.size > 0) {
      if (name && speakerHints.has(name)) score += 180;
      if (title && speakerHints.has(title)) score += 90;
    }

    if (/新手友善供應|友善供應|供應隊/u.test(fullText) && /(供應|商隊|議價|暗潮|digital|滲透)/iu.test(identityText)) {
      score += 110;
    }
    if (/情報販子|黑影|披風商人/u.test(fullText) && /(商人|販子|情報|中介)/u.test(identityText)) {
      score += 85;
    }
    if (/茶師|工坊|修復臺|檢測/u.test(fullText) && /(茶|工坊|修復|工程|機械)/u.test(identityText)) {
      score += 65;
    }

    return score;
  }

  function pickStoryConflictDisplayName(player = null, storyText = '', selectedChoice = '') {
    const story = String(storyText || '').trim();
    const sourceChoice = String(selectedChoice || '').trim();
    const playerName = String(player?.name || '').trim();

    const dialogues = extractStoryDialogues(story);
    for (let i = dialogues.length - 1; i >= 0; i--) {
      const speaker = normalizeConflictTargetName(dialogues[i]?.speaker || '');
      if (!speaker) continue;
      if (playerName && (speaker === playerName || speaker.includes(playerName))) continue;
      if (/^(冒險者|冒险者|你|我|主角|旁白)$/u.test(speaker)) continue;
      return speaker;
    }

    const speakerHints = collectRecentStorySpeakerHints(player, story);
    const nearbyRows = getNearbyStoryBattleNpcCandidates(player)
      .map((npc) => ({
        npc,
        score: scoreStoryBindingForNpc(npc, story, speakerHints)
      }))
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    const boundNpc = nearbyRows.find((row) => Number(row?.score || 0) > 0)?.npc;
    if (boundNpc?.name) return normalizeConflictTargetName(boundNpc.name);

    const tailSource = `${extractStoryEndingFocus(story)}\n${sourceChoice}`;
    const directPhrase = tailSource.match(/(?:那名|那位|剛才那名|剛才那位|刚才那名|刚才那位)([^，。；、\n]{1,14})/u);
    if (directPhrase && directPhrase[1]) {
      const normalized = normalizeConflictTargetName(directPhrase[1]);
      if (normalized) return normalized;
    }
    if (/(女子|少女|女聲|女声|女人|姑娘|她)/u.test(tailSource)) return '神秘女子';
    if (/(男子|男聲|男声|男人|他)/u.test(tailSource)) return '神秘男子';
    return '可疑人士';
  }

  function normalizePendingConflictFollowupState(raw = null, currentTurn = 0) {
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.active) return null;
    const sourceTurn = Math.max(0, Math.floor(Number(raw.sourceTurn || 0)));
    const triggerTurn = Math.max(sourceTurn + AGGRESSIVE_FOLLOWUP_MIN_TURNS, Math.floor(Number(raw.triggerTurn || sourceTurn + AGGRESSIVE_FOLLOWUP_MIN_TURNS)));
    const expireTurn = Math.max(triggerTurn, Math.floor(Number(raw.expireTurn || (sourceTurn + AGGRESSIVE_FOLLOWUP_WINDOW_TURNS))));
    if (Math.max(0, Math.floor(Number(currentTurn || 0))) > expireTurn) return null;
    const displayName = normalizeConflictTargetName(raw.displayName || '') || '可疑人士';
    return {
      active: true,
      sourceTurn,
      triggerTurn,
      expireTurn,
      location: String(raw.location || '').trim().slice(0, 32),
      sourceChoice: String(raw.sourceChoice || '').trim().slice(0, 220),
      displayName,
      injectedTurn: Math.max(0, Math.floor(Number(raw.injectedTurn || 0))),
      noNpcRetry: Math.max(0, Math.min(3, Math.floor(Number(raw.noNpcRetry || 0))))
    };
  }

  function getPendingConflictFollowup(player = null) {
    if (!player || typeof player !== 'object') return null;
    const normalized = normalizePendingConflictFollowupState(
      player.pendingConflictFollowup,
      getPlayerStoryTurns(player)
    );
    if (!normalized) {
      if (Object.prototype.hasOwnProperty.call(player, 'pendingConflictFollowup')) {
        delete player.pendingConflictFollowup;
      }
      return null;
    }
    if (JSON.stringify(player.pendingConflictFollowup || {}) !== JSON.stringify(normalized)) {
      player.pendingConflictFollowup = normalized;
    }
    return normalized;
  }

  function clearPendingConflictFollowup(player = null) {
    if (!player || typeof player !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(player, 'pendingConflictFollowup')) {
      delete player.pendingConflictFollowup;
    }
  }

  function setPendingConflictFollowup(player = null, payload = {}) {
    if (!player || typeof player !== 'object') return null;
    const currentTurn = getPlayerStoryTurns(player);
    const displayName = normalizeConflictTargetName(payload.displayName || '') || '可疑人士';
    const state = {
      active: true,
      sourceTurn: currentTurn,
      triggerTurn: currentTurn + AGGRESSIVE_FOLLOWUP_MIN_TURNS,
      expireTurn: currentTurn + AGGRESSIVE_FOLLOWUP_WINDOW_TURNS,
      location: String(payload.location || player.location || '').trim().slice(0, 32),
      sourceChoice: String(payload.sourceChoice || '').trim().slice(0, 220),
      displayName,
      injectedTurn: 0,
      noNpcRetry: 0
    };
    player.pendingConflictFollowup = state;
    return state;
  }

  function resolveLocationStoryBattleTarget(player, storyText = '', options = {}) {
    const allowLooseSelection = options?.allowLooseSelection === true;
    const wantedLevel = Math.max(0, Number(options?.wantedLevel || 0));
    const escalation = getWantedEscalationProfile(wantedLevel);
    const preferVillain = Boolean(options?.preferVillain) || wantedLevel >= WANTED_AMBUSH_MIN_LEVEL;
    const speakerHints = collectRecentStorySpeakerHints(player, storyText);
    const baseCandidates = getNearbyStoryBattleNpcCandidates(player)
      .map((npc) => {
        const baseScore = scoreStoryBattleNpcCandidate(npc);
        const bindScore = scoreStoryBindingForNpc(npc, storyText, speakerHints);
        const hostileBoost = isNpcHostileByProfile(npc) && wantedLevel > 0
          ? Math.min(120, wantedLevel * 18)
          : 0;
        return { npc, baseScore, bindScore, total: baseScore + bindScore + hostileBoost };
      })
      .sort((a, b) => {
        const bindGap = Number(b.bindScore || 0) - Number(a.bindScore || 0);
        if (bindGap !== 0) return bindGap;
        const totalGap = Number(b.total || 0) - Number(a.total || 0);
        if (totalGap !== 0) return totalGap;
        return String(a?.npc?.id || '').localeCompare(String(b?.npc?.id || ''));
      });
    let candidates = baseCandidates;
    if (preferVillain) {
      const villains = candidates.filter((row) => isNpcHostileByProfile(row?.npc));
      if (villains.length > 0) {
        candidates = villains;
      } else if (wantedLevel >= WANTED_AMBUSH_MIN_LEVEL) {
        return null;
      }
    }
    const pickedRow = candidates[0];
    if (!pickedRow) return null;

    const hasBoundCandidate = candidates.some((row) => Number(row.bindScore || 0) > 0);
    const threatScore = computeStoryThreatScore(storyText);
    const allowThreatDrivenSelection = threatScore >= Math.max(18, STORY_THREAT_SCORE_THRESHOLD - 8) || wantedLevel >= WANTED_AMBUSH_MIN_LEVEL;
    if (!hasBoundCandidate && !allowLooseSelection && !allowThreatDrivenSelection) {
      return null;
    }

    const picked = hasBoundCandidate
      ? pickedRow.npc
      : (candidates.find((row) => !row?.npc?.roaming)?.npc || pickedRow.npc);

    if (picked) {
      return {
        npcId: String(picked.id || '').trim(),
        npcName: String(picked.name || '在地勢力').trim(),
        npcTitle: String(picked.title || '').trim(),
        enemy: buildStoryBattleEnemyFromNpc(picked, player, {
          wantedLevel,
          hunterCount: escalation.hunterCount
        })
      };
    }
    return null;
  }

  return {
    buildStoryBattleEnemyFromNpc,
    getNearbyStoryBattleNpcCandidates,
    scoreStoryBattleNpcCandidate,
    collectRecentStorySpeakerHints,
    normalizeConflictTargetName,
    pickStoryConflictDisplayName,
    normalizePendingConflictFollowupState,
    getPendingConflictFollowup,
    clearPendingConflictFollowup,
    setPendingConflictFollowup,
    scoreStoryBindingForNpc,
    resolveLocationStoryBattleTarget
  };
}

module.exports = { createChoiceConflictUtils };
