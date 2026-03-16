// Simple structured logger for the bot
// Levels: debug, info, warn, error
// Respects LOG_LEVEL env var (default: 'info')

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function formatMessage(level, context, args) {
  const prefix = `[${timestamp()}] [${level.toUpperCase()}]${context ? ` [${context}]` : ''}`;
  return [prefix, ...args];
}

/**
 * Create a logger instance with an optional context label.
 *
 * @param {string} [context] - A short label such as 'announce', 'movieStarter', etc.
 * @returns {{ debug: Function, info: Function, warn: Function, error: Function }}
 */
export function createLogger(context) {
  return {
    debug(...args) {
      if (currentLevel <= LEVELS.debug) {
        console.debug(...formatMessage('debug', context, args));
      }
    },

    info(...args) {
      if (currentLevel <= LEVELS.info) {
        console.log(...formatMessage('info', context, args));
      }
    },

    warn(...args) {
      if (currentLevel <= LEVELS.warn) {
        console.warn(...formatMessage('warn', context, args));
      }
    },

    /**
     * Log an error. If the second argument is an Error object its stack trace
     * will be printed automatically.
     */
    error(message, errorObj, ...rest) {
      if (currentLevel <= LEVELS.error) {
        const parts = formatMessage('error', context, [message]);
        if (errorObj instanceof Error) {
          console.error(...parts, '\n', errorObj.stack || errorObj, ...rest);
        } else if (errorObj !== undefined) {
          console.error(...parts, errorObj, ...rest);
        } else {
          console.error(...parts);
        }
      }
    },
  };
}
