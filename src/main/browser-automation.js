const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { v4: uuidv4 } = require("uuid");

/** Same entry URL as `browser_runner.py` (Python). */
const SITE_ROOT = "https://prenotafacile.poliziadistato.it/";
const LOGIN_URL = "https://prenotafacile.poliziadistato.it/it/login";
const NAV_TIMEOUT_MS = 120000;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Chromium flags shared by launch() and launchPersistentContext(). */
function getDefaultChromiumArgs() {
    return [
        "--start-maximized",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        // GPU left enabled (do not use --disable-gpu) so pages and UI render reliably.
        "--ignore-gpu-blocklist",
        "--enable-gpu-rasterization",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=TranslateUI",
        "--disable-ipc-flooding-protection",
        "--disable-logging",
        "--disable-web-security",
        "--disable-blink-features=AutomationControlled",
        "--disable-plugins",
        "--disable-webgl",
        "--disable-webgl2",
        "--disable-3d-apis",
        "--disable-accelerated-video-decode",
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
    ];
}

/**
 * Extension toolbar popups (e.g. CapSolver `www/index.html#/popup`) are tiny renderer
 * windows. The full `getDefaultChromiumArgs()` list disables GPU, compositor, WebGL,
 * site isolation, etc. — that often yields a **1px-tall blank strip** instead of the UI.
 * Use a **minimal** allowlist when `--load-extension` is set.
 */
function getChromiumArgsForExtensions() {
    return [
        "--start-maximized",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled",
        // Explicit GPU / compositor hints for extension popups (Vue UI in tiny window).
        "--ignore-gpu-blocklist",
        "--enable-gpu-rasterization",
    ];
}

/**
 * Persistent context + unpacked extension. Default: Playwright's **bundled Chromium**
 * (`--load-extension` is what we rely on). Optional `channel: 'chrome'` uses **your
 * installed Google Chrome** — only enable if you need it (e.g. extension popup UI); it
 * can behave differently with unpacked extensions.
 */
async function launchPersistentContextWithExtension(
    userDataDir,
    contextOptions,
    extArgs,
    { useChromeChannel = false } = {},
) {
    const base = {
        headless: false,
        ...contextOptions,
        args: extArgs,
    };
    if (useChromeChannel) {
        try {
            console.log(
                "Using Google Chrome (channel: chrome) — opt-in; not the bundled Chromium.",
            );
            return await chromium.launchPersistentContext(userDataDir, {
                ...base,
                channel: "chrome",
            });
        } catch (err) {
            console.warn(
                "channel: chrome failed — falling back to Playwright Chromium:",
                err.message,
            );
        }
    }
    console.log(
        "Using Playwright Chromium (bundled) with unpacked extension — look for the puzzle icon to find CapSolver.",
    );
    return chromium.launchPersistentContext(userDataDir, base);
}

/**
 * Unpacked Chrome extension folder (must contain manifest.json).
 * Playwright only loads extensions via launchPersistentContext + --load-extension.
 */
function resolveChromiumExtensionDir(rawPath) {
    if (rawPath == null || !String(rawPath).trim()) {
        return null;
    }
    const abs = path.resolve(String(rawPath).trim());
    const manifest = path.join(abs, "manifest.json");
    if (!fs.existsSync(manifest)) {
        console.warn(
            `Chromium extension path ignored (missing manifest.json): ${abs}`,
        );
        return null;
    }
    return abs;
}

/**
 * Unpacked CapSolver folder name changes per release. Try common names, then any
 * project-root directory whose name looks like the official zip (CapSolver… / capsolver…).
 */
