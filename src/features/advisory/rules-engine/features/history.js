/**
 * Normalise farm history (completed operations + previously sent alerts) into
 * the shape the engines use. Pure: the DB query lives in
 * services/farmHistory.service.js.
 */

const TAG_RE = /\[rk:([^\]]+)\]/;

function parseTag(text) {
  const m = String(text || "").match(TAG_RE);
  if (!m) return {};
  const out = {};
  for (const part of m[1].split("|")) {
    const [k, ...rest] = part.split("=");
    if (k) out[k.trim()] = rest.join("=").trim();
  }
  return out;
}

/** Build the comment tag stored on an Operation so history can be read back exactly. */
export function buildRuleTag(fields) {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${String(v).replace(/[|\]]/g, " ")}`);
  return parts.length ? `[rk:${parts.join("|")}]` : "";
}

function activeIngredient(name) {
  return String(name || "")
    .toLowerCase()
    .split(/[\d%(]/)[0]
    .replace(/[^a-z ]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
}

/** Guess FRAC/IRAC group of a free-text product name using the product library. */
export function guessProductGroup(productName, rules) {
  const ai = activeIngredient(productName);
  if (!ai) return null;
  for (const targetId of Object.keys(rules.targets)) {
    for (const p of rules.productsFor(targetId)) {
      if (activeIngredient(p.name) === ai) return { group: p.group, targetId: p.targetId };
    }
  }
  return null;
}

function toISO(d) {
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * @param {object} p
 * @param {object[]} p.operations Operation docs (lean)
 * @param {object[]} [p.previousAdvisories] FarmAdvisory docs (lean) with `alerts`/`decisions`
 * @param {object} p.rules indexed rules
 */
export function normalizeHistory({ operations = [], previousAdvisories = [], rules }) {
  const sprays = [];
  const fertilizers = [];
  const irrigations = [];

  for (const op of operations) {
    const date = toISO(op.operationDate);
    if (!date) continue;
    const isAdvisory = op.source === "advisory";
    // Advisory suggestions only count once the farmer marked them completed.
    if (isAdvisory && op.progress !== "completed") continue;
    const tag = parseTag(op.comments);
    const type = op.operationType || "";
    const activity = op.advisoryActivityType || "";

    if (type === "spray" || activity === "SPRAY") {
      const guessed = tag.grp ? null : guessProductGroup(op.chemicalUsed, rules);
      sprays.push({
        date,
        productName: op.chemicalUsed || "",
        group: tag.grp || guessed?.group || null,
        targetId: tag.tgt || guessed?.targetId || null,
      });
    } else if (type === "fertilizer_application" || activity === "FERTIGATION") {
      fertilizers.push({ date, name: op.chemicalUsed || "", windowKey: tag.win || null });
    } else if (activity === "IRRIGATION" || type === "irrigation") {
      irrigations.push({ date });
    }
  }

  const alertsSent = [];
  let lastNotifiedFertWindow = null;
  for (const adv of previousAdvisories) {
    for (const a of adv.alerts || []) {
      if (a?.alertId && a?.sentAt) alertsSent.push({ alertId: a.alertId, sentAt: new Date(a.sentAt).toISOString() });
    }
    const win = adv.decisions?.fertilizer?.notifiedWindowKey;
    if (win && !lastNotifiedFertWindow) lastNotifiedFertWindow = win;
  }

  const byDateDesc = (a, b) => b.date.localeCompare(a.date);
  return {
    sprays: sprays.sort(byDateDesc),
    fertilizers: fertilizers.sort(byDateDesc),
    irrigations: irrigations.sort(byDateDesc),
    alertsSent,
    lastNotifiedFertWindow,
  };
}

export function emptyHistory() {
  return { sprays: [], fertilizers: [], irrigations: [], alertsSent: [], lastNotifiedFertWindow: null };
}
