(() => {
    console.clear();
    console.log("🚀 PrenotaFacile automation started");

    // Allow restart
    if (window.__PF_RUNNING__) {
        console.log("♻️ Restarting automation");
    }

    window.__PF_RUNNING__ = true;
    window.__PF_STOP__ = false;

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "STOP") {
            console.log("🛑 STOP received in content.js");
            window.__PF_STOP__ = true;
        }
    });

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const stopped = () => window.__PF_STOP__;

    const waitFor = async (fn, label, timeout = 60000) => {
        console.log(`⏳ Waiting: ${label}`);
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (stopped()) throw "STOPPED";
            const res = fn();
            if (res) return res;
            await sleep(300);
        }
        throw `TIMEOUT: ${label}`;
    };

    const realClick = (el, label) => {
        if (!el) throw `NO_ELEMENT: ${label}`;
        const r = el.getBoundingClientRect();
        ["mousedown", "mouseup", "click"].forEach((t) =>
            el.dispatchEvent(
                new MouseEvent(t, {
                    bubbles: true,
                    cancelable: true,
                    clientX: r.left + r.width / 2,
                    clientY: r.top + r.height / 2,
                }),
            ),
        );
    };

    const clickAvanti = () => {
        const btn = [...document.querySelectorAll("button")].find(
            (b) => b.innerText.trim() === "AVANTI" && !b.disabled,
        );
        if (btn) realClick(btn, "AVANTI");
    };

    const getStep = () => {
        const t = document.body.innerText;
        if (t.includes("Seleziona la struttura")) return 1;
        if (t.includes("Seleziona la data")) return 2;
        if (t.includes("Informazioni aggiuntive")) return 3;
        if (t.includes("Accetto trattamento")) return 4;
        return 0;
    };

    const ensureCheckbox = async () => {
        const input = await waitFor(
            () => document.querySelector('input[type="checkbox"]'),
            "Final checkbox",
        );
        for (let i = 0; i < 6; i++) {
            if (input.checked) return;
            input.click();
            await sleep(600);
        }
        throw "CHECKBOX_FAILED";
    };

    (async () => {
        try {
            let step = getStep();

            if (step <= 1) {
                const s = await waitFor(
                    () => document.querySelector(".v-banner__content"),
                    "Structure",
                );
                realClick(s, "Structure");
                await sleep(500);
                clickAvanti();
            }

            if (step <= 2) {
                await waitFor(
                    () => document.body.innerText.includes("Seleziona la data"),
                    "Date page",
                );

                const dateLB = await waitFor(
                    () => document.querySelectorAll('[role="listbox"]')[0],
                    "Date listbox",
                );
                const dates = [...dateLB.querySelectorAll('[role="listitem"]')];

                for (const d of dates) {
                    if (stopped()) throw "STOPPED";

                    realClick(d, "Date");

                    const timeLB = await waitFor(
                        () => document.querySelectorAll('[role="listbox"]')[1],
                        "Time listbox",
                    );

                    let times = [
                        ...timeLB.querySelectorAll('[role="listitem"]'),
                    ];

                    // 🎲 Shuffle time slots (Fisher–Yates)
                    for (let i = times.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [times[i], times[j]] = [times[j], times[i]];
                    }

                    // Try times in random order
                    for (const t of times) {
                        if (stopped()) throw "STOPPED";

                        realClick(t, "Random Time");
                        await sleep(1000);

                        clickAvanti();
                        await sleep(1500);

                        if (
                            !document.body.innerText.includes(
                                "Seleziona la data",
                            )
                        )
                            break;
                    }

                    if (!document.body.innerText.includes("Seleziona la data"))
                        break;
                }
            }

            if (step <= 3) {
                const no = await waitFor(
                    () =>
                        [...document.querySelectorAll("label")].find(
                            (l) => l.innerText.trim() === "NO",
                        ),
                    "NO option",
                );

                realClick(no, "NO");

                await waitFor(
                    () =>
                        [...document.querySelectorAll("button")].find(
                            (b) =>
                                b.innerText.trim() === "AVANTI" && !b.disabled,
                        ),
                    "AVANTI enabled",
                );

                clickAvanti();
            }

            if (step <= 4) {
                await ensureCheckbox();

                window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: "smooth",
                });

                console.log("👀 Waiting for CAPTCHA token (CapSolver)");

                console.log("✅ CAPTCHA solved");

                // Wait until PRENOTA button exists
                const prenotaSpan = await waitFor(
                    () =>
                        [...document.querySelectorAll(".v-btn__content")].find(
                            (el) =>
                                el.textContent.trim().toLowerCase() ===
                                "prenota",
                        ),
                    "prenota button render",
                );

                const prenotaBtn = prenotaSpan
                    ? prenotaSpan.closest("button")
                    : null;

                if (!prenotaBtn) throw "PRENOTA_BUTTON_NOT_FOUND";

                // Scroll to the button so you can click it manually
                prenotaBtn.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });

                console.log(
                    "👉 CAPTCHA solved. Please click PRENOTA manually.",
                );
            }

            console.log("🎉 AUTOMATION FINISHED");
            chrome.runtime.sendMessage({ action: "FINISHED" });
            window.__PF_RUNNING__ = false;
        } catch (e) {
            console.error("🔥 AUTOMATION ERROR", e);
            window.__PF_RUNNING__ = false;
        }
    })();
})();
