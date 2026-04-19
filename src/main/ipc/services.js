const fs = require("node:fs");
const { DATA_PATH, SERVICES_FILE } = require("../data/paths.js");
const { loadServicesData, normalizeService } = require("../data/services.js");

function register(ipcMain) {
    ipcMain.handle("load-services", async () => {
        return loadServicesData();
    });

    ipcMain.handle("save-services", async (event, services) => {
        try {
            const clean = Array.isArray(services)
                ? services.map(normalizeService).filter((s) => s !== null)
                : [];
            if (!fs.existsSync(DATA_PATH)) {
                fs.mkdirSync(DATA_PATH, { recursive: true });
            }
            fs.writeFileSync(SERVICES_FILE, JSON.stringify(clean, null, 2));
            return { success: true };
        } catch (error) {
            console.error("Error saving services:", error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { register };
