/**
 * Wraps the existing stage-wise fertigation decision (utils/evidence/decisionEngine)
 * with farm history: never repeat a split that was already applied, and only
 * push a WhatsApp message once per stage window.
 */

function daysBetween(aISO, bISO) {
  return Math.round((new Date(`${bISO}T12:00:00Z`) - new Date(`${aISO}T12:00:00Z`)) / 86400000);
}

export function decideFertilizer({ baseDecision, windowKey, history, todayISO, settings }) {
  if (!baseDecision) return { action: "NONE", windowKey: windowKey || null, reasonCodes: ["no_base_decision"] };
  if (!baseDecision.shouldFertigate) {
    return { action: "NONE", windowKey: windowKey || null, base: baseDecision, reasonCodes: [baseDecision.reasonKey || "not_needed"] };
  }

  const blockDays = settings.fert_repeat_block_days ?? 21;
  const applied = history.fertilizers.find(
    (f) =>
      (windowKey && f.windowKey === windowKey) ||
      (!f.windowKey && daysBetween(f.date, todayISO) <= blockDays),
  );
  if (applied) {
    return {
      action: "ALREADY_APPLIED",
      windowKey: windowKey || null,
      appliedOn: applied.date,
      base: baseDecision,
      reasonCodes: ["already_applied_this_window"],
    };
  }

  const notifyWhatsApp = Boolean(windowKey) && history.lastNotifiedFertWindow !== windowKey;
  return {
    action: "APPLY",
    windowKey: windowKey || null,
    base: baseDecision,
    notifyWhatsApp,
    notifiedWindowKey: notifyWhatsApp ? windowKey : history.lastNotifiedFertWindow || null,
    reasonCodes: [baseDecision.reasonKey || "stage_schedule"],
  };
}
