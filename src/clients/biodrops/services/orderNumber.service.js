import BiodropsOrder from "../models/biodrops-order.model.js";

export async function generateBiodropsOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `BD-${year}-`;

  const latest = await BiodropsOrder.findOne({
    orderNumber: { $regex: `^${prefix}` },
  })
    .sort({ orderNumber: -1 })
    .select("orderNumber")
    .lean();

  let seq = 1;
  if (latest?.orderNumber) {
    const tail = latest.orderNumber.slice(prefix.length);
    const parsed = parseInt(tail, 10);
    if (!Number.isNaN(parsed)) seq = parsed + 1;
  }

  return `${prefix}${String(seq).padStart(5, "0")}`;
}
