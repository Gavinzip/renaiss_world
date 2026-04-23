const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

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

  function getRegionPosterRendererScriptPath() {
    return path.join(rootDir, 'tools', 'map_poster_renderer', 'render_poster_map_v6_island_glass.py');
  }

  function normalizeMapLang(lang = 'zh-TW') {
    const raw = String(lang || '').trim();
    const lower = raw.toLowerCase();
    if (raw === 'zh-CN') return 'zh-CN';
    if (raw === 'en') return 'en';
    if (
      raw === 'ko' ||
      raw === 'ko-KR' ||
      lower === 'ko' ||
      lower === 'ko-kr' ||
      lower === 'kr' ||
      lower === 'korean' ||
      lower.includes('한국')
    ) return 'ko';
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

  async function pathExists(targetPath) {
    try {
      await fs.promises.access(targetPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  function runProcess(command, args, options = {}) {
    const cwd = options.cwd || rootDir;
    const timeoutMs = Math.max(0, Number(options.timeoutMs || 0));

    return new Promise((resolve) => {
      let finished = false;
      let timeoutError = null;
      let stdout = '';
      let stderr = '';
      let timeoutId = null;
      const child = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const finalize = (result) => {
        if (finished) return;
        finished = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve({
          error: result?.error || timeoutError,
          signal: result?.signal || '',
          status: Number.isFinite(result?.status) ? result.status : null,
          stderr,
          stdout
        });
      };

      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          timeoutError = new Error('Process timed out');
          child.kill('SIGTERM');
          setTimeout(() => {
            try { child.kill('SIGKILL'); } catch {}
          }, 400).unref();
        }, timeoutMs);
      }

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk || '');
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk || '');
      });
      child.on('error', (error) => {
        finalize({ error });
      });
      child.on('close', (status, signal) => {
        finalize({ status, signal });
      });
    });
  }

  async function renderRegionMapImageBuffer(snapshot, statusText = '', lang = 'zh-TW') {
    if (!snapshot || !Array.isArray(snapshot.mapRows) || snapshot.mapRows.length === 0) {
      return { buffer: null, error: '地圖資料為空' };
    }
    const legacyScriptPath = getRegionMapRendererScriptPath();
    const posterScriptPath = getRegionPosterRendererScriptPath();
    const hasPosterScript = await pathExists(posterScriptPath);
    const hasLegacyScript = await pathExists(legacyScriptPath);
    if (!hasPosterScript && !hasLegacyScript) {
      return { buffer: null, error: '找不到地圖渲染腳本（新版/舊版）' };
    }

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'renaiss-map-'));
    const inPath = path.join(tempDir, 'map-input.json');
    const outPath = path.join(tempDir, 'map-output.png');
    const fontPath = path.join(rootDir, 'NotoSansMonoCJKtc-Regular.otf');
    const mapLang = normalizeMapLang(lang);
    const currentLocation = Array.isArray(snapshot.locations)
      ? String(snapshot.locations.find((row) => row?.isCurrent)?.location || '').trim()
      : '';
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
      lang: mapLang,
      legend: getMapImageLegendLabels(lang)
    };

    try {
      await fs.promises.writeFile(inPath, JSON.stringify(payload), 'utf8');
      const legacyArgs = [legacyScriptPath, '--input', inPath, '--output', outPath];
      const runners = ['python3', 'python'];
      const failReasons = [];

      if (hasPosterScript) {
        const posterArgs = [posterScriptPath, '--current', currentLocation || '廣州', '--lang', mapLang, '--output', outPath];
        for (const runner of runners) {
          const run = await runProcess(runner, posterArgs, { cwd: rootDir, timeoutMs: 12000 });
          if (run.status === 0) {
            if (await pathExists(outPath)) {
              return { buffer: await fs.promises.readFile(outPath), error: '' };
            }
            failReasons.push(`${runner}(poster_v6) 執行成功但未產生 PNG`);
            continue;
          }
          failReasons.push(summarizeMapRenderFailure(`${runner}(poster_v6)`, run));
        }
      }

      if (hasLegacyScript) {
        if (await pathExists(fontPath)) legacyArgs.push('--font', fontPath);
        let run = null;
        for (const runner of runners) {
          run = await runProcess(runner, legacyArgs, { cwd: rootDir, timeoutMs: 12000 });
          if (run.status === 0) {
            if (await pathExists(outPath)) {
              return { buffer: await fs.promises.readFile(outPath), error: '' };
            }
            failReasons.push(`${runner}(legacy) 執行成功但未產生 PNG`);
            continue;
          }
          failReasons.push(summarizeMapRenderFailure(`${runner}(legacy)`, run));
        }
        if (!run || run.status !== 0) {
          console.log('[MapRender] python render failed:', {
            status: run?.status,
            signal: run?.signal,
            error: run?.error ? String(run.error.message || run.error) : '',
            stdout: String(run?.stdout || '').slice(0, 600),
            stderr: String(run?.stderr || '').slice(0, 600)
          });
        }
      }
      return { buffer: null, error: (failReasons.join('｜') || '地圖渲染失敗（新版與舊版皆不可用）').slice(0, 220) };
    } catch (e) {
      console.log('[MapRender] exception:', e?.message || e);
      return { buffer: null, error: `程式例外：${String(e?.message || e).slice(0, 140)}` };
    } finally {
      try { await fs.promises.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }

  return {
    normalizeMapViewMode,
    getPlayerMapViewMode,
    getRegionMapRendererScriptPath,
    getRegionPosterRendererScriptPath,
    summarizeMapRenderFailure,
    renderRegionMapImageBuffer
  };
}

module.exports = {
  createMapRenderUtils
};
