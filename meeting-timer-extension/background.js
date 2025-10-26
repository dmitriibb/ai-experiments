const WINDOW_SIZE = {
  medium: { width: 360, height: 280 },
  small: { width: 260, height: 170 },
};

let timerWindowId = null;
let lastMode = 'medium';

chrome.action.onClicked.addListener(async () => {
  if (timerWindowId) {
    try {
      const win = await chrome.windows.get(timerWindowId);
      if (win) {
        await chrome.windows.update(timerWindowId, { focused: true });
        return;
      }
    } catch (error) {
      // Window was likely closed.
    }
  }
  await openTimerWindow(lastMode);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'set-mode' && message.mode) {
    lastMode = message.mode;
    if (timerWindowId) {
      chrome.windows.update(timerWindowId, {
        width: WINDOW_SIZE[message.mode].width,
        height: WINDOW_SIZE[message.mode].height,
      });
    }
  } else if (message?.type === 'close-window' && timerWindowId) {
    chrome.windows.remove(timerWindowId);
  }
  sendResponse?.();
  return false;
});

chrome.windows.onRemoved.addListener((removedId) => {
  if (removedId === timerWindowId) {
    timerWindowId = null;
  }
});

chrome.tabs.onActivated.addListener(() => {
  focusTimerWindow();
});

async function openTimerWindow(mode = 'medium') {
  const size = WINDOW_SIZE[mode] ?? WINDOW_SIZE.medium;
  const win = await chrome.windows.create({
    url: 'timer.html',
    type: 'popup',
    width: size.width,
    height: size.height,
    focused: true,
    top: 120,
    left: 120,
  });
  timerWindowId = win.id ?? null;
}

async function focusTimerWindow() {
  if (!timerWindowId) return;
  try {
    await chrome.windows.update(timerWindowId, { focused: true });
  } catch (error) {
    timerWindowId = null;
  }
}
