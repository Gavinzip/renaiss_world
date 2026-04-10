const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'modules', 'app');

const ROOT_ALLOWED = ['bot.js'];

const MODULE_EXPECTED = [
  'modules/core/storage-paths.js',
  'modules/core/game-core.js',
  'modules/core/faction-war-director.js',
  'modules/core/style-sanitizer.js',
  'modules/core/world-lore.js',
  'modules/content/world-map.js',
  'modules/content/event-system.js',
  'modules/content/storyteller.js',
  'modules/content/wish-pool-ai.js',
  'modules/content/narrative-engine.js',
  'modules/content/world-system.js',
  'modules/content/judge-system.js',
  'modules/content/quest-system.js',
  'modules/content/story/main-story.js',
  'modules/content/story/island-story.js',
  'modules/systems/pet/pet-system.js',
  'modules/systems/battle/battle-system.js',
  'modules/systems/gacha/gacha-system.js',
  'modules/systems/market/economy-system.js',
  'modules/systems/player/food-system.js',
  'modules/systems/player/wallet-system.js',
  'modules/systems/data/memory-index.js',
  'modules/systems/data/world-backup.js'
];

function listJsFiles(dirPath) {
  return fs.existsSync(dirPath)
    ? fs.readdirSync(dirPath)
      .filter((name) => name.endsWith('.js'))
      .filter((name) => fs.statSync(path.join(dirPath, name)).isFile())
      .sort()
    : [];
}

function fmt(items = []) {
  return items.length > 0 ? items.join(', ') : '(none)';
}

function main() {
  const rootActual = listJsFiles(ROOT);
  const appActual = listJsFiles(APP_DIR);

  const rootUnknown = rootActual.filter((name) => !ROOT_ALLOWED.includes(name));
  const rootMissing = ROOT_ALLOWED.filter((name) => !rootActual.includes(name));
  const moduleMissing = MODULE_EXPECTED.filter((relPath) => !fs.existsSync(path.join(ROOT, relPath)));

  console.log(`[root-js] allowed: ${fmt(ROOT_ALLOWED)}`);
  console.log(`[root-js] actual (${rootActual.length}): ${fmt(rootActual)}`);
  console.log(`[modules] expected anchors (${MODULE_EXPECTED.length}): ${fmt(MODULE_EXPECTED)}`);
  console.log(`[modules/app] js files (${appActual.length}): ${fmt(appActual)}`);

  const hasError =
    rootUnknown.length > 0 ||
    rootMissing.length > 0 ||
    moduleMissing.length > 0 ||
    appActual.length > 0;

  if (rootUnknown.length > 0) {
    console.error(`[root-js] unexpected root files: ${fmt(rootUnknown)}`);
  }
  if (rootMissing.length > 0) {
    console.error(`[root-js] missing required root files: ${fmt(rootMissing)}`);
  }
  if (moduleMissing.length > 0) {
    console.error(`[modules] missing anchor files: ${fmt(moduleMissing)}`);
  }
  if (appActual.length > 0) {
    console.error(`[modules/app] should not contain js files: ${fmt(appActual)}`);
  }

  if (hasError) {
    process.exit(1);
  }

  console.log('OK root-js-layout');
}

main();
