class AutoTrafficApp {
    constructor() {
        this.currentPage = "dashboard";
        this.accounts = [];
        this.proxies = [];
        this.capsolverSettings = {
            apiKey: "",
            chromiumExtensionPath: "",
            useChromeChannel: false,
        };
        this.isRunning = false;
        this.statusUpdateInterval = null;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadData();
        this.updateUI();
        this.startStatusMonitoring();
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

    refreshCapsolverForm() {
        const input = document.getElementById("storedCapsolverApiKey");
        const extInput = document.getElementById("chromiumExtensionPath");
        const chromeChk = document.getElementById("useChromeChannel");
        const status = document.getElementById("capsolverKeyStatus");
        if (input) {
            input.value = this.capsolverSettings?.apiKey ?? "";
        }
        if (extInput) {
            extInput.value = this.capsolverSettings?.chromiumExtensionPath ?? "";
        }
        if (chromeChk) {
            chromeChk.checked = Boolean(
                this.capsolverSettings?.useChromeChannel,
            );
        }
        if (status) {
            const has = Boolean(
                (this.capsolverSettings?.apiKey || "").trim(),
            );
            const hasExt = Boolean(
                (this.capsolverSettings?.chromiumExtensionPath || "").trim(),
            );
            const useChrome = Boolean(
                this.capsolverSettings?.useChromeChannel,
            );
            const parts = [];
            if (has) parts.push("API key saved");
            if (hasExt) parts.push("extension path saved");
            if (useChrome) parts.push("using Google Chrome for automation");
            status.textContent =
                parts.length > 0
                    ? `Saved: ${parts.join("; ")}.`
                    : "No API key or extension path saved yet.";
        }
    }

    async saveCapsolverSettingsFromUI() {
        const input = document.getElementById("storedCapsolverApiKey");
        const extInput = document.getElementById("chromiumExtensionPath");
        const chromeChk = document.getElementById("useChromeChannel");
        const apiKey = (input?.value ?? "").trim();
        const chromiumExtensionPath = (extInput?.value ?? "").trim();
        const useChromeChannel = Boolean(chromeChk?.checked);
        this.capsolverSettings = {
            apiKey,
            chromiumExtensionPath,
            useChromeChannel,
        };
        try {
            const result = await window.electronAPI.saveCapsolverSettings(
                this.capsolverSettings,
            );
            if (!result.success) {
                throw new Error(result.error || "Save failed");
            }
            this.refreshCapsolverForm();
            this.showNotification("CapSolver settings saved", "success");
        } catch (error) {
            console.error("Save CapSolver settings:", error);
            this.showNotification(
                "Could not save API key: " + error.message,
                "error",
            );
        }
    }

    async clearCapsolverSettingsFromUI() {
        if (
            !confirm(
                "Remove the saved CapSolver API key from this computer?",
            )
        ) {
            return;
        }
        this.capsolverSettings = {
            apiKey: "",
            chromiumExtensionPath: "",
            useChromeChannel: false,
        };
        const input = document.getElementById("storedCapsolverApiKey");
        const extInput = document.getElementById("chromiumExtensionPath");
        const chromeChk = document.getElementById("useChromeChannel");
        if (input) input.value = "";
        if (extInput) extInput.value = "";
        if (chromeChk) chromeChk.checked = false;
        try {
            const result = await window.electronAPI.saveCapsolverSettings(
                this.capsolverSettings,
            );
            if (!result.success) {
                throw new Error(result.error || "Save failed");
            }
            this.refreshCapsolverForm();
            this.showNotification("CapSolver API key cleared", "success");
        } catch (error) {
            console.error("Clear CapSolver settings:", error);
            this.showNotification(
                "Could not clear API key: " + error.message,
                "error",
            );
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
    }

    updateStats() {
        document.getElementById("accountCount").textContent =
            this.accounts.length;
        document.getElementById("proxyCount").textContent = this.proxies.length;
    }

    updateAccountsTable() {
        const tbody = document.getElementById("accountsTableBody");
        tbody.replaceChildren();

        this.accounts.forEach((account, index) => {
            const row = document.createElement("tr");

            const tdNum = document.createElement("td");
            tdNum.textContent = String(index + 1);
            row.appendChild(tdNum);

            const tdUser = document.createElement("td");
            tdUser.textContent = account.username ?? "";
            row.appendChild(tdUser);

            const tdPass = document.createElement("td");
            tdPass.textContent = this.maskPassword(account.password);
            row.appendChild(tdPass);

            const tdActions = document.createElement("td");
            const actions = document.createElement("div");
            actions.className = "table-actions";
            const btnEdit = document.createElement("button");
            btnEdit.className = "btn btn-sm btn-primary";
            btnEdit.textContent = "Edit";
            btnEdit.addEventListener("click", () => this.editAccount(index));
            const btnDel = document.createElement("button");
            btnDel.className = "btn btn-sm btn-danger";
            btnDel.textContent = "Delete";
            btnDel.addEventListener("click", () => this.deleteAccount(index));
            actions.append(btnEdit, btnDel);
            tdActions.appendChild(actions);
            row.appendChild(tdActions);

            tbody.appendChild(row);
        });
    }

    updateProxiesTable() {
        const tbody = document.getElementById("proxiesTableBody");
        tbody.replaceChildren();

        this.proxies.forEach((proxy, index) => {
            const row = document.createElement("tr");

            const tdNum = document.createElement("td");
            tdNum.textContent = String(index + 1);
            row.appendChild(tdNum);

            const tdHost = document.createElement("td");
            tdHost.textContent = proxy.host ?? "";
            row.appendChild(tdHost);

            const tdPort = document.createElement("td");
            const range = Math.max(parseInt(proxy.portRange, 10) || 1, 1);
            const basePort = proxy.port != null ? String(proxy.port) : "";
            tdPort.textContent =
                range > 1 && basePort
                    ? `${basePort} (×${range})`
                    : basePort;
            row.appendChild(tdPort);

            const tdUser = document.createElement("td");
            tdUser.textContent = proxy.user ?? "";
            row.appendChild(tdUser);

            const tdPass = document.createElement("td");
            tdPass.textContent = this.maskPassword(proxy.pass);
            row.appendChild(tdPass);

            const tdActions = document.createElement("td");
            const actions = document.createElement("div");
            actions.className = "table-actions";
            const btnEdit = document.createElement("button");
            btnEdit.className = "btn btn-sm btn-primary";
            btnEdit.textContent = "Edit";
            btnEdit.addEventListener("click", () => this.editProxy(index));
            const btnDel = document.createElement("button");
            btnDel.className = "btn btn-sm btn-danger";
            btnDel.textContent = "Delete";
            btnDel.addEventListener("click", () => this.deleteProxy(index));
            actions.append(btnEdit, btnDel);
            tdActions.appendChild(actions);
            row.appendChild(tdActions);

            tbody.appendChild(row);
        });
    }

    maskPassword(password) {
        if (password == null || password === "") {
            return "";
        }
        return "***";
    }

    showAddAccountModal() {
        this.showModal(
            "Add Account",
            `
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="accountEmail" class="form-control" placeholder="Enter email">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="accountPassword" class="form-control" placeholder="Enter password">
            </div>
        `,
            [
                { text: "Cancel", class: "btn-secondary", action: "close" },
                {
                    text: "Add Account",
                    class: "btn-primary",
                    action: () => this.addAccount(),
                },
            ],
        );
    }

    async addAccount() {
        const email = document.getElementById("accountEmail").value.trim();
        const password = document.getElementById("accountPassword").value;

        if (!email || !password) {
            this.showNotification("Please fill all fields", "error");
            return;
        }

        if (this.accounts.some((acc) => acc.username === email)) {
            this.showNotification("Account already exists", "error");
            return;
        }

        this.accounts.push({ username: email, password });
        await this.saveData();
        this.updateUI();
        this.closeModal();
        this.showNotification("Account added successfully", "success");
    }

    async editAccount(index) {
        const account = this.accounts[index];

        this.showModal(
            "Edit Account",
            `
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="accountEmail" class="form-control" value="${account.username}">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="accountPassword" class="form-control" value="${account.password}">
            </div>
        `,
            [
                { text: "Cancel", class: "btn-secondary", action: "close" },
                {
                    text: "Update Account",
                    class: "btn-primary",
                    action: () => this.updateAccount(index),
                },
            ],
        );
    }

    async updateAccount(index) {
        const email = document.getElementById("accountEmail").value.trim();
        const password = document.getElementById("accountPassword").value;

        if (!email || !password) {
            this.showNotification("Please fill all fields", "error");
            return;
        }

        this.accounts[index] = { username: email, password };
        await this.saveData();
        this.updateUI();
        this.closeModal();
        this.showNotification("Account updated successfully", "success");
    }

    async deleteAccount(index) {
        if (confirm("Are you sure you want to delete this account?")) {
            this.accounts.splice(index, 1);
            await this.saveData();
            this.updateUI();
            this.showNotification("Account deleted successfully", "success");
        }
    }

    showAddProxyModal() {
        this.showModal(
            "Add Proxy",
            `
            <div class="form-group">
                <label>Host</label>
                <input type="text" id="proxyHost" class="form-control" placeholder="e.g., proxy.example.com">
            </div>
            <div class="form-group">
                <label>Port (base)</label>
                <input type="text" id="proxyPort" class="form-control" placeholder="e.g., 8080">
            </div>
            <div class="form-group">
                <label>Port Range (1 = single proxy; N = ports base..base+N-1)</label>
                <input type="number" id="proxyPortRange" class="form-control" value="1" min="1" max="1000">
            </div>
            <div class="form-group">
                <label>Username</label>
                <input type="text" id="proxyUser" class="form-control" placeholder="Proxy username">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="proxyPass" class="form-control" placeholder="Proxy password">
            </div>
        `,
            [
                { text: "Cancel", class: "btn-secondary", action: "close" },
                {
                    text: "Add Proxy",
                    class: "btn-primary",
                    action: () => this.addProxy(),
                },
            ],
        );
    }

    async addProxy() {
        const host = document.getElementById("proxyHost").value.trim();
        const port = document.getElementById("proxyPort").value.trim();
        const user = document.getElementById("proxyUser").value.trim();
        const pass = document.getElementById("proxyPass").value;
        const portRange = Math.max(
            parseInt(document.getElementById("proxyPortRange").value, 10) || 1,
            1,
        );

        if (!host || !port || !user || !pass) {
            this.showNotification("Please fill all fields", "error");
            return;
        }

        this.proxies.push({ host, port, user, pass, portRange, type: "regular" });
        await this.saveData();
        this.updateUI();
        this.closeModal();
        this.showNotification("Proxy added successfully", "success");
    }

    async editProxy(index) {
        const proxy = this.proxies[index];

        this.showModal(
            "Edit Proxy",
            `
            <div class="form-group">
                <label>Host</label>
                <input type="text" id="proxyHost" class="form-control" value="${proxy.host}">
            </div>
            <div class="form-group">
                <label>Port (base)</label>
                <input type="text" id="proxyPort" class="form-control" value="${proxy.port}">
            </div>
            <div class="form-group">
                <label>Port Range (1 = single proxy; N = ports base..base+N-1)</label>
                <input type="number" id="proxyPortRange" class="form-control" value="${proxy.portRange || 1}" min="1" max="1000">
            </div>
            <div class="form-group">
                <label>Username</label>
                <input type="text" id="proxyUser" class="form-control" value="${proxy.user}">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="proxyPass" class="form-control" value="${proxy.pass}">
            </div>
        `,
            [
                { text: "Cancel", class: "btn-secondary", action: "close" },
                {
                    text: "Update Proxy",
                    class: "btn-primary",
                    action: () => this.updateProxy(index),
                },
            ],
        );
    }

    async updateProxy(index) {
        const host = document.getElementById("proxyHost").value.trim();
        const port = document.getElementById("proxyPort").value.trim();
        const user = document.getElementById("proxyUser").value.trim();
        const pass = document.getElementById("proxyPass").value;
        const portRange = Math.max(
            parseInt(document.getElementById("proxyPortRange").value, 10) || 1,
            1,
        );

        if (!host || !port || !user || !pass) {
            this.showNotification("Please fill all fields", "error");
            return;
        }

        this.proxies[index] = { host, port, user, pass, portRange, type: "regular" };

        try {
            await this.saveData();
            this.updateUI();
            this.closeModal();
            this.showNotification("Proxy updated successfully", "success");
        } catch (error) {
            console.error("Failed to update proxy:", error);
            this.showNotification(
                "Failed to update proxy: " + error.message,
                "error",
            );
        }
    }

    async deleteProxy(index) {
        if (confirm("Are you sure you want to delete this proxy?")) {
            this.proxies.splice(index, 1);
            try {
                await this.saveData();
                this.updateUI();
                this.showNotification("Proxy deleted successfully", "success");
            } catch (error) {
                console.error("Failed to delete proxy:", error);
                this.showNotification(
                    "Failed to delete proxy: " + error.message,
                    "error",
                );
            }
        }
    }

    async startAutomation() {
        if (this.isRunning) {
            this.showNotification("Automation is already running", "warning");
            return;
        }

        if (this.accounts.length === 0) {
            this.showNotification("Please add at least one account", "error");
            return;
        }

        if (this.proxies.length === 0) {
            this.showNotification("Please add at least one proxy", "error");
            return;
        }

        const windowCount =
            parseInt(document.getElementById("windowCount").value) || 1;

        if (windowCount < 1 || windowCount > 20) {
            this.showNotification(
                "Window count must be between 1 and 20",
                "error",
            );
            return;
        }

        if (windowCount > this.accounts.length) {
            this.showNotification(
                `Not enough accounts for ${windowCount} windows (available: ${this.accounts.length})`,
                "error",
            );
            return;
        }

        const expandedProxyCount = this.proxies.reduce(
            (sum, p) =>
                sum + Math.max(parseInt(p.portRange, 10) || 1, 1),
            0,
        );
        if (windowCount > expandedProxyCount) {
            this.showNotification(
                `Not enough proxies for ${windowCount} windows (available: ${expandedProxyCount})`,
                "error",
            );
            return;
        }

        const config = this.getAutomationConfig();

        try {
            const result = await window.electronAPI.startAutomation(config);

            if (result && result.success) {
                this.isRunning = true;
                this.updateControlButtons();
                this.updateStatus("running", "Automation Running");
                this.showNotification(
                    "Automation started successfully",
                    "success",
                );
            } else if (result && !result.success) {
                this.showNotification(
                    result.error || "Failed to start automation",
                    "error",
                );
            } else {
                // result is undefined but automation may still be running
                console.log(
                    "Start automation returned undefined, checking status...",
                );
                this.isRunning = true;
                this.updateControlButtons();
                this.updateStatus("running", "Automation Running");
            }
        } catch (error) {
            console.error("Start automation error:", error.message);
            console.error("Stack:", error.stack);
            this.showNotification(
                "Failed to start automation: " + error.message,
                "error",
            );
        }
    }

    async stopAutomation() {
        if (!this.isRunning) {
            return;
        }

        try {
            const result = await window.electronAPI.stopAutomation();

            if (result.success) {
                this.isRunning = false;
                this.updateControlButtons();
                this.updateStatus("ready", "Ready");
                this.showNotification(
                    "Automation stopped successfully",
                    "success",
                );
            } else {
                this.showNotification(
                    result.error || "Failed to stop automation",
                    "error",
                );
            }
        } catch (error) {
            console.error("Stop automation error:", error);
            this.showNotification("Failed to stop automation", "error");
        }
    }

    getAutomationConfig() {
        const service = document.getElementById("serviceSelect").value;
        const timerMode = document.querySelector(
            'input[name="timer"]:checked',
        ).value;
        const windowCount =
            parseInt(document.getElementById("windowCount").value) || 1;

        const chromiumExtensionPath = (
            this.capsolverSettings?.chromiumExtensionPath || ""
        ).trim();
        const useChromeChannel = Boolean(
            this.capsolverSettings?.useChromeChannel,
        );

        const config = {
            service,
            timerMode,
            windowCount,
            chromiumExtensionPath,
            useChromeChannel,
        };

        console.log("Automation config:", {
            ...config,
            chromiumExtensionPath: chromiumExtensionPath ? "[SET]" : "",
            useChromeChannel,
        });

        return config;
    }

    updateControlButtons() {
        const startBtn = document.getElementById("startBtn");
        const stopBtn = document.getElementById("stopBtn");

        if (startBtn) startBtn.disabled = this.isRunning;
        if (stopBtn) stopBtn.disabled = !this.isRunning;
    }

    updateStatus(status, text) {
        const indicator = document.getElementById("statusIndicator");
        const dot = indicator.querySelector(".status-dot");
        const textElement = indicator.querySelector(".status-text");

        dot.className = `status-dot ${status}`;
        textElement.textContent = text;
    }

    startStatusMonitoring() {
        this.statusUpdateInterval = setInterval(async () => {
            try {
                const status = await window.electronAPI.getAutomationStatus();
                document.getElementById("activeBrowsers").textContent =
                    status.count || 0;

                if (status.running && !this.isRunning) {
                    this.isRunning = true;
                    this.updateControlButtons();
                    this.updateStatus("running", "Automation Running");
                } else if (!status.running && this.isRunning) {
                    this.isRunning = false;
                    this.updateControlButtons();
                    this.updateStatus("ready", "Ready");
                }
            } catch (error) {
                console.error("Status update error:", error);
            }
        }, 2000);
    }

    showModal(title, content, buttons) {
        const modalContainer = document.getElementById("modalContainer");
        modalContainer.innerHTML = `
            <div class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                        <button type="button" class="modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    <div class="modal-footer"></div>
                </div>
            </div>
        `;

        modalContainer
            .querySelector(".modal-close")
            .addEventListener("click", () => this.closeModal());

        const footer = modalContainer.querySelector(".modal-footer");
        for (const btn of buttons) {
            const el = document.createElement("button");
            el.type = "button";
            el.className = `btn ${btn.class}`;
            el.textContent = btn.text;
            if (btn.action === "close") {
                el.addEventListener("click", () => this.closeModal());
            } else if (typeof btn.action === "function") {
                el.addEventListener("click", async () => {
                    try {
                        await btn.action();
                    } catch (error) {
                        console.error("Modal action failed:", error);
                        this.showNotification(
                            error?.message || "Something went wrong",
                            "error",
                        );
                    }
                });
            }
            footer.appendChild(el);
        }
    }

    closeModal() {
        document.getElementById("modalContainer").innerHTML = "";
    }

    showNotification(message, type = "info") {
        // Create notification element
        const notification = document.createElement("div");
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        // Style the notification
        Object.assign(notification.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            padding: "12px 20px",
            borderRadius: "8px",
            color: "white",
            fontWeight: "500",
            zIndex: "1001",
            opacity: "0",
            transform: "translateY(-10px)",
            transition: "all 0.3s ease",
        });

        // Set background color based on type
        const colors = {
            success: "#16a34a",
            error: "#dc2626",
            warning: "#f59e0b",
            info: "#2563eb",
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.opacity = "1";
            notification.style.transform = "translateY(0)";
        }, 10);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = "0";
            notification.style.transform = "translateY(-10px)";
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    destroy() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }
    }
}

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