function findProjectCapsolverExtensionDir() {
    const root = path.join(__dirname, "..", "..");
    const preferred = [
        "capsolver-captcha-solver",
        "CapSolver.Browser.Extension-chrome-v1.17.0",
    ];
    for (const name of preferred) {
        const resolved = resolveChromiumExtensionDir(path.join(root, name));
        if (resolved) {
            return resolved;
        }
    }
    try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const ent of entries) {
            if (!ent.isDirectory()) {
                continue;
            }
            const n = ent.name;
            if (
                !/capsolver/i.test(n) &&
                !/CapSolver\.Browser\.Extension/i.test(n)
            ) {
                continue;
            }
            const resolved = resolveChromiumExtensionDir(
                path.join(root, ent.name),
            );
            if (resolved) {
                console.log(
                    `CapSolver extension folder (auto-detected): ${resolved}`,
                );
                return resolved;
            }
        }
    } catch {
        /* ignore */
    }
    return null;
}

/**
 * Saved path in settings wins; otherwise discover under project root.
 */
function resolveAutomationExtensionDir(config) {
    const fromSettings = resolveChromiumExtensionDir(
        config?.chromiumExtensionPath,
    );
    if (fromSettings) {
        return fromSettings;
    }
    const fallback = findProjectCapsolverExtensionDir();
    if (fallback) {
        console.log(`CapSolver extension (default path): ${fallback}`);
    }
    return fallback;
}

/**
 * Playwright proxy for Chromium. Prefer context-level proxy (not launch) so HTTPS
 * CONNECT tunnels behave more reliably with providers like Oxylabs.
 */
function buildPlaywrightProxyConfig(proxy) {
    if (!proxy || !proxy.host) {
        return null;
    }
    const host = String(proxy.host).trim();
    const port = String(proxy.port ?? "")
        .trim()
        .replace(/^:+/, "");
    const username = proxy.user != null ? String(proxy.user).trim() : "";
    const password = proxy.pass != null ? String(proxy.pass).trim() : "";
    if (!host || !port) {
        return null;
    }
    const cfg = {
        server: `http://${host}:${port}`,
    };
    if (username) {
        cfg.username = username;
    }
    if (password) {
        cfg.password = password;
    }
    return cfg;
}

/**
 * True when Google's widget shows the site exceeded reCAPTCHA Enterprise free quota.
 * This is enforced on Google's servers for the *website's* Cloud project — not fixable by
 * CapSolver, proxies, or local automation.
 */
async function isRecaptchaEnterpriseQuotaBlocked(page) {
    return page.evaluate(() => {
        const t = (
            document.body?.innerText ||
            document.body?.textContent ||
            ""
        ).toLowerCase();
        return (
            (t.includes("exceeding") &&
                t.includes("recaptcha") &&
                t.includes("quota")) ||
            t.includes("recaptcha enterprise free quota")
        );
    });
}

function logRecaptchaSiteQuotaBlocked(accountLabel) {
    console.error(
        `[${accountLabel}] reCAPTCHA: site quota error — automation cannot complete CAPTCHA on this page.`,
    );
    console.error(
        "  Google is blocking verification because prenotafacile.poliziadistato.it (or its reCAPTCHA project) exceeded the reCAPTCHA Enterprise free quota.",
    );
    console.error(
        "  This is not a bug in this app or CapSolver. Only the website operator / their Google Cloud billing can restore quota.",
    );
    console.error(
        "  What you can do: try again later, book manually when the widget works in a normal browser, or use official channels if the portal is overloaded.",
    );
}

class BrowserAutomation {
    constructor() {
        this.browsers = new Map();
        this.isRunning = false;
        this.stopFlag = false;
    }

