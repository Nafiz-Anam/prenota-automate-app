/**
 * Prototype methods attached to BrowserAutomation — mounted via Object.assign in index.js.
 * Covers pre-booking navigation: overlay, page load, cookie banner, login form.
 */
const LoginFlowMethods = {
    /**
     * One small fixed label so you can see which proxy is in use.
     * Previously used addInitScript + multiple evaluate calls + repeated installs,
     * which could duplicate the badge (e.g. top, over CAPTCHA, footer).
     */
    async installProxyOverlay(page, proxy) {
        const label = `${proxy.host}:${proxy.port}`;
        await page.evaluate((text) => {
            const ATTR = "data-prenota-proxy-overlay";
            document.querySelectorAll(`[${ATTR}]`).forEach((n) => n.remove());
            const id = "__proxy_indicator";
            const old = document.getElementById(id);
            if (old) old.remove();

            const div = document.createElement("div");
            div.id = id;
            div.setAttribute(ATTR, "1");
            div.textContent = text;
            Object.assign(div.style, {
                position: "fixed",
                top: "10px",
                right: "10px",
                fontSize: "14px",
                color: "#166534",
                zIndex: "2147483646",
                background: "#fff",
                padding: "4px 8px",
                border: "2px solid #16a34a",
                borderRadius: "6px",
                fontWeight: "600",
                pointerEvents: "none",
                fontFamily: "system-ui, sans-serif",
                maxWidth: "70vw",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
            });
            (document.body || document.documentElement)?.appendChild(div);
        }, label);
    },

    async gotoWithRetry(page, url, accountLabel) {
        const attempts = 4;
        const timeoutMs = 90000;
        let lastError = null;
        for (let i = 1; i <= attempts; i++) {
            try {
                await page.goto(url, {
                    waitUntil: "commit",
                    timeout: timeoutMs,
                });
                return;
            } catch (err) {
                lastError = err;
                console.error(
                    `[${accountLabel}] goto ${url} (${i}/${attempts}):`,
                    err?.message || err,
                );
                if (i < attempts) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, 1500 * i),
                    );
                }
            }
        }

        const errMsg = String(lastError?.message || lastError || "");
        let detail = `Failed to load ${url}`;
        const oxylabsHint =
            "Oxylabs: confirm host/port and sub-user password in the dashboard, subscription active, " +
            "and your public IP allowlisted if required. Residential endpoints can be slow—retries use a longer timeout. " +
            "Test the proxy in another browser or curl. Special characters in passwords must match exactly in Proxies.";
        if (
            errMsg.includes("ERR_TUNNEL_CONNECTION_FAILED") ||
            errMsg.includes("TUNNEL_CONNECTION")
        ) {
            detail +=
                ". HTTPS tunnel through the proxy failed (ERR_TUNNEL_CONNECTION_FAILED). " +
                oxylabsHint;
        } else if (
            errMsg.includes("ERR_PROXY_CONNECTION_FAILED") ||
            errMsg.includes("ERR_PROXY")
        ) {
            detail +=
                ". Could not connect to the proxy server (ERR_PROXY_*). " +
                "The app is not reaching your configured proxy host: wrong port, firewall/VPN blocking outbound proxy, " +
                "or Oxylabs blocking the connection. " +
                oxylabsHint;
        } else if (errMsg.includes("TIMED_OUT") || errMsg.includes("Timeout")) {
            detail +=
                ". Navigation timed out (slow proxy, blocked route, or target unreachable through this endpoint). " +
                oxylabsHint;
        }

        throw new Error(detail);
    },

    async acceptCookiesPlaywright(page, accountLabel) {
        const selectors = [
            "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
            "#CybotCookiebotDialogBodyButtonAccept",
        ];
        for (const sel of selectors) {
            try {
                const loc = page.locator(sel).first();
                await loc.click({ timeout: 2000 });
                return;
            } catch {
                /* try next */
            }
        }
        try {
            await page
                .getByRole("button", { name: /accetta/i })
                .first()
                .click({
                    timeout: 2000,
                });
        } catch {
            /* optional */
        }
    },

    async loginPlaywright(page, account) {
        const email = page
            .getByRole("textbox", { name: /email/i })
            .or(page.getByPlaceholder(/email/i))
            .or(page.locator("input[type='email']"))
            .first();

        const password = page
            .getByPlaceholder(/password/i)
            .or(page.locator("input[type='password']"))
            .first();

        await email.waitFor({ state: "visible", timeout: 25000 });
        await password.waitFor({ state: "visible", timeout: 25000 });

        await email.click();
        await email.fill(account.username);
        await password.click();
        await password.fill(account.password);

        // Site uses custom Vuetify-style buttons; not always exposed with role=button.
        let clicked = false;

        const submitCandidates = [
            page.locator("a.btn, button.btn, input[type='submit']").filter({
                hasText: /accedi/i,
            }),
            page.locator("a.btn.btn-primary, button.btn.btn-primary"),
        ];

        for (const candidate of submitCandidates) {
            try {
                const btn = candidate.first();
                await btn.waitFor({ state: "visible", timeout: 2000 });
                const label = (
                    await btn.innerText().catch(() => "")
                ).toLowerCase();
                if (label.includes("spid")) {
                    continue;
                }
                await btn.scrollIntoViewIfNeeded().catch(() => {});
                await btn.click({ force: true });
                clicked = true;
                break;
            } catch {
                // Try next candidate
            }
        }

        if (!clicked) {
            // DOM fallback based on visible text/value.
            clicked = await page.evaluate(() => {
                const norm = (s) =>
                    (s || "").replace(/\s+/g, " ").trim().toLowerCase();
                const nodes = Array.from(
                    document.querySelectorAll(
                        "a.btn, button.btn, input[type='submit'], a, button",
                    ),
                );
                const target = nodes.find((el) => {
                    const t = norm(el.textContent || el.value || "");
                    if (!t.includes("accedi")) return false;
                    if (t.includes("spid")) return false;
                    const st = window.getComputedStyle(el);
                    return st.display !== "none" && st.visibility !== "hidden";
                });
                if (!target) return false;
                target.dispatchEvent(
                    new MouseEvent("click", {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                    }),
                );
                return true;
            });
        }

        if (!clicked) {
            await page.keyboard.press("Enter").catch(() => {});
        }

        // Wait for either the suspended-user modal OR a navigation away from login.
        // The modal is server-side rendered by Vue after the login response, so we
        // must wait — an immediate evaluate() fires before the DOM updates.
        console.log("Waiting for login response (modal or navigation)...");
        try {
            await Promise.race([
                // Navigation away from current page (successful login or redirect)
                page.waitForNavigation({ waitUntil: "commit", timeout: 15000 }),
                // Utente sospeso modal appears in DOM
                page.waitForFunction(
                    () =>
                        (document.body?.innerText || "").toLowerCase().includes("utente sospeso"),
                    { timeout: 15000 },
                ),
            ]).catch(() => {});
        } catch { /* ignore */ }

        // Now check — DOM has settled
        try {
            const hasSuspendedModal = await page.evaluate(() =>
                (document.body?.innerText || "").toLowerCase().includes("utente sospeso"),
            ).catch(() => false);

            if (hasSuspendedModal) {
                console.log("Utente sospeso modal detected — clicking SI, HO CAPITO...");

                // Wait for the button to be visible and enabled
                await page.waitForFunction(
                    () => {
                        const btn = [...document.querySelectorAll("button, .v-btn, [role='button']")]
                            .find((el) => {
                                const t = (el.innerText || el.textContent || "").trim().toUpperCase();
                                return t.includes("HO CAPITO");
                            });
                        if (!btn) return false;
                        const s = window.getComputedStyle(btn);
                        return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0" && !btn.disabled;
                    },
                    { timeout: 10000 },
                ).catch(() => {});

                const buttonClicked = await page.evaluate(() => {
                    const btn = [...document.querySelectorAll("button, .v-btn, [role='button']")]
                        .find((el) => {
                            const t = (el.innerText || el.textContent || "").trim().toUpperCase();
                            return t.includes("HO CAPITO");
                        });
                    if (!btn) return false;
                    const s = window.getComputedStyle(btn);
                    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
                    const r = btn.getBoundingClientRect();
                    ["mousedown", "mouseup", "click"].forEach((t) =>
                        btn.dispatchEvent(new MouseEvent(t, {
                            bubbles: true, cancelable: true,
                            clientX: r.left + r.width / 2,
                            clientY: r.top + r.height / 2,
                        })),
                    );
                    return true;
                }).catch(() => false);

                if (buttonClicked) {
                    console.log("Clicked SI, HO CAPITO — waiting for modal to close...");
                    await page.waitForFunction(
                        () => !(document.body?.innerText || "").toLowerCase().includes("utente sospeso"),
                        { timeout: 10000 },
                    ).catch(() => {});
                    // Wait for navigation after modal dismissal
                    await page.waitForNavigation({ waitUntil: "commit", timeout: 10000 }).catch(() => {});
                } else {
                    console.log("SI, HO CAPITO button not found or not clickable");
                }
            } else {
                console.log("No Utente sospeso modal detected");
            }
        } catch (error) {
            console.log("Error handling Utente sospeso modal:", error.message);
        }
    },
};

module.exports = { LoginFlowMethods };
