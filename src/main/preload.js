const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    loadAccounts: () => ipcRenderer.invoke("load-accounts"),
    saveAccounts: (accounts) => ipcRenderer.invoke("save-accounts", accounts),
    loadProxies: () => ipcRenderer.invoke("load-proxies"),
    saveProxies: (proxies) => ipcRenderer.invoke("save-proxies", proxies),

    loadCapsolverSettings: () =>
        ipcRenderer.invoke("load-capsolver-settings"),
    saveCapsolverSettings: (settings) =>
        ipcRenderer.invoke("save-capsolver-settings", settings),

    startAutomation: (config) => ipcRenderer.invoke("start-automation", config),
    stopAutomation: () => ipcRenderer.invoke("stop-automation"),
    getAutomationStatus: () => ipcRenderer.invoke("get-automation-status"),
});
