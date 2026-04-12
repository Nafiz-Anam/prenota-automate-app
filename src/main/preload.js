const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
    // File operations
    loadAccounts: () => ipcRenderer.invoke("load-accounts"),
    saveAccounts: (accounts) => ipcRenderer.invoke("save-accounts", accounts),
    loadProxies: () => ipcRenderer.invoke("load-proxies"),
    saveProxies: (proxies) => ipcRenderer.invoke("save-proxies", proxies),

    // Automation control
    startAutomation: (config) => ipcRenderer.invoke("start-automation", config),
    stopAutomation: () => ipcRenderer.invoke("stop-automation"),
    getAutomationStatus: () => ipcRenderer.invoke("get-automation-status"),

    // Events
    onAutomationUpdate: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on("automation-update", subscription);
        return () =>
            ipcRenderer.removeListener("automation-update", subscription);
    },
});
