const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { BrowserAutomation } = require("./browser-automation.js");

// Global variables
let mainWindow;
let browserAutomation;

/** Writable JSON store in production (app.asar is read-only). */
function getDataPath() {
    if (app.isPackaged) {
        return path.join(app.getPath("userData"), "data");
    }
    return path.join(__dirname, "../../data");
}

// Data paths
const DATA_PATH = getDataPath();
const ACCOUNTS_FILE = path.join(DATA_PATH, "accounts.json");
const PROXIES_FILE = path.join(DATA_PATH, "proxies.json");
const CAPSOLVER_SETTINGS_FILE = path.join(
    DATA_PATH,
    "capsolver-settings.json",
);

const ICON_PATH = path.join(__dirname, "../../assets/icon.png");

function redactAutomationConfigForLog(config) {
    if (!config || typeof config !== "object") return config;
    const { chromiumExtensionPath, ...rest } = config;
    return {
        ...rest,
        chromiumExtensionPath: chromiumExtensionPath ? "[set]" : undefined,
    };
}

function summarizeProxiesForLog(proxies) {
    if (!Array.isArray(proxies)) return [];
    return proxies.map((p) => ({
        host: p?.host,
        port: p?.port,
        type: p?.type,
        user: p?.user ? "[set]" : undefined,
        pass: p?.pass ? "[set]" : undefined,
    }));
}

async function loadAccountsData() {
    try {
        const data = fs.readFileSync(ACCOUNTS_FILE, "utf8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Error loading accounts:", error);
        return [];
    }
}

async function loadProxiesData() {
    try {
        const data = fs.readFileSync(PROXIES_FILE, "utf8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Error loading proxies:", error);
        return [];
    }
}

function expandProxyPool(proxies) {
    if (!Array.isArray(proxies)) return [];
    const expanded = [];
    for (const p of proxies) {
        if (!p || !p.host || p.port == null) continue;
        const basePort = parseInt(p.port, 10);
        if (!Number.isFinite(basePort) || basePort <= 0) continue;
        const range = Math.max(parseInt(p.portRange, 10) || 1, 1);
        for (let i = 0; i < range; i++) {
            expanded.push({
                host: p.host,
                port: String(basePort + i),
                user: p.user,
                pass: p.pass,
                type: p.type || "regular",
            });
        }
    }
    return expanded;
}

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

// Ensure data directory exists
function ensureDataDirectory() {
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

function createWindow() {
    const winOpts = {
        width: 900,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js"),
        },
        show: false,
        titleBarStyle: "default",
    };

    if (fs.existsSync(ICON_PATH)) {
        winOpts.icon = ICON_PATH;
    }

    mainWindow = new BrowserWindow(winOpts);

    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
    });

    if (process.argv.includes("--dev")) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

// IPC Handlers
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

ipcMain.handle("load-proxies", async () => {
    return loadProxiesData();
});

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

ipcMain.handle("start-automation", async (event, config) => {
    try {
        console.log(
            "Received start-automation request with config:",
            JSON.stringify(redactAutomationConfigForLog(config), null, 2),
        );

        if (!browserAutomation) {
            browserAutomation = new BrowserAutomation(mainWindow);
        }

        const capsolverStored = loadCapsolverSettingsData();
        const mergedConfig = {
            ...config,
            chromiumExtensionPath:
                (config?.chromiumExtensionPath &&
                    String(config.chromiumExtensionPath).trim()) ||
                capsolverStored.chromiumExtensionPath ||
                "",
            useChromeChannel:
                typeof config?.useChromeChannel === "boolean"
                    ? config.useChromeChannel
                    : Boolean(capsolverStored.useChromeChannel),
        };

        const accounts = await loadAccountsData();
        const rawProxies = await loadProxiesData();
        const proxies = expandProxyPool(rawProxies);

        const usableProxies = Array.isArray(proxies)
            ? proxies.filter((p) => p && p.type !== "web_unblocker")
            : [];
        console.log(
            `Proxy pool expanded: ${rawProxies.length} entries → ${proxies.length} proxies (port ranges applied)`,
        );
        const windowCount = Math.min(
            Math.max(Number(config?.windowCount) || 1, 1),
            20,
        );
        const parallelSessions = Math.min(
            windowCount,
            accounts.length,
        );

        console.log(
            `Loaded ${accounts.length} accounts and ${proxies.length} proxy entries (${usableProxies.length} HTTP); ` +
                `windows=${windowCount}, parallel sessions=${parallelSessions}`,
        );

        if (usableProxies.length === 0) {
            throw new Error(
                "No HTTP proxies configured. Add at least one standard proxy.",
            );
        }

        if (usableProxies.length < parallelSessions) {
            throw new Error(
                `Not enough proxies: need ${parallelSessions} for ${parallelSessions} parallel window(s), but only ${usableProxies.length} HTTP proxy/proxies are configured.`,
            );
        }

        browserAutomation.start(accounts, proxies, mergedConfig).catch((err) => {
            console.error("Background automation error:", err.message);
        });

        console.log("Automation started successfully, returning success");
        return { success: true };
    } catch (error) {
        console.error("Error starting automation:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("stop-automation", async () => {
    try {
        if (browserAutomation) {
            await browserAutomation.stop();
        }
        return { success: true };
    } catch (error) {
        console.error("Error stopping automation:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("get-automation-status", async () => {
    if (browserAutomation) {
        return browserAutomation.getStatus();
    }
    return { running: false, browsers: [] };
});

// App events
app.whenReady().then(() => {
    ensureDataDirectory();
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", async () => {
    if (browserAutomation) {
        await browserAutomation.stop();
    }
});
