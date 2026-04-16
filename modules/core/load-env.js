const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_ENV_PATH = path.join(PROJECT_ROOT, '.env');

function parseEnvLine(rawLine = '') {
  const trimmed = String(rawLine || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const normalized = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trim()
    : trimmed;
  const separatorIndex = normalized.indexOf('=');
  if (separatorIndex <= 0) return null;

  const key = normalized.slice(0, separatorIndex).trim();
  if (!key) return null;

  return {
    key,
    value: normalized.slice(separatorIndex + 1).trim()
  };
}

function loadEnvFile(filePath = DEFAULT_ENV_PATH, options = {}) {
  const targetPath = path.resolve(String(filePath || DEFAULT_ENV_PATH));
  const overrideExisting = options.overrideExisting !== false;
  if (!fs.existsSync(targetPath)) {
    return {
      applied: 0,
      filePath: targetPath,
      loaded: false
    };
  }

  const content = fs.readFileSync(targetPath, 'utf8');
  let applied = 0;
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (!overrideExisting && Object.prototype.hasOwnProperty.call(process.env, parsed.key)) continue;
    process.env[parsed.key] = parsed.value;
    applied += 1;
  }

  return {
    applied,
    filePath: targetPath,
    loaded: true
  };
}

function loadEnvFromCandidates(candidates = [DEFAULT_ENV_PATH], options = {}) {
  const inputList = Array.isArray(candidates) ? candidates : [candidates];
  const uniqueCandidates = Array.from(
    new Set(inputList.map((candidate) => String(candidate || '').trim()).filter(Boolean))
  );
  const results = uniqueCandidates.map((candidate) => loadEnvFile(candidate, options));
  const applied = results.reduce((sum, result) => sum + Number(result?.applied || 0), 0);
  const firstLoaded = results.find((result) => result.loaded);

  return {
    applied,
    filePath: firstLoaded?.filePath || '',
    loaded: results.some((result) => result.loaded),
    results
  };
}

function loadProjectEnv(options = {}) {
  return loadEnvFile(DEFAULT_ENV_PATH, options);
}

module.exports = {
  DEFAULT_ENV_PATH,
  PROJECT_ROOT,
  loadEnvFile,
  loadEnvFromCandidates,
  loadProjectEnv,
  parseEnvLine
};
