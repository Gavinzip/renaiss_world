function registerRuntimeHandlers(client, deps = {}) {
  const {
    registerReadyHandlers,
    registerSlashCommandListener,
    registerInteractionDispatcher,
    handleStart,
    handleWarStatus,
    handleResetData,
    handleResetPlayerHistory,
    handleResetWorld,
    handleBackupWorld,
    handleBackupCheck,
    handlePullWorldData = async () => {},
    interactionDeps
  } = deps;

  if (typeof registerReadyHandlers === 'function') {
    registerReadyHandlers();
  }

  if (typeof registerSlashCommandListener === 'function') {
    registerSlashCommandListener(client, {
      handleStart: (...args) => handleStart(...args),
      handleWarStatus: (...args) => handleWarStatus(...args),
      handleResetData: (...args) => handleResetData(...args),
      handleResetPlayerHistory: (...args) => handleResetPlayerHistory(...args),
      handleResetWorld: (...args) => handleResetWorld(...args),
      handleBackupWorld: (...args) => handleBackupWorld(...args),
      handleBackupCheck: (...args) => handleBackupCheck(...args),
      handlePullWorldData: (...args) => handlePullWorldData(...args)
    });
  }

  if (typeof registerInteractionDispatcher === 'function') {
    registerInteractionDispatcher(client, interactionDeps || {});
  }
}

module.exports = { registerRuntimeHandlers };
