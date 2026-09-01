/**
 * Admin assignments store `stateCode` as the short ISO-style code the CRM's
 * location picker returns (satagro-crm/src/lib/location.js, backed by
 * location.cropgenapp.com — e.g. "KL" for Kerala). Farmer accounts capture
 * `state` as free text from the mobile app's own address flow, with no
 * shared vocabulary — real data has "KERALA", "TAMILNADU", "TAMIL NADU"
 * (two spellings for the same state), Devanagari script, etc.
 *
 * An exact-match filter on `state: stateCode` therefore never matches a real
 * farmer record and silently returns zero results for every region-scoped
 * BioDrops admin. This table maps each code to every farmer-stored spelling
 * seen in practice, so scope filters can match by $in instead of `===`.
 * Extend it as new spelling variants turn up in real data.
 */
export const STATE_CODE_ALIASES = {
  AN: ["ANDAMAN AND NICOBAR ISLANDS", "ANDAMAN & NICOBAR ISLANDS"],
  AP: ["ANDHRA PRADESH", "ANDHRAPRADESH"],
  AR: ["ARUNACHAL PRADESH", "ARUNACHALPRADESH"],
  AS: ["ASSAM"],
  BR: ["BIHAR"],
  CH: ["CHANDIGARH"],
  CT: ["CHHATTISGARH", "CHATTISGARH"],
  DN: [
    "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
    "DADRA & NAGAR HAVELI AND DAMAN & DIU",
  ],
  DL: ["DELHI", "NEW DELHI"],
  GA: ["GOA"],
  GJ: ["GUJARAT"],
  HR: ["HARYANA"],
  HP: ["HIMACHAL PRADESH", "HIMACHALPRADESH"],
  JK: ["JAMMU AND KASHMIR", "JAMMU & KASHMIR", "JAMMU KASHMIR"],
  JH: ["JHARKHAND"],
  KA: ["KARNATAKA"],
  KL: ["KERALA"],
  LA: ["LADAKH"],
  LD: ["LAKSHADWEEP"],
  MP: ["MADHYA PRADESH", "MADHYAPRADESH", "मध्यप्रदेश", "मध्य प्रदेश"],
  MH: ["MAHARASHTRA"],
  MN: ["MANIPUR"],
  ML: ["MEGHALAYA"],
  MZ: ["MIZORAM"],
  NL: ["NAGALAND"],
  OR: ["ODISHA", "ORISSA"],
  PY: ["PUDUCHERRY", "PONDICHERRY"],
  PB: ["PUNJAB"],
  RJ: ["RAJASTHAN"],
  SK: ["SIKKIM"],
  TN: ["TAMIL NADU", "TAMILNADU"],
  TG: ["TELANGANA"],
  TS: ["TELANGANA"],
  TR: ["TRIPURA"],
  UP: ["UTTAR PRADESH", "UTTARPRADESH"],
  UK: ["UTTARAKHAND", "UTTARANCHAL"],
  UT: ["UTTARAKHAND", "UTTARANCHAL"],
  WB: ["WEST BENGAL", "WESTBENGAL"],
};

/**
 * Every value a farmer's `state` field might hold for the given assignment
 * stateCode: the code itself (some farmer records already store the code
 * verbatim) plus every known full-name spelling.
 */
export function stateCodeToNameVariants(stateCode) {
  const code = String(stateCode || "").trim().toUpperCase();
  if (!code) return [];
  const aliases = STATE_CODE_ALIASES[code] || [];
  return [...new Set([code, ...aliases])];
}
