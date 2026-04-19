const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const { ICON_PATH, ensureDataDirectory } = require("./data/paths.js");

// Shared mutable state passed to IPC handlers that need the main window or the
// BrowserAutomation singleton. Both fields are populated lazily.
const ctx = {
    mainWindow: null,
    browserAutomation: null,
};

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

    ctx.mainWindow = new BrowserWindow(winOpts);

    ctx.mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

    ctx.mainWindow.once("ready-to-show", () => {
        ctx.mainWindow.show();
    });

    if (process.argv.includes("--dev")) {
        ctx.mainWindow.webContents.openDevTools();
    }

    ctx.mainWindow.on("closed", () => {
        ctx.mainWindow = null;
    });
}

app.whenReady().then(() => {
    ensureDataDirectory();
    const { registerAllIpc } = require("./ipc/register.js");
    registerAllIpc(ipcMain, ctx);
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
    if (ctx.browserAutomation) {
        await ctx.browserAutomation.stop();
    }
});
