/**
 * AutoTrafficApp — the renderer's single UI class. Method implementations are
 * split across sibling modules (./accounts-ui.js, ./proxies-ui.js, etc.) and
 * attached to the prototype from `renderer.js` before the class is instantiated.
 *
 * Everything in this file is foundation: state fields, lifecycle, navigation,
 * shared saveData(), and UI refreshers that fan out to the feature modules.
 */
export class AutoTrafficApp {
    constructor() {
        this.currentPage = "dashboard";
        this.accounts = [];
        this.proxies = [];
        this.services = [];
        this.capsolverSettings = {
            apiKey: "",
            chromiumExtensionPath: "",
            useChromeChannel: false,
        };
        this.isRunning = false;
        this.statusUpdateInterval = null;
        this.clockInterval = null;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadData();
        this.updateUI();
        this.startStatusMonitoring();
        this.startClock();
        if (window.electronAPI.onAutomationLog) {
            window.electronAPI.onAutomationLog((data) => {
                console.log(`[WIN:${data.account}] ${data.message}`);
            });
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll(".nav-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const page = e.currentTarget.dataset.page;
                this.navigateToPage(page);
            });
        });

        // Timer options
        document.querySelectorAll('input[name="timer"]').forEach((radio) => {
            radio.addEventListener("change", (e) => {
                const timeInputs = document.getElementById("timeInputs");
                timeInputs.style.display =
                    e.target.value === "scheduled" ? "block" : "none";
            });
        });

        // Control buttons
        document
            .getElementById("startBtn")
            .addEventListener("click", () => this.startAutomation());
        document
            .getElementById("stopBtn")
            .addEventListener("click", () => this.stopAutomation());

        // Account management
        document
            .getElementById("addAccountBtn")
            .addEventListener("click", () => this.showAddAccountModal());

        // Proxy management
        document
            .getElementById("addProxyBtn")
            .addEventListener("click", () => this.showAddProxyModal());

        // Service management
        document
            .getElementById("addServiceBtn")
            .addEventListener("click", () => this.showAddServiceModal());

        document
            .getElementById("saveCapsolverBtn")
            .addEventListener("click", () => this.saveCapsolverSettingsFromUI());
        document
            .getElementById("clearCapsolverBtn")
            .addEventListener("click", () => this.clearCapsolverSettingsFromUI());
    }

    async loadData() {
        try {
            this.accounts = await window.electronAPI.loadAccounts();
            this.proxies = await window.electronAPI.loadProxies();
            this.services =
                (await window.electronAPI.loadServices?.()) || [];
            this.capsolverSettings =
                (await window.electronAPI.loadCapsolverSettings()) || {
                    apiKey: "",
                    chromiumExtensionPath: "",
                    useChromeChannel: false,
                };
            this.refreshCapsolverForm();
        } catch (error) {
            console.error("Error loading data:", error);
            this.showNotification("Error loading data", "error");
        }
    }

    async saveData() {
        try {
            if (typeof console !== "undefined" && console.debug) {
                console.debug(
                    "Saving accounts count:",
                    this.accounts?.length ?? 0,
                    "proxies count:",
                    this.proxies?.length ?? 0,
                );
            }
            const accountsResult = await window.electronAPI.saveAccounts(
                this.accounts,
            );
            const proxiesResult = await window.electronAPI.saveProxies(
                this.proxies,
            );
            if (typeof console !== "undefined" && console.debug) {
                console.debug("Save accounts result:", accountsResult);
                console.debug("Save proxies result:", proxiesResult);
            }
            if (!accountsResult.success || !proxiesResult.success) {
                throw new Error("Save operation failed");
            }
        } catch (error) {
            console.error("Error saving data:", error);
            this.showNotification(
                "Error saving data: " + error.message,
                "error",
            );
            throw error;
        }
    }

    navigateToPage(page) {
        // Update navigation
        document.querySelectorAll(".nav-btn").forEach((btn) => {
            btn.classList.remove("active");
        });
        document.querySelector(`[data-page="${page}"]`).classList.add("active");

        // Update pages
        document.querySelectorAll(".page").forEach((p) => {
            p.classList.remove("active");
        });
        document.getElementById(`${page}-page`).classList.add("active");

        this.currentPage = page;
        if (page === "capsolver") {
            this.refreshCapsolverForm();
        }
    }

    updateUI() {
        this.updateStats();
        this.updateAccountsTable();
        this.updateProxiesTable();
        this.updateServicesTable();
        this.refreshServiceSelect();
    }

    updateStats() {
        document.getElementById("accountCount").textContent =
            this.accounts.length;
        document.getElementById("proxyCount").textContent = this.proxies.length;
    }

    maskPassword(password) {
        if (password == null || password === "") {
            return "";
        }
        return "***";
    }

    destroy() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
        }
    }
}
