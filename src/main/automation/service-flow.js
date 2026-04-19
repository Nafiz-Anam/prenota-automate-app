/**
 * Prototype methods attached to BrowserAutomation — mounted via Object.assign in index.js.
 * Owns the post-login "seleziona il servizio" page: pagination, service-row click,
 * duplicato radio, and the AVANTI that leads into the booking flow.
 *
 * Relies on sibling methods via `this`:
 *   - this.waitUntilScheduledTime   (scheduler.js)
 *   - this.completeBookingFlow      (booking-flow.js)
 */
const ServiceFlowMethods = {
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

        // Prefer phrases from the user's Services config; fall back to built-ins.
        const configPhrases = Array.isArray(config?.servicePhrases)
            ? config.servicePhrases.filter(
                  (p) => typeof p === "string" && p.trim().length > 0,
              )
            : [];
        const phrases =
            configPhrases.length > 0
                ? configPhrases
                : this.getServicePhrases(selectedService);
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

                // Wait until scheduled time (if configured) before booking flow.
                await this.waitUntilScheduledTime(config, accountLabel);
                if (this.stopFlag) return;

                // STEP 8: Start the booking flow (from extension logic)
                await this.completeBookingFlow(page, accountLabel, config);
                return;
            }
        }

        console.log(
            `[${accountLabel}] Service flow not completed within timeout`,
        );
    },

    // Fallback phrases for the three built-in services. Used when the user's
    // Services list is empty or missing phrases for the selected key.
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
    },

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
    },

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
    },

    async clickDuplicato(page) {
        // Duplicato is a radio in group name="tipologia"; value varies (2 vs 3, etc.) - never hardcode value.
        const playwrightTries = [
            async () => {
                await page
                    .getByRole("radio", { name: /^duplicato$/i })
                    .click({ force: true, timeout: 2000 });
                return true;
            },
            async () => {
                await page
                    .getByRole("radio", { name: /duplicato/i })
                    .first()
                    .click({ force: true, timeout: 2000 });
                return true;
            },
            async () => {
                const lab = page
                    .locator("label.form-control, label")
                    .filter({ hasText: /^\s*duplicato\s*$/i })
                    .first();
                await lab.waitFor({ state: "visible", timeout: 2000 });
                await lab.click({ force: true, timeout: 2000 });
                return true;
            },
            async () => {
                const group = page
                    .locator(".input-group-text, .input-group")
                    .filter({ hasText: /^\s*duplicato\s*$/i })
                    .first();
                await group.waitFor({ state: "visible", timeout: 2000 });
                const r = group
                    .locator('input[type="radio"][name="tipologia"]')
                    .first();
                await r.click({ force: true, timeout: 2000 });
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
    },

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
    },
};

module.exports = { ServiceFlowMethods };
