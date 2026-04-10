function createFriendOnlineUtils(deps = {}) {
  const CORE = deps.CORE;
  const PET = deps.PET;
  const loadPlayer = typeof deps.loadPlayer === 'function'
    ? deps.loadPlayer
    : (() => null);
  const getTimerStore = typeof deps.getTimerStore === 'function'
    ? deps.getTimerStore
    : (() => null);
  const CLIENT = deps.CLIENT || null;
  const findMessageInChannel = typeof deps.findMessageInChannel === 'function'
    ? deps.findMessageInChannel
    : (async () => null);
  const trackActiveGameMessage = typeof deps.trackActiveGameMessage === 'function'
    ? deps.trackActiveGameMessage
    : (() => {});
  const ActionRowBuilder = deps.ActionRowBuilder;
  const ButtonBuilder = deps.ButtonBuilder;
  const ButtonStyle = deps.ButtonStyle;
  const BATTLE = deps.BATTLE;
  const getMoveSpeedValue = typeof deps.getMoveSpeedValue === 'function'
    ? deps.getMoveSpeedValue
    : (() => 10);
  const format1 = typeof deps.format1 === 'function'
    ? deps.format1
    : ((value, fallback = 0) => Number(value ?? fallback));
  const describeMoveEffects = typeof deps.describeMoveEffects === 'function'
    ? deps.describeMoveEffects
    : (() => '無');
  const isFleeLikeMove = typeof deps.isFleeLikeMove === 'function'
    ? deps.isFleeLikeMove
    : (() => false);
  const getCombatantMoves = typeof deps.getCombatantMoves === 'function'
    ? deps.getCombatantMoves
    : (() => []);
  const getActiveCombatant = typeof deps.getActiveCombatant === 'function'
    ? deps.getActiveCombatant
    : ((_player, pet) => pet || null);
  const ensureBattleEnergyState = typeof deps.ensureBattleEnergyState === 'function'
    ? deps.ensureBattleEnergyState
    : (() => ({ energy: 2, turn: 1 }));
  const getOnlineBattleLayoutMode = typeof deps.getOnlineBattleLayoutMode === 'function'
    ? deps.getOnlineBattleLayoutMode
    : (() => 'desktop');
  const getBattleLayoutMode = typeof deps.getBattleLayoutMode === 'function'
    ? deps.getBattleLayoutMode
    : (() => 'desktop');
  const buildBattleMobileCombinedLayout = typeof deps.buildBattleMobileCombinedLayout === 'function'
    ? deps.buildBattleMobileCombinedLayout
    : (() => '');
  const buildManualBattleBoard = typeof deps.buildManualBattleBoard === 'function'
    ? deps.buildManualBattleBoard
    : (() => '');
  const buildDualActionPanels = typeof deps.buildDualActionPanels === 'function'
    ? deps.buildDualActionPanels
    : (() => '');
  const PET_MOVE_LOADOUT_LIMIT = Math.max(1, Number(deps.PET_MOVE_LOADOUT_LIMIT || 5));
  const FRIEND_DUEL_ONLINE_TURN_MS = Math.max(
    10000,
    Number(
      (typeof deps.FRIEND_DUEL_ONLINE_TURN_MS === 'function'
        ? deps.FRIEND_DUEL_ONLINE_TURN_MS()
        : deps.FRIEND_DUEL_ONLINE_TURN_MS) || 20000
    )
  );
  const WAIT_COMBAT_MOVE = (typeof deps.WAIT_COMBAT_MOVE === 'function'
    ? deps.WAIT_COMBAT_MOVE()
    : deps.WAIT_COMBAT_MOVE) || {
    id: 'wait',
    name: '待機',
    baseDamage: 0,
    damage: 0,
    element: '普通',
    tier: 1,
    speed: 20,
    priority: 0,
    effect: {}
  };
  const resolvePlayerMainPet = typeof deps.resolvePlayerMainPet === 'function'
    ? deps.resolvePlayerMainPet
    : ((_player, opts = {}) => ({ pet: opts.fallbackPet || null, changed: false }));
  const maybeResolveMentorSparResult = typeof deps.maybeResolveMentorSparResult === 'function'
    ? deps.maybeResolveMentorSparResult
    : ((_player, _enemy, roundResult) => roundResult);
  const persistCombatantState = typeof deps.persistCombatantState === 'function'
    ? deps.persistCombatantState
    : ((_player, pet) => pet);
  const trySwitchFriendDuelEnemy = typeof deps.trySwitchFriendDuelEnemy === 'function'
    ? deps.trySwitchFriendDuelEnemy
    : (() => ({ switched: false }));
  const trySwitchFriendDuelPlayerPet = typeof deps.trySwitchFriendDuelPlayerPet === 'function'
    ? deps.trySwitchFriendDuelPlayerPet
    : (() => ({ switched: false }));
  const finalizeFriendDuel = typeof deps.finalizeFriendDuel === 'function'
    ? deps.finalizeFriendDuel
    : ((_player, _pet, _combatant, _detail, didWin) => ({
      summaryLine: didWin ? '🤝 友誼戰結束（勝）' : '🤝 友誼戰結束（敗）',
      rivalName: '好友'
    }));
  const pickBestMoveForAI = typeof deps.pickBestMoveForAI === 'function'
    ? deps.pickBestMoveForAI
    : (() => WAIT_COMBAT_MOVE);
  const advanceBattleTurnEnergy = typeof deps.advanceBattleTurnEnergy === 'function'
    ? deps.advanceBattleTurnEnergy
    : (() => ({ turn: 1, energy: 2 }));
  const EmbedBuilder = deps.EmbedBuilder;

  function parseOnlineFriendDuelAction(customId = '') {
    const text = String(customId || '').trim();
    let matched = text.match(/^fdonline_join_([^_]+)$/);
    if (matched) {
      return {
        kind: 'join',
        hostId: String(matched[1] || '').trim(),
        moveIndex: -1
      };
    }
    matched = text.match(/^fdonline_move_([^_]+)_(\d+)$/);
    if (matched) {
      return {
        kind: 'move',
        hostId: String(matched[1] || '').trim(),
        moveIndex: Math.max(0, Number.parseInt(matched[2], 10) || 0)
      };
    }
    matched = text.match(/^fdonline_wait_([^_]+)$/);
    if (matched) {
      return {
        kind: 'wait',
        hostId: String(matched[1] || '').trim(),
        moveIndex: -1
      };
    }
    matched = text.match(/^fdonline_view_([^_]+)$/);
    if (matched) {
      return {
        kind: 'view',
        hostId: String(matched[1] || '').trim(),
        moveIndex: -1
      };
    }
    return null;
  }

  function getOnlineFriendDuelState(player) {
    const online = player?.battleState?.friendDuel?.online;
    if (!online || typeof online !== 'object' || !online.enabled) return null;
    return online;
  }

  function getOnlineFriendDuelHostPlayer(hostId = '') {
    const id = String(hostId || '').trim();
    if (!id) return null;
    const host = loadPlayer(id);
    if (!host) return null;
    const online = getOnlineFriendDuelState(host);
    if (!online) return null;
    if (String(online.hostId || '').trim() !== id) return null;
    return host;
  }

  function canOperateOnlineFriendDuel(hostPlayer, userId = '', channelId = '') {
    const online = getOnlineFriendDuelState(hostPlayer);
    if (!online) return false;
    const uid = String(userId || '').trim();
    if (!uid) return false;
    const hostId = String(online.hostId || '').trim();
    const rivalId = String(online.rivalId || '').trim();
    if (uid !== hostId && uid !== rivalId) return false;
    const duelChannelId = String(online.channelId || '').trim();
    if (duelChannelId && String(channelId || '').trim() && duelChannelId !== String(channelId || '').trim()) {
      return false;
    }
    return true;
  }

  function shouldBypassThreadGuardForOnlineFriendDuel(interaction, userId = '') {
    if (!interaction?.isButton?.()) return false;
    const action = parseOnlineFriendDuelAction(interaction.customId || '');
    if (!action?.hostId) return false;
    const hostPlayer = getOnlineFriendDuelHostPlayer(action.hostId);
    if (!hostPlayer) return false;
    return canOperateOnlineFriendDuel(hostPlayer, userId, interaction.channelId);
  }

  function clearOnlineFriendDuelTimer(roomId = '') {
    const key = String(roomId || '').trim();
    if (!key) return;
    const store = getTimerStore();
    if (!store || typeof store.get !== 'function' || typeof store.delete !== 'function') return;
    const timer = store.get(key);
    if (timer) clearTimeout(timer);
    store.delete(key);
  }

  async function editOnlineFriendDuelMessage(hostPlayer, payload) {
    const online = getOnlineFriendDuelState(hostPlayer);
    if (!online || !CLIENT) return null;
    const channelId = String(online.channelId || hostPlayer?.activeThreadId || '').trim();
    const messageId = String(online.messageId || '').trim();
    if (!channelId || !messageId) return null;
    let channel = CLIENT.channels?.cache?.get(channelId) || null;
    if (!channel && typeof CLIENT.channels?.fetch === 'function') {
      channel = await CLIENT.channels.fetch(channelId).catch(() => null);
    }
    if (!channel) return null;
    const msg = await findMessageInChannel(channel, messageId);
    if (!msg) return null;
    await msg.edit(payload).catch(() => {});
    trackActiveGameMessage(hostPlayer, channelId, messageId);
    return msg;
  }

  function pickBestMoveForOnlineEnemy(enemy, combatant, moves, availableEnergy = 0) {
    const list = (Array.isArray(moves) ? moves : []).filter((move) => Boolean(move) && !isFleeLikeMove(move));
    const affordable = list.filter((move) => BATTLE.getMoveEnergyCost(move) <= Number(availableEnergy || 0));
    const pool = affordable.length > 0 ? affordable : [];
    if (pool.length <= 0) return WAIT_COMBAT_MOVE;
    let best = pool[0];
    let bestScore = -Infinity;
    for (const move of pool) {
      const cost = BATTLE.getMoveEnergyCost(move);
      const speed = getMoveSpeedValue(move);
      const dmg = BATTLE.calculatePlayerMoveDamage(move, {}, enemy || {}).total || 0;
      const net = Math.max(1, Number(dmg) - Math.max(0, Number(combatant?.defense || 0)));
      const killBonus = Number(combatant?.hp || 0) <= net ? 120 : 0;
      const efficiency = Math.max(0, 4 - cost) * 2;
      const score = net + killBonus + efficiency + (speed - 10) * 0.4;
      if (score > bestScore) {
        best = move;
        bestScore = score;
      }
    }
    return best || WAIT_COMBAT_MOVE;
  }

  function resolveOnlineSubmittedMove(args = {}) {
    const {
      choice = null,
      moves = [],
      fallbackMove = WAIT_COMBAT_MOVE,
      availableEnergy = 0
    } = args;
    const list = Array.isArray(moves) ? moves : [];
    if (!choice || typeof choice !== 'object') {
      return {
        move: fallbackMove,
        cost: BATTLE.getMoveEnergyCost(fallbackMove),
        autoSelected: true,
        reason: 'timeout_auto'
      };
    }
    if (choice.kind === 'wait') {
      return {
        move: WAIT_COMBAT_MOVE,
        cost: 0,
        autoSelected: false,
        reason: 'manual_wait'
      };
    }
    const idx = Math.max(0, Number(choice.moveIndex || 0));
    const move = list[idx];
    if (!move) {
      return {
        move: fallbackMove,
        cost: BATTLE.getMoveEnergyCost(fallbackMove),
        autoSelected: true,
        reason: 'invalid_index'
      };
    }
    const cost = BATTLE.getMoveEnergyCost(move);
    if (Number(availableEnergy || 0) < cost) {
      return {
        move: fallbackMove,
        cost: BATTLE.getMoveEnergyCost(fallbackMove),
        autoSelected: true,
        reason: 'energy_insufficient'
      };
    }
    return {
      move,
      cost,
      autoSelected: false,
      reason: 'manual_move'
    };
  }

  function scheduleOnlineFriendDuelTimer(hostPlayer) {
    const online = getOnlineFriendDuelState(hostPlayer);
    if (!online) return;
    const roomId = String(online.roomId || '').trim();
    const hostId = String(online.hostId || hostPlayer?.id || '').trim();
    if (!roomId || !hostId) return;
    clearOnlineFriendDuelTimer(roomId);
    const delay = Math.max(200, Number(online.deadlineAt || Date.now() + FRIEND_DUEL_ONLINE_TURN_MS) - Date.now());
    const timer = setTimeout(() => {
      resolveOnlineFriendDuelTurnByTimeout(hostId, roomId).catch((err) => {
        console.error('[FriendDuelOnline] timeout resolve failed:', err?.message || err);
      });
    }, delay);
    const store = getTimerStore();
    if (store && typeof store.set === 'function') {
      store.set(roomId, timer);
    }
  }

  async function resolveOnlineFriendDuelTurnByTimeout(hostId = '', roomId = '') {
    const hostPlayer = getOnlineFriendDuelHostPlayer(hostId);
    if (!hostPlayer) return;
    const online = getOnlineFriendDuelState(hostPlayer);
    if (!online) return;
    const activeRoomId = String(online.roomId || '').trim();
    if (roomId && activeRoomId !== String(roomId || '').trim()) return;
    if (Date.now() + 80 < Number(online.deadlineAt || 0)) {
      scheduleOnlineFriendDuelTimer(hostPlayer);
      return;
    }
    await resolveOnlineFriendDuelTurn(hostPlayer, { trigger: 'timeout' });
  }

  async function resolveOnlineFriendDuelTurn(hostPlayer, options = {}) {
    if (!hostPlayer || typeof hostPlayer !== 'object') return;
    const online = getOnlineFriendDuelState(hostPlayer);
    if (!online) return;
    if (online.resolving) return;
    const hostId = String(online.hostId || hostPlayer.id || '').trim();
    const rivalId = String(online.rivalId || '').trim();
    if (!hostId || !rivalId) return;

    online.resolving = true;
    if (typeof CORE?.savePlayer === 'function') CORE.savePlayer(hostPlayer);

    try {
      const fallbackPet = PET?.loadPet?.(hostId);
      const petResolved = resolvePlayerMainPet(hostPlayer, { preferBattle: true, fallbackPet });
      let hostPet = petResolved?.pet || fallbackPet;
      let enemy = hostPlayer?.battleState?.enemy;
      let combatant = getActiveCombatant(hostPlayer, hostPet);
      if (!hostPet || !enemy || !combatant) {
        online.resolving = false;
        if (typeof CORE?.savePlayer === 'function') CORE.savePlayer(hostPlayer);
        return;
      }
      if (petResolved?.changed && typeof CORE?.savePlayer === 'function') CORE.savePlayer(hostPlayer);

      const hostState = ensureBattleEnergyState(hostPlayer);
      const hostEnergyBefore = Number(hostState.energy || 0);
      const rivalEnergyBefore = Math.max(0, Number(online.rivalEnergy || 2));
      const hostMoves = getCombatantMoves(combatant, hostPet).slice(0, PET_MOVE_LOADOUT_LIMIT);
      const rivalMoves = getOnlineFriendDuelRivalMoves(enemy).slice(0, PET_MOVE_LOADOUT_LIMIT);
      const hostChoice = online.choices?.[hostId] || null;
      const rivalChoice = online.choices?.[rivalId] || null;

      const hostAuto = pickBestMoveForAI(hostPlayer, hostPet, enemy, combatant, hostEnergyBefore) || WAIT_COMBAT_MOVE;
      const rivalAuto = pickBestMoveForOnlineEnemy(enemy, combatant, rivalMoves, rivalEnergyBefore) || WAIT_COMBAT_MOVE;
      const hostPicked = resolveOnlineSubmittedMove({
        choice: hostChoice,
        moves: hostMoves,
        fallbackMove: hostAuto,
        availableEnergy: hostEnergyBefore
      });
      const rivalPicked = resolveOnlineSubmittedMove({
        choice: rivalChoice,
        moves: rivalMoves,
        fallbackMove: rivalAuto,
        availableEnergy: rivalEnergyBefore
      });

      const roundRaw = BATTLE.executeBattleRound(
        hostPlayer,
        combatant,
        enemy,
        hostPicked.move,
        rivalPicked.move,
        { nonLethal: true }
      );
      const roundResult = maybeResolveMentorSparResult(hostPlayer, enemy, roundRaw);

      const savedPet = persistCombatantState(hostPlayer, hostPet, combatant);
      if (savedPet && typeof PET?.savePet === 'function') PET.savePet(savedPet);

      const roundNoteParts = [];
      if (hostPicked.autoSelected) {
        roundNoteParts.push(`⚠️ ${hostPlayer.name} 未在時限內完成有效提交，系統改為「${hostPicked.move?.name || '待機'}」。`);
      }
      const rivalName = String(hostPlayer?.battleState?.friendDuel?.friendName || '好友').trim() || '好友';
      if (rivalPicked.autoSelected) {
        roundNoteParts.push(`⚠️ ${rivalName} 未在時限內完成有效提交，系統改為「${rivalPicked.move?.name || '待機'}」。`);
      }
      const duelSwitchNotes = [];
      if (roundResult?.victory === true) {
        const switchedEnemy = trySwitchFriendDuelEnemy(hostPlayer, enemy?.name || '');
        if (switchedEnemy?.switched) {
          duelSwitchNotes.push(switchedEnemy.message);
          enemy = hostPlayer?.battleState?.enemy;
        } else {
          const roundSummary = [String(roundResult?.message || '').trim(), ...roundNoteParts].filter(Boolean).join('\n');
          const roomId = String(online.roomId || '').trim();
          clearOnlineFriendDuelTimer(roomId);
          const duel = finalizeFriendDuel(hostPlayer, hostPet, combatant, roundSummary, true);
          const endEmbed = new EmbedBuilder()
            .setTitle('🤝 好友友誼戰勝利（線上）')
            .setColor(0x8b5cf6)
            .setDescription(`${roundSummary}\n\n${duel.summaryLine}`);
          const row = buildFriendDuelResultRow();
          await editOnlineFriendDuelMessage(hostPlayer, { content: null, embeds: [endEmbed], components: [row] });
          return;
        }
      } else if (roundResult?.victory === false || Number(combatant?.hp || 0) <= 0) {
        const switchedPet = trySwitchFriendDuelPlayerPet(hostPlayer, hostPet, combatant);
        if (switchedPet?.switched && switchedPet?.nextPet) {
          duelSwitchNotes.push(switchedPet.message);
          hostPet = switchedPet.nextPet;
          combatant = getActiveCombatant(hostPlayer, hostPet);
        } else {
          const roundSummary = [String(roundResult?.message || '').trim(), ...roundNoteParts].filter(Boolean).join('\n');
          const roomId = String(online.roomId || '').trim();
          clearOnlineFriendDuelTimer(roomId);
          const duel = finalizeFriendDuel(hostPlayer, hostPet, combatant, roundSummary, false);
          const endEmbed = new EmbedBuilder()
            .setTitle('🤝 好友友誼戰落敗（線上）')
            .setColor(0x8b5cf6)
            .setDescription(`${roundSummary}\n\n${duel.summaryLine}`);
          const row = buildFriendDuelResultRow();
          await editOnlineFriendDuelMessage(hostPlayer, { content: null, embeds: [endEmbed], components: [row] });
          return;
        }
      }

      const roundSummary = [
        String(roundResult?.message || '').trim(),
        ...duelSwitchNotes,
        ...roundNoteParts
      ].filter(Boolean).join('\n');

      if (!combatant) {
        const roomId = String(online.roomId || '').trim();
        clearOnlineFriendDuelTimer(roomId);
        const duel = finalizeFriendDuel(hostPlayer, hostPet, combatant, roundSummary, false);
        const endEmbed = new EmbedBuilder()
          .setTitle('🤝 好友友誼戰落敗（線上）')
          .setColor(0x8b5cf6)
          .setDescription(`${roundSummary}\n\n${duel.summaryLine}`);
        const row = buildFriendDuelResultRow();
        await editOnlineFriendDuelMessage(hostPlayer, { content: null, embeds: [endEmbed], components: [row] });
        return;
      }

      if (hostPlayer?.battleState && enemy) {
        // Keep board source of truth in sync, otherwise UI may render previous-frame HP.
        hostPlayer.battleState.enemy = enemy;
      }
      if (hostPlayer?.battleState && combatant?.id) {
        hostPlayer.battleState.activePetId = String(combatant.id || '').trim() || hostPlayer.battleState.activePetId;
      }
      hostPlayer.battleState.mode = 'manual_online';
      const next = advanceBattleTurnEnergy(hostPlayer, hostPicked.cost);
      online.rivalEnergy = Math.max(0, rivalEnergyBefore - rivalPicked.cost) + 2;
      online.turn = Math.max(1, Number(next.turn || online.turn || 1));
      online.deadlineAt = Date.now() + FRIEND_DUEL_ONLINE_TURN_MS;
      online.choices = {};
      online.resolving = false;
      if (typeof CORE?.savePlayer === 'function') CORE.savePlayer(hostPlayer);
      scheduleOnlineFriendDuelTimer(hostPlayer);

      const refreshedFallbackPet = PET?.loadPet?.(hostId);
      const refreshedHostPet = resolvePlayerMainPet(hostPlayer, { preferBattle: true, fallbackPet: refreshedFallbackPet }).pet || hostPet || refreshedFallbackPet;
      await editOnlineFriendDuelMessage(hostPlayer, buildOnlineFriendDuelPayload(hostPlayer, refreshedHostPet, {
        actionView: buildOnlineFriendDuelActionView(roundResult),
        roundSummary,
        notice: '✅ 本回合已結算，下一回合開始。'
      }));
    } catch (err) {
      const latest = loadPlayer(String(hostPlayer?.id || '').trim());
      const onlineLatest = getOnlineFriendDuelState(latest);
      if (onlineLatest) {
        onlineLatest.resolving = false;
        if (typeof CORE?.savePlayer === 'function') CORE.savePlayer(latest);
      }
      console.error('[FriendDuelOnline] resolve failed:', err?.message || err);
    }
  }

  function trimButtonLabel(text = '', maxLen = 18) {
    const value = String(text || '').trim();
    if (!value) return '玩家';
    if (value.length <= maxLen) return value;
    return `${value.slice(0, Math.max(1, maxLen - 1))}…`;
  }

  function buildOnlineFriendDuelButtons(hostId = '', hostMoves = [], hostEnergy = 0, layoutMode = 'desktop') {
    const id = String(hostId || '').trim();
    const safeMoves = Array.isArray(hostMoves) ? hostMoves.slice(0, 5) : [];
    const moveButtons = [];
    for (let i = 0; i < Math.min(5, PET_MOVE_LOADOUT_LIMIT); i++) {
      const move = safeMoves[i];
      if (!move) {
        moveButtons.push(
          new ButtonBuilder()
            .setCustomId(`fdonline_move_${id}_${i}`)
            .setLabel('（空）')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );
        continue;
      }
      const cost = BATTLE.getMoveEnergyCost(move);
      const canUse = Number(hostEnergy || 0) >= cost;
      moveButtons.push(
        new ButtonBuilder()
          .setCustomId(`fdonline_move_${id}_${i}`)
          .setLabel(`${move.name} ⚡${cost}`.slice(0, 80))
          .setStyle(canUse ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .setDisabled(!canUse)
      );
    }
    return [
      new ActionRowBuilder().addComponents(...moveButtons.slice(0, 3)),
      new ActionRowBuilder().addComponents(
        ...moveButtons.slice(3, 5),
        new ButtonBuilder().setCustomId(`fdonline_wait_${id}`).setLabel('⚡ 待機').setStyle(ButtonStyle.Primary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`fdonline_view_${id}`)
          .setLabel(layoutMode === 'mobile' ? '🖥️ 電腦版' : '📱 手機版')
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  function buildFriendDuelResultRow() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_friends').setLabel('🤝 返回好友').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('main_menu').setLabel('📖 回主選單').setStyle(ButtonStyle.Secondary)
    );
  }

  function getOnlineFriendDuelRivalMoves(enemy = null) {
    const raw = Array.isArray(enemy?.moves) ? enemy.moves : [];
    const fallbackDamage = Math.max(8, Number(enemy?.attack || 12));
    const list = raw
      .slice(0, PET_MOVE_LOADOUT_LIMIT)
      .map((move) => ({
        id: String(move?.id || '').trim(),
        name: String(move?.name || '普通攻擊').trim() || '普通攻擊',
        element: String(move?.element || '普通').trim() || '普通',
        tier: Math.max(1, Math.min(3, Number(move?.tier || 1))),
        priority: Math.max(-1, Math.min(3, Number(move?.priority || 0))),
        speed: getMoveSpeedValue(move),
        baseDamage: Math.max(1, Number(move?.baseDamage ?? move?.damage ?? fallbackDamage) || fallbackDamage),
        damage: Math.max(1, Number(move?.baseDamage ?? move?.damage ?? fallbackDamage) || fallbackDamage),
        effect: (move?.effect && typeof move.effect === 'object') ? { ...move.effect } : {},
        desc: String(move?.desc || '').trim()
      }))
      .filter((move) => move.name && !isFleeLikeMove(move));
    if (list.length > 0) return list;
    return [{
      id: 'friend_duel_strike',
      name: '友誼試探',
      element: '普通',
      tier: 1,
      priority: 0,
      speed: 10,
      baseDamage: fallbackDamage,
      damage: fallbackDamage,
      effect: {},
      desc: '穩定試探'
    }];
  }

  function formatOnlineFriendDuelMoveList(moves = [], attacker = null, defender = null, energy = 0) {
    const list = Array.isArray(moves) ? moves : [];
    if (list.length <= 0) return '（本側無可用招式，逾時會自動待機）';
    return list
      .slice(0, PET_MOVE_LOADOUT_LIMIT)
      .map((move, idx) => {
        const cost = BATTLE.getMoveEnergyCost(move);
        const speed = getMoveSpeedValue(move);
        const dmg = BATTLE.calculatePlayerMoveDamage(move, {}, attacker || {}).total || 0;
        const est = Math.max(0, Number(dmg) - Math.max(0, Number(defender?.defense || 0)));
        const canUse = Number(energy || 0) >= cost;
        return `${idx + 1}. ${move.name} | 💥${format1(est)} | ⚡${cost} | 🚀${format1(speed)}${canUse ? '' : '（能量不足）'}`;
      })
      .join('\n');
  }

  function formatOnlineFriendChoiceText(choice = null, moves = []) {
    if (!choice || typeof choice !== 'object') return '⌛ 尚未提交';
    if (choice.kind === 'wait') return '⚡ 待機';
    const idx = Math.max(0, Number(choice.moveIndex || 0));
    const move = Array.isArray(moves) ? moves[idx] : null;
    if (!move) return `⚠️ 索引${idx + 1}無效（將自動重算）`;
    return `✅ ${move.name}`;
  }

  function formatOnlineHostMoveDetails(moves = [], attacker = null, defender = null, energy = 0) {
    const list = Array.isArray(moves) ? moves : [];
    if (list.length <= 0) return '（無可用招式）';
    return list
      .slice(0, PET_MOVE_LOADOUT_LIMIT)
      .map((move) => {
        const cost = BATTLE.getMoveEnergyCost(move);
        const speed = getMoveSpeedValue(move);
        const dmg = BATTLE.calculatePlayerMoveDamage(move, {}, attacker || {}).total || 0;
        const est = Math.max(0, Number(dmg) - Math.max(0, Number(defender?.defense || 0)));
        const canUse = Number(energy || 0) >= cost;
        const effectStr = describeMoveEffects(move);
        return `⚔️ ${move.name} | ${format1(est)} dmg | ⚡${cost} | 🚀速度${format1(speed)} | ${canUse ? '可用' : '能量不足'} | ${effectStr || '無'}`;
      })
      .join('\n');
  }

  function buildOnlineFriendDuelActionView(roundResult = null) {
    if (!roundResult || typeof roundResult !== 'object') {
      return { ally: { pending: true }, enemy: { pending: true } };
    }
    const extractActionExtra = (lines = [], fallback = '無') => {
      const cleaned = (Array.isArray(lines) ? lines : [])
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .filter((line) => !/施展「/.test(line));
      if (cleaned.length === 0) return fallback;
      return cleaned.slice(0, 2).join(' / ');
    };
    return {
      ally: {
        move: roundResult.playerMoveName || '',
        damage: Number.isFinite(Number(roundResult.playerDamage)) ? Number(roundResult.playerDamage) : null,
        damageLabel: '對敵造成',
        extra: extractActionExtra(roundResult.playerLines || [])
      },
      enemy: {
        move: roundResult.enemyMoveName || '',
        damage: Number.isFinite(Number(roundResult.enemyDamage)) ? Number(roundResult.enemyDamage) : null,
        damageLabel: '對我造成',
        extra: extractActionExtra(roundResult.enemyLines || [])
      }
    };
  }

  function buildOnlineFriendDuelPayload(hostPlayer, hostPet, options = {}) {
    const online = getOnlineFriendDuelState(hostPlayer);
    const enemy = hostPlayer?.battleState?.enemy;
    const combatant = getActiveCombatant(hostPlayer, hostPet);
    const state = ensureBattleEnergyState(hostPlayer);
    const hostMoves = getCombatantMoves(combatant, hostPet).slice(0, PET_MOVE_LOADOUT_LIMIT);
    const rivalMoves = getOnlineFriendDuelRivalMoves(enemy).slice(0, PET_MOVE_LOADOUT_LIMIT);
    const hostId = String(online?.hostId || hostPlayer?.id || '').trim();
    const rivalId = String(online?.rivalId || hostPlayer?.battleState?.friendDuel?.friendId || '').trim();
    const rivalName = String(hostPlayer?.battleState?.friendDuel?.friendName || '好友').trim() || '好友';
    const hostName = String(hostPlayer?.name || '你').trim() || '你';
    const hostEnergy = Number(state?.energy || 0);
    const rivalEnergy = Math.max(0, Number(online?.rivalEnergy || 2));
    const hostChoice = online?.choices?.[hostId] || null;
    const rivalChoice = online?.choices?.[rivalId] || null;
    const deadlineAt = Math.max(Date.now() + 1000, Number(online?.deadlineAt || Date.now() + FRIEND_DUEL_ONLINE_TURN_MS));
    const remainSec = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
    const layoutMode = getOnlineBattleLayoutMode(online);
    const actionView = options?.actionView || buildOnlineFriendDuelActionView(null);
    const board = layoutMode === 'mobile'
      ? buildBattleMobileCombinedLayout(enemy, combatant, state, actionView)
      : buildManualBattleBoard(enemy, combatant, state);
    const actionPanels = layoutMode === 'mobile' ? '' : buildDualActionPanels(actionView);
    const roundSummary = String(options?.roundSummary || '').trim();
    const notice = String(options?.notice || '').trim();
    const summaryBlock = roundSummary ? `\n📜 本回合結算：\n${roundSummary}\n` : '';
    const hostSubmitted = Boolean(hostChoice);
    const rivalSubmitted = Boolean(rivalChoice);
    const waitingHint = (hostSubmitted && !rivalSubmitted)
      ? '⏳ 你已提交，正在等待對手按下按鈕...'
      : (!hostSubmitted && rivalSubmitted)
        ? '⏳ 對手已提交，請你按下招式按鈕...'
        : '';
    const noticeBlock = [notice, waitingHint].filter(Boolean).join('\n');
    const readyText =
      `提交狀態：${hostName} ${formatOnlineFriendChoiceText(hostChoice, hostMoves)} ｜ ${rivalName} ${formatOnlineFriendChoiceText(rivalChoice, rivalMoves)}`;

    if (online?.awaitingRival) {
      const waitingContent =
        `🌐 **好友手動對戰（線上模式）**\n` +
        `🕒 正在等待對手加入本場即時戰鬥...\n` +
        `就緒狀態：${hostName} ✅ ｜ ${rivalName} ⌛\n\n` +
        '請對手按下「✅ 加入即時戰鬥」後開打。\n' +
        '（若對手未加入，你也可以改用其他模式）';
      const readyRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fdonline_join_${hostId}`).setLabel('✅ 加入即時戰鬥').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('battle_mode_manual_offline').setLabel('⚔️ 改用手動（對手AI）').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('battle_mode_ai').setLabel('🤖 改用AI戰鬥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('battle_mode_manual_back').setLabel('↩️ 返回').setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`fdonline_view_${hostId}`)
          .setLabel(layoutMode === 'mobile' ? '🖥️ 電腦版' : '📱 手機版')
          .setStyle(ButtonStyle.Secondary)
      );
      return { content: waitingContent, embeds: [], components: [readyRow] };
    }

    const content =
      `🌐 **好友手動對戰（線上模式）**\n` +
      `⏳ 本回合倒數：${remainSec} 秒（每回合 ${Math.floor(FRIEND_DUEL_ONLINE_TURN_MS / 1000)} 秒）\n` +
      `⚡ 能量：${hostName} ${hostEnergy} ｜ ${rivalName} ${rivalEnergy}\n` +
      `${readyText}\n` +
      `${board}${actionPanels ? `\n\n${actionPanels}` : ''}` +
      `${summaryBlock}` +
      `${noticeBlock ? `\n${noticeBlock}\n` : ''}` +
      `\n**招式：**\n${formatOnlineHostMoveDetails(hostMoves, combatant, enemy, hostEnergy)}\n` +
      '\n在倒數內可改選；雙方都提交後會立即結算。';

    return {
      content,
      embeds: [],
      components: buildOnlineFriendDuelButtons(hostId, hostMoves, hostEnergy, layoutMode)
    };
  }

  async function startManualBattleOnline(interaction, user) {
    const player = loadPlayer(user.id);
    const fallbackPet = PET?.loadPet?.(user.id);
    const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
    const pet = petResolved?.pet || fallbackPet;
    if (!player || !pet || !player?.battleState?.enemy || !player?.battleState?.friendDuel) {
      await interaction.reply({ content: '❌ 目前不是可啟用線上模式的好友友誼戰。', ephemeral: true }).catch(() => {});
      return;
    }
    if (petResolved?.changed && typeof CORE?.savePlayer === 'function') CORE.savePlayer(player);

    const duel = player.battleState.friendDuel || {};
    const friendId = String(duel.friendId || '').trim();
    if (!friendId) {
      await interaction.reply({ content: '❌ 找不到好友對戰對象。', ephemeral: true }).catch(() => {});
      return;
    }

    const rivalHost = getOnlineFriendDuelHostPlayer(friendId);
    const rivalOnline = getOnlineFriendDuelState(rivalHost);
    if (
      rivalHost &&
      rivalOnline &&
      rivalOnline.awaitingRival &&
      String(rivalOnline.rivalId || '').trim() === String(player.id || '').trim()
    ) {
      rivalHost.battleState.mode = 'manual_online';
      ensureBattleEnergyState(rivalHost);
      rivalOnline.awaitingRival = false;
      if (!String(rivalOnline.layoutMode || '').trim()) {
        rivalOnline.layoutMode = getBattleLayoutMode(rivalHost);
      }
      rivalOnline.deadlineAt = Date.now() + FRIEND_DUEL_ONLINE_TURN_MS;
      rivalOnline.turn = Math.max(1, Number(rivalHost?.battleState?.turn || rivalOnline.turn || 1));
      rivalOnline.choices = {};
      rivalOnline.resolving = false;
      if (typeof CORE?.savePlayer === 'function') CORE.savePlayer(rivalHost);
      scheduleOnlineFriendDuelTimer(rivalHost);

      const rivalFallbackPet = PET?.loadPet?.(String(rivalHost.id || '').trim());
      const rivalPetResolved = resolvePlayerMainPet(rivalHost, { preferBattle: true, fallbackPet: rivalFallbackPet });
      const rivalPet = rivalPetResolved?.pet || rivalFallbackPet;
      if (rivalPetResolved?.changed && typeof CORE?.savePlayer === 'function') CORE.savePlayer(rivalHost);
      const payload = buildOnlineFriendDuelPayload(rivalHost, rivalPet, {
        notice: `✅ ${player.name} 已加入即時戰鬥，回合開始（每回合 ${Math.floor(FRIEND_DUEL_ONLINE_TURN_MS / 1000)} 秒）。`
      });
      const duelMsg = await editOnlineFriendDuelMessage(rivalHost, payload);

      player.battleState.mode = 'manual_online';
      if (player?.battleState?.friendDuel?.online) {
        const oldRoomId = String(player.battleState.friendDuel.online.roomId || '').trim();
        if (oldRoomId) clearOnlineFriendDuelTimer(oldRoomId);
        delete player.battleState.friendDuel.online;
      }
      if (typeof CORE?.savePlayer === 'function') CORE.savePlayer(player);

      const rows = [];
      if (duelMsg?.url) {
        rows.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(duelMsg.url).setLabel('🌐 前往即時戰鬥面板')
          )
        );
      }
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('battle_mode_manual_back').setLabel('↩️ 返回').setStyle(ButtonStyle.Secondary)
        )
      );
      await interaction.update({
        content: `✅ 已自動加入 ${String(rivalHost.name || '好友').trim() || '好友'} 的即時戰鬥房。`,
        embeds: [],
        components: rows
      }).catch(async () => {
        await interaction.reply({ content: '✅ 已自動加入好友的即時戰鬥房。', ephemeral: true }).catch(() => {});
      });
      return;
    }

    player.battleState.mode = 'manual_online';
    ensureBattleEnergyState(player);
    const online = {
      enabled: true,
      hostId: String(player.id || '').trim(),
      rivalId: friendId,
      roomId: `fd_${String(player.id || '').trim()}_${Date.now().toString(36)}`,
      turn: Math.max(1, Number(player?.battleState?.turn || 1)),
      deadlineAt: 0,
      rivalEnergy: 2,
      choices: {},
      channelId: String(interaction.channelId || '').trim(),
      messageId: String(interaction.message?.id || '').trim(),
      resolving: false,
      awaitingRival: true,
      layoutMode: getBattleLayoutMode(player)
    };
    player.battleState.friendDuel.online = online;
    if (typeof CORE?.savePlayer === 'function') CORE.savePlayer(player);
    clearOnlineFriendDuelTimer(online.roomId);

    const payload = buildOnlineFriendDuelPayload(player, pet, {
      notice: '📡 已建立即時友誼戰房間，等待對手加入。'
    });
    await interaction.update(payload).catch(async () => {
      await interaction.reply({ content: '❌ 線上模式啟動失敗，請重試。', ephemeral: true }).catch(() => {});
    });
  }

  async function handleOnlineFriendDuelChoice(interaction, user, customId = '') {
    const action = parseOnlineFriendDuelAction(customId);
    if (!action?.hostId) {
      await interaction.reply({ content: '⚠️ 線上對戰按鈕格式錯誤。', ephemeral: true }).catch(() => {});
      return;
    }
    const hostPlayer = getOnlineFriendDuelHostPlayer(action.hostId);
    if (!hostPlayer) {
      await interaction.reply({ content: '⚠️ 這個線上對戰房間已失效。', ephemeral: true }).catch(() => {});
      return;
    }
    if (!canOperateOnlineFriendDuel(hostPlayer, user.id, interaction.channelId)) {
      await interaction.reply({ content: '⚠️ 你不是這場線上友誼戰的參戰者。', ephemeral: true }).catch(() => {});
      return;
    }

    const online = getOnlineFriendDuelState(hostPlayer);
    if (!online) {
      await interaction.reply({ content: '⚠️ 線上友誼戰狀態不存在。', ephemeral: true }).catch(() => {});
      return;
    }

    if (action.kind === 'view') {
      await interaction.deferUpdate().catch(() => {});
      const nextMode = toggleOnlineBattleLayoutMode(online);
      if (typeof CORE?.savePlayer === 'function') CORE.savePlayer(hostPlayer);
      const fallbackPetView = PET?.loadPet?.(String(hostPlayer?.id || '').trim());
      const petResolvedView = resolvePlayerMainPet(hostPlayer, { preferBattle: true, fallbackPet: fallbackPetView });
      const hostPetView = petResolvedView?.pet || fallbackPetView;
      if (petResolvedView?.changed && typeof CORE?.savePlayer === 'function') CORE.savePlayer(hostPlayer);
      if (hostPetView) {
        await editOnlineFriendDuelMessage(hostPlayer, buildOnlineFriendDuelPayload(hostPlayer, hostPetView, {
          notice: nextMode === 'mobile'
            ? '📱 已切換為手機版戰鬥排版。'
            : '🖥️ 已切換為電腦版戰鬥排版。'
        }));
      }
      return;
    }

    if (Date.now() > Number(online.deadlineAt || 0) && !online.resolving) {
      await interaction.deferUpdate().catch(() => {});
      await resolveOnlineFriendDuelTurn(hostPlayer, { trigger: 'late_click' });
      return;
    }

    const hostId = String(online.hostId || '').trim();
    const rivalId = String(online.rivalId || '').trim();
    const actorId = String(user.id || '').trim();
    const actorIsHost = actorId === hostId;
    const actorIsRival = actorId === rivalId;
    if (!actorIsHost && !actorIsRival) {
      await interaction.reply({ content: '⚠️ 你不是本場線上友誼戰參戰者。', ephemeral: true }).catch(() => {});
      return;
    }

    if (action.kind === 'join') {
      if (!online.awaitingRival) {
        await interaction.reply({ content: 'ℹ️ 這場即時戰鬥已開始。', ephemeral: true }).catch(() => {});
        return;
      }
      if (!actorIsRival) {
        const mirrorHost = getOnlineFriendDuelHostPlayer(rivalId);
        const mirrorOnline = getOnlineFriendDuelState(mirrorHost);
        if (
          mirrorHost &&
          mirrorOnline &&
          mirrorOnline.awaitingRival &&
          String(mirrorOnline.rivalId || '').trim() === hostId
        ) {
          await interaction.deferUpdate().catch(() => {});

          mirrorHost.battleState.mode = 'manual_online';
          ensureBattleEnergyState(mirrorHost);
          mirrorOnline.awaitingRival = false;
          mirrorOnline.deadlineAt = Date.now() + FRIEND_DUEL_ONLINE_TURN_MS;
          mirrorOnline.turn = Math.max(1, Number(mirrorHost?.battleState?.turn || mirrorOnline.turn || 1));
          mirrorOnline.choices = {};
          mirrorOnline.resolving = false;
          if (typeof CORE?.savePlayer === 'function') CORE.savePlayer(mirrorHost);
          scheduleOnlineFriendDuelTimer(mirrorHost);

          const staleRoomId = String(online.roomId || '').trim();
          if (staleRoomId) clearOnlineFriendDuelTimer(staleRoomId);
          if (hostPlayer?.battleState?.friendDuel?.online) {
            delete hostPlayer.battleState.friendDuel.online;
          }
          if (typeof CORE?.savePlayer === 'function') CORE.savePlayer(hostPlayer);

          const mirrorFallbackPet = PET?.loadPet?.(String(mirrorHost.id || '').trim());
          const mirrorPetResolved = resolvePlayerMainPet(mirrorHost, { preferBattle: true, fallbackPet: mirrorFallbackPet });
          const mirrorPet = mirrorPetResolved?.pet || mirrorFallbackPet;
          if (mirrorPetResolved?.changed && typeof CORE?.savePlayer === 'function') CORE.savePlayer(mirrorHost);
          const payload = buildOnlineFriendDuelPayload(mirrorHost, mirrorPet, {
            notice: `✅ 已自動合併雙等待房，回合開始（每回合 ${Math.floor(FRIEND_DUEL_ONLINE_TURN_MS / 1000)} 秒）。`
          });
          const duelMsg = await editOnlineFriendDuelMessage(mirrorHost, payload);
          const jump = duelMsg?.url ? `\n請前往面板：${duelMsg.url}` : '';
          await interaction.followUp({ content: `✅ 已自動合併到對手房間。${jump}`, ephemeral: true }).catch(() => {});
          return;
        }

        await interaction.reply({ content: '⚠️ 只有對手可以按「加入即時戰鬥」。', ephemeral: true }).catch(() => {});
        return;
      }
      await interaction.deferUpdate().catch(() => {});
      online.awaitingRival = false;
      online.deadlineAt = Date.now() + FRIEND_DUEL_ONLINE_TURN_MS;
      online.turn = Math.max(1, Number(hostPlayer?.battleState?.turn || online.turn || 1));
      online.choices = {};
      online.resolving = false;
      if (typeof CORE?.savePlayer === 'function') CORE.savePlayer(hostPlayer);
      scheduleOnlineFriendDuelTimer(hostPlayer);

      const fallbackPetJoin = PET?.loadPet?.(hostId);
      const petResolvedJoin = resolvePlayerMainPet(hostPlayer, { preferBattle: true, fallbackPet: fallbackPetJoin });
      const hostPetJoin = petResolvedJoin?.pet || fallbackPetJoin;
      if (!hostPetJoin) return;
      if (petResolvedJoin?.changed && typeof CORE?.savePlayer === 'function') CORE.savePlayer(hostPlayer);

      const payload = buildOnlineFriendDuelPayload(hostPlayer, hostPetJoin, {
        notice: `✅ 雙方已就緒，回合開始（每回合 ${Math.floor(FRIEND_DUEL_ONLINE_TURN_MS / 1000)} 秒）。`
      });
      await editOnlineFriendDuelMessage(hostPlayer, payload);
      return;
    }

    if (online.awaitingRival) {
      await interaction.reply({ content: '⏳ 對手尚未加入線上即時戰鬥，暫時不能提交招式。', ephemeral: true }).catch(() => {});
      return;
    }

    const fallbackPet = PET?.loadPet?.(hostId);
    const petResolved = resolvePlayerMainPet(hostPlayer, { preferBattle: true, fallbackPet });
    const hostPet = petResolved?.pet || fallbackPet;
    const enemy = hostPlayer?.battleState?.enemy;
    const combatant = getActiveCombatant(hostPlayer, hostPet);
    if (!hostPet || !enemy || !combatant) {
      await interaction.reply({ content: '❌ 戰鬥資料缺失，請重新發起友誼戰。', ephemeral: true }).catch(() => {});
      return;
    }
    if (petResolved?.changed && typeof CORE?.savePlayer === 'function') CORE.savePlayer(hostPlayer);

    const hostEnergy = Number(ensureBattleEnergyState(hostPlayer).energy || 0);
    const rivalEnergy = Math.max(0, Number(online.rivalEnergy || 2));
    const hostMoves = getCombatantMoves(combatant, hostPet).slice(0, PET_MOVE_LOADOUT_LIMIT);
    const rivalMoves = getOnlineFriendDuelRivalMoves(enemy).slice(0, PET_MOVE_LOADOUT_LIMIT);
    const actorMoves = actorIsHost ? hostMoves : rivalMoves;
    const actorEnergy = actorIsHost ? hostEnergy : rivalEnergy;
    if (action.kind === 'move') {
      const move = actorMoves[action.moveIndex];
      if (!move) {
        await interaction.reply({ content: `⚠️ 索引 ${action.moveIndex + 1} 不存在。`, ephemeral: true }).catch(() => {});
        return;
      }
      const cost = BATTLE.getMoveEnergyCost(move);
      if (actorEnergy < cost) {
        await interaction.reply({ content: `⚠️ 能量不足：${move.name} 需要 ⚡${cost}，你目前只有 ⚡${actorEnergy}。`, ephemeral: true }).catch(() => {});
        return;
      }
    }

    await interaction.deferUpdate().catch(() => {});
    if (!online.choices || typeof online.choices !== 'object') online.choices = {};
    online.choices[actorId] = {
      kind: action.kind,
      moveIndex: action.kind === 'move' ? action.moveIndex : -1,
      at: Date.now()
    };
    if (typeof CORE?.savePlayer === 'function') CORE.savePlayer(hostPlayer);

    const bothReady = Boolean(online.choices?.[hostId]) && Boolean(online.choices?.[rivalId]);
    if (bothReady) {
      await resolveOnlineFriendDuelTurn(hostPlayer, { trigger: 'both_ready' });
      return;
    }

    const payload = buildOnlineFriendDuelPayload(hostPlayer, hostPet, {
      notice: `📝 ${user.username} 已提交本回合行動，等待另一位玩家。`
    });
    await editOnlineFriendDuelMessage(hostPlayer, payload);
  }

  return {
    parseOnlineFriendDuelAction,
    getOnlineFriendDuelState,
    getOnlineFriendDuelHostPlayer,
    canOperateOnlineFriendDuel,
    shouldBypassThreadGuardForOnlineFriendDuel,
    clearOnlineFriendDuelTimer,
    editOnlineFriendDuelMessage,
    pickBestMoveForOnlineEnemy,
    resolveOnlineSubmittedMove,
    scheduleOnlineFriendDuelTimer,
    resolveOnlineFriendDuelTurnByTimeout,
    startManualBattleOnline,
    handleOnlineFriendDuelChoice,
    trimButtonLabel,
    buildOnlineFriendDuelButtons,
    buildFriendDuelResultRow,
    getOnlineFriendDuelRivalMoves,
    formatOnlineFriendDuelMoveList,
    formatOnlineFriendChoiceText,
    formatOnlineHostMoveDetails,
    buildOnlineFriendDuelActionView,
    buildOnlineFriendDuelPayload
  };
}

module.exports = { createFriendOnlineUtils };
