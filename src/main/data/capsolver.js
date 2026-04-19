const fs = require("node:fs");
const { CAPSOLVER_SETTINGS_FILE } = require("./paths.js");

function loadCapsolverSettingsData() {
    try {
        const data = fs.readFileSync(CAPSOLVER_SETTINGS_FILE, "utf8");
        const parsed = JSON.parse(data);
        return {
            apiKey:
                typeof parsed.apiKey === "string" ? parsed.apiKey : "",
            chromiumExtensionPath:
                typeof parsed.chromiumExtensionPath === "string"
                    ? parsed.chromiumExtensionPath
                    : "",
            useChromeChannel: Boolean(parsed.useChromeChannel),
        };
    } catch (error) {
        console.error("Error loading CapSolver settings:", error);
        return {
            apiKey: "",
            chromiumExtensionPath: "",
            useChromeChannel: false,
        };
    }
}

module.exports = { loadCapsolverSettingsData };
