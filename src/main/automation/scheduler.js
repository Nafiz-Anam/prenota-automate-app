const { delay } = require("./constants.js");

/**
 * Prototype methods attached to BrowserAutomation — mounted via Object.assign in index.js.
 * `emitLog` is the cross-cutting logger used by scheduler + UI; kept here because
 * `waitUntilScheduledTime` is its only non-trivial caller.
 */
const SchedulerMethods = {
    emitLog(accountLabel, message) {
        console.log(`[${accountLabel}] ${message}`);
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send("automation-log", {
                account: accountLabel,
                message,
                timestamp: Date.now(),
            });
        }
    },

    async waitUntilScheduledTime(config, accountLabel) {
        if (config?.timerMode !== "scheduled" || !config.scheduledTime) {
            return;
        }
        const { hour = 0, minute = 0, second = 0 } = config.scheduledTime;
        const now = new Date();
        const target = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            hour,
            minute,
            second,
            0,
        );
        const hhmmss = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;

        if (target.getTime() - Date.now() <= 0) {
            this.emitLog(
                accountLabel,
                `Scheduled time ${hhmmss} already passed — starting booking flow immediately.`,
            );
            return;
        }

        this.emitLog(
            accountLabel,
            `Waiting until ${hhmmss} before starting booking flow...`,
        );

        let lastLogged = 0;
        while (!this.stopFlag) {
            const remaining = target.getTime() - Date.now();
            if (remaining <= 0) break;

            const nowTs = Date.now();
            if (nowTs - lastLogged >= 5000) {
                const totalSec = Math.ceil(remaining / 1000);
                const m = Math.floor(totalSec / 60);
                const s = totalSec % 60;
                this.emitLog(
                    accountLabel,
                    `Waiting for ${hhmmss} — ${m}m ${s}s remaining`,
                );
                lastLogged = nowTs;
            }

            // Cap sleep at 500ms so Stop is responsive.
            await delay(Math.min(500, remaining));
        }

        if (!this.stopFlag) {
            this.emitLog(
                accountLabel,
                `Scheduled time ${hhmmss} reached — starting booking flow.`,
            );
        }
    },
};

module.exports = { SchedulerMethods };
