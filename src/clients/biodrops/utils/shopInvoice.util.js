function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInr(minor) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format((minor || 0) / 100);
}

export function buildShopInvoiceHtml(order) {
  const farmerName =
    order.farmer
      ? `${order.farmer.firstName || ""} ${order.farmer.lastName || ""}`.trim()
      : order.shippingAddress?.name || "—";

  const itemsHtml = (order.items || [])
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.sku)}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">${formatInr(item.lineTotalMinor)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${escapeHtml(order.orderNumber)}</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; color: #111; margin: 40px; }
    h1 { color: #0d5245; margin-bottom: 4px; }
    .muted { color: #666; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; font-size: 14px; }
    th { text-align: left; color: #374151; }
    .totals { margin-top: 20px; width: 320px; margin-left: auto; }
    .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
    .grand { font-weight: 700; font-size: 18px; color: #0d5245; }
  </style>
</head>
<body>
  <h1>Satagro.ai</h1>
  <p class="muted">BioDrops Shop Invoice</p>
  <p><strong>Invoice #:</strong> ${escapeHtml(order.orderNumber)}</p>
  <p><strong>Date:</strong> ${escapeHtml(new Date(order.paidAt || order.createdAt).toLocaleDateString("en-IN"))}</p>
  <p><strong>Bill to:</strong> ${escapeHtml(farmerName)}</p>
  <p><strong>Phone:</strong> ${escapeHtml(order.shippingAddress?.phone || order.farmer?.phone || "")}</p>
  <table>
    <thead>
      <tr><th>Product</th><th>SKU</th><th>Qty</th><th>Amount</th></tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${formatInr(order.subtotalMinor)}</span></div>
    <div><span>Shipping</span><span>${formatInr(order.shippingMinor)}</span></div>
    <div class="grand"><span>Total</span><span>${formatInr(order.totalMinor)}</span></div>
  </div>
  <p class="muted" style="margin-top:24px">Payment ref: ${escapeHtml(order.razorpayPaymentId || "—")}</p>
</body>
</html>`;
}
