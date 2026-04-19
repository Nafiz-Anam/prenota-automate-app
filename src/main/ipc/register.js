const accounts = require("./accounts.js");
const proxies = require("./proxies.js");
const services = require("./services.js");
const capsolver = require("./capsolver.js");
const automation = require("./automation.js");

/**
 * Single entry point for wiring all IPC handlers. Split into feature modules
 * (accounts/proxies/services/capsolver/automation) for readability.
 */
function registerAllIpc(ipcMain, ctx) {
    accounts.register(ipcMain);
    proxies.register(ipcMain);
    services.register(ipcMain);
    capsolver.register(ipcMain);
    automation.register(ipcMain, ctx);
}

module.exports = { registerAllIpc };
