const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

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
    const root = path.join(__dirname, "..", "..", "..");
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
 * Buster captcha-solver extension. Try common folder names, then any
 * project-root directory whose name matches /buster/i.
 */
function findProjectBusterExtensionDir() {
    const root = path.join(__dirname, "..", "..", "..");
    const preferred = ["buster", "buster-captcha-solver"];
    for (const name of preferred) {
        const resolved = resolveChromiumExtensionDir(path.join(root, name));
        if (resolved) return resolved;
    }
    try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const ent of entries) {
            if (!ent.isDirectory()) continue;
            if (!/buster/i.test(ent.name)) continue;
            const resolved = resolveChromiumExtensionDir(
                path.join(root, ent.name),
            );
            if (resolved) {
                console.log(
                    `Buster extension folder (auto-detected): ${resolved}`,
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
 * Returns array of unpacked extension dirs to load. Capsolver from settings
 * (or auto-discovered) plus optional Buster auto-discovered under project root.
 */
function resolveAutomationExtensionDirs(config) {
    const dirs = [];
    const fromSettings = resolveChromiumExtensionDir(
        config?.chromiumExtensionPath,
    );
    if (fromSettings) {
        dirs.push(fromSettings);
    } else {
        const cap = findProjectCapsolverExtensionDir();
        if (cap) {
            console.log(`CapSolver extension (default path): ${cap}`);
            dirs.push(cap);
        }
    }
    const buster = findProjectBusterExtensionDir();
    if (buster && !dirs.includes(buster)) {
        console.log(`Buster extension (default path): ${buster}`);
        dirs.push(buster);
    }
    return dirs;
}

/**
 * Backwards-compatible single-dir resolver. Returns first dir or null.
 */
function resolveAutomationExtensionDir(config) {
    const dirs = resolveAutomationExtensionDirs(config);
    return dirs[0] || null;
}

module.exports = {
    launchPersistentContextWithExtension,
    resolveChromiumExtensionDir,
    findProjectCapsolverExtensionDir,
    findProjectBusterExtensionDir,
    resolveAutomationExtensionDir,
    resolveAutomationExtensionDirs,
};
