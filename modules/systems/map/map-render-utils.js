const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function createMapRenderUtils(deps = {}) {
  const {
    rootDir = process.cwd(),
    MAP_ENABLE_WIDE_ANSI = true,
    // Global language resource accessors.
    getLanguageSection = null,
    getLanguageRegionName = null
  } = deps;

  function normalizeMapViewMode(mode, fallback = (MAP_ENABLE_WIDE_ANSI ? 'ascii' : 'text')) {
    const raw = String(mode || '').trim().toLowerCase();
    if (raw === 'ascii' || raw === 'text') return raw;
    return fallback === 'ascii' ? 'ascii' : 'text';
  }

  function getPlayerMapViewMode(player) {
    return normalizeMapViewMode(player?.mapViewMode);
  }

  function getRegionMapRendererScriptPath() {
    return path.join(rootDir, 'tools', 'render_region_map.py');
  }

  function normalizeMapLang(lang = 'zh-TW') {
    const raw = String(lang || '').trim();
    if (raw === 'zh-CN') return 'zh-CN';
    if (raw === 'en') return 'en';
    return 'zh-TW';
  }

  function getMapImageLegendLabels(lang = 'zh-TW') {
    const code = normalizeMapLang(lang);
    if (typeof getLanguageSection === 'function') {
      const fromGlobal = getLanguageSection('mapRenderLegendLabels', code);
      if (fromGlobal && typeof fromGlobal === 'object' && Object.keys(fromGlobal).length > 0) {
        return fromGlobal;
      }
    }
    const map = {
      'zh-TW': {
        you: '目前位置',
        portal: '主傳送門',
        city: '城市',
        forest: '森林'
      },
      'zh-CN': {
        you: '目前位置',
        portal: '主传送门',
        city: '城市',
        forest: '森林'
      },
      en: {
        you: 'You',
        portal: 'Portal Hub',
        city: 'City',
        forest: 'Forest'
      }
    };
    return map[code] || map['zh-TW'];
  }

  function getLocalizedRegionName(regionName = '', lang = 'zh-TW') {
    const source = String(regionName || '').trim();
    if (!source) return source;
    if (typeof getLanguageRegionName === 'function') {
      const fromGlobal = getLanguageRegionName(source, normalizeMapLang(lang));
      if (fromGlobal && String(fromGlobal).trim()) return String(fromGlobal);
    }
    const code = normalizeMapLang(lang);
    const table = {
      '北境高原': { 'zh-TW': '北境高原', 'zh-CN': '北境高原', en: 'Northern Highlands' },
      '中原核心': { 'zh-TW': '中原核心', 'zh-CN': '中原核心', en: 'Central Core' },
      '西域沙海': { 'zh-TW': '西域沙海', 'zh-CN': '西域沙海', en: 'Western Sandsea' },
      '南疆水網': { 'zh-TW': '南疆水網', 'zh-CN': '南疆水网', en: 'Southern Waterways' },
      '群島航線': { 'zh-TW': '群島航線', 'zh-CN': '群岛航线', en: 'Archipelago Routes' },
      '隱秘深域': { 'zh-TW': '隱秘深域', 'zh-CN': '隐秘深域', en: 'Hidden Deep Zone' }
    };
    const row = table[source];
    if (!row) return source;
    return row[code] || row['zh-TW'] || source;
  }

  function summarizeMapRenderFailure(runner = '', run = null) {
    const tag = String(runner || 'python').trim();
    const signal = String(run?.signal || '').trim();
    const status = Number(run?.status);
    const stderr = String(run?.stderr || '').trim();
    const stdout = String(run?.stdout || '').trim();
    const errMsg = String(run?.error?.message || '').trim();
    const mixed = [stderr, stdout, errMsg].filter(Boolean).join('\n');

    if (/No module named ['"]?PIL['"]?/i.test(mixed)) return `${tag} 缺少 Pillow（PIL）套件`;
    if (/ENOENT/i.test(errMsg)) return `${tag} 指令不存在`;
    if (/timed out/i.test(errMsg) || signal === 'SIGTERM' || signal === 'SIGKILL') return `${tag} 渲染逾時`;
    if (/cannot open resource/i.test(mixed) || /OSError:.*resource/i.test(mixed)) return `${tag} 字型資源不可用`;
    if (/can't open file|No such file or directory/i.test(mixed) && /render_region_map\.py/i.test(mixed)) {
      return `${tag} 找不到地圖渲染腳本`;
    }

    const firstLine = (stderr || stdout || errMsg || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
    if (firstLine) return `${tag} 失敗：${firstLine.slice(0, 120)}`;
    if (Number.isFinite(status)) return `${tag} 失敗（exit ${status}）`;
    return `${tag} 渲染失敗`;
  }

  function renderRegionMapImageBuffer(snapshot, statusText = '', lang = 'zh-TW') {
    if (!snapshot || !Array.isArray(snapshot.mapRows) || snapshot.mapRows.length === 0) {
      return { buffer: null, error: '地圖資料為空' };
    }
    const scriptPath = getRegionMapRendererScriptPath();
    if (!fs.existsSync(scriptPath)) {
      return { buffer: null, error: '找不到地圖渲染腳本 tools/render_region_map.py' };
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renaiss-map-'));
    const inPath = path.join(tempDir, 'map-input.json');
    const outPath = path.join(tempDir, 'map-output.png');
    const fontPath = path.join(rootDir, 'NotoSansMonoCJKtc-Regular.otf');
    const localizedRegionName = getLocalizedRegionName(snapshot.regionName || '', lang);
    const payload = {
      map_rows: snapshot.mapRows,
      labels: Array.isArray(snapshot.locations)
        ? snapshot.locations.map((row) => ({
          location: String(row.location || ''),
          x: Number(row.x) + 1,
          y: Number(row.y) + 1,
          name: String(row.location || ''),
          is_current: Boolean(row.isCurrent),
          is_portal_hub: Boolean(row.isPortalHub),
          marker: row.isCurrent && row.isPortalHub
            ? '◎'
            : (row.isCurrent ? '' : (row.isPortalHub ? '◎' : '')),
          npc_count: 0
        }))
        : [],
      zone_name: `${localizedRegionName} ${snapshot.difficultyRange ? `(${snapshot.difficultyRange})` : ''}`.trim(),
      status: statusText,
      lang: normalizeMapLang(lang),
      legend: getMapImageLegendLabels(lang)
    };

    try {
      fs.writeFileSync(inPath, JSON.stringify(payload), 'utf8');
      const args = [scriptPath, '--input', inPath, '--output', outPath];
      if (fs.existsSync(fontPath)) args.push('--font', fontPath);
      const runners = ['python3', 'python'];
      let run = null;
      const failReasons = [];
      for (const runner of runners) {
        run = spawnSync(runner, args, { cwd: rootDir, encoding: 'utf8', timeout: 12000 });
        if (run.status === 0) {
          if (fs.existsSync(outPath)) {
            return { buffer: fs.readFileSync(outPath), error: '' };
          }
          failReasons.push(`${runner} 執行成功但未產生 PNG`);
          continue;
        }
        failReasons.push(summarizeMapRenderFailure(runner, run));
      }
      if (!run || run.status !== 0) {
        console.log('[MapRender] python render failed:', {
          status: run?.status,
          signal: run?.signal,
          error: run?.error ? String(run.error.message || run.error) : '',
          stdout: String(run?.stdout || '').slice(0, 600),
          stderr: String(run?.stderr || '').slice(0, 600)
        });
        return { buffer: null, error: (failReasons.join('｜') || 'Python 渲染失敗').slice(0, 220) };
      }
      return { buffer: null, error: (failReasons.join('｜') || '渲染失敗（未知原因）').slice(0, 220) };
    } catch (e) {
      console.log('[MapRender] exception:', e?.message || e);
      return { buffer: null, error: `程式例外：${String(e?.message || e).slice(0, 140)}` };
    } finally {
      try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath); } catch {}
      try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
      try { fs.rmdirSync(tempDir); } catch {}
    }
  }

  return {
    normalizeMapViewMode,
    getPlayerMapViewMode,
    getRegionMapRendererScriptPath,
    summarizeMapRenderFailure,
    renderRegionMapImageBuffer
  };
}

module.exports = {
  createMapRenderUtils
};
