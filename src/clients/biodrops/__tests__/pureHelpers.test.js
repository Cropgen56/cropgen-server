import { buildShopInvoiceHtml } from "../utils/shopInvoice.util.js";
import { validateShippingAddress } from "../utils/shopAuth.util.js";
import { formatBiodropsOrder } from "../utils/formatOrder.js";
import { formatBiodropsProduct } from "../utils/formatProduct.js";
import {
  formatCrmSubscriptionRow,
  resolveExpiryDate,
} from "../utils/subscriptionRowFormat.js";

describe("buildShopInvoiceHtml", () => {
  const order = {
    orderNumber: "BD-2026-00007",
    paidAt: "2026-11-20T10:00:00Z",
    farmer: { firstName: "Asha", lastName: "Patil", phone: "9000000000" },
    shippingAddress: { phone: "9111111111" },
    items: [
      { name: "Neem <oil>", sku: "NEEM-1", quantity: 2, lineTotalMinor: 150000 },
    ],
  };

  test("escapes user-supplied text so it cannot inject markup", () => {
    const html = buildShopInvoiceHtml(order);
    expect(html).toContain("Neem &lt;oil&gt;");
    expect(html).not.toContain("Neem <oil>");
  });

  test("formats amounts in rupees from minor units", () => {
    const html = buildShopInvoiceHtml(order);
    expect(html).toContain("₹1,500");
  });

  test("uses the farmer's name, or the shipping name when there is no farmer", () => {
    expect(buildShopInvoiceHtml(order)).toContain("Asha Patil");
    const noFarmer = { ...order, farmer: null, shippingAddress: { name: "Ravi", phone: "9111111111" } };
    expect(buildShopInvoiceHtml(noFarmer)).toContain("Ravi");
  });
});

describe("validateShippingAddress", () => {
  const valid = {
    name: "  Asha  ",
    phone: "+91 98765-43210",
    line1: "Plot 4",
    city: "Pune",
    state: "MH",
    pincode: "411 001",
  };

  test("normalises a valid address", () => {
    expect(validateShippingAddress(valid)).toEqual({
      name: "Asha",
      phone: "9876543210",
      line1: "Plot 4",
      line2: "",
      city: "Pune",
      state: "MH",
      pincode: "411001",
      country: "IN",
    });
  });

  test("rejects a missing required field with 400", () => {
    expect(() => validateShippingAddress({ ...valid, city: "" })).toThrow(
      "shippingAddress.city is required",
    );
    try {
      validateShippingAddress({ ...valid, city: "" });
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  test("rejects a phone number that is too short", () => {
    expect(() => validateShippingAddress({ ...valid, phone: "12345" })).toThrow(
      "valid 10-digit number",
    );
  });

  test("rejects a pincode that is not six digits", () => {
    expect(() => validateShippingAddress({ ...valid, pincode: "4110" })).toThrow(
      "6-digit pincode",
    );
  });
});

describe("formatBiodropsOrder", () => {
  test("returns null for a missing order", () => {
    expect(formatBiodropsOrder(null)).toBeNull();
  });

  test("converts minor units to rupees", () => {
    const out = formatBiodropsOrder({
      _id: "o1",
      orderNumber: "BD-2026-00001",
      userId: "u1",
      items: [{ productId: "p1", sku: "S", name: "N", quantity: 2, unitPriceMinor: 2500, lineTotalMinor: 5000 }],
      subtotalMinor: 5000,
      shippingMinor: 0,
      totalMinor: 5000,
    });
    expect(out.items[0]).toMatchObject({ unitPrice: 25, lineTotal: 50 });
    expect(out.subtotal).toBe(50);
    expect(out.total).toBe(50);
    expect(out.currency).toBe("INR");
    expect(out.paymentMethod).toBe("online");
  });

  test("adds farmer details only when asked for them", () => {
    const doc = {
      _id: "o1",
      userId: { _id: "u9", firstName: "Asha", lastName: "P", phone: "9000000000", email: "a@x.in" },
      items: [],
      subtotalMinor: 0,
      totalMinor: 0,
    };
    expect(formatBiodropsOrder(doc).farmer).toBeUndefined();
    const withUser = formatBiodropsOrder(doc, { includeUser: true });
    expect(withUser.farmer).toMatchObject({ id: "u9", firstName: "Asha" });
    expect(withUser.userId).toBe("u9");
  });
});

describe("formatBiodropsProduct", () => {
  test("converts price and fills defaults", () => {
    const out = formatBiodropsProduct({
      _id: "p1",
      sku: "NEEM-1",
      name: "Neem oil",
      priceMinor: 7500,
      unit: "L",
      category: "bio",
      stockQuantity: 10,
      status: "active",
    });
    expect(out).toMatchObject({ id: "p1", price: 75, currency: "INR", description: "", sortOrder: 0, createdBy: null });
  });
});

describe("formatCrmSubscriptionRow", () => {
  test("uses the farmer's name, then phone, then a placeholder", () => {
    const base = { _id: "s1", billingCycle: "annual", totalAmountMinor: 120000 };
    expect(formatCrmSubscriptionRow({ ...base, userId: { firstName: "Asha", lastName: "P" } }).farmer.name).toBe("Asha P");
    expect(formatCrmSubscriptionRow({ ...base, userId: { phone: "9000000000" } }).farmer.name).toBe("9000000000");
    expect(formatCrmSubscriptionRow({ ...base, userId: null }).farmer.name).toBe("Farmer");
  });

  test("formats the amount in rupees and labels trials", () => {
    const row = formatCrmSubscriptionRow({ _id: "s1", billingCycle: "trial", totalAmountMinor: 0 });
    expect(row.billingLabel).toBe("Trial");
    expect(row.amount).toBe("₹0");
    const annual = formatCrmSubscriptionRow({ _id: "s2", billingCycle: "annual", totalAmountMinor: 120000 });
    expect(annual.amount).toBe("₹1,200");
    expect(annual.billingLabel).toBe("Annual");
  });
});

describe("resolveExpiryDate", () => {
  test("prefers endDate, then currentPeriodEnd, then trialEndsAt", () => {
    expect(resolveExpiryDate({ endDate: "a", currentPeriodEnd: "b", trialEndsAt: "c" })).toBe("a");
    expect(resolveExpiryDate({ currentPeriodEnd: "b", trialEndsAt: "c" })).toBe("b");
    expect(resolveExpiryDate({ trialEndsAt: "c" })).toBe("c");
    expect(resolveExpiryDate({})).toBeNull();
  });
});
