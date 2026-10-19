import BiodropsCart from "../models/biodrops-cart.model.js";
import BiodropsProduct from "../models/biodrops-product.model.js";
import { formatBiodropsProduct } from "../utils/formatProduct.js";
import { resolveCartItems } from "./shopCheckout.service.js";

function normalizeSku(sku) {
  return String(sku || "")
    .trim()
    .toLowerCase();
}

function normalizeQuantity(qty) {
  return Math.max(1, parseInt(qty, 10) || 1);
}

export async function getOrCreateCart(userId) {
  let cart = await BiodropsCart.findOne({ userId });
  if (!cart) {
    cart = await BiodropsCart.create({ userId, items: [] });
  }
  return cart;
}

export function formatCartLine(resolvedItem, product) {
  const formatted = product ? formatBiodropsProduct(product) : null;
  return {
    sku: resolvedItem.sku,
    name: resolvedItem.name,
    quantity: resolvedItem.quantity,
    price: resolvedItem.unitPriceMinor / 100,
    priceMinor: resolvedItem.unitPriceMinor,
    lineTotal: resolvedItem.lineTotalMinor / 100,
    lineTotalMinor: resolvedItem.lineTotalMinor,
    imageUrl: formatted?.images?.[0]?.url || null,
    unit: formatted?.unit || null,
    stockQuantity: resolvedItem.stockQuantity ?? formatted?.stockQuantity ?? null,
  };
}

export async function buildCartResponse(cartDoc) {
  const rawItems = cartDoc?.items || [];
  if (!rawItems.length) {
    return {
      items: [],
      rawItems: [],
      subtotalMinor: 0,
      subtotal: 0,
    };
  }

  try {
    const resolved = await resolveCartItems(rawItems);
    const products = await BiodropsProduct.find({
      sku: { $in: resolved.items.map((i) => i.sku) },
    }).lean();
    const bySku = new Map(products.map((p) => [p.sku, p]));

    return {
      items: resolved.items.map((row) =>
        formatCartLine(row, bySku.get(row.sku)),
      ),
      rawItems: rawItems.map((i) => ({
        sku: i.sku,
        quantity: i.quantity,
      })),
      subtotalMinor: resolved.subtotalMinor,
      subtotal: resolved.subtotalMinor / 100,
    };
  } catch (error) {
    if (error.status === 400) {
      return {
        items: [],
        rawItems: rawItems.map((i) => ({
          sku: i.sku,
          quantity: i.quantity,
        })),
        subtotalMinor: 0,
        subtotal: 0,
        warning: error.message,
      };
    }
    throw error;
  }
}

export async function getUserCart(userId) {
  const cart = await getOrCreateCart(userId);
  return buildCartResponse(cart);
}

export async function replaceUserCart(userId, items = []) {
  const normalized = [];
  const skuQty = new Map();

  for (const row of items || []) {
    const sku = normalizeSku(row.sku);
    if (!sku) continue;
    const qty = normalizeQuantity(row.quantity);
    skuQty.set(sku, (skuQty.get(sku) || 0) + qty);
  }

  for (const [sku, quantity] of skuQty.entries()) {
    normalized.push({ sku, quantity });
  }

  const cart = await BiodropsCart.findOneAndUpdate(
    { userId },
    { items: normalized },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return buildCartResponse(cart);
}

export async function upsertCartItem(userId, { sku, quantity }) {
  const normalizedSku = normalizeSku(sku);
  if (!normalizedSku) {
    const err = new Error("sku is required");
    err.status = 400;
    throw err;
  }

  const cart = await getOrCreateCart(userId);
  const qty = normalizeQuantity(quantity);
  const existing = cart.items.find((i) => i.sku === normalizedSku);

  if (existing) {
    existing.quantity = qty;
  } else {
    cart.items.push({ sku: normalizedSku, quantity: qty });
  }

  await cart.save();
  return buildCartResponse(cart);
}

export async function patchCartItemQuantity(userId, sku, quantity) {
  const normalizedSku = normalizeSku(sku);
  const cart = await getOrCreateCart(userId);
  const qty = normalizeQuantity(quantity);

  if (qty <= 0) {
    cart.items = cart.items.filter((i) => i.sku !== normalizedSku);
  } else {
    const existing = cart.items.find((i) => i.sku === normalizedSku);
    if (!existing) {
      const err = new Error("Cart item not found");
      err.status = 404;
      throw err;
    }
    existing.quantity = qty;
  }

  await cart.save();
  return buildCartResponse(cart);
}

export async function removeCartItem(userId, sku) {
  const normalizedSku = normalizeSku(sku);
  const cart = await getOrCreateCart(userId);
  cart.items = cart.items.filter((i) => i.sku !== normalizedSku);
  await cart.save();
  return buildCartResponse(cart);
}

export async function clearUserCart(userId) {
  const cart = await BiodropsCart.findOneAndUpdate(
    { userId },
    { items: [] },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return buildCartResponse(cart);
}

export async function getCartItemsForCheckout(userId) {
  const cart = await getOrCreateCart(userId);
  return cart.items.map((i) => ({ sku: i.sku, quantity: i.quantity }));
}

export async function mergeGuestCartIntoUser(userId, guestItems = []) {
  if (!guestItems?.length) {
    return getUserCart(userId);
  }

  const existing = await getOrCreateCart(userId);
  const skuQty = new Map(existing.items.map((i) => [i.sku, i.quantity]));

  for (const row of guestItems) {
    const sku = normalizeSku(row.sku);
    if (!sku) continue;
    const qty = normalizeQuantity(row.quantity);
    skuQty.set(sku, (skuQty.get(sku) || 0) + qty);
  }

  const merged = [...skuQty.entries()].map(([sku, quantity]) => ({
    sku,
    quantity,
  }));

  return replaceUserCart(userId, merged);
}
