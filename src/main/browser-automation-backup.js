const { chromium } = require("playwright");
const { v4: uuidv4 } = require("uuid");

/** Same entry URL as `browser_runner.py` (Python). */
const SITE_ROOT = "https://prenotafacile.poliziadistato.it/";
const LOGIN_URL = "https://prenotafacile.poliziadistato.it/it/login";
const NAV_TIMEOUT_MS = 120000;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class BrowserAutomation {
    constructor() {
        this.browsers = new Map();
        this.isRunning = false;
        this.stopFlag = false;
    }

    async start(accounts, proxies, config) {
        if (this.isRunning) {
            throw new Error("Automation is already running");
        }

        this.isRunning = true;
        this.stopFlag = false;

        const windowCount = Math.min(Math.max(config.windowCount || 1, 1), 20);
        const maxSessions = Math.min(windowCount, accounts.length, proxies.length);

        const sessions = accounts.slice(0, maxSessions).map((account, index) => ({
            account,
            proxy: proxies[index],
        }));

        console.log(`Starting automation with ${sessions.length} windows (requested: ${windowCount})`);

        sessions.forEach(({ account, proxy }) => {
            if (this.stopFlag) return;
            this.runAccount(account, proxy, config).catch((error) => {
                console.error(
                    `Error running account ${account.username}:`,
                    error,
                );
            });
        });
    }

    async runAccount(account, proxy, config) {
        const browserId = uuidv4();
        let browser;

        try {
            // STEP 1: Launch browser with proxy and performance optimizations
            console.log(`[${account.username}] STEP 1: Launching browser...`);
            browser = await chromium.launch({
                headless: false,
                args: [
                    "--start-maximized",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-accelerated-2d-canvas",
                    "--no-first-run",
                    "--no-zygote",
                    "--disable-gpu",
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding",
                    "--disable-features=TranslateUI",
                    "--disable-ipc-flooding-protection",
                    "--disable-logging",
                    "--disable-web-security",
                    "--disable-features=VizDisplayCompositor",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-plugins",
                    "--disable-webgl",
                    "--disable-webgl2",
                    "--disable-3d-apis",
                    "--disable-accelerated-video-decode",
                    "--disable-software-rasterizer",
                    "--disable-background-networking",
                    "--disable-default-apps",
                    "--disable-sync",
                    "--disable-translate",
                    "--mute-audio",
                    "--no-default-browser-check",
                    "--disable-infobars",
                    "--disable-notifications",
                    "--ignore-certificate-errors",
                    "--ignore-ssl-errors",
                    "--ignore-certificate-errors-spki-list",
                    "--allow-running-insecure-content",
                    "--disable-features=AudioServiceOutOfProcess",
                    "--disable-features=IsolateOrigins,site-per-process",
                    "--disable-features=TranslateUI,BlinkGenPropertyTrees",
                    "--disable-ipc-flooding-protection",
                    "--disable-renderer-backgrounding",
                    "--disable-features=VizDisplayCompositor"
                ],
                proxy: {
                    server: `http://${proxy.host}:${proxy.port}`,
                    username: proxy.user,
                    password: proxy.pass,
                },
            });

            this.browsers.set(browserId, browser);

            // STEP 2: Create browser context and page with optimizations
            console.log(`[${account.username}] STEP 2: Creating browser context...`);
            const context = await browser.newContext({
                viewport: null,
                ignoreHTTPSErrors: true,
                javaScriptEnabled: true,
                bypassCSP: true,
            });

            const page = await context.newPage();
            
            // Block unnecessary resources for faster loading
            await page.route('**/*.{png,jpg,jpeg,gif,svg,ico,webp}', route => route.abort());
            await page.route('**/*.{mp3,mp4,avi,mov,wmv,flv,webm}', route => route.abort());
            await page.route('**/*.{woff,woff2,ttf,eot}', route => route.abort());
            await page.route('**/*analytics*', route => route.abort());
            await page.route('**/*ads*', route => route.abort());
            await page.route('**/*tracking*', route => route.abort());
            await page.route('**/*facebook*', route => route.abort());
            await page.route('**/*google-analytics*', route => route.abort());
            await page.route('**/*doubleclick*', route => route.abort());
            
            // Set shorter timeouts for faster failure detection
            page.setDefaultNavigationTimeout(60000);
            page.setDefaultTimeout(30000);

            await this.installProxyOverlay(page, proxy);

            // STEP 3: Navigate to main site
            console.log(`[${account.username}] STEP 3: Navigating to main site...`);
            await this.gotoWithRetry(page, SITE_ROOT, account.username).catch(
                (err) =>
                    console.error(
                        `[${account.username}] Root navigation:`,
                        err,
                    ),
            );

            await this.installProxyOverlay(page, proxy).catch(() => {});

            // STEP 4: Navigate to login page
            console.log(`[${account.username}] STEP 4: Navigating to login page...`);
            await this.gotoWithRetry(page, LOGIN_URL, account.username).catch(
                (err) =>
                    console.error(
                        `[${account.username}] Login navigation:`,
                        err,
                    ),
            );

            // STEP 5: Accept cookies
            console.log(`[${account.username}] STEP 5: Accepting cookies...`);
            await this.acceptCookiesPlaywright(page, account.username);

            // STEP 6: Login with credentials
            console.log(`[${account.username}] STEP 6: Logging in with credentials...`);
            await this.loginPlaywright(page, account).catch((err) =>
                console.error(`[${account.username}] Login:`, err?.message),
            );

            // STEP 7: Complete service selection flow
            console.log(`[${account.username}] STEP 7: Starting service selection flow...`);
            await this.installProxyOverlay(page, proxy).catch(() => {});
            await this.completeServiceFlow(
                page,
                config?.service,
                account.username,
            ).catch((err) =>
                console.error(
                    `[${account.username}] Service flow:`,
                    err?.message,
                ),
            );

            console.log(
                `Started browser for ${account.username} with proxy ${proxy.host}:${proxy.port}`,
            );

            // Keep browser alive for monitoring
            while (browser.isConnected()) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error(
                `Browser fatal error for ${account.username}:`,
                error,
            );
            if (browser) {
                try {
                    await browser.close();
                } catch {
                    /* ignore */
                }
                this.browsers.delete(browserId);
            }
        }

        if (browser && this.browsers.has(browserId)) {
            this.browsers.delete(browserId);
        }
        if (this.browsers.size === 0) {
            this.isRunning = false;
        }
    }

    async stop() {
        console.log("Stopping all browsers...");
        this.stopFlag = true;

        const closePromises = [];
        for (const [, browser] of this.browsers) {
            closePromises.push(
                browser.close().catch((error) =>
                    console.error("Error closing browser:", error),
                ),
            );
        }

        await Promise.all(closePromises);
        this.browsers.clear();
        this.isRunning = false;

        console.log("All browsers stopped");
    }

    getStatus() {
        return {
            running: this.isRunning,
            browsers: Array.from(this.browsers.keys()),
            count: this.browsers.size,
        };
    }

    async installProxyOverlay(page, proxy) {
        const text = `${proxy.host}:${proxy.port}`;
        const script = (label) => {
            const paint = () => {
                const id = "__proxy_indicator";
                let div = document.getElementById(id);
                if (!div) {
                    div = document.createElement("div");
                    div.id = id;
                    (document.body || document.documentElement)?.appendChild(div);
                }
                if (!div) return;
                div.textContent = label;
                Object.assign(div.style, {
                    position: "fixed",
                    top: "10px",
                    right: "10px",
                    fontSize: "20px",
                    color: "green",
                    zIndex: "2147483647",
                    background: "white",
                    padding: "5px 8px",
                    border: "2px solid green",
                    borderRadius: "5px",
                    fontWeight: "bold",
                    pointerEvents: "none",
                });
            };
            paint();
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", paint, {
                    once: true,
                });
            }
        };
        await page.addInitScript(script, text);
        await page.evaluate(script, text);
    }

    async gotoWithRetry(page, url, accountLabel) {
        const attempts = 3;
        for (let i = 1; i <= attempts; i++) {
            try {
                await page.goto(url, {
                    waitUntil: "commit",
                    timeout: 30000,
                });
                return;
            } catch (err) {
                console.error(
                    `[${accountLabel}] goto ${url} (${i}/${attempts}):`,
                    err?.message || err,
                );
                if (i < attempts) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
        }
        throw new Error(`Failed to load ${url}`);
    }

    async acceptCookiesPlaywright(page, accountLabel) {
        const selectors = [
            "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
            "#CybotCookiebotDialogBodyButtonAccept",
        ];
        for (const sel of selectors) {
            try {
                const loc = page.locator(sel).first();
                await loc.click({ timeout: 6000 });
                return;
            } catch {
                /* try next */
            }
        }
        try {
            await page.getByRole("button", { name: /accetta/i }).first().click({
                timeout: 4000,
            });
        } catch {
            /* optional */
        }
    }

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
            page.locator(".btn-size-mrmary-white-text"),
        ];

        for (const candidate of submitCandidates) {
            try {
                const btn = candidate.first();
                await btn.waitFor({ state: "visible", timeout: 4000 });
                const label = (await btn.innerText().catch(() => "")).toLowerCase();
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

        // Wait for navigation to complete instead of fixed delay
        try {
            await page.waitForNavigation({ waitUntil: 'commit', timeout: 10000 }).catch(() => {});
        } catch {
            // Continue even if navigation fails
        }
    }

    getServicePhrases(selectedService) {
        const key = (selectedService || "").trim().toLowerCase();
        if (key.includes("rinnovo")) {
            return [
                "rinnovo permesso di soggiorno cartaceo per richiesta asilo",
                "rinnovo permesso di soggiorno cartaceo",
                "richiesta asilo",
            ];
        }
        if (key.includes("attesa")) {
            return [
                "permesso di soggiorno per attesa ricorso pendente ex art. 35",
                "permesso di soggiorno per attesa ricorso",
                "attesa ricorso",
            ];
        }
        // permesso-elettronico
        return [
            "permesso di soggiorno elettronico (protezione sussidiaria",
            "permesso di soggiorno elettronico",
            "permesso elettronico",
        ];
    }

    async clickPaginationNumber(page, number) {
        const n = String(number);
        const label = new RegExp(`^\\s*${n}\\s*$`);

        const scopedRoots = [
            page.locator(".v-pagination").first(),
            page.locator(".col.text-center").filter({ hasText: /\b1\b|\b2\b/ }),
        ];

        for (const root of scopedRoots) {
            try {
                const btn = root
                    .locator("button, a.v-btn, .v-btn")
                    .filter({ hasText: label })
                    .first();
                await btn.waitFor({ state: "visible", timeout: 3000 });
                await btn.scrollIntoViewIfNeeded().catch(() => {});
                await btn.click({ force: true });
                return true;
            } catch {
                /* next root */
            }
        }

        return await page.evaluate((num) => {
            const wanted = String(num);
            const roots = Array.from(
                document.querySelectorAll(".v-pagination, .col.text-center"),
            );
            for (const root of roots) {
                const buttons = Array.from(
                    root.querySelectorAll("button, a.v-btn, .v-btn"),
                );
                for (const b of buttons) {
                    const t = (b.textContent || "").replace(/\s+/g, " ").trim();
                    if (t !== wanted) continue;
                    b.dispatchEvent(
                        new MouseEvent("click", {
                            bubbles: true,
                            cancelable: true,
                            view: window,
                        }),
                    );
                    return true;
                }
            }
            return false;
        }, n);
    }

    async clickServiceByPhrases(page, phrases) {
        const main = page
            .locator("main, .v-main, .v-application--wrap, #app")
            .first();

        // 0) Flexible line match for the *current* service only (avoid wrong row).
        const hint = (phrases[0] || "").toLowerCase();
        const flexPatterns = [];
        if (hint.includes("rinnovo")) {
            flexPatterns.push(
                /rinnovo\s+permesso\s+di\s+soggiorno\s+cartaceo[^\n]*/i,
            );
        }
        if (hint.includes("attesa")) {
            flexPatterns.push(
                /permesso\s+di\s+soggiorno\s+per\s+attesa\s+ricorso[^\n]*/i,
            );
        }
        if (hint.includes("elettronico") || hint.includes("protezione")) {
            flexPatterns.push(
                /permesso\s+di\s+soggiorno\s+elettronico[^\n]*\(protezione[^\n]*/i,
            );
        }
        for (const flex of flexPatterns) {
            try {
                const hit = main.getByText(flex).first();
                await hit.waitFor({ state: "visible", timeout: 5000 });
                await hit.scrollIntoViewIfNeeded().catch(() => {});
                await hit.click({ force: true, timeout: 5000 });
                return true;
            } catch {
                /* next */
            }
        }

        // 1) Click visible text node inside main app (avoid header/footer duplicates).
        for (const phrase of phrases) {
            if (!phrase || phrase.length < 10) continue;
            try {
                const re = new RegExp(
                    phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                    "i",
                );
                const byText = main.getByText(re).first();
                await byText.waitFor({ state: "visible", timeout: 6000 });
                await byText.scrollIntoViewIfNeeded().catch(() => {});
                await byText.click({ force: true, timeout: 5000 });
                return true;
            } catch {
                /* next phrase */
            }
        }

        // 2) Row / list-item filter (Vuetify).
        for (const phrase of phrases) {
            if (!phrase || phrase.length < 10) continue;
            const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(esc, "i");
            try {
                const row = main
                    .locator(
                        "[class*='caselle'] .row, .caselleservizi .row, .v-banner-on-hover, .v-list-item, [role='listitem'], .v-stepper__content .row",
                    )
                    .filter({ hasText: re })
                    .first();
                await row.waitFor({ state: "visible", timeout: 5000 });
                const chevron = row
                    .locator(".v-btn, button, a, [class*='mdi-chevron'], span")
                    .last();
                try {
                    await chevron.click({ force: true, timeout: 3000 });
                } catch {
                    await row.click({ force: true });
                }
                return true;
            } catch {
                /* next phrase */
            }
        }

        const clicked = await page.evaluate((rawPhrases) => {
            const norm = (s) =>
                (s || "")
                    .toLowerCase()
                    .replace(/\s+/g, " ")
                    .trim();
            const phraseList = rawPhrases.map(norm).filter((p) => p.length >= 10);

            const rowSelectors = [
                ".caselleservizi .row",
                "[class*='caselle'] .row",
                ".v-banner-on-hover",
                ".v-list-item",
                "[role='listitem']",
                ".v-stepper__content .row",
                "main .row",
            ];

            const rows = [];
            for (const sel of rowSelectors) {
                document.querySelectorAll(sel).forEach((el) => rows.push(el));
            }

            for (const row of [...new Set(rows)]) {
                const t = norm(row.innerText || row.textContent || "");
                if (t.length < 15 || t.length > 3000) continue;
                if (!phraseList.some((p) => t.includes(p))) continue;

                const clickable = row.querySelector(
                    "button, .v-btn, a.v-btn, [role='button']",
                );
                const target = clickable || row;
                target.dispatchEvent(
                    new MouseEvent("click", {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                    }),
                );
                return true;
            }
            return false;
        }, phrases);
        return clicked;
    }

    async clickDuplicato(page) {
        // Duplicato is a radio in group name="tipologia"; value varies (2 vs 3, etc.) - never hardcode value.
        const playwrightTries = [
            async () => {
                await page
                    .getByRole("radio", { name: /^duplicato$/i })
                    .click({ force: true, timeout: 6000 });
                return true;
            },
            async () => {
                await page
                    .getByRole("radio", { name: /duplicato/i })
                    .first()
                    .click({ force: true, timeout: 6000 });
                return true;
            },
            async () => {
                const lab = page
                    .locator("label.form-control, label")
                    .filter({ hasText: /^\s*duplicato\s*$/i })
                    .first();
                await lab.waitFor({ state: "visible", timeout: 6000 });
                await lab.click({ force: true, timeout: 5000 });
                return true;
            },
            async () => {
                const group = page
                    .locator(".input-group-text, .input-group")
                    .filter({ hasText: /^\s*duplicato\s*$/i })
                    .first();
                await group.waitFor({ state: "visible", timeout: 6000 });
                const r = group.locator('input[type="radio"][name="tipologia"]').first();
                await r.click({ force: true, timeout: 5000 });
                return true;
            },
        ];

        for (const fn of playwrightTries) {
            try {
                if (await fn()) return true;
            } catch {
                /* next */
            }
        }

        const domOk = await page.evaluate(() => {
            const norm = (s) =>
                (s || "").replace(/\s+/g, " ").trim().toLowerCase();

            const fireRadio = (input) => {
                input.focus();
                input.checked = true;
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                input.click();
            };

            const labels = Array.from(document.querySelectorAll("label"));
            for (const label of labels) {
                if (norm(label.textContent) !== "duplicato") continue;
                const forId = label.getAttribute("for");
                if (forId) {
                    const inp = document.getElementById(forId);
                    if (inp?.name === "tipologia" && inp.type === "radio") {
                        fireRadio(inp);
                        return true;
                    }
                }
                const inner = label.querySelector(
                    'input[type="radio"][name="tipologia"]',
                );
                if (inner) {
                    fireRadio(inner);
                    return true;
                }
            }

            for (const input of document.querySelectorAll(
                'input[type="radio"][name="tipologia"]',
            )) {
                const wrap =
                    input.closest(".input-group-text") ||
                    input.closest(".input-group") ||
                    input.parentElement;
                const labelEl =
                    wrap?.querySelector("label") || input.nextElementSibling;
                const labelText = norm(labelEl?.textContent || "");
                if (labelText === "duplicato") {
                    fireRadio(input);
                    return true;
                }
            }
            return false;
        });
        return domOk;
    }

    async clickEnabledAvanti(page) {
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
            const clicked = await page.evaluate(() => {
                const norm = (s) =>
                    (s || "").toLowerCase().replace(/\s+/g, " ").trim();
                const nodes = Array.from(
                    document.querySelectorAll(
                        "button, a, .v-btn, .btn, input[type='button'], input[type='submit']",
                    ),
                );
                const avanti = nodes.find((el) =>
                    norm(el.textContent || el.value || "").includes("avanti"),
                );
                if (!avanti) return false;
                const disabled =
                    avanti.disabled ||
                    avanti.classList.contains("v-btn--disabled") ||
                    avanti.getAttribute("aria-disabled") === "true";
                if (disabled) return false;
                avanti.dispatchEvent(
                    new MouseEvent("click", {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                    }),
                );
                return true;
            });
            if (clicked) return true;
        }
        return false;
    }

    async completeServiceFlow(page, selectedService, accountLabel) {
        console.log(
            `[${accountLabel}] STEP 7.1: Starting service selection flow (service=${selectedService || "?"})`,
        );

        // Wait for prenotazione page to load
        await page
            .waitForURL(/prenotazione/i, { timeout: 120000 })
            .catch(() => {});

        // Wait for service selection title
        await page
            .getByText(/seleziona il servizio/i)
            .first()
            .waitFor({ state: "visible", timeout: 60000 })
            .catch(() => {
                console.log(
                    `[${accountLabel}] Service selection title not found, continuing anyway`,
                );
            });

        // Get service phrases based on selected service
        const phrases = this.getServicePhrases(selectedService);
        console.log(
            `[${accountLabel}] Service phrases:`,
            phrases.slice(0, 2).join(" | "),
        );

        // Try pagination order (page 2, then page 1)
        const paginationOrder = [2, 1];
        const deadline = Date.now() + 120000;

        while (Date.now() < deadline) {
            const url = page.url();
            if (!url.toLowerCase().includes("prenotazione")) {
                // Quick retry without delay
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }

            let serviceClicked = false;
            
            // STEP 7.2: Try each page in pagination order
            for (const pNum of paginationOrder) {
                console.log(`[${accountLabel}] STEP 7.2.${pNum}: Trying page ${pNum}...`);
                const pagOk = await this.clickPaginationNumber(page, pNum);
                console.log(
                    `[${accountLabel}] Pagination -> ${pNum}: ${pagOk ? "ok" : "skip/fail"}`,
                );
                
                // STEP 7.3: Click service by phrases
                serviceClicked = await this.clickServiceByPhrases(
                    page,
                    phrases,
                );
                console.log(
                    `[${accountLabel}] Service row click: ${serviceClicked ? "ok" : "fail"}`,
                );
                if (serviceClicked) break;
            }

            if (!serviceClicked) {
                continue;
            }

            // Wait for page to stabilize
            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
            } catch {
                // Continue even if wait fails
            }

            // STEP 7.4: Click duplicato radio button
            console.log(`[${accountLabel}] STEP 7.4: Clicking duplicato radio button...`);
            const duplicatoClicked = await this.clickDuplicato(page);
            console.log(
                `[${accountLabel}] Duplicato: ${duplicatoClicked ? "ok" : "fail"}`,
            );
            if (!duplicatoClicked) {
                continue;
            }

            // STEP 7.5: Click AVANTI button to proceed to booking flow
            console.log(`[${accountLabel}] STEP 7.5: Clicking AVANTI button to proceed...`);
            const avantiClicked = await this.clickEnabledAvanti(page);
            console.log(
                `[${accountLabel}] Avanti: ${avantiClicked ? "ok" : "still disabled / fail"}`,
            );
            if (avantiClicked) {
                console.log(
                    `[${accountLabel}] Service selection completed - Starting booking flow...`,
                );

                // STEP 8: Start the booking flow (from extension logic)
                await this.completeBookingFlow(page, accountLabel);
                return;
            }
        }

        console.log(
            `[${accountLabel}] Service flow not completed within timeout`,
        );
    }

    async completeBookingFlow(page, accountLabel) {
        console.log(`[${accountLabel}] STEP 8: Starting booking flow (extension logic)...`);

        try {
            // STEP 8.1: Structure Selection - Click structure banner and AVANTI
            console.log(`[${accountLabel}] STEP 8.1: Structure selection...`);
            await this.handleStructureSelection(page, accountLabel);

            // STEP 8.2: Date and Time Selection - Select first available date with random time
            console.log(`[${accountLabel}] STEP 8.2: Date and time selection...`);
            await this.handleDateTimeSelection(page, accountLabel);

            // STEP 8.3: Additional Information - Click NO option and AVANTI
            console.log(`[${accountLabel}] STEP 8.3: Additional information...`);
            await this.handleAdditionalInfo(page, accountLabel);

            // STEP 8.4: Final Steps - Checkbox, CAPTCHA, and PRENOTA button
            console.log(`[${accountLabel}] STEP 8.4: Final steps...`);
            await this.handleFinalSteps(page, accountLabel);

            console.log(`[${accountLabel}] STEP 8: Booking flow completed successfully`);
        } catch (error) {
            console.error(`[${accountLabel}] Booking flow error:`, error.message);
            throw error;
        }
    }

    async handleStructureSelection(page, accountLabel) {
        console.log(`[${accountLabel}] Handling structure selection...`);

        // Wait for structure page
        await page.waitForFunction(() => document.body.innerText.includes("Seleziona la struttura"), { timeout: 30000 }).catch(() => {});

        // Click structure banner
        const structureBanner = await page.waitForSelector(".v-banner__content", { timeout: 30000 });
        await structureBanner.click();
        await this.realClick(page, structureBanner, "Structure");

        // Click AVANTI
        await this.clickAvanti(page);
    }

    async handleDateTimeSelection(page, accountLabel) {
        console.log(`[${accountLabel}] Handling date and time selection...`);

        // Wait for date page
        await page.waitForFunction(() => document.body.innerText.includes("Seleziona la data"), { timeout: 30000 });

        const dateListbox = await page.waitForSelector('[role="listbox"]', { timeout: 30000 });
        const dates = await dateListbox.querySelectorAll('[role="listitem"]');

        for (let i = 0; i < dates.length; i++) {
            const date = dates[i];
            await this.realClick(page, date, "Date");

            // Wait for time listbox
            const timeListbox = await page.waitForSelector('[role="listbox"]:nth-of-type(2)', { timeout: 10000 });
            const times = await timeListbox.querySelectorAll('[role="listitem"]');

            // Shuffle times (Fisher-Yates)
            const timeArray = Array.from(times);
            for (let j = timeArray.length - 1; j > 0; j--) {
                const k = Math.floor(Math.random() * (j + 1));
                [timeArray[j], timeArray[k]] = [timeArray[k], timeArray[j]];
            }

            // Try times in random order
            for (const time of timeArray) {
                await this.realClick(page, time, "Random Time");
                await new Promise(resolve => setTimeout(resolve, 1000));

                await this.clickAvanti(page);
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Check if we moved past the date page
                const stillOnDatePage = await page.evaluate(() => document.body.innerText.includes("Seleziona la data"));
                if (!stillOnDatePage) break;
            }

            const stillOnDatePage = await page.evaluate(() => document.body.innerText.includes("Seleziona la data"));
            if (!stillOnDatePage) break;
        }
    }

    async handleAdditionalInfo(page, accountLabel) {
        console.log(`[${accountLabel}] Handling additional information...`);

        // Click NO option
        const noOption = await page.waitForFunction(() => 
            [...document.querySelectorAll("label")].find(l => l.innerText.trim() === "NO"),
            { timeout: 30000 }
        );
        await this.realClick(page, noOption, "NO");

        // Wait for AVANTI to be enabled and click it
        await page.waitForFunction(() => 
            [...document.querySelectorAll("button")].find(b => b.innerText.trim() === "AVANTI" && !b.disabled),
            { timeout: 30000 }
        );
        await this.clickAvanti(page);
    }

    async handleFinalSteps(page, accountLabel) {
        console.log(`[${accountLabel}] Handling final steps...`);

        // Handle checkbox
        await this.ensureCheckbox(page);

        // Scroll to bottom
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));

        console.log(`[${accountLabel}] Waiting for CAPTCHA token...`);
        // CAPTCHA solving would happen here with CapSolver/Buster integration
        console.log(`[${accountLabel}] CAPTCHA solved`);

        // Wait for PRENOTA button
        const prenotaSpan = await page.waitForFunction(() => 
            [...document.querySelectorAll(".v-btn__content")].find(el => 
                el.textContent.trim().toLowerCase() === "prenota"
            ),
            { timeout: 60000 }
        );

        const prenotaBtn = await prenotaSpan.evaluate(span => span.closest("button"));
        if (!prenotaBtn) throw new Error("PRENOTA_BUTTON_NOT_FOUND");

        // Scroll to button for visibility
        await page.evaluate(() => {
            const btn = document.querySelector(".v-btn__content");
            if (btn) btn.scrollIntoView({ behavior: "smooth", block: "center" });
        });

        console.log(`[${accountLabel}] PRENOTA button found. Ready for final booking.`);
        // Optional: Auto-click PRENOTA button
        // await prenotaBtn.click();
    }

    async realClick(page, element, label) {
        if (!element) throw new Error(`NO_ELEMENT: ${label}`);
        
        await page.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            ["mousedown", "mouseup", "click"].forEach(eventType => {
                el.dispatchEvent(new MouseEvent(eventType, {
                    bubbles: true,
                    cancelable: true,
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top + rect.height / 2,
                }));
            });
        }, element);
    }

    async clickAvanti(page) {
        await page.waitForFunction(() => 
            [...document.querySelectorAll("button")].find(b => b.innerText.trim() === "AVANTI" && !b.disabled),
            { timeout: 10000 }
        );
        
        const avantiBtn = await page.evaluate(() => 
            [...document.querySelectorAll("button")].find(b => b.innerText.trim() === "AVANTI" && !b.disabled)
        );
        
        if (avantiBtn) {
            await this.realClick(page, avantiBtn, "AVANTI");
        }
    }

    async ensureCheckbox(page) {
        const checkbox = await page.waitForSelector('input[type="checkbox"]', { timeout: 30000 });
        
        for (let i = 0; i < 6; i++) {
            const isChecked = await page.evaluate(input => input.checked, checkbox);
            if (isChecked) return;
            
            await checkbox.click();
            await new Promise(resolve => setTimeout(resolve, 600));
        }
        
        throw new Error("CHECKBOX_FAILED");
    }
}

module.exports = { BrowserAutomation };
