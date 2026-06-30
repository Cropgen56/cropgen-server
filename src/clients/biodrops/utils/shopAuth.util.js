import User from "../../../models/user.model.js";
import { isBiodropsUser } from "../../../utils/organization/biodropsOrganization.js";

export async function assertBiodropsFarmer(req) {
  const userId = req.auth?.id || req.auth?._id || req.user?.id || req.user?._id;
  if (!userId) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  const user = await User.findById(userId)
    .populate("organization", "organizationCode code")
    .lean();

  if (!user || !isBiodropsUser(user)) {
    const err = new Error("Biodrops account required");
    err.status = 403;
    throw err;
  }

  return { userId, user };
}

export function validateShippingAddress(addr = {}) {
  const required = ["name", "phone", "line1", "city", "state", "pincode"];
  for (const key of required) {
    if (!String(addr[key] || "").trim()) {
      const err = new Error(`shippingAddress.${key} is required`);
      err.status = 400;
      throw err;
    }
  }

  const phoneDigits = String(addr.phone).replace(/\D/g, "");
  if (phoneDigits.length < 10 || phoneDigits.length > 12) {
    const err = new Error("shippingAddress.phone must be a valid 10-digit number");
    err.status = 400;
    throw err;
  }

  const pincodeDigits = String(addr.pincode).replace(/\D/g, "");
  if (pincodeDigits.length !== 6) {
    const err = new Error("shippingAddress.pincode must be a 6-digit pincode");
    err.status = 400;
    throw err;
  }

  return {
    name: String(addr.name).trim(),
    phone: phoneDigits.slice(-10),
    line1: String(addr.line1).trim(),
    line2: String(addr.line2 || "").trim(),
    city: String(addr.city).trim(),
    state: String(addr.state).trim(),
    pincode: pincodeDigits,
    country: String(addr.country || "IN").trim().toUpperCase(),
  };
}
