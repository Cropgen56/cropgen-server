export const SENT = (globalThis.__SENT__ ||= []);
export async function createNotification(n) { SENT.push({ templateName: n.templateName, type: n.type, parameters: n.parameters, referenceId: String(n.referenceId) }); return { ok: true }; }
