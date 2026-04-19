/** Same entry URL as `browser_runner.py` (Python). */
const SITE_ROOT = "https://prenotafacile.poliziadistato.it/";
const LOGIN_URL = "https://prenotafacile.poliziadistato.it/it/login";
const NAV_TIMEOUT_MS = 120000;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { SITE_ROOT, LOGIN_URL, NAV_TIMEOUT_MS, delay };
