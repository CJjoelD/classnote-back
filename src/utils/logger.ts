type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const isProd = process.env.NODE_ENV === 'production';

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: LogLevel, tag: string, message: string): string {
  if (isProd) {
    return JSON.stringify({ time: timestamp(), level, tag, message });
  }
  const color = COLORS[level];
  return `${color}${BOLD}[${timestamp()}] [${level.toUpperCase()}]${RESET} ${color}[${tag}]${RESET} ${message}`;
}

export const logger = {
  debug(tag: string, message: string) {
    if (!isProd) console.debug(format('debug', tag, message));
  },

  info(tag: string, message: string) {
    console.info(format('info', tag, message));
  },

  warn(tag: string, message: string) {
    console.warn(format('warn', tag, message));
  },

  error(tag: string, message: string, err?: unknown) {
    const suffix = err instanceof Error ? ` | ${err.message}` : '';
    console.error(format('error', tag, message + suffix));
  },
};
