// Email address validation for campaigns
import validator from "validator";
import { domainToASCII } from "node:url"; // modern IDNA conversion
import dns from "node:dns"; // use promises API
const { resolveMx, resolveAny, resolveA } = dns.promises;

// simple in-memory cache (15 minutes)
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map();
function getCache(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() - v.t > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return v.v;
}
function setCache(key, value) {
  cache.set(key, { v: value, t: Date.now() });
}

// RFC-ish domain checks (labels/length)
function isValidDomainShape(domain) {
  if (!domain || domain.length > 253) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (!/^[a-zA-Z0-9-]+$/.test(label)) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
  }
  const tld = labels[labels.length - 1];
  return tld.length >= 2;
}

// best-effort DNS check with MX preferred, A fallback
async function hasMailPath(domain) {
  // try MX
  try {
    const mx = await resolveMx(domain);
    if (Array.isArray(mx) && mx.length > 0) return true;
  } catch (_) {}
  // some resolvers block MX: try ANY (may throw) — optional
  try {
    const any = await resolveAny(domain);
    if (Array.isArray(any) && any.some((r) => r && typeof r === "object"))
      return true;
  } catch (_) {}
  // fallback to A
  try {
    const a = await resolveA(domain);
    if (Array.isArray(a) && a.length > 0) return true;
  } catch (_) {}
  return false;
}

/**
 * Validate email deliverability:
 * 1) Syntax (validator.js)
 * 2) Domain punycode/shape
 * 3) DNS MX (preferred) or A (fallback)
 *
 * Returns: boolean
 */
export async function isDeliverableEmail(email) {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();

  // quick syntax
  if (!validator.isEmail(trimmed, { allow_display_name: false })) return false;

  // extract domain
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at >= trimmed.length - 1) return false;
  const local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);

  // IDN → ASCII
  try {
    const ascii = domainToASCII(domain);
    if (!ascii) return false;
    domain = ascii;
  } catch {
    return false;
  }

  // shape check
  if (!isValidDomainShape(domain)) return false;

  // optional env flag to skip DNS in dev/test (defaults to false)
  if (
    String(process.env.EMAIL_VALIDATE_DNS || "true").toLowerCase() !== "true"
  ) {
    return true;
  }

  // cache by domain
  const cached = getCache(domain);
  if (cached !== null) return cached;

  const ok = await hasMailPath(domain);
  setCache(domain, ok);
  return ok;
}
