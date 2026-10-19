import { getFarmerCardSummaries } from "../../services/acreEntitlement.service.js";
import { assertCrmFarmerAccess } from "../../services/crmSubscription.service.js";

export async function listCrmFarmerAccessCards(req, res) {
  try {
    const { id } = req.params;
    await assertCrmFarmerAccess(req, id);

    const data = await getFarmerCardSummaries(id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    const statusCode = error.status || 500;
    if (statusCode >= 500) console.error("listCrmFarmerAccessCards:", error);
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to fetch farmer cards",
    });
  }
}
