const fs = require("node:fs");
const { ACCOUNTS_FILE } = require("./paths.js");

async function loadAccountsData() {
    try {
        const data = fs.readFileSync(ACCOUNTS_FILE, "utf8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Error loading accounts:", error);
        return [];
    }
}

module.exports = { loadAccountsData };