    async start(accounts, proxies, config = {}) {
        if (this.isRunning) {
            throw new Error("Automation is already running");
        }

        this.isRunning = true;
        this.stopFlag = false;

        console.log(
            "CAPTCHA: using unpacked CapSolver extension in Chromium only (no in-app API).",
        );

        const windowCount = Math.min(Math.max(config.windowCount || 1, 1), 20);
        const maxSessions = Math.min(
            windowCount,
            accounts.length,
            proxies.length,
        );

        const selectedProxies = proxies.filter(
            (p) => p.type !== "web_unblocker",
        );
        if (selectedProxies.length === 0) {
            throw new Error(
                "No HTTP proxies available. Remove Web Unblocker-only entries and add at least one standard HTTP proxy (host, port, user, pass).",
            );
        }

        const sessions = accounts
            .slice(0, maxSessions)
            .map((account, index) => ({
                account,
                proxy: selectedProxies[index % selectedProxies.length],
            }));

        console.log(`Using ${selectedProxies.length} HTTP proxy(es)`);

        console.log(
            `Starting automation with ${sessions.length} windows (requested: ${windowCount})`,
        );

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
        let browser = null;
        let context = null;

        try {
            // STEP 1: Launch browser with proxy and performance optimizations
            console.log(`[${account.username}] STEP 1: Launching browser...`);
            const proxyConfig = buildPlaywrightProxyConfig(proxy);
            if (!proxyConfig) {
                throw new Error(
                    "Invalid proxy: need host and port in Proxies settings.",
                );
            }
            console.log(
                `[${account.username}] Using HTTP proxy ${proxy.host}:${proxy.port} (context proxy)`,
            );

            const extDir = resolveAutomationExtensionDir(config);
            const contextOptions = {
                proxy: proxyConfig,
                viewport: null,
                ignoreHTTPSErrors: true,
                javaScriptEnabled: true,
                bypassCSP: true,
            };

            const baseArgs = getDefaultChromiumArgs();

            if (extDir) {
                // Playwright only loads extensions via launchPersistentContext (unique profile per window).
                const userDataDir = path.join(
                    os.tmpdir(),
                    "prenota-playwright-profiles",
                    browserId,
                );
                fs.mkdirSync(userDataDir, { recursive: true });
                const extArgs = [
                    ...getChromiumArgsForExtensions(),
                    `--disable-extensions-except=${extDir}`,
                    `--load-extension=${extDir}`,
                ];
                console.log(
                    `[${account.username}] Chromium extension folder: ${extDir}`,
                );
                console.log(
                    `[${account.username}] Persistent profile (this window): ${userDataDir}`,
                );
                context = await launchPersistentContextWithExtension(
                    userDataDir,
                    contextOptions,
                    extArgs,
                    {
                        useChromeChannel:
                            config?.useChromeChannel === true,
                    },
                );
                browser = context.browser();
                if (!browser) {
                    console.warn(
                        `[${account.username}] context.browser() is null (Chrome+persistent) — using context for lifecycle; UI stays open.`,
                    );
                }
            } else {
                browser = await chromium.launch({
                    headless: false,
                    args: baseArgs,
                });
                context = await browser.newContext(contextOptions);
            }

            this.browsers.set(browserId, { browser, context });

            console.log(
                `[${account.username}] STEP 2: Browser context ready (extension=${Boolean(extDir)})`,
            );

            const page =
                context.pages()[0] || (await context.newPage());

            // Block unnecessary resources for faster loading
            await page.route("**/*.{png,jpg,jpeg,gif,svg,ico,webp}", (route) =>
                route.abort(),
            );
            await page.route("**/*.{mp3,mp4,avi,mov,wmv,flv,webm}", (route) =>
                route.abort(),
            );
            await page.route("**/*.{woff,woff2,ttf,eot}", (route) =>
                route.abort(),
            );
            await page.route("**/*analytics*", (route) => route.abort());
            await page.route("**/*ads*", (route) => route.abort());
            await page.route("**/*tracking*", (route) => route.abort());
            await page.route("**/*facebook*", (route) => route.abort());
            await page.route("**/*google-analytics*", (route) => route.abort());
            await page.route("**/*doubleclick*", (route) => route.abort());

            // Set shorter timeouts for faster failure detection
            page.setDefaultNavigationTimeout(60000);
            page.setDefaultTimeout(30000);

            // STEP 3: Navigate to main site
            console.log(
                `[${account.username}] STEP 3: Navigating to main site...`,
            );

            await this.gotoWithRetry(page, SITE_ROOT, account.username);
            console.log(`[${account.username}] Navigation successful`);

            // STEP 4: Navigate to login page
            console.log(
                `[${account.username}] STEP 4: Navigating to login page...`,
            );
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
            console.log(
                `[${account.username}] STEP 6: Logging in with credentials...`,
            );
            await this.loginPlaywright(page, account).catch((err) =>
                console.error(`[${account.username}] Login:`, err?.message),
            );

            // STEP 7: Complete service selection flow
            console.log(
                `[${account.username}] STEP 7: Starting service selection flow...`,
            );
            await this.installProxyOverlay(page, proxy).catch(() => {});
            await this.completeServiceFlow(
                page,
                config?.service,
                account.username,
                config,
            );

            console.log(
                `Started browser for ${account.username} with proxy ${proxy.host}:${proxy.port}`,
            );

            // Keep session alive until Stop, disconnect, or all pages closed
            while (!this.stopFlag) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                try {
                    if (browser) {
                        if (!browser.isConnected()) {
                            break;
                        }
                        continue;
                    }
                    if (context) {
                        const b = context.browser();
                        if (b && !b.isConnected()) {
                            break;
                        }
                        if (!b) {
                            const pages = context.pages();
                            if (
                                pages.length === 0 ||
                                pages.every((p) => p.isClosed())
                            ) {
                                break;
                            }
                        }
                        continue;
                    }
                    break;
                } catch {
                    break;
                }
            }
        } catch (error) {
            console.error(
                `Browser fatal error for ${account.username}:`,
                error,
            );
            try {
                if (browser) {
                    await browser.close();
                } else if (context) {
                    await context.close();
                }
            } catch {
                /* ignore */
            }
            this.browsers.delete(browserId);
        }

