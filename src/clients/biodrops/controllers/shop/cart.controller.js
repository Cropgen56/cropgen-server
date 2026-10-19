import {
  getUserCart,
  replaceUserCart,
  upsertCartItem,
  patchCartItemQuantity,
  removeCartItem,
  clearUserCart,
} from "../../services/shopCart.service.js";
import { assertBiodropsFarmer } from "../../utils/shopAuth.util.js";

function handleShopError(res, error, fallback) {
  const status = error.status || 500;
  if (status >= 500) console.error(fallback, error);
  return res.status(status).json({
    success: false,
    message: error.message || fallback,
  });
}

export const getShopCart = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const cart = await getUserCart(userId);
    return res.status(200).json({ success: true, ...cart });
  } catch (error) {
    return handleShopError(res, error, "Failed to load cart.");
  }
};

export const replaceShopCart = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const { items } = req.body;
    const cart = await replaceUserCart(userId, items);
    return res.status(200).json({ success: true, ...cart });
  } catch (error) {
    return handleShopError(res, error, "Failed to update cart.");
  }
};

export const addShopCartItem = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const { sku, quantity } = req.body;
    const cart = await upsertCartItem(userId, { sku, quantity });
    return res.status(200).json({ success: true, ...cart });
  } catch (error) {
    return handleShopError(res, error, "Failed to add cart item.");
  }
};

export const patchShopCartItem = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const { quantity } = req.body;
    const cart = await patchCartItemQuantity(
      userId,
      req.params.sku,
      quantity,
    );
    return res.status(200).json({ success: true, ...cart });
  } catch (error) {
    return handleShopError(res, error, "Failed to update cart item.");
  }
};

export const deleteShopCartItem = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const cart = await removeCartItem(userId, req.params.sku);
    return res.status(200).json({ success: true, ...cart });
  } catch (error) {
    return handleShopError(res, error, "Failed to remove cart item.");
  }
};

export const clearShopCart = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const cart = await clearUserCart(userId);
    return res.status(200).json({ success: true, ...cart });
  } catch (error) {
    return handleShopError(res, error, "Failed to clear cart.");
  }
};
