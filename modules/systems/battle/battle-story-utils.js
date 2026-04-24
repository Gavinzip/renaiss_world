function createBattleStoryUtils(deps = {}) {
  const CORE = deps.CORE;
  const PET = deps.PET;
  const mentorSparWinHpRatio = Number(deps.mentorSparWinHpRatio || 0.35);
  const ensureMentorSparRecord = typeof deps.ensureMentorSparRecord === 'function'
    ? deps.ensureMentorSparRecord
    : (() => ({ completedByMentor: {}, completedOrder: [], totalCompleted: 0 }));
  const getPlayerStoryTurns = typeof deps.getPlayerStoryTurns === 'function'
    ? deps.getPlayerStoryTurns
    : (() => 0);
  const rememberPlayer = typeof deps.rememberPlayer === 'function'
    ? deps.rememberPlayer
    : (() => {});
  const queuePendingStoryTrigger = typeof deps.queuePendingStoryTrigger === 'function'
    ? deps.queuePendingStoryTrigger
    : (() => {});
  const formatRecoveryTurnsShort = typeof deps.formatRecoveryTurnsShort === 'function'
    ? deps.formatRecoveryTurnsShort
    : ((v) => `${Number(v || 0)}回合`);
  const appendStoryContinuation = typeof deps.appendStoryContinuation === 'function'
    ? deps.appendStoryContinuation
    : ((prev, extra = '') => [String(prev || '').trim(), String(extra || '').trim()].filter(Boolean).join('\n\n'));
  const getLanguageSection = typeof deps.getLanguageSection === 'function'
    ? deps.getLanguageSection
    : null;

  function getBattleText(lang = 'zh-TW') {
    let base = {};
    let localized = {};
    try {
      base = getLanguageSection ? (getLanguageSection('battleText', 'zh-TW') || {}) : {};
      localized = getLanguageSection ? (getLanguageSection('battleText', lang) || {}) : {};
    } catch {
      base = {};
      localized = {};
    }
    return { ...base, ...localized };
  }

  function summarizeBattleDetailForStory(detail = '', maxLen = 260) {
    const text = String(detail || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return `${text.slice(0, Math.max(40, maxLen - 1))}…`;
  }

  function composePostBattleStory(player, outcomeLine, detail = '', epilogue = '', triggerChoice = '', baseStory = '') {
    const prev = String(baseStory || player?.currentStory || '').trim();
    const parts = [];
    if (outcomeLine) parts.push(String(outcomeLine).trim());
    const summary = summarizeBattleDetailForStory(detail);
    if (summary) parts.push(`戰況摘要：${summary}`);
    if (epilogue) parts.push(String(epilogue).trim());
    if (triggerChoice) parts.push(`你先前的決定：${String(triggerChoice).trim()}`);
    const merged = parts.filter(Boolean).join('\n\n');
    return appendStoryContinuation(prev, merged);
  }

  function composeActionBridgeStory(player, triggerChoice = '', resultText = '') {
    const prev = String(player?.currentStory || '').trim();
    const parts = [];
    if (triggerChoice) parts.push(`你剛做出的行動：${String(triggerChoice).trim()}`);
    const summary = summarizeBattleDetailForStory(resultText, 420);
    if (summary) parts.push(`現場結果：${summary}`);
    const merged = parts.filter(Boolean).join('\n\n');
    if (!merged) return prev;
    if (merged.length <= 2200) return merged;
    return merged.slice(merged.length - 2200);
  }

  function maybeResolveMentorSparResult(player, enemy, roundResult) {
    const spar = player?.battleState?.mentorSpar;
    if (!spar || !enemy || !roundResult) return roundResult;
    const threshold = Math.max(
      1,
      Number(spar.acceptHpThreshold || Math.floor(Number(enemy?.maxHp || enemy?.hp || 1) * mentorSparWinHpRatio))
    );
    const mentorName = String(spar.mentorName || enemy?.name || '導師');
    if (roundResult.victory === null && Number(enemy?.hp || 0) <= threshold) {
      return {
        ...roundResult,
        victory: true,
        gold: 0,
        wantedLevel: 0,
        message: `${roundResult.message || ''}\n🤝 ${mentorName}抬手示意停戰：你已通過試煉。`.trim()
      };
    }
    if (roundResult.victory === true) {
      return {
        ...roundResult,
        gold: 0,
        wantedLevel: 0,
        message: `${roundResult.message || ''}\n🤝 ${mentorName}點頭：這場友誼賽到此為止。`.trim()
      };
    }
    return roundResult;
  }

  function recordMentorSparCompletion(player, spar = {}, result = 'done') {
    if (!player || typeof player !== 'object') return;
    const mentorId = String(spar?.mentorId || '').trim();
    const mentorName = String(spar?.mentorName || mentorId || '導師').trim();
    if (!mentorId) return;

    const record = ensureMentorSparRecord(player);
    const now = Date.now();
    const turn = getPlayerStoryTurns(player);
    record.completedByMentor[mentorId] = {
      mentorId,
      mentorName,
      mentorTitle: String(spar?.mentorTitle || '').trim(),
      mentorLoc: String(spar?.mentorLoc || player?.location || '').trim(),
      result: String(result || 'done'),
      completedAt: now,
      completedTurn: turn
    };
    if (!record.completedOrder.includes(mentorId)) {
      record.completedOrder.push(mentorId);
    }
    record.totalCompleted = Object.keys(record.completedByMentor).length;

    player.lastMentorSparTurn = turn;

    if (!Array.isArray(player.achievements)) player.achievements = [];
    const achievementId = `mentor_spar:${mentorId}`;
    if (!player.achievements.some((row) => String(row?.id || '') === achievementId)) {
      player.achievements.push({
        id: achievementId,
        type: 'mentor_spar',
        title: `友誼賽成就｜${mentorName}`,
        summary: '已完成一次性友誼賽，無法再次挑戰同導師',
        at: now
      });
    }
  }

  function finalizeMentorSparVictory(player, pet, detailText = '') {
    const battleState = player?.battleState || {};
    const spar = battleState?.mentorSpar || {};
    const mentorName = String(spar.mentorName || '導師');
    const teachMoveIds = Array.isArray(spar.teachMoveIds) ? spar.teachMoveIds : [];
    let learnedMove = null;
    let learnReason = '';
    for (const moveId of teachMoveIds) {
      const result = PET.learnMove(pet, moveId);
      if (result?.success) {
        learnedMove = result.move;
        break;
      }
      if (!learnReason && result?.reason) learnReason = result.reason;
    }
    PET.savePet(pet);

    const sourceChoice = String(battleState?.sourceChoice || '').trim();
    const baseStory = String(battleState?.preBattleStory || player?.currentStory || '').trim();
    recordMentorSparCompletion(player, spar, 'victory');
    const learnLine = learnedMove
      ? `📜 ${mentorName}收你為徒，傳授了「${learnedMove.name}」。`
      : `📜 ${mentorName}願意收你為徒，但本次未新增招式（${learnReason || '你已掌握其核心招式'}）。`;
    rememberPlayer(player, {
      type: '友誼賽',
      content: `與${mentorName}完成友誼賽`,
      outcome: learnedMove ? `學會 ${learnedMove.name}` : `收徒成功｜${learnReason || '無新招式'}`,
      importance: 3,
      tags: ['mentor_spar', 'apprentice']
    });
    player.currentStory = composePostBattleStory(
      player,
      `🤝 你在友誼賽中獲得 ${mentorName} 認可。`,
      detailText,
      `${learnLine}\n你把這份指導記在心裡，準備帶往下一段冒險。\n🔒 你已完成與 ${mentorName} 的一次性友誼賽，之後不可重複挑戰。`,
      sourceChoice,
      baseStory
    );
    queuePendingStoryTrigger(player, {
      name: '友誼賽結果',
      choice: sourceChoice || `與${mentorName}友誼賽`,
      desc: `${mentorName} 的試煉已告一段落`,
      action: 'mentor_spar_result',
      outcome: `${learnLine}\n${String(detailText || '').trim()}`
    });
    player.battleState = null;
    player.eventChoices = [];
    CORE.savePlayer(player);
    return { mentorName, learnedMove, learnReason, learnLine };
  }

  function finalizeMentorSparDefeat(player, pet, combatant, detailText = '') {
    const battleState = player?.battleState || {};
    const spar = battleState?.mentorSpar || {};
    const mentorName = String(spar.mentorName || '導師');
    if (pet) {
      pet.hp = pet.maxHp || 100;
      pet.status = '正常';
      pet.reviveAt = null;
      pet.reviveTurnsRemaining = 0;
      pet.lastDownReason = '友誼賽落敗後由導師治療';
      pet.lastRevivedAt = Date.now();
      PET.savePet(pet);
    }
    if (combatant?.isHuman) {
      player.stats.生命 = Math.max(1, Number(player?.maxStats?.生命 || 100));
    }
    const sourceChoice = String(battleState?.sourceChoice || '').trim();
    const baseStory = String(battleState?.preBattleStory || player?.currentStory || '').trim();
    recordMentorSparCompletion(player, spar, 'defeat');
    rememberPlayer(player, {
      type: '友誼賽',
      content: `在與${mentorName}的友誼賽中落敗`,
      outcome: '導師當場治療我方，並給予戰術建議',
      importance: 2,
      tags: ['mentor_spar', 'defeat', 'healed']
    });
    player.currentStory = composePostBattleStory(
      player,
      `🤝 你在友誼賽中敗給了 ${mentorName}。`,
      detailText,
      `${mentorName}沒有追擊，反而立刻替你的夥伴做緊急修復，並提醒你下次該如何調整節奏。\n🔒 這場友誼賽已列入紀錄，同一位導師不會再重複切磋。`,
      sourceChoice,
      baseStory
    );
    queuePendingStoryTrigger(player, {
      name: '友誼賽結果',
      choice: sourceChoice || `與${mentorName}友誼賽`,
      desc: `${mentorName} 指導你調整戰術節奏`,
      action: 'mentor_spar_result',
      outcome: String(detailText || '').trim()
    });
    player.battleState = null;
    player.eventChoices = [];
    CORE.savePlayer(player);
    return { mentorName };
  }

  function formatPetHpWithRecovery(pet, lang = 'zh-TW') {
    const hp = `${Math.round(Number(pet?.hp || 0))}/${Math.round(Number(pet?.maxHp || 0))}`;
    const remain = typeof PET.getPetRecoveryRemainingTurns === 'function'
      ? Number(PET.getPetRecoveryRemainingTurns(pet) || 0)
      : 0;
    if (remain > 0) {
      const tx = getBattleText(lang);
      if (typeof tx.hpRecoverySuffix === 'function') return `${hp}${tx.hpRecoverySuffix(remain)}`;
      return `${hp} (${formatRecoveryTurnsShort(remain)})`;
    }
    return hp;
  }

  return {
    summarizeBattleDetailForStory,
    composePostBattleStory,
    composeActionBridgeStory,
    maybeResolveMentorSparResult,
    recordMentorSparCompletion,
    finalizeMentorSparVictory,
    finalizeMentorSparDefeat,
    formatPetHpWithRecovery
  };
}

module.exports = {
  createBattleStoryUtils
};
