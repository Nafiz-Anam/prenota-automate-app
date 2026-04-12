class PrenotafacileApp {
    constructor() {
        this.currentPage = "dashboard";
        this.accounts = [];
        this.proxies = [];
        this.isRunning = false;
        this.statusUpdateInterval = null;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadData();
        this.updateUI();
        this.startStatusMonitoring();
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
    }

    async loadData() {
        try {
            this.accounts = await window.electronAPI.loadAccounts();
            this.proxies = await window.electronAPI.loadProxies();
        } catch (error) {
            console.error("Error loading data:", error);
            this.showNotification("Error loading data", "error");
        }
    }

    async saveData() {
        try {
            await window.electronAPI.saveAccounts(this.accounts);
            await window.electronAPI.saveProxies(this.proxies);
        } catch (error) {
            console.error("Error saving data:", error);
            this.showNotification("Error saving data", "error");
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
        tbody.innerHTML = "";

        this.accounts.forEach((account, index) => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${account.username}</td>
                <td>${this.maskPassword(account.password)}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-primary" onclick="app.editAccount(${index})">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="app.deleteAccount(${index})">Delete</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    updateProxiesTable() {
        const tbody = document.getElementById("proxiesTableBody");
        tbody.innerHTML = "";

        this.proxies.forEach((proxy, index) => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${proxy.host}</td>
                <td>${proxy.port}</td>
                <td>${proxy.user}</td>
                <td>${this.maskPassword(proxy.pass)}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-primary" onclick="app.editProxy(${index})">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="app.deleteProxy(${index})">Delete</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    maskPassword(password) {
        return "***".repeat(password.length);
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
                <label>Port</label>
                <input type="text" id="proxyPort" class="form-control" placeholder="e.g., 8080">
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

        if (!host || !port || !user || !pass) {
            this.showNotification("Please fill all fields", "error");
            return;
        }

        this.proxies.push({ host, port, user, pass });
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
                <label>Port</label>
                <input type="text" id="proxyPort" class="form-control" value="${proxy.port}">
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

        if (!host || !port || !user || !pass) {
            this.showNotification("Please fill all fields", "error");
            return;
        }

        this.proxies[index] = { host, port, user, pass };
        await this.saveData();
        this.updateUI();
        this.closeModal();
        this.showNotification("Proxy updated successfully", "success");
    }

    async deleteProxy(index) {
        if (confirm("Are you sure you want to delete this proxy?")) {
            this.proxies.splice(index, 1);
            await this.saveData();
            this.updateUI();
            this.showNotification("Proxy deleted successfully", "success");
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

        if (windowCount > this.proxies.length) {
            this.showNotification(
                `Not enough proxies for ${windowCount} windows (available: ${this.proxies.length})`,
                "error",
            );
            return;
        }

        const config = this.getAutomationConfig();

        try {
            const result = await window.electronAPI.startAutomation(config);

            if (result.success) {
                this.isRunning = true;
                this.updateControlButtons();
                this.updateStatus("running", "Automation Running");
                this.showNotification(
                    "Automation started successfully",
                    "success",
                );
            } else {
                this.showNotification(
                    result.error || "Failed to start automation",
                    "error",
                );
            }
        } catch (error) {
            console.error("Start automation error:", error);
            this.showNotification("Failed to start automation", "error");
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
        const captchaMethod = document.querySelector(
            'input[name="captcha"]:checked',
        ).value;
        const windowCount =
            parseInt(document.getElementById("windowCount").value) || 1;

        const config = {
            service,
            timerMode,
            captchaMethod,
            windowCount: Math.min(Math.max(windowCount, 1), 20),
        };

        if (timerMode === "scheduled") {
            const hour =
                parseInt(document.getElementById("hourInput").value) || 0;
            const minute =
                parseInt(document.getElementById("minuteInput").value) || 0;
            const second =
                parseInt(document.getElementById("secondInput").value) || 0;

            config.scheduleTime = { hour, minute, second };
        }

        return config;
    }

    updateControlButtons() {
        const startBtn = document.getElementById("startBtn");
        const stopBtn = document.getElementById("stopBtn");

        startBtn.disabled = this.isRunning;
        stopBtn.disabled = !this.isRunning;
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
                        <button class="modal-close" onclick="app.closeModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    <div class="modal-footer">
                        ${buttons
                            .map(
                                (btn) =>
                                    `<button class="btn ${btn.class}" onclick="${typeof btn.action === "function" ? `(${btn.action.toString()})()` : btn.action}">${btn.text}</button>`,
                            )
                            .join("")}
                    </div>
                </div>
            </div>
        `;
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
    window.app = new PrenotafacileApp();
});

// Clean up on window unload
window.addEventListener("beforeunload", () => {
    if (window.app) {
        window.app.destroy();
    }
});
