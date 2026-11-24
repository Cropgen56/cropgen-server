import { webSearchTool } from "@openai/agents";
import { stateDisplayName } from "../utils/farmerContext.js";

/** Master switch: AGENT_WEB_SEARCH=false turns web search off everywhere. */
export function isWebSearchEnabled() {
  return String(process.env.AGENT_WEB_SEARCH ?? "true").toLowerCase() !== "false";
}

/**
 * Sources trusted for spray / fertiliser amounts: Indian government, research and university
 * sites (and FAO). The search API cannot filter by domain on every model, so this is enforced
 * AFTER the search: an amount from the web is only kept when a cited source is on this list.
 */
export const OFFICIAL_DOMAINS = [
  "gov.in", "nic.in", "ac.in", "res.in", "icar.org.in", "fao.org",
  "eagri.org", // Tamil Nadu Agricultural University portal
  "indianspices.com", // Spices Board of India
];

/** True if at least one cited source is an official site. */
export function hasOfficialSource(sources = []) {
  return sources.some((s) =>
    OFFICIAL_DOMAINS.some((d) => s.domain === d || s.domain.endsWith(`.${d}`)),
  );
}

const DOSE_QUESTION =
  /\b(dose|dosage|how much|how many|quantity|rate|per (acre|hectare|ha|litre|liter|plant|tree)|ml|grams?|gm|kg|spray|fungicide|insecticide|pesticide|herbicide|weedicide|urea|dap|npk|potash|fertili[sz]er|manure|micronutrient)\b|खुराक|मात्रा|फवारणी|फवारा|छिड़काव|खत|खाद|कीटनाशक|औषध/i;

/** Does the message look like it wants an amount of a chemical / fertiliser? */
export function looksLikeDoseQuestion(text) {
  return DOSE_QUESTION.test(String(text || ""));
}

const title = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/(^|[\s(/-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());

/** The farmer's region so results are local ("mandi price today" → their state/district). */
export function userLocationFor(farmerUser) {
  const loc = { type: "approximate", country: "IN" };
  const state = farmerUser?.state ? stateDisplayName(farmerUser.state) : "";
  if (state) loc.region = state;
  if (farmerUser?.district) loc.city = title(farmerUser.district);
  return loc;
}

/** @param {{ farmerUser?: object }} opts */
export function buildWebSearchTools({ farmerUser } = {}) {
  if (!isWebSearchEnabled()) return [];
  return [
    webSearchTool({
      searchContextSize: "medium",
      userLocation: userLocationFor(farmerUser),
    }),
  ];
}

/** Per-farmer daily cap on turns that used web search (cost / abuse control). */
export function createSearchBudget(limit = Number(process.env.AGENT_WEB_SEARCHES_PER_DAY) || 40) {
  const used = new Map();
  const today = () => new Date().toISOString().slice(0, 10);
  const entry = (key) => {
    const e = used.get(key);
    if (!e || e.day !== today()) {
      const fresh = { day: today(), n: 0 };
      used.set(key, fresh);
      return fresh;
    }
    return e;
  };
  return {
    allowed: (key) => entry(key).n < limit,
    record: (key) => {
      entry(key).n++;
    },
  };
}

const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

export function hasCitations(text) {
  return /\]\(https?:\/\//.test(String(text || ""));
}

const cleanUrl = (u) => {
  try {
    const url = new URL(u);
    url.searchParams.delete("utm_source");
    return url.toString().replace(/\?$/, "");
  } catch {
    return u;
  }
};

const domainOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/**
 * The chat shows plain text, so markdown links become numbered references:
 *   "…₹2,000 ([pib.gov.in](https://…))"  →  "…₹2,000 [1]"  +  a "Sources:" list at the end.
 * @returns {{ text: string, sources: { n: number, domain: string, url: string }[] }}
 */
export function formatWebCitations(text, label = "Sources") {
  const sources = [];
  const indexOf = new Map();
  let out = String(text || "").replace(/\(\s*(\[[^\]]+\]\(https?:\/\/[^)\s]+\)(?:\s*[,;]\s*\[[^\]]+\]\(https?:\/\/[^)\s]+\))*)\s*\)/g, (m, inner) =>
    inner.replace(MD_LINK, (mm, t, u) => mark(u)),
  );
  out = out.replace(MD_LINK, (m, t, u) => mark(u));

  function mark(u) {
    const url = cleanUrl(u);
    if (!indexOf.has(url)) {
      indexOf.set(url, sources.length + 1);
      sources.push({ n: sources.length + 1, domain: domainOf(url), url });
    }
    return ` [${indexOf.get(url)}]`;
  }

  out = out.replace(/ +\[(\d+)\]/g, " [$1]").replace(/\s+([.,;:!?])/g, "$1").trim();
  if (!sources.length) return { text: out, sources };
  const list = sources.map((s) => `[${s.n}] ${s.domain} — ${s.url}`).join("\n");
  return { text: `${out}\n\n${label}:\n${list}`, sources };
}

/** Cited sources (domain + url) found in a raw reply, without rewriting it. */
export function citedSources(text) {
  return formatWebCitations(text).sources;
}
