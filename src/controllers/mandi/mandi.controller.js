import { getMandiRecords } from "../../services/mandi.service.js";

/** GET /v1/api/mandi/prices?commodity=Tomato */
export const getMandiPrices = async (req, res) => {
  const commodity = String(req.query.commodity || "").trim();
  if (!commodity || commodity.length > 60) {
    return res.status(400).json({
      success: false,
      message: "commodity is required (up to 60 characters)",
    });
  }
  try {
    const { records, date, isToday, source } = await getMandiRecords(commodity);
    // `date` is the single day the records are for; `isToday` is false when
    // today's prices are not available yet and the latest stored day is shown.
    return res.json({ success: true, records, date, isToday, source });
  } catch (err) {
    const rateLimited = err.status === 429;
    return res.status(rateLimited ? 429 : 502).json({
      success: false,
      code: rateLimited ? "MANDI_RATE_LIMITED" : "MANDI_UNAVAILABLE",
      message: rateLimited
        ? "The market-price service is busy. Please try again in a minute."
        : "Could not load market prices right now.",
    });
  }
};
