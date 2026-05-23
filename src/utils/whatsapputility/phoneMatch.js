import User from "../../models/user.model.js";

export function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
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
