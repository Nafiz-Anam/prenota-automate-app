const fs = require("node:fs");
const { DATA_PATH, PROXIES_FILE } = require("../data/paths.js");
const {
    loadProxiesData,
    summarizeProxiesForLog,
} = require("../data/proxies.js");

function register(ipcMain) {
    ipcMain.handle("load-proxies", async () => {
        return loadProxiesData();
    });

    ipcMain.handle("save-proxies", async (event, proxies) => {
        try {
            if (process.argv.includes("--dev")) {
                console.log("Main process: Saving proxies to", PROXIES_FILE);
                console.log(
                    "Proxies summary:",
                    JSON.stringify(summarizeProxiesForLog(proxies), null, 2),
                );
            }

            if (!fs.existsSync(DATA_PATH)) {
                fs.mkdirSync(DATA_PATH, { recursive: true });
            }

            fs.writeFileSync(PROXIES_FILE, JSON.stringify(proxies, null, 2));
            return { success: true };
        } catch (error) {
            console.error("Error saving proxies:", error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { register };
