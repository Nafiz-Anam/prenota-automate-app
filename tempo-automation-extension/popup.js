const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");
const status = document.getElementById("status");
const countdown = document.getElementById("countdown");

const useTimer = document.getElementById("useTimer");
const targetTime = document.getElementById("targetTime");

startBtn.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.runtime.sendMessage({
    action: "START",
    tabId: tab.id,
    useTimer: useTimer.checked,
    targetTime: targetTime.value
  });
};

stopBtn.onclick = () => {
  chrome.runtime.sendMessage({ action: "STOP" });
};

resetBtn.onclick = () => {
  chrome.runtime.sendMessage({ action: "RESET" });

  useTimer.checked = false;
  targetTime.value = "";

  countdown.textContent = "";
  status.textContent = "Reset complete";

  startBtn.disabled = false;
  stopBtn.disabled = true;
};

setInterval(() => {
  chrome.runtime.sendMessage({ action: "GET_STATE" }, (state) => {
    if (!state) return;

    if (state.running || state.waiting) {
      useTimer.checked = state.useTimer;
      targetTime.value = state.targetTimeStr || "";
    }

    if (state.running) {
      status.textContent = "Running...";
      countdown.textContent = "";
      startBtn.disabled = true;
      stopBtn.disabled = false;
    }
    else if (state.waiting) {
      const sec = Math.floor(state.remaining / 1000);
      status.textContent = "Waiting for timer";
      countdown.textContent = `⏳ ${sec}s`;
      startBtn.disabled = true;
      stopBtn.disabled = false;
    }
    else {
      status.textContent = "Idle";
      countdown.textContent = "";
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  });
}, 500);
