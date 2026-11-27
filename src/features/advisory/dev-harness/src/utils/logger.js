const quiet = () => process.env.HARNESS_VERBOSE !== "1";
export function createStepLogger(prefix) { return (m) => { if (!quiet()) console.log(prefix, m); }; }
export const log = { info: (...a) => { if (!quiet()) console.log(...a); }, warn: (...a) => { if (!quiet()) console.warn(...a); } };
