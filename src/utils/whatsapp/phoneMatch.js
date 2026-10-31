import User from "../../models/user.model.js";
import WhatsAppMessage from "../../models/whatsapp-message.model.js";

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

/**
 * Match Meta `from` (e.g. 919322396236) to User.phone (+919322396236).
 * Phone is unique per org, so several accounts may share the number: the
 * farmer is replying to whichever one we messaged last.
 */
export async function findUserByWhatsAppPhone(phone) {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return null;

  let users = await User.find({ phone: `+${digits}` });
  const last10 = digits.slice(-10);
  if (!users.length && last10.length === 10) {
    users = await User.find({ phone: { $regex: `${last10}$` } });
  }
  if (users.length <= 1) return users[0] || null;

  const lastOutbound = await WhatsAppMessage.findOne({
    farmerId: { $in: users.map((u) => u._id) },
    direction: "OUT",
  })
    .sort({ createdAt: -1 })
    .select("farmerId")
    .lean();
  return (
    users.find((u) => String(u._id) === String(lastOutbound?.farmerId)) ||
    users.find((u) => !u.deletedAt) ||
    users[0]
  );
}
