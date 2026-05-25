/**
 * Display farm area with 2 digits after the decimal (e.g. 5.99 acre).
 */
export function formatAcresTwoDecimals(acre) {
  const n = Number(acre);
  if (!Number.isFinite(n)) return String(acre ?? "");
  return n.toFixed(2);
}
