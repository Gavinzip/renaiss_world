const { createInteractionMessageUtils } = require('../../modules/systems/runtime/utils/interaction-message-utils');

function run() {
  const original = process.env.BUTTON_HIDE_KEEP_MODAL_LAUNCHERS;
  delete process.env.BUTTON_HIDE_KEEP_MODAL_LAUNCHERS;

  const utils = createInteractionMessageUtils();
  if (!utils.isModalLauncherButtonId('open_friend_add_modal')) {
    throw new Error('open_friend_add_modal should stay visible by default');
  }
  if (!utils.isModalLauncherButtonId('open_wallet_modal')) {
    throw new Error('open_wallet_modal should stay visible by default');
  }
  if (utils.isModalLauncherButtonId('open_friends')) {
    throw new Error('open_friends should still follow env switch by default');
  }

  if (typeof original === 'undefined') {
    delete process.env.BUTTON_HIDE_KEEP_MODAL_LAUNCHERS;
  } else {
    process.env.BUTTON_HIDE_KEEP_MODAL_LAUNCHERS = original;
  }
  console.log('OK friend-add-modal-visibility-smoke');
}

try {
  run();
} catch (e) {
  console.error('FAIL friend-add-modal-visibility-smoke:', e?.stack || e);
  process.exit(1);
}
