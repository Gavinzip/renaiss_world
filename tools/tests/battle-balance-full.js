#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PET = require('../../modules/systems/pet/pet-system');
const BATTLE = require('../../modules/systems/battle/battle-system');

const ELEMENTS = ['水', '火', '草'];
const ADV_PAIRS = [
  ['水', '火'],
  ['火', '草'],
  ['草', '水']
];

const CONTROL_KEYS = ['stun', 'freeze', 'bind', 'slow', 'fear', 'confuse', 'blind', 'missNext'];
const SUSTAIN_KEYS = ['heal', 'shield', 'cleanse', 'reflect', 'dodge', 'thorns', 'drain'];

function getArg(name, fallback) {
  const key = `--${name}=`;
  const hit = process.argv.find((v) => String(v || '').startsWith(key));
  if (!hit) return fallback;
  const raw = String(hit).slice(key.length).trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const CYCLE_ROUNDS = Math.max(80, Math.floor(getArg('cycle', 260)));
const MOVE_ROUNDS = Math.max(40, Math.floor(getArg('move', 80)));
const MAX_TURNS = Math.max(12, Math.floor(getArg('turns', 24)));

function clampInt(v, min, max, fallback = min) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeElement(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text === '水' || /水|液|潮|霧|冰/.test(text)) return '水';
  if (text === '火' || /火|炎|焰|熱|熔/.test(text)) return '火';
  if (text === '草' || /草|木|藤|森|生質/.test(text)) return '草';
  return '';
}

function toCombatMove(move) {
  return {
    id: String(move?.id || ''),
    name: String(move?.name || '普通攻擊'),
    element: String(move?.element || ''),
    tier: clampInt(move?.tier || 1, 1, 3, 1),
    priority: clampInt(move?.priority || 0, -1, 3, 0),
    speed: clampInt(move?.speed ?? move?.priority ?? 0, -1, 3, 0),
    baseDamage: Math.max(1, Number(move?.baseDamage ?? move?.damage ?? 10) || 10),
    damage: Math.max(1, Number(move?.baseDamage ?? move?.damage ?? 10) || 10),
    effect: (move?.effect && typeof move.effect === 'object') ? { ...move.effect } : {}
  };
}

function pickByRules(pool, count, predicate) {
  const out = [];
  const seen = new Set();
  for (const mv of pool) {
    if (out.length >= count) break;
    const id = String(mv?.id || '');
    if (!id || seen.has(id)) continue;
    if (!predicate(mv)) continue;
    seen.add(id);
    out.push(toCombatMove(mv));
  }
  return out;
}

function buildArchetypePool(element, archetype = 'balanced', count = 8) {
  const base = PET.getMovesByElement(element)
    .filter((m) => !m?.effect?.flee)
    .map((m) => ({ ...m }))
    .sort((a, b) => Number(b?.baseDamage || 0) - Number(a?.baseDamage || 0));

  if (base.length === 0) return [];

  const isControl = (m) => CONTROL_KEYS.some((k) => Number(m?.effect?.[k] || 0) > 0);
  const isSustain = (m) => SUSTAIN_KEYS.some((k) => Number(m?.effect?.[k] || 0) > 0);
  const isBurst = (m) => Number(m?.baseDamage || 0) >= 24;

  const selected = [];
  const add = (arr) => {
    for (const m of arr) {
      if (selected.length >= count) break;
      if (selected.find((x) => x.id === m.id)) continue;
      selected.push(m);
    }
  };

  if (archetype === 'burst') {
    add(base.filter(isBurst));
    add(base);
  } else if (archetype === 'control') {
    add(base.filter(isControl));
    add(base.filter(isSustain));
    add(base);
  } else if (archetype === 'sustain') {
    add(base.filter(isSustain));
    add(base.filter(isControl));
    add(base);
  } else {
    // balanced: 2 burst + 2 control + 2 sustain + fill
    add(base.filter(isBurst).slice(0, 2));
    add(base.filter(isControl).slice(0, 2));
    add(base.filter(isSustain).slice(0, 2));
    add(base);
  }

  return selected.slice(0, count).map(toCombatMove);
}