        if (this.browsers.has(browserId)) {
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
        for (const [, session] of this.browsers) {
            const { browser, context } =
                session && typeof session === "object" && "context" in session
                    ? session
                    : { browser: session, context: null };
            if (browser) {
                closePromises.push(
                    browser
                        .close()
                        .catch((error) =>
                            console.error("Error closing browser:", error),
                        ),
                );
            } else if (context) {
                closePromises.push(
                    context
                        .close()
                        .catch((error) =>
                            console.error("Error closing browser context:", error),
                        ),
                );
            }
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
    }

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
        } else if (
            errMsg.includes("TIMED_OUT") ||
            errMsg.includes("Timeout")
        ) {
            detail +=
                ". Navigation timed out (slow proxy, blocked route, or target unreachable through this endpoint). " +
                oxylabsHint;
        }

        throw new Error(detail);
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
            await page
                .getByRole("button", { name: /accetta/i })
                .first()
                .click({
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

        // Wait for navigation to complete instead of fixed delay
        try {
            await page
                .waitForNavigation({ waitUntil: "commit", timeout: 10000 })
                .catch(() => {});
        } catch {
            // Continue even if navigation fails
        }
    }

    async completeServiceFlow(page, selectedService, accountLabel, config) {
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
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
            }

            let serviceClicked = false;

            // STEP 7.2: Try each page in pagination order
            for (const pNum of paginationOrder) {
                console.log(
                    `[${accountLabel}] STEP 7.2.${pNum}: Trying page ${pNum}...`,
                );
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
                await page
                    .waitForLoadState("domcontentloaded", { timeout: 3000 })
                    .catch(() => {});
            } catch {
                // Continue even if wait fails
            }

            // STEP 7.4: Click duplicato radio button
            console.log(
                `[${accountLabel}] STEP 7.4: Clicking duplicato radio button...`,
            );
            const duplicatoClicked = await this.clickDuplicato(page);
            console.log(
                `[${accountLabel}] Duplicato: ${duplicatoClicked ? "ok" : "fail"}`,
            );
            if (!duplicatoClicked) {
                continue;
            }

            // STEP 7.5: Click AVANTI button to proceed to booking flow
            console.log(
                `[${accountLabel}] STEP 7.5: Clicking AVANTI button to proceed...`,
            );
            const avantiClicked = await this.clickEnabledAvanti(page);
            console.log(
                `[${accountLabel}] Avanti: ${avantiClicked ? "ok" : "still disabled / fail"}`,
            );
            if (avantiClicked) {
                console.log(
                    `[${accountLabel}] Service selection completed - Starting booking flow...`,
                );

                // STEP 8: Start the booking flow (from extension logic)
                await this.completeBookingFlow(page, accountLabel, config);
                return;
            }
        }

