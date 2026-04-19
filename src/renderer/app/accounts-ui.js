/**
 * Account CRUD UI — table render + add/edit/delete modal flows.
 * Persistence uses the shared `this.saveData()` (accounts + proxies written together).
 */
export const AccountsUiMethods = {
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
    },

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
    },

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
    },

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
    },

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
    },

    async deleteAccount(index) {
        if (confirm("Are you sure you want to delete this account?")) {
            this.accounts.splice(index, 1);
            await this.saveData();
            this.updateUI();
            this.showNotification("Account deleted successfully", "success");
        }
    },
};
