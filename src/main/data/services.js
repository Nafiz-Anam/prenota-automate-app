const fs = require("node:fs");
const { SERVICES_FILE } = require("./paths.js");

const DEFAULT_SERVICES = [
    {
        name: "Permesso elettronico",
        phrases: [
            "permesso di soggiorno elettronico (protezione sussidiaria",
            "permesso di soggiorno elettronico",
            "permesso elettronico",
        ],
    },
    {
        name: "Rinnovo cartaceo",
        phrases: [
            "rinnovo permesso di soggiorno cartaceo per richiesta asilo",
            "rinnovo permesso di soggiorno cartaceo",
            "richiesta asilo",
        ],
    },
    {
        name: "Attesa ricorso",
        phrases: [
            "permesso di soggiorno per attesa ricorso pendente ex art. 35",
            "permesso di soggiorno per attesa ricorso",
            "attesa ricorso",
        ],
    },
];

function normalizeService(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const phrases = Array.isArray(raw.phrases)
        ? raw.phrases
              .map((p) => (typeof p === "string" ? p.trim() : ""))
              .filter((p) => p.length > 0)
        : [];
    if (!name || phrases.length === 0) return null;
    return { name, phrases };
}

async function loadServicesData() {
    try {
        const data = fs.readFileSync(SERVICES_FILE, "utf8");
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return [...DEFAULT_SERVICES];
        const normalized = parsed
            .map(normalizeService)
            .filter((s) => s !== null);
        return normalized.length > 0 ? normalized : [...DEFAULT_SERVICES];
    } catch (error) {
        // First run or missing file → seed defaults so the app keeps working.
        return [...DEFAULT_SERVICES];
    }
}

module.exports = { DEFAULT_SERVICES, normalizeService, loadServicesData };
