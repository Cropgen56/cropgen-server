export function formatBiodropsProduct(doc) {
  if (!doc) return null;
  const p = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(p._id),
    sku: p.sku,
    name: p.name,
    description: p.description || "",
    tagline: p.tagline || "",
    images: p.images || [],
    priceMinor: p.priceMinor,
    price: p.priceMinor / 100,
    currency: p.currency || "INR",
    unit: p.unit,
    category: p.category,
    stockQuantity: p.stockQuantity,
    lowStockThreshold: p.lowStockThreshold,
    weightGrams: p.weightGrams,
    status: p.status,
    applicationMethod: p.applicationMethod || "",
    sortOrder: p.sortOrder ?? 0,
    createdBy: p.createdBy ? String(p.createdBy) : null,
    updatedBy: p.updatedBy ? String(p.updatedBy) : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
