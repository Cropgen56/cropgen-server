import { t } from "../../utils/i18n/advisoryLocale.js";

/** DD/MM — avoids month names that would need translation. */
export function formatDayMonth(iso) {
  if (!iso) return "";
  const [, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}`;
}

export function pestName(targetId, rules, lang) {
  const key = `pest_${targetId}`;
  const text = t(key, lang);
  return text === key ? rules.targets[targetId]?.name || targetId : text;
}

/** WhatsApp template params: no newlines/tabs, max 4 consecutive spaces, cut on a word boundary. */
export function sanitizeParam(value, maxChars = 160) {
  let text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(" ");
  text = (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/u, "");
  return `${text}…`;
}

export function productLabel(product) {
  if (!product) return "";
  return product.dose ? `${product.name} (${product.dose})` : product.name;
}
