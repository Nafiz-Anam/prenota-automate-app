/**
 * Shared modal + toast helpers. Attached to AutoTrafficApp.prototype in
 * renderer.js so features can call `this.showModal(...)` / `this.showNotification(...)`.
 */
export const ModalMethods = {
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
    },

    closeModal() {
        document.getElementById("modalContainer").innerHTML = "";
    },

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
    },
};
