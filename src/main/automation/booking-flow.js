const {
    resolveAutomationExtensionDir,
} = require("./extension-loader.js");
const {
    isRecaptchaEnterpriseQuotaBlocked,
    logRecaptchaSiteQuotaBlocked,
} = require("./captcha.js");

/**
 * Prototype methods attached to BrowserAutomation — mounted via Object.assign in index.js.
 * Owns STEP 8 and all sub-steps after service+duplicato+AVANTI: structure, date/time,
 * additional info, and final checkbox/CAPTCHA/PRENOTA.
 *
 * Relies on sibling methods via `this`:
 *   - this._forceCaptchaTokenApply  (captcha.js)
 */
const BookingFlowMethods = {
    async completeBookingFlow(page, accountLabel, config) {
        // How many times a single step can fail before we trigger a full restart.
        const MAX_STEP_RETRIES = 3;
        // How many full restarts (navigate back to prenotazione start) we allow.
        const MAX_FULL_RESTARTS = 5;

        const PRENOTAZIONE_URL =
            "https://prenotafacile.poliziadistato.it/it/prenotazione";

        const steps = [
            {
                name: "8.1: Structure Selection",
                run: () => this.handleStructureSelection(page, accountLabel),
            },
            {
                name: "8.2: Date and Time Selection",
                run: () => this.handleDateTimeSelection(page, accountLabel),
            },
            {
                name: "8.3: Additional Information",
                run: () => this.handleAdditionalInfo(page, accountLabel),
            },
            {
                name: "8.4: Final Steps (Checkbox + CAPTCHA + PRENOTA)",
                run: () => this.handleFinalSteps(page, accountLabel, config),
            },
        ];

        // Go back one page in the browser history; fall back to navigating to
        // the booking start if goBack() throws (e.g. no history entry).
        const goBackOnePage = async () => {
            await page.goBack({ timeout: 10000 }).catch(async () => {
                await page
                    .goto(PRENOTAZIONE_URL, {
                        waitUntil: "commit",
                        timeout: 30000,
                    })
                    .catch(() => {});
            });
            await new Promise((r) => setTimeout(r, 1500));
        };

        for (
            let fullAttempt = 1;
            fullAttempt <= MAX_FULL_RESTARTS;
            fullAttempt++
        ) {
            if (fullAttempt > 1) {
                console.log(
                    `[${accountLabel}] STEP 8: Full restart ${fullAttempt}/${MAX_FULL_RESTARTS} — navigating to booking start...`,
                );
                await page
                    .goto(PRENOTAZIONE_URL, {
                        waitUntil: "commit",
                        timeout: 30000,
                    })
                    .catch(() => {});
                await new Promise((r) => setTimeout(r, 1500));
            }

            // Per-step failure counters — reset on each full restart.
            const stepRetries = new Array(steps.length).fill(0);
            let currentStep = 0;
            let booked = false;
            let needFullRestart = false;

            while (currentStep < steps.length) {
                const step = steps[currentStep];
                console.log(
                    `[${accountLabel}] STEP ${step.name} (full attempt ${fullAttempt})...`,
                );

                try {
                    const result = await step.run();

                    // handleFinalSteps returns true on success, false on failure.
                    if (currentStep === steps.length - 1) {
                        if (result === true) {
                            booked = true;
                            break;
                        }
                        throw new Error(
                            "Booking not confirmed after PRENOTA click",
                        );
                    }

                    // Step succeeded — advance.
                    currentStep++;
                } catch (error) {
                    stepRetries[currentStep]++;
                    console.error(
                        `[${accountLabel}] STEP ${step.name} failed (retry ${stepRetries[currentStep]}/${MAX_STEP_RETRIES}): ${error.message}`,
                    );

                    if (stepRetries[currentStep] >= MAX_STEP_RETRIES) {
                        console.log(
                            `[${accountLabel}] STEP ${step.name} exhausted ${MAX_STEP_RETRIES} retries — triggering full restart.`,
                        );
                        needFullRestart = true;
                        break;
                    }

                    if (currentStep > 0) {
                        // Go back one step in the wizard and redo it from scratch.
                        const prevStep = steps[currentStep - 1];
                        console.log(
                            `[${accountLabel}] Stepping back to redo STEP ${prevStep.name}...`,
                        );
                        await goBackOnePage();
                        currentStep--;
                    } else {
                        // Already at step 0 — can't go further back; wait and retry in place.
                        console.log(
                            `[${accountLabel}] STEP ${step.name} at step 0, retrying in place...`,
                        );
                        await new Promise((r) => setTimeout(r, 2000));
                    }
                }
            }

            if (booked) {
                console.log(
                    `[${accountLabel}] STEP 8: Booking completed on full attempt ${fullAttempt}.`,
                );
                return;
            }

            if (!needFullRestart) {
                // While loop exited without booking and without an explicit restart
                // signal — something unexpected; treat as exhausted.
                break;
            }
        }

        console.log(
            `[${accountLabel}] All ${MAX_FULL_RESTARTS} booking attempts exhausted — stopping.`,
        );
    },

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
    },

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
    },

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
    },

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

        // Start background helper: once extension delivers the token it may not
        // fire Vue's reactive callback automatically (reCAPTCHA Enterprise /
        // invisible widgets store callbacks differently). This loop watches for
        // a non-empty g-recaptcha-response and manually triggers every known
        // callback path so the Vue form registers the solved state.
        if (hasCaptcha) {
            this._forceCaptchaTokenApply(page, accountLabel).catch(() => {});
        }

        // Wait for PRENOTA (enabled after extension solves or you solve manually)
        console.log(
            `[${accountLabel}] Waiting for PRENOTA button to become enabled...`,
        );

        try {
            // The PRENOTA button on this site is never disabled via DOM
            // attributes — it always has class "success" (green). The real
            // gate is the g-recaptcha-response token: once the extension
            // delivers the token and _forceCaptchaTokenApply fires the Vue
            // callback, the form accepts the click. So we wait for the token.
            console.log(
                `[${accountLabel}] Waiting for g-recaptcha-response token (captcha solved)...`,
            );
            await page.waitForFunction(
                () => {
                    const tas = document.querySelectorAll(
                        'textarea[name="g-recaptcha-response"]',
                    );
                    for (const ta of tas) {
                        if (ta.value && ta.value.trim().length > 20)
                            return true;
                    }
                    return false;
                },
                undefined,
                { timeout: 300000 }, // 5-minute cap; captcha solving varies
            );
            console.log(
                `[${accountLabel}] Captcha token confirmed in DOM, proceeding to click PRENOTA.`,
            );

            // Give Vue one tick to process the callback before we click
            await new Promise((resolve) => setTimeout(resolve, 1500));

            console.log(
                `[${accountLabel}] PRENOTA control is enabled, clicking to complete booking...`,
            );

            // Two PRENOTA buttons exist in DOM — one visible (success/green),
            // one hidden (display:none). Use real Playwright click (isTrusted=true)
            // so Vue form handlers accept the event; synthetic events are rejected.
            const prenotaLoc = page
                .locator("button, .v-btn, [role='button']")
                .filter({ hasText: /\bPRENOTA\b/i, visible: true })
                .first();
            try {
                await prenotaLoc.scrollIntoViewIfNeeded({ timeout: 5000 });
                await prenotaLoc.click({ timeout: 15000 });
            } catch (_) {
                // Fallback: synthetic click if Playwright locator fails
                await page.evaluate(() => {
                    const nodes = [
                        ...document.querySelectorAll(
                            "button, .v-btn, [role='button']",
                        ),
                    ];
                    const btn = nodes.find((el) => {
                        if (!/\bPRENOTA\b/i.test(el.textContent || ""))
                            return false;
                        const style = window.getComputedStyle(el);
                        return (
                            style.display !== "none" &&
                            style.visibility !== "hidden" &&
                            style.opacity !== "0"
                        );
                    });
                    if (btn) {
                        btn.scrollIntoView({ block: "center" });
                        btn.click();
                    }
                });
            }
            console.log(
                `[${accountLabel}] PRENOTA button clicked successfully!`,
            );

            // Wait up to 45s for "Complimenti!" success page
            // (server-side captcha verification + DB write takes several seconds)
            const booked = await page
                .waitForFunction(
                    () => {
                        const t =
                            document.body.innerText ||
                            document.body.textContent ||
                            "";
                        return (
                            t.includes("Complimenti") ||
                            t.includes("prenotazione è stata inserita") ||
                            t.includes("Prenotazione N.")
                        );
                    },
                    undefined,
                    { timeout: 45000 },
                )
                .then(() => true)
                .catch(() => false);

            if (booked) {
                const bookingNum = await page
                    .evaluate(() => {
                        const m = (
                            document.body.innerText || ""
                        ).match(/Prenotazione N\.\s*([\w-]+)/);
                        return m ? m[1] : null;
                    })
                    .catch(() => null);
                console.log(
                    `[${accountLabel}] BOOKING SUCCESS! Ref: ${bookingNum || "unknown"}`,
                );
                return true;
            }

            // Check if site redirected back to an earlier step (server rejected captcha)
            const currentUrl = page.url();
            if (currentUrl.includes("/prenotazione") && !currentUrl.includes("step=5") && !currentUrl.includes("step=6")) {
                console.log(
                    `[${accountLabel}] Site redirected back to earlier step (captcha rejected or session issue). URL: ${currentUrl}`,
                );
            } else {
                console.log(
                    `[${accountLabel}] Success page not detected after PRENOTA click.`,
                );
            }
            return false;
        } catch (error) {
            console.error(
                `[${accountLabel}] Error with PRENOTA button:`,
                error.message,
            );
            return false;
        }
    },

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
    },

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
    },
};

module.exports = { BookingFlowMethods };
