const SUPPORTED = 'documentPictureInPicture' in window;

const state = {
  timeSetMs: 30 * 60 * 1000,
  accumulatedMs: 0,
  running: false,
  startTimestamp: null,
  mode: 'medium',
  pipWindow: null,
  tickHandle: null,
  ui: {
    root: null,
    timeSet: null,
    timePassed: null,
    toggle: null,
    addFive: null,
    modeToggle: null,
    timerCard: null,
  },
};

const openBtn = document.querySelector('[data-open-pip]');
const warning = document.querySelector('[data-support-warning]');
let autoOpenScheduled = false;

if (!SUPPORTED) {
  warning.hidden = false;
  openBtn.disabled = true;
}

openBtn?.addEventListener('click', () => openFloatingTimer());
scheduleAutoOpen();

async function openFloatingTimer() {
  if (!SUPPORTED) {
    return;
  }

  if (state.pipWindow && !state.pipWindow.closed) {
    state.pipWindow.focus();
    return;
  }

  try {
    const pipWindow = await documentPictureInPicture.requestWindow({
      width: state.mode === 'small' ? 260 : 340,
      height: state.mode === 'small' ? 150 : 240,
    });
    mountPiPWindow(pipWindow);
  } catch (error) {
    console.error('Unable to open floating window', error);
    warning.hidden = false;
    warning.textContent = 'Unable to open floating window in this browser.';
  }
}

function mountPiPWindow(pipWindow) {
  state.pipWindow = pipWindow;
  const { document: doc } = pipWindow;

  ensureHead(doc);
  injectStyles(doc);

  doc.body.className = 'pip-body';
  doc.body.innerHTML = '';

  const app = doc.createElement('div');
  app.className = 'floating-app';
  app.dataset.mode = state.mode;
  app.innerHTML = createFloatingMarkup();
  doc.body.appendChild(app);

  cacheElements(doc, app);
  bindHandlers();
  render();
  if (state.running) {
    startTicker();
  }

  pipWindow.addEventListener('pagehide', handlePiPClose, { once: true });
}

function ensureHead(doc) {
  if (!doc.head) {
    const head = doc.createElement('head');
    doc.documentElement.prepend(head);
  }
}

function injectStyles(doc) {
  const existing = doc.querySelector('link[data-shared-style]');
  if (existing) {
    return;
  }
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./styles.css', document.baseURI).toString();
  link.dataset.sharedStyle = 'true';
  doc.head.appendChild(link);
}

function createFloatingMarkup() {
  return `
    <div class="timer-card" data-timer-shell>
      <div class="timer-grid">
        <div class="label">time set</div>
        <div class="label">time passed</div>
        <div class="value small" data-time-set>30:00</div>
        <div class="value" data-time-passed>00:00</div>
      </div>
    </div>
    <div class="controls">
      <button type="button" data-add-five>+5 min</button>
      <button type="button" data-toggle-run title="Start / pause">▶️</button>
      <button type="button" data-mode-toggle>Small mode</button>
    </div>
  `;
}

function cacheElements(doc, appRoot) {
  state.ui.root = appRoot;
  state.ui.timeSet = doc.querySelector('[data-time-set]');
  state.ui.timePassed = doc.querySelector('[data-time-passed]');
  state.ui.toggle = doc.querySelector('[data-toggle-run]');
  state.ui.addFive = doc.querySelector('[data-add-five]');
  state.ui.modeToggle = doc.querySelector('[data-mode-toggle]');
  state.ui.timerCard = doc.querySelector('[data-timer-shell]');
}

function bindHandlers() {
  state.ui.addFive?.addEventListener('click', () => {
    adjustTimeSet(5 * 60 * 1000);
  });

  state.ui.toggle?.addEventListener('click', () => {
    state.running ? pauseTimer() : startTimer();
  });

  state.ui.modeToggle?.addEventListener('click', () => {
    setMode('small');
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
}

function startTimer() {
  if (state.running) return;
  state.running = true;
  state.startTimestamp = performance.now();
  startTicker();
  render();
}

function pauseTimer() {
  if (!state.running) return;
  state.accumulatedMs = getElapsedMs();
  state.running = false;
  state.startTimestamp = null;
  stopTicker();
  render();
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
  return state.accumulatedMs + (performance.now() - state.startTimestamp);
}

function setMode(mode) {
  state.mode = mode;
  if (state.ui.root) {
    state.ui.root.dataset.mode = mode;
  }
  attemptResize(mode);
  if (mode === 'medium' && state.ui.modeToggle) {
    state.ui.modeToggle.blur();
  }
}

function attemptResize(mode) {
  if (!state.pipWindow || typeof state.pipWindow.resizeTo !== 'function') {
    return;
  }
  const size = mode === 'small'
    ? { width: 260, height: 150 }
    : { width: 340, height: 240 };
  try {
    state.pipWindow.resizeTo(size.width, size.height);
  } catch (error) {
    // Silently ignore if host blocks resize.
  }
}

function render() {
  const elapsed = getElapsedMs();
  state.ui.timeSet && (state.ui.timeSet.textContent = formatDuration(state.timeSetMs));
  state.ui.timePassed && (state.ui.timePassed.textContent = formatDuration(elapsed));

  if (state.ui.toggle) {
    state.ui.toggle.textContent = state.running ? '⏸️' : '▶️';
    state.ui.toggle.title = state.running ? 'Pause timer' : 'Start timer';
  }

  if (state.ui.modeToggle) {
    state.ui.modeToggle.textContent = state.mode === 'small' ? 'Medium mode' : 'Small mode';
    if (state.mode === 'small') {
      state.ui.modeToggle.blur();
    }
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

function handlePiPClose() {
  if (state.running) {
    // Keep the timer moving even if the floating window was closed.
    state.accumulatedMs = getElapsedMs();
    state.startTimestamp = performance.now();
  }
  cleanupUiReferences();
  state.pipWindow = null;
}

function cleanupUiReferences() {
  stopTicker();
  Object.keys(state.ui).forEach((key) => {
    state.ui[key] = null;
  });
}

function scheduleAutoOpen() {
  if (autoOpenScheduled || !SUPPORTED) {
    return;
  }
  autoOpenScheduled = true;
  // Delay slightly so the landing copy renders before the PiP prompt appears.
  setTimeout(() => {
    openFloatingTimer().catch(() => {
      autoOpenScheduled = false;
    });
  }, 300);
}
