function createBattleLayoutUtils(deps = {}) {
  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    BATTLE,
    format1 = (value, fallback = 0) => Number(value ?? fallback),
    getMoveSpeedValue = () => 10,
    describeMoveEffects = () => '無',
    getCombatantMoves = () => [],
    hasPetSwapBlockingStatus = () => false,
    getBattleSwitchCandidates = () => [],
    getBattleElementRelation = () => ({ text: '屬性克制：無明確克制' }),
    formatBattleElementDisplay = (v) => String(v || '❔ 未知屬性'),
    getPetElementDisplayName = (v) => String(v || '未知屬性'),
    resolveEnemyBattleElement = () => '',
    getActiveCombatant = (_player, pet) => pet || null,
    PET_MOVE_LOADOUT_LIMIT = 5
  } = deps;

  function normalizeBattleLayoutMode(mode = '') {
    return String(mode || '').toLowerCase() === 'mobile' ? 'mobile' : 'desktop';
  }

  function getBattleLayoutMode(player) {
    return normalizeBattleLayoutMode(player?.battleUILayout || 'desktop');
  }

  function toggleBattleLayoutMode(player) {
    const current = getBattleLayoutMode(player);
    const next = current === 'mobile' ? 'desktop' : 'mobile';
    if (player && typeof player === 'object') {
      player.battleUILayout = next;
    }
    return next;
  }

  function getOnlineBattleLayoutMode(online = null) {
    return normalizeBattleLayoutMode(online?.layoutMode || 'desktop');
  }

  function toggleOnlineBattleLayoutMode(online = null) {
    const current = getOnlineBattleLayoutMode(online);
    const next = current === 'mobile' ? 'desktop' : 'mobile';
    if (online && typeof online === 'object') {
      online.layoutMode = next;
    }
    return next;
  }

  function buildBattleMoveDetails(player, pet, combatant) {
    const battleState = player?.battleState || {};
    const currentEnergy = Number.isFinite(Number(battleState.energy)) ? Number(battleState.energy) : 2;
    return getCombatantMoves(combatant, pet).map((m) => {
      const d = BATTLE.calculatePlayerMoveDamage(m, player, combatant);
      const energyCost = BATTLE.getMoveEnergyCost(m);
      const moveSpeed = getMoveSpeedValue(m);
      const canUse = currentEnergy >= energyCost;
      const effectStr = describeMoveEffects(m);
      return `⚔️ ${m.name} | ${format1(d.total)} dmg | ⚡${energyCost} | 🚀速度${format1(moveSpeed)} | ${canUse ? '可用' : '能量不足'} | ${effectStr || '無'}`;
    }).join('\n');
  }

  function ensureBattleEnergyState(player) {
    if (!player?.battleState) return { energy: 0, turn: 1 };
    if (!Number.isFinite(Number(player.battleState.energy))) player.battleState.energy = 2;
    if (!Number.isFinite(Number(player.battleState.turn)) || Number(player.battleState.turn) < 1) player.battleState.turn = 1;
    return {
      energy: Number(player.battleState.energy),
      turn: Number(player.battleState.turn)
    };
  }

  function advanceBattleTurnEnergy(player, spentCost = 0) {
    if (!player?.battleState) return { energy: 0, turn: 1 };
    const state = ensureBattleEnergyState(player);
    const spent = Math.max(0, Number(spentCost) || 0);
    const remaining = Math.max(0, state.energy - spent);
    player.battleState.energy = remaining + 2;
    player.battleState.turn = Math.max(1, state.turn) + 1;
    return {
      energy: player.battleState.energy,
      turn: player.battleState.turn
    };
  }

  function buildBattleActionRows(player, pet, combatant, options = {}) {
    const state = ensureBattleEnergyState(player);
    const battleState = player.battleState || {};
    const disableAll = Boolean(options?.disableAll);
    const currentEnergy = state.energy;
    const indexedMoves = getCombatantMoves(combatant, pet)
      .map((m, i) => ({ move: m, index: i }))
      .slice(0, Math.min(5, PET_MOVE_LOADOUT_LIMIT));

    const moveButtons = indexedMoves.map(({ move, index }) => {
      const energyCost = BATTLE.getMoveEnergyCost(move);
      const canUse = currentEnergy >= energyCost;
      return new ButtonBuilder()
        .setCustomId(`use_move_${index}`)
        .setLabel(`${move.name} ⚡${energyCost}`)
        .setStyle(canUse ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setDisabled(disableAll || !canUse);
    });

    const moveRow = new ActionRowBuilder().addComponents(
      moveButtons.length > 0
        ? moveButtons
        : [new ButtonBuilder().setCustomId('no_attack_moves').setLabel('無可用攻擊招式').setStyle(ButtonStyle.Secondary).setDisabled(true)]
    );
    const fleeTry = battleState.fleeAttempts || 0;
    const fleeMaxAttempts = Math.max(1, Number(BATTLE?.FLEE_CONFIG?.maxAttempts || 2));
    const swapBlocked = hasPetSwapBlockingStatus(combatant?.status || {});
    const canSwap = !disableAll && !combatant?.isHuman && !swapBlocked && getBattleSwitchCandidates(player, combatant?.id).length > 0;
    const layoutMode = getBattleLayoutMode(player);
    const toggleLabel = layoutMode === 'mobile' ? '🖥️ 電腦版' : '📱 手機版';
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('battle_wait').setLabel('⚡ 蓄能待機').setStyle(ButtonStyle.Primary).setDisabled(disableAll),
      new ButtonBuilder().setCustomId('battle_switch_pet').setLabel('🔁 換寵物').setStyle(ButtonStyle.Secondary).setDisabled(!canSwap),
      new ButtonBuilder()
        .setCustomId(`flee_${fleeTry}`)
        .setLabel(`🏃 逃跑 70%（失敗 ${fleeTry}/${fleeMaxAttempts}）`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disableAll || fleeTry >= fleeMaxAttempts),
      new ButtonBuilder()
        .setCustomId('battle_toggle_layout')
        .setLabel(toggleLabel)
        .setStyle(ButtonStyle.Secondary)
    );
    return [moveRow, actionRow];
  }

  function clipBattleCellText(text = '', maxLen = 18) {
    const raw = String(text || '').trim() || '—';
    const safeMax = Math.max(4, Number(maxLen) || 18);
    if (getBattleTextWidth(raw) <= safeMax) return raw;
    const ellipsis = '…';
    const keepWidth = Math.max(1, safeMax - getBattleTextWidth(ellipsis));
    let out = '';
    let used = 0;
    for (const ch of raw) {
      const w = getBattleCharWidth(ch);
      if (used + w > keepWidth) break;
      out += ch;
      used += w;
    }
    return `${out}${ellipsis}`;
  }

  function padBattleCellText(text = '', width = 18) {
    const safeWidth = Math.max(4, Number(width) || 18);
    const clipped = clipBattleCellText(text, safeWidth);
    let used = 0;
    for (const ch of clipped) used += getBattleCharWidth(ch);
    return `${clipped}${' '.repeat(Math.max(0, safeWidth - used))}`;
  }

  function padBattleLabel(text = '', width = 18) {
    return padBattleCellText(text, width);
  }

  function wrapBattleCellText(text = '', maxWidth = 18, maxLines = 2) {
    const source = String(text || '').trim();
    if (!source) return [''];
    const safeWidth = Math.max(4, Number(maxWidth) || 18);
    const safeLines = Math.max(1, Number(maxLines) || 1);
    const out = [];
    let line = '';
    let lineWidth = 0;
    for (const ch of source) {
      if (ch === '\n') {
        out.push(line);
        line = '';
        lineWidth = 0;
        continue;
      }
      const w = getBattleCharWidth(ch);
      if (lineWidth + w > safeWidth && line) {
        out.push(line);
        line = ch;
        lineWidth = w;
      } else {
        line += ch;
        lineWidth += w;
      }
    }
    if (line || out.length === 0) out.push(line);
    if (out.length <= safeLines) return out;
    const kept = out.slice(0, safeLines);
    kept[safeLines - 1] = clipBattleCellText(`${kept[safeLines - 1]}…`, safeWidth);
    return kept;
  }

  const BATTLE_WIDE_CHAR_RE = /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u;
  const BATTLE_EMOJI_RE = /[\u{2600}-\u{27bf}\u{1f300}-\u{1faff}]/u;

  function getBattleCharWidth(ch = '') {
    if (!ch) return 0;
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(ch)) return 0;
    if (BATTLE_WIDE_CHAR_RE.test(ch) || BATTLE_EMOJI_RE.test(ch)) return 2;
    return 1;
  }

  function getBattleTextWidth(source = '') {
    let total = 0;
    for (const ch of String(source || '')) total += getBattleCharWidth(ch);
    return total;
  }

  function getBattleBoxInnerWidth(lines = [], min = 24, max = 42) {
    const safeMin = Math.max(18, Number(min) || 24);
    const safeMax = Math.max(safeMin, Number(max) || 42);
    let width = safeMin;
    for (const line of Array.isArray(lines) ? lines : []) {
      width = Math.max(width, getBattleTextWidth(String(line || '')));
    }
    return Math.min(safeMax, width);
  }

  function extractActionExtra(lines = [], fallback = '無') {
    const cleaned = (Array.isArray(lines) ? lines : [])
      .map((line) => String(line || '').trim())
      .filter(Boolean)
      .filter((line) => !/施展「/.test(line));
    if (cleaned.length === 0) return fallback;
    return cleaned.slice(0, 2).join(' / ');
  }

  function buildActionPanelLines(title, data = {}, width = 24) {
    const safeWidth = Math.max(18, Number(width) || 24);
    const inner = safeWidth;
    const top = `┌─【${title}】${'─'.repeat(Math.max(0, inner - title.length - 4))}┐`;
    const bottom = `└${'─'.repeat(inner + 2)}┘`;
    const toLine = (value = '') => `│ ${padBattleCellText(value, inner)} │`;

    if (data?.pending) {
      return [top, toLine('（準備中...）'), toLine(''), toLine(''), toLine(''), bottom];
    }

    const moveLine = data?.move ? `招式：${data.move}` : '（尚未行動）';
    const damageLabel = data?.damageLabel || '造成';
    const damageLine = Number.isFinite(Number(data?.damage))
      ? `${damageLabel}：${format1(Math.max(0, Number(data.damage)))}`
      : '';
    const extraLabel = '附加：';
    const extraIndent = '      ';
    const extraRaw = String(data?.extra || '無').trim() || '無';
    const extraMaxWidth = Math.max(4, inner - 6);
    const extraWrapped = wrapBattleCellText(extraRaw, extraMaxWidth, 2);
    const extraLine1 = `${extraLabel}${extraWrapped[0] || '無'}`;
    const extraLine2 = extraWrapped[1] ? `${extraIndent}${extraWrapped[1]}` : '';

    return [
      top,
      toLine(moveLine),
      toLine(damageLine),
      toLine(extraLine1),
      toLine(extraLine2),
      bottom
    ];
  }

  function buildDualActionPanels(actionView = {}) {
    const ally = buildActionPanelLines('我方行動', actionView?.ally || {}, 26);
    const enemy = buildActionPanelLines('敵方行動', actionView?.enemy || {}, 26);
    const rows = [];
    for (let i = 0; i < Math.max(ally.length, enemy.length); i++) {
      rows.push(`${ally[i] || ''}    ${enemy[i] || ''}`);
    }
    return `\`\`\`text\n${rows.join('\n')}\n\`\`\``;
  }

  function buildDualActionPanelsMobile(actionView = {}, options = {}) {
    const ally = actionView?.ally || {};
    const enemy = actionView?.enemy || {};
    const allyName = String(options?.allyName || '我方').trim();
    const allyMove = ally?.pending ? '（準備中...）' : (ally?.move || '（尚未行動）');
    const enemyMove = enemy?.pending ? '（準備中...）' : (enemy?.move || '（尚未行動）');
    const allyDamage = Number.isFinite(Number(ally?.damage)) ? format1(Math.max(0, Number(ally.damage))) : '—';
    const enemyDamage = Number.isFinite(Number(enemy?.damage)) ? format1(Math.max(0, Number(enemy.damage))) : '—';
    const allyExtra = ally?.pending ? '—' : (ally?.extra || '無');
    const enemyExtra = enemy?.pending ? '—' : (enemy?.extra || '無');
    return (
      `【敵方行動】\n` +
      `招式：${enemyMove}\n` +
      `對我造成：${enemyDamage}\n` +
      `附加：${enemyExtra}\n` +
      `--------------------------------\n` +
      `戰況更新：🐾 我方：${allyName}\n` +
      `【我方行動】\n` +
      `招式：${allyMove}\n` +
      `對敵造成：${allyDamage}\n` +
      `附加：${allyExtra}`
    );
  }

  function formatBattleHpValue(value, fallback = 0) {
    return format1(value, fallback);
  }

  function buildBattleHpBar(current = 0, max = 1, width = 12) {
    const safeMax = Math.max(1, Number(max || 1));
    const safeCurrent = Math.max(0, Math.min(safeMax, Number(current || 0)));
    const safeWidth = Math.max(6, Math.min(20, Math.floor(Number(width) || 12)));
    const ratio = safeCurrent / safeMax;
    const filled = Math.max(0, Math.min(safeWidth, Math.round(ratio * safeWidth)));
    const empty = Math.max(0, safeWidth - filled);
    const bar = `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
    const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    return { bar, percent };
  }

  function buildBattleMobileCombinedLayout(enemy, combatant, state, actionView = {}) {
    const enemyElement = formatBattleElementDisplay(resolveEnemyBattleElement(enemy));
    const allyElement = combatant?.isHuman
      ? '🧍 無屬性'
      : formatBattleElementDisplay(combatant?.type || combatant?.element || '');
    const relationText = getBattleElementRelation(
      combatant?.isHuman ? '' : (combatant?.type || combatant?.element || ''),
      resolveEnemyBattleElement(enemy)
    ).text;
    const turn = Number(state?.turn || 1);
    const energy = Number(state?.energy || 0);
    const ally = actionView?.ally || {};
    const enemyAction = actionView?.enemy || {};
    const enemyMove = enemyAction?.pending ? '（準備中...）' : (enemyAction?.move || '（尚未行動）');
    const allyMove = ally?.pending ? '（準備中...）' : (ally?.move || '（尚未行動）');
    const enemyDamage = Number.isFinite(Number(enemyAction?.damage)) ? format1(Math.max(0, Number(enemyAction.damage))) : '—';
    const allyDamage = Number.isFinite(Number(ally?.damage)) ? format1(Math.max(0, Number(ally.damage))) : '—';
    const enemyExtra = enemyAction?.pending ? '—' : (enemyAction?.extra || '無');
    const allyExtra = ally?.pending ? '—' : (ally?.extra || '無');
    const enemyHpBar = buildBattleHpBar(enemy?.hp, enemy?.maxHp, 12);
    const allyHpBar = buildBattleHpBar(combatant?.hp, combatant?.maxHp, 12);

    return (
      `第 ${turn} 回合\n` +
      `👹 敵方：${enemy?.name || '敵人'}\n` +
      `屬性：${enemyElement}\n` +
      `HP：${formatBattleHpValue(enemy?.hp, 0)}/${formatBattleHpValue(enemy?.maxHp, 1)} ｜ ${enemyHpBar.bar} ${enemyHpBar.percent}% ｜ ATK：${format1(enemy?.attack || 0)}\n\n` +
      `【敵方行動】\n` +
      `招式：${enemyMove}\n` +
      `對我造成：${enemyDamage}\n` +
      `附加：${enemyExtra}\n\n` +
      `--------------------------------\n\n` +
      `🐾 我方：${combatant?.name || '我方'}\n` +
      `屬性：${allyElement}\n` +
      `${relationText}\n` +
      `HP：${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)} ｜ ${allyHpBar.bar} ${allyHpBar.percent}%\n` +
      `⚡ 能量：${energy}（每回 +2，可結轉）\n\n` +
      `【我方行動】\n` +
      `招式：${allyMove}\n` +
      `對敵造成：${allyDamage}\n` +
      `附加：${allyExtra}`
    );
  }

  function buildActionViewFromPhase(playerPhase = null, enemyPhase = null, options = {}) {
    const enemyPending = Boolean(options?.enemyPending);
    return {
      ally: {
        move: playerPhase?.playerMoveName || '',
        damage: Number.isFinite(Number(playerPhase?.playerDamage)) ? Number(playerPhase.playerDamage) : null,
        damageLabel: '對敵造成',
        extra: extractActionExtra(playerPhase?.playerLines || [])
      },
      enemy: enemyPending
        ? { pending: true }
        : {
            move: enemyPhase?.enemyMoveName || '',
            damage: Number.isFinite(Number(enemyPhase?.enemyDamage)) ? Number(enemyPhase.enemyDamage) : null,
            damageLabel: '對我造成',
            extra: extractActionExtra(enemyPhase?.enemyLines || [])
          }
    };
  }

  function buildAIBattleStory(rounds, combatant, enemy, finalResult) {
    const lines = [];
    const icon = combatant?.isHuman ? '🧍' : '🐾';
    lines.push(`戰場氣壓驟降，${combatant.name}與${enemy.name}在塵霧中對峙，呼吸與殺意同時收緊。`);
    for (const r of rounds) {
      const hitText = r.playerDamage > 0
        ? `命中造成 **${format1(r.playerDamage)}** 點傷害`
        : '攻勢被對手硬生生擋下';
      const takenText = r.enemyDamage > 0
        ? `反擊讓你承受 **${format1(r.enemyDamage)}** 點傷害`
        : '反擊落空，擦身而過';
      lines.push(
        `**第 ${r.turn} 回合**\n` +
        `${icon} ${combatant.name}使出「${r.playerMove}」，${hitText}。\n` +
        `👹 ${enemy.name}立刻以「${r.enemyMove}」回應，${takenText}。\n` +
        `⚡ 能量：${r.energyBefore ?? '-'} -> ${r.energyAfter ?? '-'}（消耗 ${r.energyCost ?? 0}）\n` +
        `📉 戰況：${combatant.name} ${r.petHp}/${r.petMaxHp} ｜ ${enemy.name} ${r.enemyHp}/${r.enemyMaxHp}`
      );
    }
    if (finalResult) {
      const lastRound = Array.isArray(rounds) && rounds.length > 0 ? rounds[rounds.length - 1] : null;
      const finisher = String(lastRound?.playerMove || '最後一擊').trim();
      if (finalResult.victory === true) {
        const gold = Math.max(0, Number(finalResult?.gold || 0));
        const wanted = Math.max(0, Number(finalResult?.wantedLevel || 0));
        const rewardLine = gold > 0 ? `，獲得 ${gold} Rns！` : '。';
        const wantedLine = wanted > 0 ? `\n⚠️ 你現在是 ${wanted} 級通緝犯！` : '';
        lines.push(`**終局：** 🏆 ${combatant.name}以「${finisher}」擊倒${enemy.name}${rewardLine}${wantedLine}`);
      } else if (finalResult.victory === false) {
        lines.push(`**終局：** 💀 ${combatant.name}不敵${enemy.name}，戰鬥落敗。`);
      } else if (finalResult?.message) {
        lines.push(`**終局：** ${String(finalResult.message).split('\n').slice(-1)[0]}`);
      }
    }
    return lines.join('\n\n');
  }

  function buildManualBattleBoard(enemy, combatant, state) {
    const enemyName = String(enemy?.name || '敵人').trim() || '敵人';
    const allyName = String(combatant?.name || '我方').trim() || '我方';
    const enemyElement = formatBattleElementDisplay(resolveEnemyBattleElement(enemy));
    const allyElement = combatant?.isHuman
      ? '🧍 無屬性'
      : formatBattleElementDisplay(combatant?.type || combatant?.element || '');
    const relationText = getBattleElementRelation(
      combatant?.isHuman ? '' : (combatant?.type || combatant?.element || ''),
      resolveEnemyBattleElement(enemy)
    ).text.replace(/^([^\s]+\s)/u, '');
    const enemyHp = `${formatBattleHpValue(enemy?.hp, 0)}/${formatBattleHpValue(enemy?.maxHp, 1)}`;
    const allyHp = `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`;
    const enemyHpBar = buildBattleHpBar(enemy?.hp, enemy?.maxHp, 12);
    const allyHpBar = buildBattleHpBar(combatant?.hp, combatant?.maxHp, 12);
    const turn = Number(state?.turn || 1);
    const energy = Number(state?.energy || 0);
    const roundText = `第 ${turn} 回合`;
    const allyRelation = `克制：${relationText}`;
    const enemyHeader = `【敵方】 HP ${enemyHp}`;
    const allyHeader = `【我方】 HP ${allyHp}`;
    const enemyPreviewLines = [
      enemyHeader,
      `名稱 ${enemyName}`,
      `HPBAR ${enemyHpBar.bar} ${enemyHpBar.percent}%`,
      `屬性 ${enemyElement}`,
      `ATK ${enemy?.attack || 0}`
    ];
    const allyPreviewLines = [
      allyHeader,
      `名稱 ${allyName}`,
      `HPBAR ${allyHpBar.bar} ${allyHpBar.percent}%`,
      `屬性 ${allyElement}`,
      allyRelation,
      `⚡ 能量 ${energy}（每回 +2，可結轉）`
    ];
    const boxInnerWidth = getBattleBoxInnerWidth(
      enemyPreviewLines.concat(allyPreviewLines),
      24,
      40
    );
    const boardOuterWidth = boxInnerWidth + 4;
    const boardTargetWidth = 66;
    const enemyIndentWidth = Math.max(0, boardTargetWidth - boardOuterWidth);
    const enemyIndent = ' '.repeat(enemyIndentWidth);
    const roundLine = `${' '.repeat(Math.max(0, boardTargetWidth - getBattleTextWidth(roundText)))}${roundText}`;
    const enemyTop = `${enemyIndent}┌${'─'.repeat(boxInnerWidth + 2)}┐`;
    const enemyBottom = `${enemyIndent}└${'─'.repeat(boxInnerWidth + 2)}┘`;
    const allyTop = `┌${'─'.repeat(boxInnerWidth + 2)}┐`;
    const allyBottom = `└${'─'.repeat(boxInnerWidth + 2)}┘`;
    const enemyLine = (text = '') => `${enemyIndent}│ ${padBattleCellText(text, boxInnerWidth)} │`;
    const allyLine = (text = '') => `│ ${padBattleCellText(text, boxInnerWidth)} │`;
    return (
      '```text\n' +
      `${roundLine}\n` +
      `${enemyTop}\n` +
      `${enemyLine(enemyHeader)}\n` +
      `${enemyLine(`名稱 ${enemyName}`)}\n` +
      `${enemyLine(`HPBAR ${enemyHpBar.bar} ${enemyHpBar.percent}%`)}\n` +
      `${enemyLine(`屬性 ${enemyElement}`)}\n` +
      `${enemyLine(`ATK ${enemy?.attack || 0}`)}\n` +
      `${enemyBottom}\n\n` +
      `${allyTop}\n` +
      `${allyLine(allyHeader)}\n` +
      `${allyLine(`名稱 ${allyName}`)}\n` +
      `${allyLine(`HPBAR ${allyHpBar.bar} ${allyHpBar.percent}%`)}\n` +
      `${allyLine(`屬性 ${allyElement}`)}\n` +
      `${allyLine(allyRelation)}\n` +
      `${allyLine(`⚡ 能量 ${energy}（每回 +2，可結轉）`)}\n` +
      `${allyBottom}\n` +
      '```'
    );
  }

  function buildManualBattleBoardMobile(enemy, combatant, state) {
    const enemyElement = formatBattleElementDisplay(resolveEnemyBattleElement(enemy));
    const allyElement = combatant?.isHuman ? '🧍 無屬性' : formatBattleElementDisplay(combatant?.type || combatant?.element || '');
    const relationText = getBattleElementRelation(
      combatant?.isHuman ? '' : (combatant?.type || combatant?.element || ''),
      resolveEnemyBattleElement(enemy)
    ).text;
    const turn = Number(state?.turn || 1);
    const energy = Number(state?.energy || 0);
    const enemyHpBar = buildBattleHpBar(enemy?.hp, enemy?.maxHp, 12);
    const allyHpBar = buildBattleHpBar(combatant?.hp, combatant?.maxHp, 12);
    return (
      `第 ${turn} 回合\n` +
      `👹 敵方：${enemy?.name || '敵人'}\n` +
      `屬性：${enemyElement}\n` +
      `HP：${formatBattleHpValue(enemy?.hp, 0)}/${formatBattleHpValue(enemy?.maxHp, 1)} ｜ ${enemyHpBar.bar} ${enemyHpBar.percent}% ｜ ATK：${format1(enemy?.attack || 0)}\n\n` +
      `🐾 我方：${combatant?.name || '我方'}\n` +
      `屬性：${allyElement}\n` +
      `${relationText}\n` +
      `HP：${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)} ｜ ${allyHpBar.bar} ${allyHpBar.percent}%\n` +
      `⚡ 能量：${energy}（每回 +2，可結轉）`
    );
  }

  async function sendBattleMessage(interaction, payload, mode = 'update') {
    if (mode === 'edit') {
      if (interaction?.message?.edit) {
        await interaction.message.edit(payload);
        return;
      }
      if (interaction?.channel && interaction?.message?.id) {
        const msg = await interaction.channel.messages.fetch(interaction.message.id);
        if (msg) await msg.edit(payload);
        return;
      }
    }
    await interaction.update(payload);
  }

  function buildManualBattlePayload(player, pet, options = {}) {
    const enemy = player?.battleState?.enemy;
    const combatant = getActiveCombatant(player, pet);
    const state = ensureBattleEnergyState(player);
    const [moveRow, actionRow] = buildBattleActionRows(player, pet, combatant, { disableAll: Boolean(options?.disableActions) });
    const dmgInfo = buildBattleMoveDetails(player, pet, combatant);
    const fighterLabel = combatant.isHuman ? `🧍 ${combatant.name}` : `🐾 ${combatant.name}`;
    const layoutMode = getBattleLayoutMode(player);
    const actionView = options?.actionView || {};
    const board = layoutMode === 'mobile'
      ? buildBattleMobileCombinedLayout(enemy, combatant, state, actionView)
      : buildManualBattleBoard(enemy, combatant, state);
    const actionPanels = layoutMode === 'mobile'
      ? ''
      : buildDualActionPanels(actionView);
    const statusLines = []
      .concat(Array.isArray(options?.turnStartLines) ? options.turnStartLines : [])
      .concat(Array.isArray(options?.extraLines) ? options.extraLines : []);
    const statusText = statusLines.length > 0 ? `\n**戰況更新：**\n${statusLines.join('\n')}\n` : '';
    const noticeLine = options?.notice ? `\n${options.notice}\n` : '';

    return {
      content:
        `⚔️ **戰鬥中：${fighterLabel} vs ${enemy.name}**\n` +
        `${board}${actionPanels ? `\n\n${actionPanels}` : ''}` +
        `${statusText}` +
        `${noticeLine}` +
        `\n**招式：**\n${dmgInfo}`,
      embeds: [],
      components: [moveRow, actionRow]
    };
  }

  function buildBattleSwitchPayload(player, currentPet, notice = '') {
    const enemy = player?.battleState?.enemy;
    const combatant = getActiveCombatant(player, currentPet);
    const state = ensureBattleEnergyState(player);
    const layoutMode = getBattleLayoutMode(player);
    const board = layoutMode === 'mobile'
      ? buildManualBattleBoardMobile(enemy, combatant, state)
      : buildManualBattleBoard(enemy, combatant, state);
    const candidates = getBattleSwitchCandidates(player, combatant?.id);
    const options = candidates.slice(0, 25).map((p) => ({
      label: `${p.name}`.slice(0, 100),
      description: `${getPetElementDisplayName(p.type, player?.language || 'zh-TW')}｜HP ${p.hp}/${p.maxHp}`.slice(0, 100),
      value: String(p.id || '')
    }));

    const rows = [];
    if (options.length > 0) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('battle_switch_select')
        .setPlaceholder('選擇要換上的寵物')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options);
      rows.push(new ActionRowBuilder().addComponents(menu));
    }
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('battle_switch_cancel').setLabel('↩️ 取消換寵').setStyle(ButtonStyle.Secondary)
    ));

    return {
      content:
        `⚔️ **戰鬥中：🐾 ${combatant?.name || '寵物'} vs ${enemy?.name || '敵人'}**\n` +
        `${board}\n` +
        `${notice ? `${notice}\n` : ''}` +
        '請選擇要換上的寵物：',
      embeds: [],
      components: rows
    };
  }

  return {
    normalizeBattleLayoutMode,
    getBattleLayoutMode,
    toggleBattleLayoutMode,
    getOnlineBattleLayoutMode,
    toggleOnlineBattleLayoutMode,
    buildBattleMoveDetails,
    ensureBattleEnergyState,
    advanceBattleTurnEnergy,
    buildBattleActionRows,
    clipBattleCellText,
    extractActionExtra,
    buildActionPanelLines,
    buildDualActionPanels,
    buildDualActionPanelsMobile,
    buildBattleMobileCombinedLayout,
    buildActionViewFromPhase,
    buildAIBattleStory,
    padBattleLabel,
    formatBattleHpValue,
    buildManualBattleBoard,
    buildManualBattleBoardMobile,
    sendBattleMessage,
    buildManualBattlePayload,
    buildBattleSwitchPayload
  };
}

module.exports = {
  createBattleLayoutUtils
};