function makeFighter(element, moves, name = '') {
  const el = normalizeElement(element) || '水';
  const safeMoves = Array.isArray(moves) ? moves.filter(Boolean).slice(0, 12) : [];
  return {
    id: `${el}_${name || 'fighter'}`,
    name: name || `${el}測試方`,
    type: el,
    element: el,
    hp: 120,
    maxHp: 120,
    attack: 24,
    defense: 14,
    speed: 20,
    status: {},
    moves: safeMoves.length > 0
      ? safeMoves
      : [toCombatMove({ id: `fallback_${el}`, name: '普通攻擊', element: el, tier: 1, priority: 0, speed: 0, baseDamage: 12, effect: {} })]
  };
}

function cloneFighter(entity) {
  return {
    ...entity,
    hp: Number(entity?.maxHp || entity?.hp || 120),
    maxHp: Number(entity?.maxHp || entity?.hp || 120),
    status: {},
    moves: (Array.isArray(entity?.moves) ? entity.moves : []).map((m) => toCombatMove(m))
  };
}

function chooseMoveByPolicy(entity, policy, forcedMoveId = '') {
  if (policy === 'force' && forcedMoveId) {
    const found = (entity?.moves || []).find((m) => String(m?.id || '') === String(forcedMoveId || ''));
    if (found) return found;
  }
  return BATTLE.enemyChooseMove(entity);
}

function runOneBattle(attackerSeed, defenderSeed, options = {}) {
  const a = cloneFighter(attackerSeed);
  const b = cloneFighter(defenderSeed);
  const player = { id: 'sim', stats: {} };

  let turns = 0;
  let aMoveUsed = 0;
  let bMoveUsed = 0;
  let aDamage = 0;
  let bDamage = 0;

  for (let t = 1; t <= MAX_TURNS; t++) {
    turns = t;
    const aHpBefore = a.hp;
    const bHpBefore = b.hp;
    const aMove = chooseMoveByPolicy(a, options?.aPolicy || 'weighted', options?.aForcedMoveId || '');
    const bMove = chooseMoveByPolicy(b, options?.bPolicy || 'weighted', options?.bForcedMoveId || '');
    if (aMove) aMoveUsed += 1;
    if (bMove) bMoveUsed += 1;

    const result = BATTLE.executeBattleRound(player, a, b, aMove, bMove, { dryRun: true, nonLethal: true });
    aDamage += Math.max(0, bHpBefore - b.hp);
    bDamage += Math.max(0, aHpBefore - a.hp);
    if (result?.victory === true || b.hp <= 0) {
      return { winner: 'A', turns, aMoveUsed, bMoveUsed, aDamage, bDamage };
    }
    if (result?.victory === false || a.hp <= 0) {
      return { winner: 'B', turns, aMoveUsed, bMoveUsed, aDamage, bDamage };
    }
  }

  if (a.hp === b.hp) return { winner: Math.random() < 0.5 ? 'A' : 'B', turns, aMoveUsed, bMoveUsed, aDamage, bDamage };
  return { winner: a.hp > b.hp ? 'A' : 'B', turns, aMoveUsed, bMoveUsed, aDamage, bDamage };
}

function simulateSeries(attackerSeed, defenderSeed, rounds, options = {}) {
  let wins = 0;
  let totalTurns = 0;
  let totalADmg = 0;
  let totalBDmg = 0;
  let totalAMoveUsed = 0;
  for (let i = 0; i < rounds; i++) {
    const r = runOneBattle(attackerSeed, defenderSeed, options);
    if (r.winner === 'A') wins += 1;
    totalTurns += r.turns;
    totalADmg += r.aDamage;
    totalBDmg += r.bDamage;
    totalAMoveUsed += r.aMoveUsed;
  }
  const rate = wins / Math.max(1, rounds);
  return {
    rounds,
    wins,
    winRate: Number((rate * 100).toFixed(2)),
    avgTurns: Number((totalTurns / Math.max(1, rounds)).toFixed(2)),
    avgADamage: Number((totalADmg / Math.max(1, rounds)).toFixed(2)),
    avgBDamage: Number((totalBDmg / Math.max(1, rounds)).toFixed(2)),
    avgAMoveUsed: Number((totalAMoveUsed / Math.max(1, rounds)).toFixed(2))
  };
}

