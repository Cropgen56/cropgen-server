const scheduled = (globalThis.__CRON__ ||= []);
export default { schedule: (expr, fn) => { scheduled.push({ expr, fn }); return { stop() {} }; } };
