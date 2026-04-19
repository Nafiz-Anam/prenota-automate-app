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

module.exports = { getDefaultChromiumArgs, getChromiumArgsForExtensions };
