const fs = require("node:fs");
const { ACCOUNTS_FILE } = require("../data/paths.js");
const { loadAccountsData } = require("../data/accounts.js");

function register(ipcMain) {
    ipcMain.handle("load-accounts", async () => {
        return loadAccountsData();
    });

    ipcMain.handle("save-accounts", async (event, accounts) => {
        try {
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
            return { success: true };
        } catch (error) {
            console.error("Error saving accounts:", error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { register };