        console.log(
            `[${accountLabel}] Service flow not completed within timeout`,
        );
    }

    async completeBookingFlow(page, accountLabel, config) {
        console.log(
            `[${accountLabel}] STEP 8: Starting booking flow (extension logic)...`,
        );

        try {
            // STEP 8.1: Structure Selection - Click structure banner and AVANTI
            console.log(`[${accountLabel}] STEP 8.1: Structure selection...`);
            await this.handleStructureSelection(page, accountLabel);

            // STEP 8.2: Date and Time Selection - Select first available date with random time
            console.log(
                `[${accountLabel}] STEP 8.2: Date and time selection...`,
            );
            await this.handleDateTimeSelection(page, accountLabel);

            // STEP 8.3: Additional Information - Click NO option and AVANTI
            console.log(
                `[${accountLabel}] STEP 8.3: Additional information...`,
            );
            await this.handleAdditionalInfo(page, accountLabel);

            // STEP 8.4: Final Steps - Checkbox, CAPTCHA, and PRENOTA button
            console.log(`[${accountLabel}] STEP 8.4: Final steps...`);
            await this.handleFinalSteps(page, accountLabel, config);

            console.log(
                `[${accountLabel}] STEP 8: Booking flow completed successfully`,
            );
        } catch (error) {
            console.error(
                `[${accountLabel}] Booking flow error:`,
                error.message,
            );
            throw error;
        }
    }

    async handleStructureSelection(page, accountLabel) {
        console.log(`[${accountLabel}] Handling structure selection...`);

        // Wait for structure page
        await page
            .waitForFunction(
                () =>
                    document.body.innerText.includes("Seleziona la struttura"),
                undefined,
                { timeout: 30000 },
            )
            .catch(() => {});

        // Click on the structure banner using the same approach as the extension
        console.log(`[${accountLabel}] Looking for structure banner...`);
        try {
            // Use page.evaluate to get the element and dispatch mouse events like the extension
            const clicked = await page.evaluate(() => {
                const element = document.querySelector(".v-banner__content");
                if (!element) return false;

                const r = element.getBoundingClientRect();
                ["mousedown", "mouseup", "click"].forEach((t) =>
                    element.dispatchEvent(
                        new MouseEvent(t, {
                            bubbles: true,
                            cancelable: true,
                            clientX: r.left + r.width / 2,
                            clientY: r.top + r.height / 2,
                        }),
                    ),
                );
                return true;
            });

            if (clicked) {
                console.log(
                    `[${accountLabel}] Structure banner clicked successfully using extension method`,
                );
            } else {
                throw new Error("Structure banner not found");
            }

            // Wait a moment for selection to register
            await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
            console.error(
                `[${accountLabel}] Structure selection failed:`,
                error.message,
            );
            throw error;
        }

        // Click AVANTI
        await this.clickAvanti(page);
    }

    async handleDateTimeSelection(page, accountLabel) {
        console.log(`[${accountLabel}] Handling date and time selection...`);

        // Wait for date page
        await page.waitForFunction(
            () => document.body.innerText.includes("Seleziona la data"),
            undefined,
            { timeout: 30000 },
        );

        const dateListbox = await page.waitForSelector('[role="listbox"]', {
            timeout: 30000,
        });
        const dates = await page
            .locator('[role="listbox"] [role="listitem"]')
            .all();

        for (let i = 0; i < dates.length; i++) {
            const date = dates[i];
            await date.click();

            // Wait for time listbox
            const timeListbox = await page.waitForSelector(
                '[role="listbox"]:nth-of-type(2)',
                { timeout: 10000 },
            );
            const times = await page
                .locator('[role="listbox"]:nth-of-type(2) [role="listitem"]')
                .all();

            // Shuffle times (Fisher-Yates)
            const timeArray = Array.from(times);
            for (let j = timeArray.length - 1; j > 0; j--) {
                const k = Math.floor(Math.random() * (j + 1));
                [timeArray[j], timeArray[k]] = [timeArray[k], timeArray[j]];
            }

            // Try times in random order
            for (const time of timeArray) {
                await time.click();
                await new Promise((resolve) => setTimeout(resolve, 1000));

                await this.clickAvanti(page);
                await new Promise((resolve) => setTimeout(resolve, 1500));

                // Check if we moved past the date page
                const stillOnDatePage = await page.evaluate(() =>
                    document.body.innerText.includes("Seleziona la data"),
                );
                if (!stillOnDatePage) break;
            }

            const stillOnDatePage = await page.evaluate(() =>
                document.body.innerText.includes("Seleziona la data"),
            );
            if (!stillOnDatePage) break;
        }
    }

    async handleAdditionalInfo(page, accountLabel) {
        console.log(`[${accountLabel}] Handling additional information...`);

        // Wait for additional info page
        await page
            .waitForFunction(
                () =>
                    document.body.innerText.includes("Informazioni aggiuntive"),
                undefined,
                { timeout: 30000 },
            )
            .catch(() => {});

        // Click NO option using the same approach as the extension
        console.log(`[${accountLabel}] Looking for NO option...`);
        const clicked = await page.evaluate(() => {
            const no = [...document.querySelectorAll("label")].find(
                (l) => l.innerText.trim() === "NO",
            );
            if (!no) return false;

            // Use the same realClick approach as the extension
            const r = no.getBoundingClientRect();
            ["mousedown", "mouseup", "click"].forEach((t) =>
                no.dispatchEvent(
                    new MouseEvent(t, {
                        bubbles: true,
                        cancelable: true,
                        clientX: r.left + r.width / 2,
                        clientY: r.top + r.height / 2,
                    }),
                ),
            );
            return true;
        });

        if (!clicked) {
            throw new Error("NO option not found");
        }

        console.log(`[${accountLabel}] NO option clicked successfully`);

        // Wait for AVANTI to be enabled and click it
        await page.waitForFunction(
            () =>
                [...document.querySelectorAll("button")].find(
                    (b) => b.innerText.trim() === "AVANTI" && !b.disabled,
                ),
            undefined,
            { timeout: 30000 },
        );
        await this.clickAvanti(page);
    }

    async handleFinalSteps(page, accountLabel, config) {
        console.log(`[${accountLabel}] Handling final steps...`);

        const chromiumExtensionLoaded = Boolean(
            resolveAutomationExtensionDir(config),
        );

        // Handle checkbox first - CAPTCHA appears after this
        await this.ensureCheckbox(page);

        // Wait a moment for CAPTCHA to appear after checkbox click
        console.log(
            `[${accountLabel}] Waiting for CAPTCHA to appear after checkbox click...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Scroll to bottom to ensure CAPTCHA is visible
        await page.evaluate(() =>
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: "smooth",
            }),
        );

        // Additional wait for dynamic CAPTCHA loading
        await new Promise((resolve) => setTimeout(resolve, 2000));

        if (await isRecaptchaEnterpriseQuotaBlocked(page)) {
            if (chromiumExtensionLoaded) {
                console.warn(
                    `[${accountLabel}] reCAPTCHA quota warning on page; continuing because a Chromium extension path is configured (solve in-browser).`,
                );
            } else {
                logRecaptchaSiteQuotaBlocked(accountLabel);
                return;
            }
        }

        console.log(
            `[${accountLabel}] Checking for CAPTCHA after checkbox interaction...`,
        );

        // First, check if there's actually a CAPTCHA on the page
        const hasCaptcha = await page.evaluate(() => {
            // Look for any CAPTCHA-related elements
            const captchaElements = document.querySelectorAll(
                '[class*="recaptcha"], [class*="g-recaptcha"], [class*="captcha"], iframe[src*="recaptcha"], div[id*="recaptcha"], div[id*="captcha"]',
            );
            const captchaIframes = Array.from(
                document.querySelectorAll("iframe"),
            ).filter(
                (iframe) =>
                    iframe.src &&
                    (iframe.src.includes("recaptcha") ||
                        iframe.src.includes("captcha")),
            );

            console.log(
                `CAPTCHA detection: ${captchaElements.length} elements, ${captchaIframes.length} iframes`,
            );
            return captchaElements.length > 0 || captchaIframes.length > 0;
        });

        if (!hasCaptcha) {
            console.log(
                `[${accountLabel}] No CAPTCHA detected after checkbox click; waiting for PRENOTA anyway...`,
            );
        } else if (chromiumExtensionLoaded) {
            console.log(
                `[${accountLabel}] Waiting for the CapSolver extension to solve reCAPTCHA in-page; then PRENOTA will enable.`,
            );
        } else {
            console.warn(
                `[${accountLabel}] No unpacked extension path — add the CapSolver folder under CapSolver settings (or project root). You can still complete CAPTCHA manually; waiting for PRENOTA...`,
            );
        }

        // Wait for PRENOTA (enabled after extension solves or you solve manually)
        console.log(
            `[${accountLabel}] Waiting for PRENOTA button to become enabled...`,
        );

        try {
            // Vuetify often uses role="button" or .v-btn, not always <button>
            await page.waitForFunction(
                () => {
                    const candidates = [
                        ...document.querySelectorAll(
                            'button,[role="button"],a.v-btn,a.btn,.v-btn',
                        ),
                    ];
                    for (const el of candidates) {
                        const txt = (el.textContent || "")
                            .replace(/\s+/g, " ")
                            .trim();
                        if (!/\bPRENOTA\b/i.test(txt)) continue;
                        const disabled =
                            el.disabled === true ||
                            el.getAttribute("aria-disabled") === "true" ||
                            el.classList.contains("v-btn--disabled") ||
                            (el.className &&
                                String(el.className).includes("disabled"));
                        if (!disabled) return true;
                    }
                    return false;
                },
                undefined,
                { timeout: 120000 },
            );

            await new Promise((resolve) => setTimeout(resolve, 800));

            console.log(
                `[${accountLabel}] PRENOTA control is enabled, clicking to complete booking...`,
            );

            const prenotaLoc = page
                .locator(".v-btn, button, [role='button']")
                .filter({ hasText: /\bPRENOTA\b/i })
                .first();
            await prenotaLoc.scrollIntoViewIfNeeded();
            try {
                await prenotaLoc.click({ timeout: 25000, force: true });
            } catch {
                const clicked = await page.evaluate(() => {
                    const nodes = [
                        ...document.querySelectorAll(
                            "button, .v-btn, [role='button']",
                        ),
                    ];
                    const btn = nodes.find((el) =>
                        /\bPRENOTA\b/i.test(el.textContent || ""),
                    );
                    if (!btn) return false;
                    btn.scrollIntoView({ block: "center", inline: "nearest" });
                    btn.dispatchEvent(
                        new MouseEvent("click", {
                            bubbles: true,
                            cancelable: true,
                            view: window,
                        }),
                    );
                    return true;
                });
                if (!clicked) {
                    throw new Error("PRENOTA click fallback found no element");
                }
            }
            console.log(
                `[${accountLabel}] PRENOTA button clicked successfully!`,
            );

            // Wait a moment to see if navigation occurs
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Check if we navigated away or if booking was successful
            const currentUrl = page.url();
            if (!currentUrl.includes("prenotazione")) {
                console.log(
                    `[${accountLabel}] Booking appears successful - navigated away from booking page`,
                );
            } else {
                console.log(
                    `[${accountLabel}] Still on booking page - checking for success indicators...`,
                );

                // Look for success messages or confirmation
                const hasSuccessMessage = await page.evaluate(() => {
                    const bodyText =
                        document.body.innerText ||
                        document.body.textContent ||
                        "";
                    return (
                        bodyText.includes("confermata") ||
                        bodyText.includes("prenotazione completata") ||
                        bodyText.includes("success") ||
                        bodyText.includes("completata")
                    );
                });

                if (hasSuccessMessage) {
                    console.log(
                        `[${accountLabel}] Success message detected - booking completed!`,
                    );
                } else {
                    console.log(
                        `[${accountLabel}] No clear success indicator - manual verification needed`,
                    );
                }
            }
        } catch (error) {
            console.error(
                `[${accountLabel}] Error with PRENOTA button:`,
                error.message,
            );
            console.log(
                `[${accountLabel}] This might be due to the reCAPTCHA Enterprise quota issue`,
            );
        }
    }


    // Additional helper methods (simplified versions)
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
                (s || "").toLowerCase().replace(/\s+/g, " ").trim();
            const phraseList = rawPhrases
                .map(norm)
                .filter((p) => p.length >= 10);

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
                const r = group
                    .locator('input[type="radio"][name="tipologia"]')
                    .first();
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

    async clickAvanti(page) {
        try {
            console.log("Waiting for AVANTI button to be enabled...");

            // Wait longer for button to become enabled
            await page
                .waitForFunction(
                    () =>
                        [...document.querySelectorAll("button")].find(
                            (b) =>
                                b.innerText.trim() === "AVANTI" && !b.disabled,
                        ),
                    undefined,
                    { timeout: 10000 },
                )
                .catch(() =>
                    console.log("AVANTI button wait timeout, trying anyway..."),
                );

            // Use the same approach as the extension
            const clicked = await page.evaluate(() => {
                const btn = [...document.querySelectorAll("button")].find(
                    (b) => b.innerText.trim() === "AVANTI" && !b.disabled,
                );
                if (!btn) return false;

                // Use the same realClick approach as the extension
                const r = btn.getBoundingClientRect();
                ["mousedown", "mouseup", "click"].forEach((t) =>
                    btn.dispatchEvent(
                        new MouseEvent(t, {
                            bubbles: true,
                            cancelable: true,
                            clientX: r.left + r.width / 2,
                            clientY: r.top + r.height / 2,
                        }),
                    ),
                );
                return true;
            });

            if (clicked) {
                console.log(
                    "AVANTI button clicked successfully using extension method",
                );

                // Wait for navigation to complete
                try {
                    await page.waitForLoadState("domcontentloaded", {
                        timeout: 5000,
                    });
                } catch (e) {
                    console.log(
                        "Navigation may not have occurred, continuing...",
                    );
                }
            } else {
                throw new Error("AVANTI button not found or disabled");
            }
        } catch (error) {
            console.error("AVANTI click failed:", error.message);
            throw error;
        }
    }

    async ensureCheckbox(page) {
        console.log(`Looking for final checkbox...`);

        // Simple checkbox - just click it once
        const clicked = await page.evaluate(() => {
            const input = document.querySelector('input[type="checkbox"]');
            if (!input) return false;

            if (input.checked) {
                console.log("Checkbox already checked");
                return true;
            }

            input.click();
            return input.checked;
        });

        if (!clicked) {
            throw new Error("CHECKBOX_FAILED");
        }

        console.log(`Final checkbox checked successfully`);
    }
}

module.exports = { BrowserAutomation };
