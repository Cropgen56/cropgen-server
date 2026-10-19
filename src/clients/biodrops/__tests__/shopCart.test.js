function normalizeSku(sku) {
  return String(sku || "")
    .trim()
    .toLowerCase();
}

function mergeGuestItems(guest = [], server = []) {
  const skuQty = new Map(server.map(i => [i.sku, i.quantity]));
  for (const row of guest) {
    if (!row?.sku) continue;
    skuQty.set(row.sku, (skuQty.get(row.sku) || 0) + (row.quantity || 1));
  }
  return [...skuQty.entries()].map(([sku, quantity]) => ({sku, quantity}));
}

describe("shop cart merge", () => {
  test("normalizeSku lowercases and trims", () => {
    expect(normalizeSku("  ABC-123  ")).toBe("abc-123");
  });

  test("mergeGuestItems unions quantities", () => {
    const merged = mergeGuestItems(
      [{sku: "a", quantity: 2}],
      [{sku: "a", quantity: 1}, {sku: "b", quantity: 3}],
    );
    expect(merged).toEqual([
      {sku: "a", quantity: 3},
      {sku: "b", quantity: 3},
    ]);
  });
});
