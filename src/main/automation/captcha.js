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

/**
 * Prototype methods attached to BrowserAutomation — mounted via Object.assign in index.js.
 * Keep as an object of methods so `this` resolves to the BrowserAutomation instance at call time.
 */
const CaptchaMethods = {
    // Polls for a solved reCAPTCHA token in the page and forces every known
    // callback path so Vue's reactive form state registers the solution and
    // enables the PRENOTA button. Runs in the background while we await the
    // button; safe to call-and-ignore errors.
    async _forceCaptchaTokenApply(page, accountLabel) {
        for (let attempt = 0; attempt < 90; attempt++) {
            await new Promise((r) => setTimeout(r, 1000));
            let applied = false;
            try {
                applied = await page.evaluate(() => {
                    // Find the first g-recaptcha-response textarea with a token
                    const textareas = [
                        ...document.querySelectorAll(
                            'textarea[name="g-recaptcha-response"]',
                        ),
                    ];
                    const token = textareas
                        .map((t) => t.value && t.value.trim())
                        .find((v) => v && v.length > 20);
                    if (!token) return false;

                    // Fire native input/change events so Vue picks up the value
                    textareas.forEach((ta) => {
                        if (!ta.value) return;
                        ["input", "change"].forEach((type) =>
                            ta.dispatchEvent(
                                new Event(type, { bubbles: true }),
                            ),
                        );
                    });

                    // Walk ___grecaptcha_cfg.clients to find and call callbacks
                    const clients =
                        window.___grecaptcha_cfg &&
                        window.___grecaptcha_cfg.clients;
                    if (!clients) return true;

                    const callFn = (fn) => {
                        try {
                            if (typeof fn === "function") fn(token);
                            else if (
                                typeof fn === "string" &&
                                typeof window[fn] === "function"
                            )
                                window[fn](token);
                        } catch (_) {}
                    };

                    const walk = (obj, depth) => {
                        if (!obj || typeof obj !== "object" || depth > 6)
                            return;
                        for (const key of Object.keys(obj)) {
                            try {
                                const v = obj[key];
                                if (
                                    key === "callback" ||
                                    key === "promise-callback"
                                ) {
                                    callFn(v);
                                }
                                walk(v, depth + 1);
                            } catch (_) {}
                        }
                    };

                    for (const id of Object.keys(clients)) {
                        walk(clients[id], 0);
                    }

                    return true;
                });
            } catch (_) {
                // page may have navigated; stop
                break;
            }
            if (applied) {
                console.log(
                    `[${accountLabel}] Captcha token found and callbacks fired (attempt ${attempt + 1}).`,
                );
                return;
            }
        }
    },
};

module.exports = {
    isRecaptchaEnterpriseQuotaBlocked,
    logRecaptchaSiteQuotaBlocked,
    CaptchaMethods,
};
