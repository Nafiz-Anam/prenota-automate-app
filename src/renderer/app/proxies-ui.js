/**
 * Proxy CRUD UI — table render + add/edit/delete modal flows.
 * Persistence uses the shared `this.saveData()`.
 */
export const ProxiesUiMethods = {
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
    },

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
                <div class="password-wrapper">
                    <input type="password" id="proxyPass" class="form-control" placeholder="Proxy password">
                    <button type="button" class="password-toggle" data-target="proxyPass">Show</button>
                </div>
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
        this.wirePasswordToggle();
    },

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
    },

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
                <div class="password-wrapper">
                    <input type="password" id="proxyPass" class="form-control" value="${proxy.pass}">
                    <button type="button" class="password-toggle" data-target="proxyPass">Show</button>
                </div>
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
        this.wirePasswordToggle();
    },

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
    },

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
    },
};
