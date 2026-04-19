const path = require("node:path");
const fs = require("node:fs");

/** Writable JSON store in production (app.asar is read-only). */
function getDataPath() {
    const { app } = require("electron");
    if (app && app.isPackaged) {
        return path.join(app.getPath("userData"), "data");
    }
    return path.join(__dirname, "../../../data");
}

// Defer path resolution until app is ready (app.isPackaged unavailable at require-time).
let _dataPath = null;
function getResolvedDataPath() {
    if (!_dataPath) _dataPath = getDataPath();
    return _dataPath;
}

// Lazy getters so nothing touches app.isPackaged until first access.
const pathGetters = {
    get DATA_PATH() { return getResolvedDataPath(); },
    get ACCOUNTS_FILE() { return path.join(getResolvedDataPath(), "accounts.json"); },
    get PROXIES_FILE() { return path.join(getResolvedDataPath(), "proxies.json"); },
    get SERVICES_FILE() { return path.join(getResolvedDataPath(), "services.json"); },
    get CAPSOLVER_SETTINGS_FILE() { return path.join(getResolvedDataPath(), "capsolver-settings.json"); },
};

const ICON_PATH = path.join(__dirname, "../../../assets/applogo.png");

function ensureDataDirectory() {
    const DATA_PATH = getResolvedDataPath();
    const ACCOUNTS_FILE = pathGetters.ACCOUNTS_FILE;
    const PROXIES_FILE = pathGetters.PROXIES_FILE;
    const CAPSOLVER_SETTINGS_FILE = pathGetters.CAPSOLVER_SETTINGS_FILE;

    if (!fs.existsSync(DATA_PATH)) {
        fs.mkdirSync(DATA_PATH, { recursive: true });
    }

    if (!fs.existsSync(ACCOUNTS_FILE)) {
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(PROXIES_FILE)) {
        fs.writeFileSync(PROXIES_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(CAPSOLVER_SETTINGS_FILE)) {
        fs.writeFileSync(
            CAPSOLVER_SETTINGS_FILE,
            JSON.stringify(
                {
                    apiKey: "",
                    chromiumExtensionPath: "",
                    useChromeChannel: false,
                },
                null,
                2,
            ),
        );
    }
}

module.exports = {
    get DATA_PATH() { return pathGetters.DATA_PATH; },
    get ACCOUNTS_FILE() { return pathGetters.ACCOUNTS_FILE; },
    get PROXIES_FILE() { return pathGetters.PROXIES_FILE; },
    get SERVICES_FILE() { return pathGetters.SERVICES_FILE; },
    get CAPSOLVER_SETTINGS_FILE() { return pathGetters.CAPSOLVER_SETTINGS_FILE; },
    ICON_PATH,
    ensureDataDirectory,
};
