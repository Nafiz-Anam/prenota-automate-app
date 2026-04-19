const fs = require("node:fs");
const { PROXIES_FILE } = require("./paths.js");

async function loadProxiesData() {
    try {
        const data = fs.readFileSync(PROXIES_FILE, "utf8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Error loading proxies:", error);
        return [];
    }
}

/**
 * Expand each proxy entry with a portRange (>1) into that many concrete proxies
 * on consecutive ports. Single-port entries pass through unchanged.
 */
function expandProxyPool(proxies) {
    if (!Array.isArray(proxies)) return [];
    const expanded = [];
    for (const p of proxies) {
        if (!p || !p.host || p.port == null) continue;
        const basePort = parseInt(p.port, 10);
        if (!Number.isFinite(basePort) || basePort <= 0) continue;
        const range = Math.max(parseInt(p.portRange, 10) || 1, 1);
        for (let i = 0; i < range; i++) {
            expanded.push({
                host: p.host,
                port: String(basePort + i),
                user: p.user,
                pass: p.pass,
                type: p.type || "regular",
            });
        }
    }
    return expanded;
}

/** Redacted view of the proxy list for dev-mode logs (passwords hidden). */
function summarizeProxiesForLog(proxies) {
    if (!Array.isArray(proxies)) return [];
    return proxies.map((p) => ({
        host: p?.host,
        port: p?.port,
        type: p?.type,
        user: p?.user ? "[set]" : undefined,
        pass: p?.pass ? "[set]" : undefined,
    }));
}

module.exports = { loadProxiesData, expandProxyPool, summarizeProxiesForLog };