function runCycleSuite() {
  const archetypes = ['balanced', 'burst', 'control', 'sustain'];
  const rows = [];
  for (const [atkEl, defEl] of ADV_PAIRS) {
    for (const atkArc of archetypes) {
      const atkPool = buildArchetypePool(atkEl, atkArc, 8);
      const defPool = buildArchetypePool(defEl, 'balanced', 8);
      const attacker = makeFighter(atkEl, atkPool, `${atkEl}_${atkArc}`);
      const defender = makeFighter(defEl, defPool, `${defEl}_balanced`);
      const summary = simulateSeries(attacker, defender, CYCLE_ROUNDS, { aPolicy: 'weighted', bPolicy: 'weighted' });
      rows.push({
        attackerElement: atkEl,
        defenderElement: defEl,
        attackerArchetype: atkArc,
        defenderArchetype: 'balanced',
        ...summary
      });
    }
  }
  return rows;
}

function runPerMoveCoverageSuite() {
  const allMoves = [...(PET.POSITIVE_MOVES || []), ...(PET.NEGATIVE_MOVES || [])]
    .filter((m) => !m?.effect?.flee)
    .map((m) => ({ ...m }));

  const byElement = new Map();
  for (const el of ELEMENTS) byElement.set(el, PET.getMovesByElement(el).filter((m) => !m?.effect?.flee));

  const rows = [];
  const skipped = [];
  for (const move of allMoves) {
    const moveId = String(move?.id || '').trim();
    if (!moveId) continue;
    const directEl = normalizeElement(move?.element || '');
    let candidateAttackEls = directEl ? [directEl] : [];
    if (candidateAttackEls.length === 0) {
      const byPoolEls = ELEMENTS.filter((el) =>
        (byElement.get(el) || []).some((m) => String(m?.id || '') === moveId)
      );
      if (byPoolEls.length > 0) candidateAttackEls = byPoolEls;
    }
    if (candidateAttackEls.length === 0) {
      // 未明確掛屬性的招式：三屬性都測，確保覆蓋
      candidateAttackEls = [...ELEMENTS];
    }

    for (const atkEl of candidateAttackEls) {
      const ownPool = (byElement.get(atkEl) || []).filter((m) => String(m?.id || '') !== moveId);
      const filler = ownPool.slice(0, 7).map(toCombatMove);
      const attackerMoves = [toCombatMove(move), ...filler].slice(0, 8);
      const attacker = makeFighter(atkEl, attackerMoves, `force_${moveId}_${atkEl}`);

      for (const defEl of ELEMENTS) {
        if (defEl === atkEl) continue;
        const defender = makeFighter(defEl, buildArchetypePool(defEl, 'balanced', 8), `def_${defEl}`);
        const s = simulateSeries(attacker, defender, MOVE_ROUNDS, {
          aPolicy: 'force',
          aForcedMoveId: moveId,
          bPolicy: 'weighted'
        });
        rows.push({
          moveId,
          moveName: move.name,
          moveElement: move.element,
          attackerElement: atkEl,
          defenderElement: defEl,
          tier: Number(move?.tier || 1),
          priority: Number(move?.priority || 0),
          speed: Number(move?.speed ?? move?.priority ?? 0),
          rounds: s.rounds,
          winRate: s.winRate,
          avgTurns: s.avgTurns,
          avgDamage: s.avgADamage,
          avgMoveUsage: s.avgAMoveUsed
        });
      }
    }
  }

  return { rows, skipped };
}

