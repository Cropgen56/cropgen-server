import BiodropsFarmerAddress from "../models/biodrops-farmer-address.model.js";
import { validateShippingAddress } from "../utils/shopAuth.util.js";

function formatAddress(doc) {
  if (!doc) return null;
  const a = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(a._id),
    label: a.label || "",
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 || "",
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    country: a.country || "IN",
    isDefault: !!a.isDefault,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

async function clearDefaultFlag(userId, exceptId = null) {
  const query = { userId, isDefault: true };
  if (exceptId) {
    query._id = { $ne: exceptId };
  }
  await BiodropsFarmerAddress.updateMany(query, { isDefault: false });
}

export async function listFarmerAddresses(userId) {
  const rows = await BiodropsFarmerAddress.find({ userId })
    .sort({ isDefault: -1, updatedAt: -1 })
    .lean();
  return rows.map(formatAddress);
}

export async function createFarmerAddress(userId, payload) {
  const data = validateShippingAddress(payload);
  const label = String(payload.label || "").trim();
  const isDefault = !!payload.isDefault;

  const count = await BiodropsFarmerAddress.countDocuments({ userId });
  const shouldDefault = isDefault || count === 0;

  if (shouldDefault) {
    await clearDefaultFlag(userId);
  }

  const created = await BiodropsFarmerAddress.create({
    userId,
    label,
    ...data,
    isDefault: shouldDefault,
  });

  return formatAddress(created);
}

export async function updateFarmerAddress(userId, addressId, payload) {
  const existing = await BiodropsFarmerAddress.findOne({
    _id: addressId,
    userId,
  });

  if (!existing) {
    const err = new Error("Address not found");
    err.status = 404;
    throw err;
  }

  const data = validateShippingAddress({ ...existing.toObject(), ...payload });
  existing.name = data.name;
  existing.phone = data.phone;
  existing.line1 = data.line1;
  existing.line2 = data.line2;
  existing.city = data.city;
  existing.state = data.state;
  existing.pincode = data.pincode;
  existing.country = data.country;
  if (payload.label !== undefined) {
    existing.label = String(payload.label || "").trim();
  }

  if (payload.isDefault === true) {
    await clearDefaultFlag(userId, existing._id);
    existing.isDefault = true;
  }

  await existing.save();
  return formatAddress(existing);
}

export async function deleteFarmerAddress(userId, addressId) {
  const deleted = await BiodropsFarmerAddress.findOneAndDelete({
    _id: addressId,
    userId,
  });

  if (!deleted) {
    const err = new Error("Address not found");
    err.status = 404;
    throw err;
  }

  if (deleted.isDefault) {
    const next = await BiodropsFarmerAddress.findOne({ userId }).sort({
      updatedAt: -1,
    });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }

  return { deleted: true };
}

export async function setDefaultFarmerAddress(userId, addressId) {
  const existing = await BiodropsFarmerAddress.findOne({
    _id: addressId,
    userId,
  });

  if (!existing) {
    const err = new Error("Address not found");
    err.status = 404;
    throw err;
  }

  await clearDefaultFlag(userId);
  existing.isDefault = true;
  await existing.save();
  return formatAddress(existing);
}
