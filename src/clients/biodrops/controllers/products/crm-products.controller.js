import BiodropsProduct from "../../models/biodrops-product.model.js";
import BiodropsOrder from "../../models/biodrops-order.model.js";
import { formatBiodropsProduct } from "../../utils/formatProduct.js";

function normalizeSku(sku) {
  return String(sku || "")
    .trim()
    .toLowerCase();
}

function buildProductSearchFilter(search) {
  if (!search?.trim()) return null;
  const q = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    $or: [
      { name: { $regex: q, $options: "i" } },
      { sku: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
    ],
  };
}

async function getPendingOrderCountByProductIds(productIds = []) {
  if (!Array.isArray(productIds) || !productIds.length) {
    return new Map();
  }

  const rows = await BiodropsOrder.aggregate([
    {
      $match: {
        "items.productId": { $in: productIds },
        fulfillmentStatus: { $in: ["pending", "confirmed", "shipped"] },
      },
    },
    { $unwind: "$items" },
    {
      $match: {
        "items.productId": { $in: productIds },
      },
    },
    {
      $group: {
        _id: "$items.productId",
        pendingOrderCount: { $sum: 1 },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [String(row._id), Number(row.pendingOrderCount) || 0]),
  );
}

export const listCrmProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    let query = {};
    if (status && ["draft", "active", "archived"].includes(status)) {
      query.status = status;
    }

    const searchFilter = buildProductSearchFilter(search);
    if (searchFilter) {
      query = { $and: [query, searchFilter] };
    }

    const [products, total] = await Promise.all([
      BiodropsProduct.find(query)
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      BiodropsProduct.countDocuments(query),
    ]);

    const productIds = products.map((p) => p._id);
    const pendingByProduct = await getPendingOrderCountByProductIds(productIds);

    return res.status(200).json({
      success: true,
      products: products.map((product) => {
        const formatted = formatBiodropsProduct(product);
        const pendingOrderCount = pendingByProduct.get(String(product._id)) || 0;
        return {
          ...formatted,
          pendingOrderCount,
          canDelete: pendingOrderCount === 0,
        };
      }),
      pagination: {
        page: parsedPage,
        currentPage: parsedPage,
        totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        total,
        limit: parsedLimit,
      },
    });
  } catch (error) {
    console.error("listCrmProducts:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load products.",
    });
  }
};

export const getCrmProductById = async (req, res) => {
  try {
    const product = await BiodropsProduct.findById(req.params.id).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    const pendingByProduct = await getPendingOrderCountByProductIds([product._id]);
    const pendingOrderCount = pendingByProduct.get(String(product._id)) || 0;

    return res.status(200).json({
      success: true,
      product: {
        ...formatBiodropsProduct(product),
        pendingOrderCount,
        canDelete: pendingOrderCount === 0,
      },
    });
  } catch (error) {
    console.error("getCrmProductById:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load product.",
    });
  }
};

export const createCrmProduct = async (req, res) => {
  try {
    const actorId = req.user?.id || req.user?._id;
    const {
      sku,
      name,
      description,
      tagline,
      images,
      priceMinor,
      currency,
      unit,
      category,
      stockQuantity,
      lowStockThreshold,
      weightGrams,
      status,
      applicationMethod,
      sortOrder,
    } = req.body;

    if (!sku?.trim() || !name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "sku and name are required",
      });
    }
    if (priceMinor == null || Number(priceMinor) < 0) {
      return res.status(400).json({
        success: false,
        message: "priceMinor is required",
      });
    }

    const product = await BiodropsProduct.create({
      sku: normalizeSku(sku),
      name: name.trim(),
      description: description || "",
      tagline: tagline || "",
      images: Array.isArray(images) ? images : [],
      priceMinor: Number(priceMinor),
      currency: currency || "INR",
      unit: unit || "per_unit",
      category: category || "other",
      stockQuantity:
        stockQuantity === "" || stockQuantity === undefined
          ? null
          : Number(stockQuantity),
      lowStockThreshold:
        lowStockThreshold === "" || lowStockThreshold === undefined
          ? null
          : Number(lowStockThreshold),
      weightGrams:
        weightGrams === "" || weightGrams === undefined
          ? null
          : Number(weightGrams),
      status: status || "draft",
      applicationMethod: applicationMethod || "",
      sortOrder: Number(sortOrder) || 0,
      createdBy: actorId,
      updatedBy: actorId,
    });

    return res.status(201).json({
      success: true,
      product: formatBiodropsProduct(product),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A product with this SKU already exists",
      });
    }
    console.error("createCrmProduct:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create product.",
    });
  }
};

export const updateCrmProduct = async (req, res) => {
  try {
    const actorId = req.user?.id || req.user?._id;
    const product = await BiodropsProduct.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const fields = [
      "name",
      "description",
      "tagline",
      "images",
      "priceMinor",
      "currency",
      "unit",
      "category",
      "status",
      "applicationMethod",
      "sortOrder",
      "weightGrams",
    ];

    for (const key of fields) {
      if (req.body[key] !== undefined) {
        product[key] = req.body[key];
      }
    }

    if (req.body.sku !== undefined) {
      product.sku = normalizeSku(req.body.sku);
    }

    if (req.body.stockQuantity !== undefined) {
      product.stockQuantity =
        req.body.stockQuantity === "" || req.body.stockQuantity === null
          ? null
          : Number(req.body.stockQuantity);
    }

    if (req.body.lowStockThreshold !== undefined) {
      product.lowStockThreshold =
        req.body.lowStockThreshold === "" || req.body.lowStockThreshold === null
          ? null
          : Number(req.body.lowStockThreshold);
    }

    if (req.body.weightGrams !== undefined) {
      product.weightGrams =
        req.body.weightGrams === "" || req.body.weightGrams === null
          ? null
          : Number(req.body.weightGrams);
    }

    if (req.body.priceMinor !== undefined) {
      product.priceMinor = Number(req.body.priceMinor);
    }

    product.updatedBy = actorId;
    await product.save();

    return res.status(200).json({
      success: true,
      product: formatBiodropsProduct(product),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A product with this SKU already exists",
      });
    }
    console.error("updateCrmProduct:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update product.",
    });
  }
};

export const archiveCrmProduct = async (req, res) => {
  try {
    const product = await BiodropsProduct.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const pendingByProduct = await getPendingOrderCountByProductIds([product._id]);
    const pendingOrderCount = pendingByProduct.get(String(product._id)) || 0;
    if (pendingOrderCount > 0) {
      return res.status(409).json({
        success: false,
        message: "Cannot delete product while pending orders exist for it.",
      });
    }

    await BiodropsProduct.deleteOne({ _id: product._id });

    return res.status(200).json({
      success: true,
      message: "Product deleted",
    });
  } catch (error) {
    console.error("archiveCrmProduct:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to archive product.",
    });
  }
};
