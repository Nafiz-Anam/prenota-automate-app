const { resolveAutomationExtensionDir } = require("./extension-loader.js");
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

        // Try to go back using INDIETRO button first, then browser back, then navigate to start
        const goBackOnePage = async () => {
            // Always try to find and click INDIETRO button first
            const indietroClicked = await page.evaluate(() => {
                // Try multiple selectors to find INDIETRO button
                const selectors = [
                    "button",
                    ".v-btn",
                    "[role='button']",
                    "a.v-btn",
                    ".v-btn--contained",
                    ".v-btn--elevated",
                ];

                let indietroBtn = null;

                // Search through all possible button elements
                for (const selector of selectors) {
                    const buttons = [...document.querySelectorAll(selector)];
                    indietroBtn = buttons.find((btn) => {
                        const text = (btn.innerText || btn.textContent || "")
                            .trim()
                            .toUpperCase();
                        return text === "INDIETRO" || text.includes("INDIETRO");
                    });
                    if (indietroBtn) break;
                }

                // Additional fallback - search by exact text match
                if (!indietroBtn) {
                    const allElements = [...document.querySelectorAll("*")];
                    indietroBtn = allElements.find((el) => {
                        const text = (
                            el.innerText ||
                            el.textContent ||
                            ""
                        ).trim();
                        return (
                            text.toUpperCase() === "INDIETRO" &&
                            (el.tagName === "BUTTON" ||
                                el.tagName === "A" ||
                                el.getAttribute("role") === "button")
                        );
                    });
                }

                if (!indietroBtn) {
                    console.log("INDIETRO button not found on page");
                    return false;
                }

                // Check if button is visible and enabled
                const style = window.getComputedStyle(indietroBtn);
                if (
                    style.display === "none" ||
                    style.visibility === "hidden" ||
                    style.opacity === "0" ||
                    indietroBtn.disabled
                ) {
                    console.log(
                        "INDIETRO button found but not visible or enabled",
                    );
                    return false;
                }

                // Scroll button into view to ensure it's clickable
                indietroBtn.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });

                // Wait a moment for scroll to complete
                setTimeout(() => {
                    // Use real mouse events like other button clicks in this codebase
                    const r = indietroBtn.getBoundingClientRect();
                    ["mousedown", "mouseup", "click"].forEach((t) =>
                        indietroBtn.dispatchEvent(
                            new MouseEvent(t, {
                                bubbles: true,
                                cancelable: true,
                                clientX: r.left + r.width / 2,
                                clientY: r.top + r.height / 2,
                            }),
                        ),
                    );
                }, 200);

                return true;
            });

            if (indietroClicked) {
                console.log(
                    `[${accountLabel}] Successfully clicked INDIETRO button to go back`,
                );
            } else {
                console.log(
                    `[${accountLabel}] INDIETRO button not available, falling back to browser back`,
                );
                // Fall back to browser back button
                await page.goBack({ timeout: 10000 }).catch(async () => {
                    console.log(
                        `[${accountLabel}] Browser back failed, navigating to booking start`,
                    );
                    await page
                        .goto(PRENOTAZIONE_URL, {
                            waitUntil: "commit",
                            timeout: 30000,
                        })
                        .catch(() => {});
                });
            }
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

        const MAX_FINAL_RETRIES = 3;

        // Track the token used in the previous submit attempt. On retry we
        // must wait for a DIFFERENT token (the stale one is still in the DOM
        // and would otherwise satisfy waitForFunction instantly).
        let lastSubmittedToken = null;

        // Single long-lived helper across all attempts. It loops, fires Vue
        // callbacks every time a new token appears, and skips the stale
        // (already-submitted) one. We stop it on success/exit.
        const captchaCtrl = {
            stop: false,
            ignoreToken: null,
            lastFiredToken: null,
        };
        const helperPromise = this._forceCaptchaTokenApply(
            page,
            accountLabel,
            captchaCtrl,
        ).catch(() => {});

        const stopHelper = async () => {
            captchaCtrl.stop = true;
            await helperPromise.catch(() => {});
        };

        // Clear stale g-recaptcha-response textareas so waitForFunction
        // can't pick up a token from the previous submit.
        const clearStaleCaptcha = async () => {
            try {
                await page.evaluate(() => {
                    const tas = document.querySelectorAll(
                        'textarea[name="g-recaptcha-response"]',
                    );
                    tas.forEach((ta) => {
                        ta.value = "";
                        ["input", "change"].forEach((type) =>
                            ta.dispatchEvent(
                                new Event(type, { bubbles: true }),
                            ),
                        );
                    });
                    try {
                        if (
                            window.grecaptcha &&
                            typeof window.grecaptcha.reset === "function"
                        ) {
                            window.grecaptcha.reset();
                        }
                    } catch (_) {}
                });
            } catch (_) {}
        };

        // Robust real-mouse PRENOTA click. Returns true if a click was
        // dispatched via Playwright (trusted). Synthetic JS fallback removed
        // because Vue rejects isTrusted=false events anyway.
        const clickPrenota = async () => {
            const prenotaLoc = page
                .locator("button, .v-btn, [role='button']")
                .filter({ hasText: /\bPRENOTA\b/i, visible: true })
                .first();
            for (let i = 0; i < 3; i++) {
                try {
                    await prenotaLoc.scrollIntoViewIfNeeded({ timeout: 3000 });
                    await prenotaLoc.click({ timeout: 5000 });
                    return true;
                } catch (e) {
                    console.warn(
                        `[${accountLabel}] PRENOTA click attempt ${i + 1} failed: ${e.message}`,
                    );
                    await new Promise((r) => setTimeout(r, 1000));
                }
            }
            return false;
        };

        // Race success vs redirect-back vs error toast. Returns one of:
        // 'success' | 'redirected' | 'error' | 'timeout'
        const awaitOutcome = async (timeoutMs) => {
            try {
                const outcome = await page.waitForFunction(
                    () => {
                        const t =
                            document.body.innerText ||
                            document.body.textContent ||
                            "";
                        if (
                            t.includes("Complimenti") ||
                            t.includes("prenotazione è stata inserita") ||
                            t.includes("Prenotazione N.")
                        )
                            return "success";
                        if (
                            t.includes("Seleziona la struttura") ||
                            t.includes("Seleziona la data") ||
                            t.includes("Informazioni aggiuntive") ||
                            t.includes("Seleziona l'orario")
                        )
                            return "redirected";
                        if (
                            /errore|riprova più tardi|server.{0,20}error|503|504/i.test(
                                t,
                            )
                        )
                            return "error";
                        return false;
                    },
                    undefined,
                    { timeout: timeoutMs, polling: 500 },
                );
                return await outcome.jsonValue();
            } catch (_) {
                return "timeout";
            }
        };

        try {
            for (let attempt = 1; attempt <= MAX_FINAL_RETRIES; attempt++) {
                console.log(
                    `[${accountLabel}] Final step attempt ${attempt}/${MAX_FINAL_RETRIES}`,
                );

                try {
                    // On retry: clear stale token + force-recheck checkbox so
                    // captcha widget remounts and we wait for a fresh token.
                    if (attempt > 1) {
                        await clearStaleCaptcha();
                        captchaCtrl.ignoreToken = lastSubmittedToken;
                    }

                    await this.ensureCheckbox(page, {
                        forceRecheck: attempt > 1,
                    });

                    // Brief wait + scroll so captcha iframe can mount/be
                    // visible. Use waitForSelector instead of fixed sleeps.
                    await page.evaluate(() =>
                        window.scrollTo({
                            top: document.body.scrollHeight,
                            behavior: "smooth",
                        }),
                    );
                    await page
                        .waitForSelector(
                            'iframe[src*="recaptcha"], textarea[name="g-recaptcha-response"]',
                            { timeout: 8000 },
                        )
                        .catch(() => {});

                    if (await isRecaptchaEnterpriseQuotaBlocked(page)) {
                        if (chromiumExtensionLoaded) {
                            console.warn(
                                `[${accountLabel}] reCAPTCHA quota warning on page; continuing because Chromium extension is configured.`,
                            );
                        } else {
                            logRecaptchaSiteQuotaBlocked(accountLabel);
                            return false;
                        }
                    }

                    console.log(
                        `[${accountLabel}] Waiting for FRESH g-recaptcha-response token...`,
                    );
                    await page.waitForFunction(
                        (ignore) => {
                            const tas = document.querySelectorAll(
                                'textarea[name="g-recaptcha-response"]',
                            );
                            for (const ta of tas) {
                                const v = ta.value && ta.value.trim();
                                if (v && v.length > 20 && v !== ignore)
                                    return true;
                            }
                            return false;
                        },
                        lastSubmittedToken,
                        { timeout: 300000, polling: 500 },
                    );
                    console.log(
                        `[${accountLabel}] Fresh captcha token in DOM.`,
                    );

                    // Wait up to 5s for helper to fire Vue callback for the
                    // new token (it polls at 1Hz). Then click.
                    const tokenReady = await page
                        .waitForFunction(
                            (prev) => {
                                const tas = document.querySelectorAll(
                                    'textarea[name="g-recaptcha-response"]',
                                );
                                for (const ta of tas) {
                                    const v = ta.value && ta.value.trim();
                                    if (v && v.length > 20 && v !== prev)
                                        return v;
                                }
                                return false;
                            },
                            lastSubmittedToken,
                            { timeout: 5000, polling: 250 },
                        )
                        .then((h) => h.jsonValue())
                        .catch(() => null);

                    // Brief settle so Vue's reactive form picks up callback.
                    await new Promise((r) => setTimeout(r, 800));

                    console.log(
                        `[${accountLabel}] Clicking PRENOTA...`,
                    );
                    const clicked = await clickPrenota();
                    if (!clicked) {
                        console.warn(
                            `[${accountLabel}] PRENOTA click failed all 3 tries; retrying flow.`,
                        );
                        if (attempt < MAX_FINAL_RETRIES) {
                            await new Promise((r) => setTimeout(r, 2000));
                            continue;
                        }
                        return false;
                    }

                    // Record token we just submitted so retries skip it.
                    lastSubmittedToken =
                        tokenReady ||
                        (await page
                            .evaluate(() => {
                                const ta = document.querySelector(
                                    'textarea[name="g-recaptcha-response"]',
                                );
                                return ta ? (ta.value || "").trim() : null;
                            })
                            .catch(() => null));

                    console.log(
                        `[${accountLabel}] PRENOTA clicked; awaiting outcome (race success/redirect/error)...`,
                    );

                    const outcome = await awaitOutcome(180000);

                    if (outcome === "success") {
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

                    if (outcome === "redirected") {
                        console.log(
                            `[${accountLabel}] Server redirected back to earlier step (attempt ${attempt}/${MAX_FINAL_RETRIES}).`,
                        );
                    } else if (outcome === "error") {
                        console.log(
                            `[${accountLabel}] Server error toast detected (attempt ${attempt}/${MAX_FINAL_RETRIES}).`,
                        );
                    } else {
                        console.log(
                            `[${accountLabel}] No outcome within window (attempt ${attempt}/${MAX_FINAL_RETRIES}).`,
                        );
                    }

                    if (attempt < MAX_FINAL_RETRIES) {
                        await new Promise((r) => setTimeout(r, 2000));
                        continue;
                    }
                    return false;
                } catch (error) {
                    console.error(
                        `[${accountLabel}] Error in final step attempt ${attempt}:`,
                        error.message,
                    );
                    if (attempt < MAX_FINAL_RETRIES) {
                        await new Promise((r) => setTimeout(r, 2000));
                        continue;
                    }
                    return false;
                }
            }

            console.log(
                `[${accountLabel}] All ${MAX_FINAL_RETRIES} final step attempts exhausted.`,
            );
            return false;
        } finally {
            await stopHelper();
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

    async ensureCheckbox(page, { forceRecheck = false } = {}) {
        console.log(
            `Looking for final checkbox${forceRecheck ? " (force re-check)" : ""}...`,
        );

        // On retry the checkbox may already be checked but the captcha widget
        // is in a stale/submitted state — toggle off then on to remount it.
        const clicked = await page.evaluate((force) => {
            const input = document.querySelector('input[type="checkbox"]');
            if (!input) return false;

            if (force && input.checked) {
                input.click();
            }

            if (!input.checked) {
                input.click();
            }
            return input.checked;
        }, forceRecheck);

        if (!clicked) {
            throw new Error("CHECKBOX_FAILED");
        }

        console.log(`Final checkbox checked successfully`);
    },
};

module.exports = { BookingFlowMethods };