function summarizeMoveCoverage(rows = []) {
  const map = new Map();
  for (const r of rows) {
    const id = String(r.moveId || '').trim();
    if (!id) continue;
    if (!map.has(id)) {
      map.set(id, {
        moveId: id,
        moveName: r.moveName,
        moveElement: r.moveElement,
        tier: r.tier,
        priority: r.priority,
        speed: r.speed,
        samples: 0,
        winRateSum: 0,
        avgDamageSum: 0
      });
    }
    const rec = map.get(id);
    rec.samples += 1;
    rec.winRateSum += Number(r.winRate || 0);
    rec.avgDamageSum += Number(r.avgDamage || 0);
  }
  return [...map.values()].map((r) => ({
    ...r,
    meanWinRate: Number((r.winRateSum / Math.max(1, r.samples)).toFixed(2)),
    meanDamage: Number((r.avgDamageSum / Math.max(1, r.samples)).toFixed(2))
  })).sort((a, b) => a.meanWinRate - b.meanWinRate);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Battle Balance Full Report');
  lines.push('');
  lines.push(`- generatedAt: ${report.generatedAt}`);
  lines.push(`- cycleRounds: ${report.meta.cycleRounds}`);
  lines.push(`- moveRounds: ${report.meta.moveRounds}`);
  lines.push(`- maxTurns: ${report.meta.maxTurns}`);
  lines.push('');

  lines.push('## Cycle Suite (Advantage Direction)');
  for (const row of report.cycleSuite) {
    lines.push(`- ${row.attackerElement}>${row.defenderElement} | ${row.attackerArchetype}->${row.defenderArchetype} | winRate ${row.winRate}% | avgTurns ${row.avgTurns}`);
  }
  lines.push('');

  lines.push('## Move Coverage Summary');
  lines.push(`- tested moves: ${report.moveCoverageSummary.length}`);
  lines.push(`- skipped moves: ${report.moveCoverageSkipped.length}`);
  lines.push('');

  lines.push('### Bottom 20 Moves (meanWinRate)');
  for (const row of report.moveCoverageSummary.slice(0, 20)) {
    lines.push(`- ${row.moveName}(${row.moveId}) [${row.moveElement}] tier${row.tier} spd${row.speed} prio${row.priority} | meanWinRate ${row.meanWinRate}% | meanDamage ${row.meanDamage}`);
  }
  lines.push('');

  lines.push('### Top 20 Moves (meanWinRate)');
  for (const row of report.moveCoverageSummary.slice(-20).reverse()) {
    lines.push(`- ${row.moveName}(${row.moveId}) [${row.moveElement}] tier${row.tier} spd${row.speed} prio${row.priority} | meanWinRate ${row.meanWinRate}% | meanDamage ${row.meanDamage}`);
  }

  return lines.join('\n');
}

function main() {
  const cycleSuite = runCycleSuite();
  const moveCoverage = runPerMoveCoverageSuite();
  const moveCoverageSummary = summarizeMoveCoverage(moveCoverage.rows);

  const report = {
    generatedAt: new Date().toISOString(),
    meta: {
      cycleRounds: CYCLE_ROUNDS,
      moveRounds: MOVE_ROUNDS,
      maxTurns: MAX_TURNS
    },
    cycleSuite,
    moveCoverageRows: moveCoverage.rows,
    moveCoverageSummary,
    moveCoverageSkipped: moveCoverage.skipped
  };

  const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const outDir = path.join(__dirname, 'results');
  ensureDir(outDir);
  const jsonPath = path.join(outDir, `battle_balance_full_${ts}.json`);
  const mdPath = path.join(outDir, `battle_balance_full_${ts}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderMarkdown(report), 'utf8');

  console.log(`[Balance] Cycle rows: ${cycleSuite.length}`);
  console.log(`[Balance] Move rows: ${moveCoverage.rows.length}`);
  console.log(`[Balance] Output JSON: ${jsonPath}`);
  console.log(`[Balance] Output MD: ${mdPath}`);
}

main();
