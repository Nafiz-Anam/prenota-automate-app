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

module.exports = { buildPlaywrightProxyConfig };
