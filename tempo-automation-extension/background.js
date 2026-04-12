/* ================= GLOBAL STATE (PER WINDOW) ================= */

const states = {};

/* ================= UTILITIES ================= */

function getState(windowId) {
  if (!states[windowId]) {
    states[windowId] = {
      running: false,
      waiting: false,
      tabId: null,
      targetTime: null,
      useTimer: false,
      targetTimeStr: "",
      alarmId: null
    };
  }
  return states[windowId];
}

function safeSend(sendResponse, payload) {
  try {
    sendResponse(payload);
  } catch {}
}

function isInjectableTab(tab) {
  return tab && tab.url && tab.url.startsWith("http");
}

/* ================= ICON HANDLER ================= */

function setIcon(tabId, type) {
  if (!tabId) return;

  const icons = {
    idle: "icons/icon-idle.png",
    running: "icons/icon-running.png",
    timer: "icons/icon-timer.png"
  };

  chrome.action.setIcon({ tabId, path: icons[type] });
}

function applyIconForWindow(windowId, tabId) {
  const state = states[windowId];
  if (!state) return setIcon(tabId, "idle");

  if (state.running) setIcon(tabId, "running");
  else if (state.waiting) setIcon(tabId, "timer");
  else setIcon(tabId, "idle");
}

/* ================= MESSAGE HANDLER ================= */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  /* ---------- START ---------- */
  if (msg.action === "START") {
    chrome.tabs.get(msg.tabId, (tab) => {
      if (!tab) return safeSend(sendResponse, { ok: false });

      const windowId = tab.windowId;
      const state = getState(windowId);

      resetTimersOnly(windowId);

      state.tabId = msg.tabId;
      state.useTimer = !!msg.useTimer;
      state.targetTimeStr = msg.targetTime || "";
      state.running = false;
      state.waiting = false;

      // 🔕 INSTANT MODE
      if (!state.useTimer) {
        state.running = true;
        applyIconForWindow(windowId, state.tabId);
        startInstantAutomation(state);
        return safeSend(sendResponse, { ok: true });
      }

      // ⏰ TIMER MODE
      const [hh, mm] = state.targetTimeStr.split(":").map(Number);
      if (isNaN(hh) || isNaN(mm)) {
        return safeSend(sendResponse, { ok: false });
      }

      const now = new Date();
      const target = new Date();
      target.setHours(hh, mm, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);

      state.targetTime = target.getTime();
      state.waiting = true;

      applyIconForWindow(windowId, state.tabId);
      startCountdown(windowId, state);

      safeSend(sendResponse, { ok: true });
    });

    return true;
  }

  /* ---------- STOP / RESET ---------- */
  if (msg.action === "STOP" || msg.action === "RESET") {
    chrome.windows.getCurrent({}, (win) => {
      if (win) fullReset(win.id);
      safeSend(sendResponse, { ok: true });
    });
    return true;
  }

  /* ---------- POPUP STATE ---------- */
  if (msg.action === "GET_STATE") {
    chrome.windows.getCurrent({}, (win) => {
      const state = win ? getState(win.id) : {};
      safeSend(sendResponse, {
        ...state,
        remaining: state?.targetTime
          ? Math.max(0, state.targetTime - Date.now())
          : null
      });
    });
    return true;
  }

  /* ---------- CONTENT FINISHED ---------- */
  if (msg.action === "FINISHED") {
    if (sender.tab) fullReset(sender.tab.windowId);
  }
});

/* ================= TIMER ================= */

function startCountdown(windowId, state) {
  if (state.alarmId) {
    chrome.alarms.clear(state.alarmId);
  }

  state.alarmId = `automation|${windowId}|${state.tabId}`;

  chrome.alarms.create(state.alarmId, {
    when: state.targetTime
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith("automation|")) return;

  const [, windowIdStr, tabIdStr] = alarm.name.split("|");
  const windowId = Number(windowIdStr);
  const tabId = Number(tabIdStr);

  const state = getState(windowId);

  state.tabId = tabId;
  state.waiting = false;
  state.running = true;

  startTimerAutomation(state);
});

/* ================= AUTOMATION ================= */

function startInstantAutomation(state) {
  chrome.tabs.get(state.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab || !isInjectableTab(tab)) return;
    injectAutomation(tab.id);
  });
}

function startTimerAutomation(state) {
  chrome.tabs.get(state.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab || !isInjectableTab(tab)) return;

    const windowId = tab.windowId;

    // 1️⃣ Restore + focus window (works for normal, safe for incognito)
    chrome.windows.update(
      windowId,
      { state: "normal", focused: true },
      () => {

        // 2️⃣ Re-check active tab AFTER window restore
        chrome.tabs.query({ windowId, active: true }, (activeTabs) => {

          const needsActivation =
            !activeTabs[0] || activeTabs[0].id !== tab.id;

          const activateAndInject = () => {

            // 3️⃣ Allow Chrome to repaint & unthrottle
            setTimeout(() => {

              // 4️⃣ Final verification
              chrome.tabs.get(tab.id, (finalTab) => {
                if (
                  chrome.runtime.lastError ||
                  !finalTab ||
                  !finalTab.active ||
                  finalTab.windowId !== windowId
                ) {
                  return;
                }

                injectAutomation(finalTab.id);
              });

            }, 600); // REQUIRED for minimized + incognito
          };

          // 2️⃣a Activate tab only if needed
          if (needsActivation) {
            chrome.tabs.update(tab.id, { active: true }, activateAndInject);
          } else {
            activateAndInject();
          }
        });
      }
    );
  });
}

function injectAutomation(tabId) {
  chrome.scripting.executeScript(
    {
      target: { tabId },
      files: ["content.js"]
    },
    () => {
      // Silence MV3 warnings (tab navigated / closed)
      if (chrome.runtime.lastError) {}
    }
  );
}

/* ================= RESET ================= */

function resetTimersOnly(windowId) {
  const state = states[windowId];
  if (state?.alarmId) {
    chrome.alarms.clear(state.alarmId);
    state.alarmId = null;
  }
}

function fullReset(windowId) {
  const state = states[windowId];
  if (!state) return;

  resetTimersOnly(windowId);

  if (state.tabId) {
    chrome.tabs.sendMessage(
  state.tabId,
  { action: "STOP" },
  () => {
    if (chrome.runtime.lastError) {
      // content script already gone — safe to ignore
    }
  }
);
    setIcon(state.tabId, "idle");
  }

  delete states[windowId];
}

/* ================= ICON SYNC ================= */

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab) applyIconForWindow(tab.windowId, tabId);
  });
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;

  chrome.tabs.query({ windowId, active: true }, (tabs) => {
    if (tabs[0]) applyIconForWindow(windowId, tabs[0].id);
  });
});
