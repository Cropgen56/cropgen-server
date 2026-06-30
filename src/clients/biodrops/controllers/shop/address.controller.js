import {
  listFarmerAddresses,
  createFarmerAddress,
  updateFarmerAddress,
  deleteFarmerAddress,
  setDefaultFarmerAddress,
} from "../../services/shopAddress.service.js";
import { assertBiodropsFarmer } from "../../utils/shopAuth.util.js";

function handleShopError(res, error, fallback) {
  const status = error.status || 500;
  if (status >= 500) console.error(fallback, error);
  return res.status(status).json({
    success: false,
    message: error.message || fallback,
  });
}

export const listShopAddresses = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const addresses = await listFarmerAddresses(userId);
    return res.status(200).json({ success: true, addresses });
  } catch (error) {
    return handleShopError(res, error, "Failed to load addresses.");
  }
};

export const createShopAddress = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const address = await createFarmerAddress(userId, req.body);
    return res.status(201).json({ success: true, address });
  } catch (error) {
    return handleShopError(res, error, "Failed to save address.");
  }
};

export const updateShopAddress = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const address = await updateFarmerAddress(
      userId,
      req.params.id,
      req.body,
    );
    return res.status(200).json({ success: true, address });
  } catch (error) {
    return handleShopError(res, error, "Failed to update address.");
  }
};

export const deleteShopAddress = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    await deleteFarmerAddress(userId, req.params.id);
    return res.status(200).json({ success: true });
  } catch (error) {
    return handleShopError(res, error, "Failed to delete address.");
  }
};

export const setDefaultShopAddress = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const address = await setDefaultFarmerAddress(userId, req.params.id);
    return res.status(200).json({ success: true, address });
  } catch (error) {
    return handleShopError(res, error, "Failed to set default address.");
  }
};
