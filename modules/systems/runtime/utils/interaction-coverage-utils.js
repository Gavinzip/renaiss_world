const fs = require('fs');
const path = require('path');

function createInteractionCoverageUtils(deps = {}) {
  const {
    coverageFile = '',
    loadJsonObject = () => ({}),
    saveJsonObject = () => {}
  } = deps;

  const dispatcherFile = path.resolve(__dirname, '../../routing/interaction-dispatcher-utils.js');
  const signatures = parseRouteSignatures(dispatcherFile);
  const exactSet = new Set(signatures.exact);
  const prefixList = signatures.prefix;

  let stateCache = null;
  let dirty = false;
  let flushTimer = null;

  function buildInitialState() {
    return {
      version: 1,
      updatedAt: Date.now(),
      totals: { ok: 0, failed: 0 },
      observedCustomIds: {},
      exactStats: {},
      prefixStats: {},
      recentFailures: []
    };
  }

  function ensureState() {
    if (stateCache) return stateCache;
    const loaded = String(coverageFile || '').trim()
      ? loadJsonObject(coverageFile)
      : {};
    const base = buildInitialState();
    stateCache = {
      ...base,
      ...((loaded && typeof loaded === 'object' && !Array.isArray(loaded)) ? loaded : {}),
      totals: {
        ok: Math.max(0, Number(loaded?.totals?.ok || 0)),
        failed: Math.max(0, Number(loaded?.totals?.failed || 0))
      },
      observedCustomIds: (loaded?.observedCustomIds && typeof loaded.observedCustomIds === 'object' && !Array.isArray(loaded.observedCustomIds))
        ? loaded.observedCustomIds
        : {},
      exactStats: (loaded?.exactStats && typeof loaded.exactStats === 'object' && !Array.isArray(loaded.exactStats))
        ? loaded.exactStats
        : {},
      prefixStats: (loaded?.prefixStats && typeof loaded.prefixStats === 'object' && !Array.isArray(loaded.prefixStats))
        ? loaded.prefixStats
        : {},
      recentFailures: Array.isArray(loaded?.recentFailures) ? loaded.recentFailures : []
    };
    return stateCache;
  }

  function normalizeCounterEntry(raw = null) {
    const obj = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    return {
      ok: Math.max(0, Number(obj.ok || 0)),
      failed: Math.max(0, Number(obj.failed || 0)),
      lastStatus: String(obj.lastStatus || '').trim() || 'none',
      lastAt: Math.max(0, Number(obj.lastAt || 0)),
      lastError: String(obj.lastError || '').trim().slice(0, 500),
      kind: String(obj.kind || '').trim() || 'unknown'
    };
  }

  function touchCounter(target, key, ok, kind, errorText = '') {
    const prev = normalizeCounterEntry(target[key]);
    if (ok) prev.ok += 1;
    else prev.failed += 1;
    prev.lastStatus = ok ? 'ok' : 'failed';
    prev.lastAt = Date.now();
    prev.lastError = ok ? '' : String(errorText || '').trim().slice(0, 500);
    prev.kind = String(kind || prev.kind || 'unknown').trim() || 'unknown';
    target[key] = prev;
  }

  function scheduleFlush() {
    if (!dirty || !coverageFile) return;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (!dirty) return;
      try {
        saveJsonObject(coverageFile, ensureState());
        dirty = false;
      } catch (err) {
        console.error('[InteractionCoverage] flush failed:', err?.message || err);
      }
    }, 1200);
    if (typeof flushTimer.unref === 'function') flushTimer.unref();
  }

  function flushInteractionCoverageNow() {
    if (!coverageFile) return false;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!dirty) return true;
    try {
      saveJsonObject(coverageFile, ensureState());
      dirty = false;
      return true;
    } catch (err) {
      console.error('[InteractionCoverage] flush-now failed:', err?.message || err);
      return false;
    }
  }

  function recordInteractionCoverage(payload = {}) {
    const customId = String(payload.customId || '').trim();
    if (!customId) return;
    const kind = String(payload.kind || 'unknown').trim() || 'unknown';
    const ok = Boolean(payload.ok);
    const errorText = String(payload.error || '').trim();

    const state = ensureState();
    state.updatedAt = Date.now();
    if (ok) state.totals.ok += 1;
    else state.totals.failed += 1;
    state.observedCustomIds[customId] = Math.max(0, Number(state.observedCustomIds[customId] || 0)) + 1;

    if (exactSet.has(customId)) {
      touchCounter(state.exactStats, customId, ok, kind, errorText);
    }
    for (const prefix of prefixList) {
      if (!customId.startsWith(prefix)) continue;
      touchCounter(state.prefixStats, prefix, ok, kind, errorText);
    }

    if (!ok) {
      state.recentFailures.unshift({
        at: Date.now(),
        customId,
        kind,
        error: errorText.slice(0, 500)
      });
      if (state.recentFailures.length > 120) {
        state.recentFailures = state.recentFailures.slice(0, 120);
      }
    }

    dirty = true;
    scheduleFlush();
  }

  function summarizeCounter(keys = [], stats = {}) {
    let covered = 0;
    let okCount = 0;
    let failedCount = 0;
    const untested = [];
    const failed = [];
    for (const key of keys) {
      const row = normalizeCounterEntry(stats[key]);
      const total = row.ok + row.failed;
      okCount += row.ok;
      failedCount += row.failed;
      if (total > 0) covered += 1;
      else untested.push(key);
      if (row.failed > 0) {
        failed.push({ key, failed: row.failed, ok: row.ok, lastError: row.lastError, lastAt: row.lastAt, kind: row.kind });
      }
    }
    failed.sort((a, b) => b.failed - a.failed || b.lastAt - a.lastAt);
    return {
      total: keys.length,
      covered,
      coverageRate: keys.length > 0 ? Number(((covered / keys.length) * 100).toFixed(1)) : 100,
      okCount,
      failedCount,
      untested,
      failed
    };
  }

  function getInteractionCoverageReport(options = {}) {
    const top = Math.max(1, Math.min(100, Number(options.top || 30)));
    const state = ensureState();
    const exactSummary = summarizeCounter(signatures.exact, state.exactStats);
    const prefixSummary = summarizeCounter(signatures.prefix, state.prefixStats);

    const observedKeys = Object.keys(state.observedCustomIds || {});
    const unexpectedObserved = observedKeys.filter((id) => !exactSet.has(id));

    const failedCombined = [
      ...exactSummary.failed.map((row) => ({ scope: 'exact', ...row })),
      ...prefixSummary.failed.map((row) => ({ scope: 'prefix', ...row }))
    ].sort((a, b) => b.failed - a.failed || b.lastAt - a.lastAt);

    return {
      updatedAt: Math.max(0, Number(state.updatedAt || 0)),
      totals: {
        ok: Math.max(0, Number(state.totals?.ok || 0)),
        failed: Math.max(0, Number(state.totals?.failed || 0))
      },
      exact: exactSummary,
      prefix: prefixSummary,
      observedCustomIdCount: observedKeys.length,
      unexpectedObservedCount: unexpectedObserved.length,
      unexpectedObserved: unexpectedObserved.slice(0, top),
      failedTop: failedCombined.slice(0, top),
      recentFailures: (Array.isArray(state.recentFailures) ? state.recentFailures : []).slice(0, top)
    };
  }

  function clearInteractionCoverage() {
    stateCache = buildInitialState();
    dirty = true;
    return flushInteractionCoverageNow();
  }

  return {
    recordInteractionCoverage,
    getInteractionCoverageReport,
    clearInteractionCoverage,
    flushInteractionCoverageNow
  };
}

function parseRouteSignatures(dispatcherFile = '') {
  try {
    if (!dispatcherFile || !fs.existsSync(dispatcherFile)) {
      return { exact: [], prefix: [] };
    }
    const src = fs.readFileSync(dispatcherFile, 'utf8');
    const exact = Array.from(new Set([...src.matchAll(/customId\s*===\s*'([^']+)'/g)].map((m) => m[1]))).sort();
    const prefix = Array.from(new Set([...src.matchAll(/customId\.startsWith\('([^']+)'\)/g)].map((m) => m[1]))).sort();
    return { exact, prefix };
  } catch (err) {
    console.error('[InteractionCoverage] parse signatures failed:', err?.message || err);
    return { exact: [], prefix: [] };
  }
}

module.exports = {
  createInteractionCoverageUtils
};

