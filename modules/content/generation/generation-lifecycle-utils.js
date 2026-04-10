function createGenerationLifecycleUtils(deps = {}) {
  const {
    GENERATION_HISTORY_LIMIT = 20,
    ensurePlayerGenerationSchema = () => {},
    normalizeGenerationStatus = (status) => String(status || 'idle'),
    cloneChoiceSnapshot = (choices = []) => (Array.isArray(choices) ? choices : [])
  } = deps;

  function pushGenerationHistory(player, record = {}) {
    ensurePlayerGenerationSchema(player);
    const history = Array.isArray(player.generationHistory) ? player.generationHistory : [];
    history.push({
      id: record.id ? String(record.id) : null,
      source: record.source ? String(record.source) : 'unknown',
      status: normalizeGenerationStatus(record.status),
      phase: record.phase ? String(record.phase) : '',
      startedAt: Number(record.startedAt) || 0,
      endedAt: Number(record.endedAt) || Date.now(),
      sourceChoice: record.sourceChoice ? String(record.sourceChoice) : '',
      story: record.story ? String(record.story) : '',
      choices: cloneChoiceSnapshot(record.choices),
      error: record.error ? String(record.error) : '',
      location: record.location ? String(record.location) : ''
    });
    player.generationHistory = history.slice(-GENERATION_HISTORY_LIMIT);
  }

  function startGenerationState(player, metadata = {}) {
    ensurePlayerGenerationSchema(player);
    const now = Date.now();
    const nextAttempt = Math.max(1, Number(metadata.attempts) || Number(player.generationState?.attempts || 0) + 1);
    const nextId = `${player?.id || 'player'}-${now}-${Math.random().toString(36).slice(2, 7)}`;
    player.generationState = {
      id: nextId,
      source: metadata.source ? String(metadata.source) : 'unknown',
      status: 'pending',
      phase: metadata.phase ? String(metadata.phase) : 'init',
      startedAt: now,
      updatedAt: now,
      sourceChoice: metadata.sourceChoice ? String(metadata.sourceChoice) : '',
      lastError: null,
      storySnapshot: metadata.storySnapshot ? String(metadata.storySnapshot) : '',
      choicesSnapshot: cloneChoiceSnapshot(metadata.choicesSnapshot),
      loadingMessageId: metadata.loadingMessageId ? String(metadata.loadingMessageId) : null,
      attempts: nextAttempt
    };
    return player.generationState;
  }

  function updateGenerationState(player, patch = {}) {
    ensurePlayerGenerationSchema(player);
    const state = player.generationState || {};
    if (patch.source !== undefined) state.source = patch.source ? String(patch.source) : state.source;
    if (patch.phase !== undefined) state.phase = patch.phase ? String(patch.phase) : state.phase;
    if (patch.status !== undefined) state.status = normalizeGenerationStatus(patch.status);
    if (patch.sourceChoice !== undefined) state.sourceChoice = patch.sourceChoice ? String(patch.sourceChoice) : '';
    if (patch.loadingMessageId !== undefined) {
      state.loadingMessageId = patch.loadingMessageId ? String(patch.loadingMessageId) : null;
    }
    if (patch.storySnapshot !== undefined) {
      state.storySnapshot = patch.storySnapshot ? String(patch.storySnapshot) : '';
    }
    if (patch.choicesSnapshot !== undefined) {
      state.choicesSnapshot = cloneChoiceSnapshot(patch.choicesSnapshot);
    }
    if (patch.lastError !== undefined) {
      state.lastError = patch.lastError || null;
    }
    state.updatedAt = Date.now();
    player.generationState = state;
    return state;
  }

  function finishGenerationState(player, status, extras = {}) {
    ensurePlayerGenerationSchema(player);
    const state = player.generationState || {};
    const endedAt = Date.now();
    const finalStatus = normalizeGenerationStatus(status);
    state.status = finalStatus;
    state.phase = extras.phase ? String(extras.phase) : state.phase || 'done';
    state.updatedAt = endedAt;

    if (extras.storySnapshot !== undefined) {
      state.storySnapshot = extras.storySnapshot ? String(extras.storySnapshot) : '';
    } else if (String(player.currentStory || '').trim()) {
      state.storySnapshot = String(player.currentStory || '');
    }
    if (extras.choicesSnapshot !== undefined) {
      state.choicesSnapshot = cloneChoiceSnapshot(extras.choicesSnapshot);
    } else if (Array.isArray(player.eventChoices) && player.eventChoices.length > 0) {
      state.choicesSnapshot = cloneChoiceSnapshot(player.eventChoices);
    }

    if (finalStatus === 'failed') {
      const message = extras.error ? String(extras.error) : 'unknown error';
      state.lastError = {
        message,
        at: endedAt,
        phase: state.phase || ''
      };
    } else {
      state.lastError = null;
    }

    player.generationState = state;
    pushGenerationHistory(player, {
      id: state.id,
      source: state.source,
      status: finalStatus,
      phase: state.phase,
      startedAt: Number(state.startedAt) || endedAt,
      endedAt,
      sourceChoice: state.sourceChoice || '',
      story: state.storySnapshot || '',
      choices: state.choicesSnapshot || [],
      error: finalStatus === 'failed' ? (state.lastError?.message || '') : '',
      location: player?.location || ''
    });
    return state;
  }

  function restoreStoryFromGenerationState(player) {
    ensurePlayerGenerationSchema(player);
    const existingStory = String(player.currentStory || '').trim();
    if (existingStory) return false;

    const fromState = String(player.generationState?.storySnapshot || '').trim();
    if (fromState) {
      player.currentStory = fromState;
      return true;
    }

    const history = Array.isArray(player.generationHistory) ? player.generationHistory : [];
    for (let i = history.length - 1; i >= 0; i--) {
      const story = String(history[i]?.story || '').trim();
      if (!story) continue;
      player.currentStory = story;
      return true;
    }

    return false;
  }

  function restoreChoicesFromGenerationState(player) {
    ensurePlayerGenerationSchema(player);
    if (Array.isArray(player.eventChoices) && player.eventChoices.length > 0) return false;
    const story = String(player.currentStory || '').trim();
    if (!story) return false;

    const state = player.generationState || {};
    const stateChoices = cloneChoiceSnapshot(state.choicesSnapshot);
    if (stateChoices.length > 0 && String(state.storySnapshot || '').trim() === story) {
      player.eventChoices = stateChoices;
      return true;
    }

    const history = Array.isArray(player.generationHistory) ? player.generationHistory : [];
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      if (String(item?.story || '').trim() !== story) continue;
      const choices = cloneChoiceSnapshot(item?.choices);
      if (choices.length === 0) continue;
      player.eventChoices = choices;
      return true;
    }

    return false;
  }

  return {
    pushGenerationHistory,
    startGenerationState,
    updateGenerationState,
    finishGenerationState,
    restoreStoryFromGenerationState,
    restoreChoicesFromGenerationState
  };
}

module.exports = { createGenerationLifecycleUtils };
