/**
 * Prenota shim: normalizes chrome.storage.local.get for older/newer Chromium bindings.
 * Must load before other extension scripts (see manifest).
 */
(function () {
    function patchStorageLocal(local) {
        if (!local || local.__prenotaStoragePatched) {
            return;
        }
        var origGet = local.get.bind(local);
        local.get = function (keys, callback) {
            if (keys === undefined) {
                keys = null;
            }
            if (callback != null && typeof callback !== "function") {
                callback = undefined;
            }
            if (typeof callback === "function") {
                return origGet(keys, callback);
            }
            return new Promise(function (resolve) {
                origGet(keys, resolve);
            });
        };
        try {
            Object.defineProperty(local, "__prenotaStoragePatched", {
                value: true,
            });
        } catch (e) {
            /* ignore */
        }
    }
    try {
        if (
            typeof chrome !== "undefined" &&
            chrome.storage &&
            chrome.storage.local
        ) {
            patchStorageLocal(chrome.storage.local);
        }
        if (
            typeof browser !== "undefined" &&
            browser.storage &&
            browser.storage.local
        ) {
            patchStorageLocal(browser.storage.local);
        }
    } catch (e) {
        /* ignore */
    }
})();
