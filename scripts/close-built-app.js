/**
 * Windows: end a running build from dist/ so electron-builder can delete app.asar.
 * Safe to run when the app is not running (taskkill exits 128).
 */
const { execSync } = require("node:child_process");
const os = require("node:os");

if (os.platform() !== "win32") {
    process.exit(0);
}

try {
    execSync('taskkill /F /IM "Prenotafacile Automation.exe" /T', {
        stdio: "ignore",
    });
    console.log(
        '[dist:win] Closed "Prenotafacile Automation" so the build can overwrite dist.',
    );
} catch {
    /* not running — OK */
}
