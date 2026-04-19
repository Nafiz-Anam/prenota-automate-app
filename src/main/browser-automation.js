// Backwards-compat shim — real implementation lives under ./automation/.
// Existing callers (main.js) can keep `require("./browser-automation.js")`.
module.exports = require("./automation/index.js");
