const verbose =
  String(process.env.LOG_VERBOSE || "").toLowerCase() === "true";

export function isVerboseLogging() {
  return verbose;
}

export const log = {
  info: (...args) => {
    if (verbose) console.log(...args);
  },
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

export function createStepLogger(prefix) {
  return (message) => {
    if (verbose) console.log(`${prefix} ${message}`);
  };
}
