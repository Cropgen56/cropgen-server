import Operation from "../../../models/operation.model.js";
import FarmAdvisory from "../models/farmAdvisory.model.js";
import { emptyHistory, normalizeHistory } from "../rules-engine/features/history.js";

const HISTORY_DAYS = Number(process.env.ADVISORY_HISTORY_DAYS) || 120;
const MAX_OPERATIONS = 300;
const MAX_ADVISORIES = 15;

function toDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Load what has actually happened on the field (completed sprays, fertilizer,
 * irrigation, plus alerts already sent) so the rules engine can rotate spray
 * chemistry, avoid repeating a fertilizer split and respect alert cooldowns.
 *
 * Never throws: on any database error the engine simply runs without history.
 *
 * @param {object} p
 * @param {string|object} p.farmFieldId
 * @param {string|object|null} [p.cropInstanceId]
 * @param {object} p.rules indexed rules (rules-engine/rulesStore.js)
 * @param {(msg: string) => void} [p.log]
 */
export async function loadFarmHistory({ farmFieldId, cropInstanceId = null, rules, log = () => {} }) {
  const since = new Date(Date.now() - HISTORY_DAYS * 86400000);
  try {
    const [operations, previousAdvisories] = await Promise.all([
      // operationDate is stored as YYYY-MM-DD by the advisory sync but may be a
      // Date for manually created operations, so filter by date in JS.
      Operation.find({ farmField: farmFieldId })
        .sort({ createdAt: -1 })
        .limit(MAX_OPERATIONS)
        .select("operationType source advisoryActivityType progress chemicalUsed chemicalQuantity comments operationDate createdAt")
        .lean(),
      FarmAdvisory.find({
        farmFieldId,
        ...(cropInstanceId ? { cropInstanceId } : {}),
        createdAt: { $gte: since },
      })
        .sort({ createdAt: -1 })
        .limit(MAX_ADVISORIES)
        .select("alerts decisions createdAt")
        .lean(),
    ]);

    const recentOps = (operations || []).filter((op) => {
      const d = toDate(op.operationDate) || toDate(op.createdAt);
      return d && d >= since;
    });
    const history = normalizeHistory({ operations: recentOps, previousAdvisories: previousAdvisories || [], rules });
    log(
      `history: ${history.sprays.length} sprays, ${history.fertilizers.length} fertilizer, ` +
        `${history.irrigations.length} irrigations, ${history.alertsSent.length} alerts`,
    );
    return history;
  } catch (err) {
    log(`history: unavailable (${err?.message || err}) - engine runs without it`);
    return emptyHistory();
  }
}
