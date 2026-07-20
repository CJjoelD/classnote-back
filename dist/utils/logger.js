"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const COLORS = {
    debug: '\x1b[90m',
    info: '\x1b[36m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const isProd = process.env.NODE_ENV === 'production';
function timestamp() {
    return new Date().toISOString();
}
function format(level, tag, message) {
    if (isProd) {
        return JSON.stringify({ time: timestamp(), level, tag, message });
    }
    const color = COLORS[level];
    return `${color}${BOLD}[${timestamp()}] [${level.toUpperCase()}]${RESET} ${color}[${tag}]${RESET} ${message}`;
}
exports.logger = {
    debug(tag, message) {
        if (!isProd)
            console.debug(format('debug', tag, message));
    },
    info(tag, message) {
        console.info(format('info', tag, message));
    },
    warn(tag, message) {
        console.warn(format('warn', tag, message));
    },
    error(tag, message, err) {
        const suffix = err instanceof Error ? ` | ${err.message}` : '';
        console.error(format('error', tag, message + suffix));
    },
};
