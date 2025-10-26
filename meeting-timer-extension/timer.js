const STORAGE_KEY = 'meetingTimerStateV1';
const DEFAULT_TIME_MS = 30 * 60 * 1000;

const state = {
  timeSetMs: DEFAULT_TIME_MS,
  accumulatedMs: 0,
  running: false,
  startTimestamp: null,
  mode: 'medium',
  tickHandle: null,
  ui: {},
};

const root = document.querySelector('.floating-app');
state.ui.root = root;
state.ui.timeSet = document.querySelector('[data-time-set]');
state.ui.timePassed = document.querySelector('[data-time-passed]');
state.ui.toggle = document.querySelector('[data-toggle-run]');
state.ui.addFive = document.querySelector('[data-add-five]');
state.ui.subFive = document.querySelector('[data-sub-five]');
state.ui.modeToggle = document.querySelector('[data-mode-toggle]');
state.ui.reset = document.querySelector('[data-reset]');
state.ui.timerCard = document.querySelector('[data-timer-shell]');

initialize();
window.addEventListener('beforeunload', persistState);

async function initialize() {
  await hydrateState();
  bindHandlers();
  render();
  notifyBackground(state.mode);
  if (state.running) {
    startTicker();
  }
}

function bindHandlers() {
  state.ui.addFive?.addEventListener('click', () => {
    adjustTimeSet(5 * 60 * 1000);
  });

  state.ui.subFive?.addEventListener('click', () => {
    adjustTimeSet(-5 * 60 * 1000);
  });

  state.ui.toggle?.addEventListener('click', () => {
    state.running ? pauseTimer() : startTimer();
  });

  state.ui.modeToggle?.addEventListener('click', () => {
    setMode('small');
  });

  state.ui.reset?.addEventListener('click', () => {
    resetTimer();
  });

  state.ui.timerCard?.addEventListener('click', () => {
    if (state.mode === 'small') {
      setMode('medium');
    }
  });
}

function adjustTimeSet(deltaMs) {
  state.timeSetMs = Math.max(60 * 1000, state.timeSetMs + deltaMs);
  render();
  persistState();
}

function startTimer() {
  if (state.running) return;
  state.running = true;
  state.startTimestamp = Date.now();
  startTicker();
  render();
  persistState();
}

function pauseTimer() {
  if (!state.running) return;
  state.accumulatedMs = getElapsedMs();
  state.running = false;
  state.startTimestamp = null;
  stopTicker();
  render();
  persistState();
}

function startTicker() {
  if (state.tickHandle) return;
  state.tickHandle = setInterval(render, 200);
}

function stopTicker() {
  if (!state.tickHandle) return;
  clearInterval(state.tickHandle);
  state.tickHandle = null;
}

function getElapsedMs() {
  if (!state.running || state.startTimestamp === null) {
    return state.accumulatedMs;
  }
  return state.accumulatedMs + (Date.now() - state.startTimestamp);
}

function setMode(mode) {
  state.mode = mode;
  if (state.ui.root) {
    state.ui.root.dataset.mode = mode;
  }
  resizeWindow(mode);
  notifyBackground(mode);
  render();
  persistState();
}

function render() {
  const elapsed = getElapsedMs();
  if (state.ui.timeSet) {
    state.ui.timeSet.textContent = formatDuration(state.timeSetMs);
  }
  if (state.ui.timePassed) {
    state.ui.timePassed.textContent = formatDuration(elapsed);
  }

  if (state.ui.toggle) {
    state.ui.toggle.textContent = state.running ? '⏸️' : '▶️';
    state.ui.toggle.title = state.running ? 'Pause timer' : 'Start timer';
  }

  if (state.ui.modeToggle) {
    state.ui.modeToggle.textContent = 'Minimize';
    state.ui.modeToggle.title = 'Switch to compact view';
    state.ui.modeToggle.disabled = state.mode === 'small';
  }

  applyBorderState(elapsed);
}

function applyBorderState(elapsed) {
  if (!state.ui.timerCard) return;
  const ratio = elapsed / state.timeSetMs;
  state.ui.timerCard.classList.remove('warning', 'alert');
  if (ratio >= 1) {
    state.ui.timerCard.classList.add('alert');
  } else if (ratio >= 0.9) {
    state.ui.timerCard.classList.add('warning');
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.abs(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function resizeWindow(mode) {
  if (!chrome?.windows) return;
  const size = mode === 'small'
    ? { width: 260, height: 170 }
    : { width: 360, height: 280 };
  try {
    const current = await getCurrentWindow();
    await updateWindow(current.id, size);
  } catch (error) {
    // Ignore when window info is not available (e.g., during teardown).
  }
}

function notifyBackground(mode) {
  if (!chrome?.runtime?.sendMessage) return;
  chrome.runtime.sendMessage({ type: 'set-mode', mode }, () => chrome.runtime.lastError);
}

function getCurrentWindow() {
  return new Promise((resolve, reject) => {
    chrome.windows.getCurrent((win) => {
      if (chrome.runtime.lastError || !win) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(win);
      }
    });
  });
}

function updateWindow(windowId, info) {
  return new Promise((resolve, reject) => {
    chrome.windows.update(windowId, info, (win) => {
      if (chrome.runtime.lastError || !win) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(win);
      }
    });
  });
}

async function hydrateState() {
  if (!chrome?.storage?.local) return;
  const data = await new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve(null);
      } else {
        resolve(result[STORAGE_KEY]);
      }
    });
  });
  if (!data) return;
  state.timeSetMs = data.timeSetMs ?? state.timeSetMs;
  state.accumulatedMs = typeof data.accumulatedMs === 'number' ? data.accumulatedMs : state.accumulatedMs;
  state.running = Boolean(data.running);
  state.startTimestamp = typeof data.startTimestamp === 'number' ? data.startTimestamp : null;
  if (state.running && state.startTimestamp === null) {
    state.running = false;
  }
  state.mode = data.mode ?? state.mode;
  if (state.ui.root) {
    state.ui.root.dataset.mode = state.mode;
  }
}

function persistState() {
  if (!chrome?.storage?.local) return;
  const elapsedSnapshot = getElapsedMs();
  if (state.running) {
    state.accumulatedMs = elapsedSnapshot;
    state.startTimestamp = Date.now();
  } else {
    state.accumulatedMs = elapsedSnapshot;
    state.startTimestamp = null;
  }
  const payload = {
    timeSetMs: state.timeSetMs,
    accumulatedMs: state.accumulatedMs,
    running: state.running,
    startTimestamp: state.running ? state.startTimestamp : null,
    mode: state.mode,
  };
  chrome.storage.local.set({ [STORAGE_KEY]: payload }, () => chrome.runtime.lastError);
}

function resetTimer() {
  state.timeSetMs = DEFAULT_TIME_MS;
  state.accumulatedMs = 0;
  state.running = false;
  state.startTimestamp = null;
  stopTicker();
  render();
  persistState();
}
