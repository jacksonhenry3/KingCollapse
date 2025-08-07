// js/logger.js
// A simple console logger with enable/disable functionality.

const logger = {
    _enabled: true, // Set to false to disable all console logging
    log(group, ...args) { if (this._enabled) console.log(`[${group}]`, ...args); },
    info(group, ...args) { if (this._enabled) console.info(`[${group}]`, ...args); },
    warn(group, ...args) { if (this._enabled) console.warn(`[${group}]`, ...args); },
    error(group, ...args) { if (this._enabled) console.error(`[${group}]`, ...args); },
    group(name) { if (this._enabled) console.group(name); },
    groupEnd() { if (this._enabled) console.groupEnd(); }
};

export default logger;
