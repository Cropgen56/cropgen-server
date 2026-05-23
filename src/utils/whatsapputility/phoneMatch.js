import User from "../../models/user.model.js";

export function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

/** Last 10 digits — match Indian numbers across 91 / +91 / local formats. */
export function phoneMatchKey(phone) {
  const digits = normalizePhoneDigits(phone);
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

/**
 * Mongo filter matching all stored variants of the same WhatsApp number.
 */
export function buildPhoneQueryFilter(phone) {
  const normalized = normalizePhoneDigits(phone);
  if (!normalized) return {};

  const variants = new Set([normalized]);
  const last10 = phoneMatchKey(normalized);
  if (last10.length === 10) {
    variants.add(last10);
    variants.add(`91${last10}`);
    variants.add(`0${last10}`);
  }

  return { phone: { $in: [...variants] } };
}

/** Match Meta `from` (e.g. 919322396236) to User.phone (+919322396236). */
export async function findUserByWhatsAppPhone(phone) {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return null;

  const exact = await User.findOne({ phone: `+${digits}` });
  if (exact) return exact;

  const last10 = digits.slice(-10);
  if (last10.length === 10) {
    return User.findOne({ phone: { $regex: `${last10}$` } });
  }

  return null;
}
