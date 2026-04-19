const { SchedulerMethods } = require("./scheduler.js");
const { CaptchaMethods } = require("./captcha.js");
const { LoginFlowMethods } = require("./login-flow.js");
const { ServiceFlowMethods } = require("./service-flow.js");
const { BookingFlowMethods } = require("./booking-flow.js");
const { AccountRunnerMethods } = require("./account-runner.js");

/**
 * Orchestrator class. All behavior lives in the sibling modules and is attached
 * to the prototype below via Object.assign, so refactors can move methods between
 * modules without touching call sites.
 */
class BrowserAutomation {
    constructor(mainWindow = null) {
        this.browsers = new Map();
        this.isRunning = false;
        this.stopFlag = false;
        this.activeCount = 0;
        this.mainWindow = mainWindow;
    }
}

Object.assign(
    BrowserAutomation.prototype,
    SchedulerMethods,
    CaptchaMethods,
    LoginFlowMethods,
    ServiceFlowMethods,
    BookingFlowMethods,
    AccountRunnerMethods,
);

module.exports = { BrowserAutomation };
