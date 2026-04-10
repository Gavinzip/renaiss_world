function createFriendCoreUtils(deps = {}) {
  const loadPlayer = typeof deps.loadPlayer === 'function'
    ? deps.loadPlayer
    : (() => null);
  const savePlayer = typeof deps.savePlayer === 'function'
    ? deps.savePlayer
    : (() => {});
  const getAllPlayers = typeof deps.getAllPlayers === 'function'
    ? deps.getAllPlayers
    : (() => []);

  function normalizeFriendId(value = '') {
    const id = String(value || '').trim();
    if (!/^\d{15,22}$/.test(id)) return '';
    return id;
  }

  function ensurePlayerFriendState(player) {
    if (!player || typeof player !== 'object') {
      return { friends: [], friendRequestsIncoming: [], friendRequestsOutgoing: [] };
    }
    if (!player.social || typeof player.social !== 'object' || Array.isArray(player.social)) {
      player.social = {};
    }
    const social = player.social;
    const selfId = String(player.id || '').trim();
    const normalizeList = (arr) => {
      const out = [];
      const seen = new Set();
      for (const raw of Array.isArray(arr) ? arr : []) {
        const id = normalizeFriendId(raw);
        if (!id || id === selfId || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
      return out;
    };
    social.friends = normalizeList(social.friends);
    social.friendRequestsIncoming = normalizeList(social.friendRequestsIncoming).filter((id) => !social.friends.includes(id));
    social.friendRequestsOutgoing = normalizeList(social.friendRequestsOutgoing).filter((id) => !social.friends.includes(id));
    return social;
  }

  function removeFriendIdFromList(list, friendId) {
    const target = String(friendId || '').trim();
    const source = Array.isArray(list) ? list : [];
    return source.filter((id) => String(id || '').trim() !== target);
  }

  function resetFriendPairState(fromSocial, targetSocial, fromId = '', targetId = '') {
    const srcId = String(fromId || '').trim();
    const dstId = String(targetId || '').trim();
    if (!fromSocial || !targetSocial || !srcId || !dstId) return;

    fromSocial.friends = removeFriendIdFromList(fromSocial.friends, dstId);
    targetSocial.friends = removeFriendIdFromList(targetSocial.friends, srcId);
    fromSocial.friendRequestsIncoming = removeFriendIdFromList(fromSocial.friendRequestsIncoming, dstId);
    fromSocial.friendRequestsOutgoing = removeFriendIdFromList(fromSocial.friendRequestsOutgoing, dstId);
    targetSocial.friendRequestsIncoming = removeFriendIdFromList(targetSocial.friendRequestsIncoming, srcId);
    targetSocial.friendRequestsOutgoing = removeFriendIdFromList(targetSocial.friendRequestsOutgoing, srcId);

    if (fromSocial.friendBattleStats && typeof fromSocial.friendBattleStats === 'object' && !Array.isArray(fromSocial.friendBattleStats)) {
      delete fromSocial.friendBattleStats[dstId];
    }
    if (targetSocial.friendBattleStats && typeof targetSocial.friendBattleStats === 'object' && !Array.isArray(targetSocial.friendBattleStats)) {
      delete targetSocial.friendBattleStats[srcId];
    }
  }

  function removeFriendLinkFromPlayer(player, targetId = '') {
    if (!player || typeof player !== 'object') return false;
    const id = String(targetId || '').trim();
    if (!id) return false;
    const social = ensurePlayerFriendState(player);
    let changed = false;

    const nextFriends = removeFriendIdFromList(social.friends, id);
    if (nextFriends.length !== social.friends.length) {
      social.friends = nextFriends;
      changed = true;
    }
    const nextIncoming = removeFriendIdFromList(social.friendRequestsIncoming, id);
    if (nextIncoming.length !== social.friendRequestsIncoming.length) {
      social.friendRequestsIncoming = nextIncoming;
      changed = true;
    }
    const nextOutgoing = removeFriendIdFromList(social.friendRequestsOutgoing, id);
    if (nextOutgoing.length !== social.friendRequestsOutgoing.length) {
      social.friendRequestsOutgoing = nextOutgoing;
      changed = true;
    }
    if (social.friendBattleStats && typeof social.friendBattleStats === 'object' && !Array.isArray(social.friendBattleStats)) {
      if (Object.prototype.hasOwnProperty.call(social.friendBattleStats, id)) {
        delete social.friendBattleStats[id];
        changed = true;
      }
    }
    return changed;
  }

  function pruneMissingFriendLinksForPlayer(player) {
    if (!player || typeof player !== 'object') return false;
    const social = ensurePlayerFriendState(player);
    const checks = [
      ...(Array.isArray(social.friends) ? social.friends : []),
      ...(Array.isArray(social.friendRequestsIncoming) ? social.friendRequestsIncoming : []),
      ...(Array.isArray(social.friendRequestsOutgoing) ? social.friendRequestsOutgoing : [])
    ];
    let changed = false;
    for (const rawId of checks) {
      const id = String(rawId || '').trim();
      if (!id) continue;
      if (loadPlayer(id)) continue;
      if (removeFriendLinkFromPlayer(player, id)) changed = true;
    }
    return changed;
  }

  function purgePlayerFromAllFriendLists(targetId = '') {
    const id = String(targetId || '').trim();
    if (!id) return { affectedPlayers: 0, removedLinks: 0 };
    const players = getAllPlayers();
    let affectedPlayers = 0;
    let removedLinks = 0;
    for (const player of Array.isArray(players) ? players : []) {
      if (!player || typeof player !== 'object') continue;
      if (String(player.id || '').trim() === id) continue;
      const social = ensurePlayerFriendState(player);
      const before =
        (Array.isArray(social.friends) ? social.friends.length : 0) +
        (Array.isArray(social.friendRequestsIncoming) ? social.friendRequestsIncoming.length : 0) +
        (Array.isArray(social.friendRequestsOutgoing) ? social.friendRequestsOutgoing.length : 0) +
        ((social.friendBattleStats && typeof social.friendBattleStats === 'object' && !Array.isArray(social.friendBattleStats) && Object.prototype.hasOwnProperty.call(social.friendBattleStats, id)) ? 1 : 0);
      if (!removeFriendLinkFromPlayer(player, id)) continue;
      const after =
        (Array.isArray(social.friends) ? social.friends.length : 0) +
        (Array.isArray(social.friendRequestsIncoming) ? social.friendRequestsIncoming.length : 0) +
        (Array.isArray(social.friendRequestsOutgoing) ? social.friendRequestsOutgoing.length : 0) +
        ((social.friendBattleStats && typeof social.friendBattleStats === 'object' && !Array.isArray(social.friendBattleStats) && Object.prototype.hasOwnProperty.call(social.friendBattleStats, id)) ? 1 : 0);
      removedLinks += Math.max(0, before - after);
      savePlayer(player);
      affectedPlayers += 1;
    }
    return { affectedPlayers, removedLinks };
  }

  function getPlayerDisplayNameById(playerId = '') {
    const id = String(playerId || '').trim();
    if (!id) return '未知玩家';
    const p = loadPlayer(id);
    if (!p) return `玩家(${id})`;
    return String(p.name || '').trim() || `玩家(${id})`;
  }

  function isMutualFriend(player, targetId = '') {
    if (!player || typeof player !== 'object') return false;
    const id = String(targetId || '').trim();
    if (!id) return false;
    const social = ensurePlayerFriendState(player);
    return social.friends.includes(id);
  }

  function finalizeMutualFriendship(playerA, playerB) {
    const socialA = ensurePlayerFriendState(playerA);
    const socialB = ensurePlayerFriendState(playerB);
    const idA = String(playerA?.id || '').trim();
    const idB = String(playerB?.id || '').trim();
    if (!idA || !idB || idA === idB) return;
    if (!socialA.friends.includes(idB)) socialA.friends.push(idB);
    if (!socialB.friends.includes(idA)) socialB.friends.push(idA);
    socialA.friendRequestsIncoming = removeFriendIdFromList(socialA.friendRequestsIncoming, idB);
    socialA.friendRequestsOutgoing = removeFriendIdFromList(socialA.friendRequestsOutgoing, idB);
    socialB.friendRequestsIncoming = removeFriendIdFromList(socialB.friendRequestsIncoming, idA);
    socialB.friendRequestsOutgoing = removeFriendIdFromList(socialB.friendRequestsOutgoing, idA);
  }

  function createFriendRequest(fromUserId, targetUserId) {
    const fromId = normalizeFriendId(fromUserId);
    const targetId = normalizeFriendId(targetUserId);
    if (!fromId || !targetId) return { ok: false, code: 'invalid_id' };
    if (fromId === targetId) return { ok: false, code: 'self' };
    const fromPlayer = loadPlayer(fromId);
    const targetPlayer = loadPlayer(targetId);
    if (!fromPlayer) return { ok: false, code: 'from_not_found' };
    if (!targetPlayer) return { ok: false, code: 'target_not_found' };

    const fromSocial = ensurePlayerFriendState(fromPlayer);
    const targetSocial = ensurePlayerFriendState(targetPlayer);

    const reversePending = fromSocial.friendRequestsIncoming.includes(targetId) || targetSocial.friendRequestsOutgoing.includes(fromId);
    if (reversePending) {
      finalizeMutualFriendship(fromPlayer, targetPlayer);
      savePlayer(fromPlayer);
      savePlayer(targetPlayer);
      return { ok: true, code: 'auto_accepted', targetName: getPlayerDisplayNameById(targetId) };
    }

    resetFriendPairState(fromSocial, targetSocial, fromId, targetId);
    if (!fromSocial.friendRequestsOutgoing.includes(targetId)) fromSocial.friendRequestsOutgoing.push(targetId);
    if (!targetSocial.friendRequestsIncoming.includes(fromId)) targetSocial.friendRequestsIncoming.push(fromId);
    savePlayer(fromPlayer);
    savePlayer(targetPlayer);
    return { ok: true, code: 'requested', overwritten: true, targetName: getPlayerDisplayNameById(targetId) };
  }

  function acceptFriendRequest(receiverUserId, requesterUserId) {
    const receiverId = normalizeFriendId(receiverUserId);
    const requesterId = normalizeFriendId(requesterUserId);
    if (!receiverId || !requesterId) return { ok: false, code: 'invalid_id' };
    const receiver = loadPlayer(receiverId);
    const requester = loadPlayer(requesterId);
    if (!receiver || !requester) return { ok: false, code: 'player_not_found' };
    const receiverSocial = ensurePlayerFriendState(receiver);
    const requesterSocial = ensurePlayerFriendState(requester);
    const hasPending = receiverSocial.friendRequestsIncoming.includes(requesterId) || requesterSocial.friendRequestsOutgoing.includes(receiverId);
    if (!hasPending && !(receiverSocial.friends.includes(requesterId) && requesterSocial.friends.includes(receiverId))) {
      return { ok: false, code: 'request_not_found', requesterName: getPlayerDisplayNameById(requesterId) };
    }
    finalizeMutualFriendship(receiver, requester);
    savePlayer(receiver);
    savePlayer(requester);
    return { ok: true, code: 'accepted', requesterName: getPlayerDisplayNameById(requesterId) };
  }

  function cancelOutgoingFriendRequest(fromUserId, targetUserId) {
    const fromId = normalizeFriendId(fromUserId);
    const targetId = normalizeFriendId(targetUserId);
    if (!fromId || !targetId) return { ok: false, code: 'invalid_id' };
    const fromPlayer = loadPlayer(fromId);
    const targetPlayer = loadPlayer(targetId);
    if (!fromPlayer || !targetPlayer) return { ok: false, code: 'player_not_found' };
    const fromSocial = ensurePlayerFriendState(fromPlayer);
    const targetSocial = ensurePlayerFriendState(targetPlayer);
    const had = fromSocial.friendRequestsOutgoing.includes(targetId) || targetSocial.friendRequestsIncoming.includes(fromId);
    fromSocial.friendRequestsOutgoing = removeFriendIdFromList(fromSocial.friendRequestsOutgoing, targetId);
    targetSocial.friendRequestsIncoming = removeFriendIdFromList(targetSocial.friendRequestsIncoming, fromId);
    savePlayer(fromPlayer);
    savePlayer(targetPlayer);
    if (!had) return { ok: false, code: 'request_not_found', targetName: getPlayerDisplayNameById(targetId) };
    return { ok: true, code: 'cancelled', targetName: getPlayerDisplayNameById(targetId) };
  }

  function ensureFriendBattleStatsMap(player) {
    const social = ensurePlayerFriendState(player);
    if (!social.friendBattleStats || typeof social.friendBattleStats !== 'object' || Array.isArray(social.friendBattleStats)) {
      social.friendBattleStats = {};
    }
    return social.friendBattleStats;
  }

  function getFriendBattleRecord(player, friendId = '') {
    const id = String(friendId || '').trim();
    const map = ensureFriendBattleStatsMap(player);
    if (!map[id] || typeof map[id] !== 'object') {
      map[id] = { wins: 0, losses: 0, total: 0, lastResult: '', lastAt: 0 };
    }
    const row = map[id];
    row.wins = Math.max(0, Math.floor(Number(row.wins || 0)));
    row.losses = Math.max(0, Math.floor(Number(row.losses || 0)));
    row.total = Math.max(0, Math.floor(Number(row.total || (row.wins + row.losses))));
    row.lastResult = String(row.lastResult || '').trim();
    row.lastAt = Math.max(0, Number(row.lastAt || 0));
    return row;
  }

  function applyFriendBattleResult(player, friendId = '', didWin = false) {
    if (!player || typeof player !== 'object') return null;
    const id = String(friendId || '').trim();
    if (!id) return null;
    const record = getFriendBattleRecord(player, id);
    if (didWin) record.wins += 1;
    else record.losses += 1;
    record.total = record.wins + record.losses;
    record.lastResult = didWin ? 'win' : 'loss';
    record.lastAt = Date.now();
    return record;
  }

  return {
    normalizeFriendId,
    ensurePlayerFriendState,
    removeFriendIdFromList,
    resetFriendPairState,
    removeFriendLinkFromPlayer,
    pruneMissingFriendLinksForPlayer,
    purgePlayerFromAllFriendLists,
    getPlayerDisplayNameById,
    isMutualFriend,
    finalizeMutualFriendship,
    createFriendRequest,
    acceptFriendRequest,
    cancelOutgoingFriendRequest,
    ensureFriendBattleStatsMap,
    getFriendBattleRecord,
    applyFriendBattleResult
  };
}

module.exports = { createFriendCoreUtils };
