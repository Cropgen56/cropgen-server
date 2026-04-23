import { writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLOW_JSON_PATH = path.join(__dirname, "advisoryflow.json");

function isFlowLoggingEnabled() {
  return process.env.ADVISORY_FLOW_LOG !== "0" && process.env.ADVISORY_FLOW_LOG !== "false";
}

function safeJsonPreview(value, maxChars = 4000) {
  try {
    const s = JSON.stringify(value, (_k, v) => {
      if (typeof v === "string" && v.length > 200) return `${v.slice(0, 200)}…(${v.length} chars)`;
      return v;
    });
    return s.length > maxChars ? `${s.slice(0, maxChars)}…[truncated]` : s;
  } catch {
    return String(value);
  }
}

function summarizeGeometry(geometry) {
  if (!geometry || geometry.type !== "Polygon") {
    return { type: geometry?.type ?? null, note: "non-polygon or missing" };
  }
  const ring = geometry.coordinates?.[0];
  return {
    type: "Polygon",
    exteriorRingPointCount: Array.isArray(ring) ? ring.length : 0,
    firstCoord: Array.isArray(ring) && ring[0] ? [ring[0][0], ring[0][1]] : null,
  };
}

/**
 * One entry per `/calculate/index` call for advisoryflow.json (verbose; no raw base64).
 * @param {Array<{ indexName: string, ok: boolean, data?: object, error?: string }>} indexRows
 */
export function summarizeOpticalIndexRowsForFlow(indexRows) {
  if (!Array.isArray(indexRows)) return [];

  return indexRows.map((row) => {
    const { indexName } = row;
    if (!row.ok) {
      return {
        indexName,
        ok: false,
        error: row.error || "request_failed",
      };
    }

    const raw = row.data && typeof row.data === "object" ? row.data : {};
    const sanitized = { ...raw };

    if (typeof sanitized.image_base64 === "string") {
      sanitized.image_base64_meta = {
        present: true,
        charLength: sanitized.image_base64.length,
      };
      delete sanitized.image_base64;
    }

    return {
      indexName,
      ok: true,
      /** Full `/calculate/index` body; `image_base64` replaced by `image_base64_meta`. */
      apiResponseSanitized: sanitized,
    };
  });
}

/**
 * Deep-clone values for advisoryflow.json (truncates very long strings and huge arrays).
 * @param {unknown} value
 * @param {{ maxStringLength?: number, maxDepth?: number, maxArrayLength?: number }} [options]
 */
export function cloneForAdvisoryFlowLog(value, options = {}) {
  const maxStringLength = options.maxStringLength ?? 12000;
  const maxDepth = options.maxDepth ?? 25;
  const maxArrayLength = options.maxArrayLength ?? 3000;

  function walk(v, depth) {
    if (depth > maxDepth) return "__max_depth__";
    if (v === null || v === undefined) return v;
    if (typeof v === "string") {
      return v.length > maxStringLength
        ? `${v.slice(0, maxStringLength)}…(+${v.length - maxStringLength} chars)`
        : v;
    }
    if (typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v === "bigint") return Number(v);
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) {
      const lim = Math.min(v.length, maxArrayLength);
      const out = [];
      for (let i = 0; i < lim; i += 1) {
        out.push(walk(v[i], depth + 1));
      }
      if (v.length > maxArrayLength) {
        out.push(`__truncated_array__:${v.length - maxArrayLength}_more_elements`);
      }
      return out;
    }
    if (typeof v === "object") {
      if (typeof v.toJSON === "function") {
        try {
          return walk(v.toJSON(), depth + 1);
        } catch {
          /* fall through */
        }
      }
      const out = {};
      for (const k of Object.keys(v)) {
        try {
          out[k] = walk(v[k], depth + 1);
        } catch {
          out[k] = "__unserializable__";
        }
      }
      return out;
    }
    return String(v);
  }

  return walk(value, 0);
}

/**
 * @param {{ farmFieldId?: string, geometryId?: string, language?: string, platform?: string }} meta
 */
export function createAdvisoryFlowContext(meta = {}) {
  const run = {
    meta: {
      startedAt: new Date().toISOString(),
      ...meta,
    },
    steps: [],
    outcome: null,
    error: null,
  };

  return {
    /**
     * @param {{
     *   step: string,
     *   service?: string,
     *   apiOrFn?: string,
     *   inputs?: unknown,
     *   rawResponseSummary?: unknown,
     *   calculated?: unknown,
     *   output?: unknown,
     *   notes?: string,
     * }} step
     */
    addStep(step) {
      run.steps.push({
        at: new Date().toISOString(),
        ...step,
      });
    },

    setOutcome(outcome) {
      run.outcome = outcome;
    },

    setError(err) {
      run.error = {
        message: err?.message || String(err),
        name: err?.name,
      };
    },

    async writeToDisk() {
      if (!isFlowLoggingEnabled()) return;
      run.meta.finishedAt = new Date().toISOString();
      await writeFile(FLOW_JSON_PATH, JSON.stringify(run, null, 2), "utf8");
    },
  };
}

export { summarizeGeometry, safeJsonPreview, FLOW_JSON_PATH };
