/**
 * Services CRUD UI + dashboard dropdown sync.
 * Each service is `{ name, phrases: string[] }`. Persists via its own
 * `saveServices()` IPC call (not the shared saveData) and rolls back on failure.
 */
export const ServicesUiMethods = {
    async saveServices() {
        const result = await window.electronAPI.saveServices(this.services);
        if (!result || !result.success) {
            throw new Error(result?.error || "Save failed");
        }
    },

    updateServicesTable() {
        const tbody = document.getElementById("servicesTableBody");
        if (!tbody) return;
        tbody.replaceChildren();

        this.services.forEach((service, index) => {
            const row = document.createElement("tr");

            const tdNum = document.createElement("td");
            tdNum.textContent = String(index + 1);
            row.appendChild(tdNum);

            const tdName = document.createElement("td");
            tdName.textContent = service.name ?? "";
            row.appendChild(tdName);

            const tdPhrases = document.createElement("td");
            const phrases = Array.isArray(service.phrases)
                ? service.phrases
                : [];
            tdPhrases.textContent = phrases.join(" | ");
            tdPhrases.title = phrases.join("\n");
            row.appendChild(tdPhrases);

            const tdActions = document.createElement("td");
            const actions = document.createElement("div");
            actions.className = "table-actions";
            const btnEdit = document.createElement("button");
            btnEdit.className = "btn btn-sm btn-primary";
            btnEdit.textContent = "Edit";
            btnEdit.addEventListener("click", () => this.editService(index));
            const btnDel = document.createElement("button");
            btnDel.className = "btn btn-sm btn-danger";
            btnDel.textContent = "Delete";
            btnDel.addEventListener("click", () => this.deleteService(index));
            actions.append(btnEdit, btnDel);
            tdActions.appendChild(actions);
            row.appendChild(tdActions);

            tbody.appendChild(row);
        });
    },

    refreshServiceSelect() {
        const select = document.getElementById("serviceSelect");
        if (!select) return;
        const prev = select.value;
        select.replaceChildren();
        if (this.services.length === 0) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "(No services — add one in the Services tab)";
            opt.disabled = true;
            opt.selected = true;
            select.appendChild(opt);
            return;
        }
        for (const service of this.services) {
            const opt = document.createElement("option");
            opt.value = service.name;
            opt.textContent = service.name;
            select.appendChild(opt);
        }
        if (this.services.some((s) => s.name === prev)) {
            select.value = prev;
        }
    },

    showAddServiceModal() {
        this.showModal(
            "Add Service",
            `
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="serviceName" class="form-control" placeholder="e.g., Permesso elettronico">
            </div>
            <div class="form-group">
                <label>Phrases (one per line, most specific first)</label>
                <textarea id="servicePhrases" class="form-control" rows="5" placeholder="permesso di soggiorno elettronico (protezione sussidiaria&#10;permesso di soggiorno elettronico&#10;permesso elettronico"></textarea>
            </div>
        `,
            [
                { text: "Cancel", class: "btn-secondary", action: "close" },
                {
                    text: "Add Service",
                    class: "btn-primary",
                    action: () => this.addService(),
                },
            ],
        );
    },

    parseServiceForm() {
        const name = document.getElementById("serviceName").value.trim();
        const phrases = document
            .getElementById("servicePhrases")
            .value.split("\n")
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
        return { name, phrases };
    },

    async addService() {
        const { name, phrases } = this.parseServiceForm();
        if (!name) {
            this.showNotification(
                "Service name is required",
                "error",
            );
            return;
        }
        if (this.services.some((s) => s.name === name)) {
            this.showNotification(
                "A service with that name already exists",
                "error",
            );
            return;
        }
        this.services.push({ name, phrases });
        try {
            await this.saveServices();
            this.updateUI();
            this.closeModal();
            this.showNotification("Service added successfully", "success");
        } catch (error) {
            this.services.pop();
            this.showNotification(
                "Failed to save service: " + error.message,
                "error",
            );
        }
    },

    editService(index) {
        const service = this.services[index];
        if (!service) return;
        const nameEsc = String(service.name || "").replace(/"/g, "&quot;");
        const phrasesText = (service.phrases || []).join("\n");
        this.showModal(
            "Edit Service",
            `
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="serviceName" class="form-control" value="${nameEsc}">
            </div>
            <div class="form-group">
                <label>Phrases (one per line, most specific first)</label>
                <textarea id="servicePhrases" class="form-control" rows="5">${phrasesText}</textarea>
            </div>
        `,
            [
                { text: "Cancel", class: "btn-secondary", action: "close" },
                {
                    text: "Update Service",
                    class: "btn-primary",
                    action: () => this.updateService(index),
                },
            ],
        );
    },

    async updateService(index) {
        const { name, phrases } = this.parseServiceForm();
        if (!name) {
            this.showNotification(
                "Service name is required",
                "error",
            );
            return;
        }
        if (
            this.services.some((s, i) => i !== index && s.name === name)
        ) {
            this.showNotification(
                "A service with that name already exists",
                "error",
            );
            return;
        }
        const prev = this.services[index];
        this.services[index] = { name, phrases };
        try {
            await this.saveServices();
            this.updateUI();
            this.closeModal();
            this.showNotification("Service updated successfully", "success");
        } catch (error) {
            this.services[index] = prev;
            this.showNotification(
                "Failed to update service: " + error.message,
                "error",
            );
        }
    },

    async deleteService(index) {
        if (!confirm("Are you sure you want to delete this service?")) return;
        const removed = this.services.splice(index, 1);
        try {
            await this.saveServices();
            this.updateUI();
            this.showNotification("Service deleted successfully", "success");
        } catch (error) {
            this.services.splice(index, 0, ...removed);
            this.showNotification(
                "Failed to delete service: " + error.message,
                "error",
            );
        }
    },
};
