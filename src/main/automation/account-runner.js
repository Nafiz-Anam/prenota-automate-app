const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const uuidv4 = () => require("node:crypto").randomUUID();

const { LOGIN_URL } = require("./constants.js");
const {
    getDefaultChromiumArgs,
    getChromiumArgsForExtensions,
} = require("./chromium-args.js");
const {
    launchPersistentContextWithExtension,
    resolveAutomationExtensionDir,
} = require("./extension-loader.js");
const { buildPlaywrightProxyConfig } = require("./proxy-config.js");

/**
 * Prototype methods attached to BrowserAutomation — mounted via Object.assign in index.js.
 * Owns the orchestrator surface (start/stop/getStatus) and the per-account lifecycle
 * (browser launch, page wiring, handoff to login/service/booking flows).
 *
 * Relies on sibling methods via `this`:
 *   - this.gotoWithRetry / this.loginPlaywright / this.installProxyOverlay  (login-flow.js)
 *   - this.completeServiceFlow                                              (service-flow.js)
 */
const AccountRunnerMethods = {
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
        const useProxy = config?.useProxy !== false;

        let sessions;
        if (useProxy) {
            const selectedProxies = proxies.filter(
                (p) => p.type !== "web_unblocker",
            );
            if (selectedProxies.length === 0) {
                throw new Error(
                    "No HTTP proxies available. Remove Web Unblocker-only entries and add at least one standard HTTP proxy (host, port, user, pass).",
                );
            }
            const maxSessions = Math.min(
                windowCount,
                accounts.length,
                selectedProxies.length,
            );
            sessions = accounts.slice(0, maxSessions).map((account, index) => ({
                account,
                proxy: selectedProxies[index % selectedProxies.length],
            }));
            console.log(`Using ${selectedProxies.length} HTTP proxy(es)`);
        } else {
            const maxSessions = Math.min(windowCount, accounts.length);
            sessions = accounts
                .slice(0, maxSessions)
                .map((account) => ({ account, proxy: null }));
            console.log("Proxy disabled — using direct connection for all windows");
        }

        console.log(
            `Starting automation with ${sessions.length} windows (requested: ${windowCount})`,
        );

        const LAUNCH_DELAY_MS = 3000;
        sessions.forEach(({ account, proxy }, index) => {
            if (this.stopFlag) return;
            setTimeout(() => {
                if (this.stopFlag) return;
                this.runAccount(account, proxy, config).catch((error) => {
                    console.error(
                        `Error running account ${account.username}:`,
                        error,
                    );
                });
            }, index * LAUNCH_DELAY_MS);
        });
    },

    async runAccount(account, proxy, config) {
        const browserId = uuidv4();
        let browser = null;
        let context = null;
        this.activeCount++;

        const winLog = (msg) => {
            console.log(`[${account.username}] ${msg}`);
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send("automation-log", {
                    account: account.username,
                    message: msg,
                    timestamp: Date.now(),
                });
            }
        };

        try {
            // STEP 1: Launch browser with proxy and performance optimizations
            winLog("STEP 1: Launching browser...");
            let proxyConfig = null;
            if (proxy) {
                proxyConfig = buildPlaywrightProxyConfig(proxy);
                if (!proxyConfig) {
                    throw new Error(
                        "Invalid proxy: need host and port in Proxies settings.",
                    );
                }
                console.log(
                    `[${account.username}] Using HTTP proxy ${proxy.host}:${proxy.port} (context proxy)`,
                );
            } else {
                console.log(
                    `[${account.username}] Proxy disabled — using direct connection`,
                );
            }

            const extDir = resolveAutomationExtensionDir(config);
            const contextOptions = {
                viewport: null,
                ignoreHTTPSErrors: true,
                javaScriptEnabled: true,
                bypassCSP: true,
            };
            if (proxyConfig) {
                contextOptions.proxy = proxyConfig;
            }

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

            winLog(`STEP 2: Browser context ready (extension=${Boolean(extDir)})`);

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

            // STEP 3+4: Navigate directly to login page (skip redundant root nav)
            winLog("STEP 3: Navigating to login page...");
            await this.gotoWithRetry(page, LOGIN_URL, account.username).catch(
                (err) =>
                    console.error(
                        `[${account.username}] Login navigation:`,
                        err,
                    ),
            );

            // STEP 6: Login with credentials
            winLog("STEP 6: Logging in with credentials...");
            await this.loginPlaywright(page, account).catch((err) =>
                console.error(`[${account.username}] Login:`, err?.message),
            );

            // STEP 7: Complete service selection flow
            winLog("STEP 7: Starting service selection flow...");
            if (proxy) {
                await this.installProxyOverlay(page, proxy).catch(() => {});
            }
            await this.completeServiceFlow(
                page,
                config?.service,
                account.username,
                config,
            );

            winLog(
                proxy
                    ? `Browser running with proxy ${proxy.host}:${proxy.port}`
                    : "Browser running with direct connection (no proxy)",
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
        this.activeCount--;
        if (this.activeCount <= 0) {
            this.activeCount = 0;
            this.isRunning = false;
        }
    },

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
    },

    getStatus() {
        return {
            running: this.isRunning,
            browsers: Array.from(this.browsers.keys()),
            count: this.browsers.size,
        };
    },
};

module.exports = { AccountRunnerMethods };
