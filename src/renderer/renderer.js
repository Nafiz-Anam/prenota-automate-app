import { AutoTrafficApp } from "./app/core.js";
import { ModalMethods } from "./app/modal.js";
import { AccountsUiMethods } from "./app/accounts-ui.js";
import { ProxiesUiMethods } from "./app/proxies-ui.js";
import { ServicesUiMethods } from "./app/services-ui.js";
import { CapsolverUiMethods } from "./app/capsolver-ui.js";
import { AutomationUiMethods } from "./app/automation-ui.js";

// Compose feature modules onto the single app class.
Object.assign(
    AutoTrafficApp.prototype,
    ModalMethods,
    AccountsUiMethods,
    ProxiesUiMethods,
    ServicesUiMethods,
    CapsolverUiMethods,
    AutomationUiMethods,
);

// Initialize the app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
    window.app = new AutoTrafficApp();
});

// Clean up on window unload
window.addEventListener("beforeunload", () => {
    if (window.app) {
        window.app.destroy();
    }
});
