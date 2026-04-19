/**
 * CapSolver settings panel — reads `this.capsolverSettings`, renders form state,
 * and saves/clears via the IPC bridge.
 */
export const CapsolverUiMethods = {
    refreshCapsolverForm() {
        const input = document.getElementById("storedCapsolverApiKey");
        const extInput = document.getElementById("chromiumExtensionPath");
        const chromeChk = document.getElementById("useChromeChannel");
        const status = document.getElementById("capsolverKeyStatus");
        if (input) {
            input.value = this.capsolverSettings?.apiKey ?? "";
        }
        if (extInput) {
            extInput.value = this.capsolverSettings?.chromiumExtensionPath ?? "";
        }
        if (chromeChk) {
            chromeChk.checked = Boolean(
                this.capsolverSettings?.useChromeChannel,
            );
        }
        if (status) {
            const has = Boolean(
                (this.capsolverSettings?.apiKey || "").trim(),
            );
            const hasExt = Boolean(
                (this.capsolverSettings?.chromiumExtensionPath || "").trim(),
            );
            const useChrome = Boolean(
                this.capsolverSettings?.useChromeChannel,
            );
            const parts = [];
            if (has) parts.push("API key saved");
            if (hasExt) parts.push("extension path saved");
            if (useChrome) parts.push("using Google Chrome for automation");
            status.textContent =
                parts.length > 0
                    ? `Saved: ${parts.join("; ")}.`
                    : "No API key or extension path saved yet.";
        }
    },

    async saveCapsolverSettingsFromUI() {
        const input = document.getElementById("storedCapsolverApiKey");
        const extInput = document.getElementById("chromiumExtensionPath");
        const chromeChk = document.getElementById("useChromeChannel");
        const apiKey = (input?.value ?? "").trim();
        const chromiumExtensionPath = (extInput?.value ?? "").trim();
        const useChromeChannel = Boolean(chromeChk?.checked);
        this.capsolverSettings = {
            apiKey,
            chromiumExtensionPath,
            useChromeChannel,
        };
        try {
            const result = await window.electronAPI.saveCapsolverSettings(
                this.capsolverSettings,
            );
            if (!result.success) {
                throw new Error(result.error || "Save failed");
            }
            this.refreshCapsolverForm();
            this.showNotification("CapSolver settings saved", "success");
        } catch (error) {
            console.error("Save CapSolver settings:", error);
            this.showNotification(
                "Could not save API key: " + error.message,
                "error",
            );
        }
    },

    async clearCapsolverSettingsFromUI() {
        if (
            !confirm(
                "Remove the saved CapSolver API key from this computer?",
            )
        ) {
            return;
        }
        this.capsolverSettings = {
            apiKey: "",
            chromiumExtensionPath: "",
            useChromeChannel: false,
        };
        const input = document.getElementById("storedCapsolverApiKey");
        const extInput = document.getElementById("chromiumExtensionPath");
        const chromeChk = document.getElementById("useChromeChannel");
        if (input) input.value = "";
        if (extInput) extInput.value = "";
        if (chromeChk) chromeChk.checked = false;
        try {
            const result = await window.electronAPI.saveCapsolverSettings(
                this.capsolverSettings,
            );
            if (!result.success) {
                throw new Error(result.error || "Save failed");
            }
            this.refreshCapsolverForm();
            this.showNotification("CapSolver API key cleared", "success");
        } catch (error) {
            console.error("Clear CapSolver settings:", error);
            this.showNotification(
                "Could not clear API key: " + error.message,
                "error",
            );
        }
    },
};
