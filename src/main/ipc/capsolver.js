const fs = require("node:fs");
const { DATA_PATH, CAPSOLVER_SETTINGS_FILE } = require("../data/paths.js");
const { loadCapsolverSettingsData } = require("../data/capsolver.js");

function register(ipcMain) {
    ipcMain.handle("load-capsolver-settings", async () => {
        return loadCapsolverSettingsData();
    });

    ipcMain.handle("save-capsolver-settings", async (event, settings) => {
        try {
            const apiKey =
                settings && typeof settings.apiKey === "string"
                    ? settings.apiKey
                    : "";
            const chromiumExtensionPath =
                settings && typeof settings.chromiumExtensionPath === "string"
                    ? settings.chromiumExtensionPath
                    : "";
            const useChromeChannel = Boolean(settings?.useChromeChannel);
            if (!fs.existsSync(DATA_PATH)) {
                fs.mkdirSync(DATA_PATH, { recursive: true });
            }
            fs.writeFileSync(
                CAPSOLVER_SETTINGS_FILE,
                JSON.stringify(
                    { apiKey, chromiumExtensionPath, useChromeChannel },
                    null,
                    2,
                ),
            );
            return { success: true };
        } catch (error) {
            console.error("Error saving CapSolver settings:", error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { register };
