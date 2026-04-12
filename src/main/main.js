const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { BrowserAutomation } = require("./browser-automation.js");

// Global variables
let mainWindow;
let browserAutomation;

// Data paths
const DATA_PATH = path.join(__dirname, "../../data");
const ACCOUNTS_FILE = path.join(DATA_PATH, "accounts.json");
const PROXIES_FILE = path.join(DATA_PATH, "proxies.json");

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

// Ensure data directory exists
function ensureDataDirectory() {
    if (!fs.existsSync(DATA_PATH)) {
        fs.mkdirSync(DATA_PATH, { recursive: true });
    }

    // Initialize files if they don't exist
    if (!fs.existsSync(ACCOUNTS_FILE)) {
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(PROXIES_FILE)) {
        fs.writeFileSync(PROXIES_FILE, JSON.stringify([], null, 2));
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js"),
        },
        icon: path.join(__dirname, "../../assets/icon.png"),
        show: false,
        titleBarStyle: "default",
    });

    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
    });

    // Dev tools in development
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

ipcMain.handle("save-proxies", async (event, proxies) => {
    try {
        fs.writeFileSync(PROXIES_FILE, JSON.stringify(proxies, null, 2));
        return { success: true };
    } catch (error) {
        console.error("Error saving proxies:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("start-automation", async (event, config) => {
    try {
        if (!browserAutomation) {
            browserAutomation = new BrowserAutomation();
        }

        const accounts = await loadAccountsData();
        const proxies = await loadProxiesData();

        if (proxies.length < accounts.length) {
            throw new Error("Not enough proxy IPs available!");
        }

        await browserAutomation.start(accounts, proxies, config);
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
