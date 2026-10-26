import mongoose from "mongoose";
import FarmField from "../../../../models/field.model.js";
import { getField } from "../../../../controllers/field/field.controller.js";
import { getFarmAdvisories } from "../../../../features/advisory/controllers/advisory.controller.js";
import { assertCrmFarmerAccess } from "../../services/crmSubscription.service.js";

/**
 * The generic field/advisory controllers authorize by req.user's org, which
 * does not know about CRM geo or client scope. Scope is checked here with
 * assertCrmFarmerAccess first, then the generic controller runs without
 * req.user so the response shape stays identical to what the CRM already uses.
 */
function delegateWithoutViewer(req, params) {
  const scoped = Object.create(req);
  scoped.user = undefined;
  scoped.params = params;
  return scoped;
}

function sendScopeError(res, error, label) {
  const status = error.status || 500;
  if (status >= 500) console.error(`${label}:`, error);
  return res.status(status).json({
    success: false,
    message: error.message || "Failed to load farm data.",
  });
}

/** GET /crm/farmers/:id/fields — same payload as GET /v1/api/field/get-field/:userId. */
export async function getCrmFarmerFields(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid farmer ID." });
    }
    await assertCrmFarmerAccess(req, id);
    return getField(delegateWithoutViewer(req, { userId: id }), res);
  } catch (error) {
    return sendScopeError(res, error, "getCrmFarmerFields");
  }
}

/** GET /crm/fields/:fieldId/advisories — same payload as GET /v2/api/advisory/:farmFieldId. */
export async function getCrmFieldAdvisories(req, res) {
  try {
    const { fieldId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(fieldId)) {
      return res.status(400).json({ success: false, message: "Invalid field ID." });
    }
    const field = await FarmField.findById(fieldId).select("user").lean();
    if (!field?.user) {
      return res.status(404).json({ success: false, message: "Farm field not found." });
    }
    await assertCrmFarmerAccess(req, field.user);
    return getFarmAdvisories(
      delegateWithoutViewer(req, { farmFieldId: fieldId }),
      res,
    );
  } catch (error) {
    return sendScopeError(res, error, "getCrmFieldAdvisories");
  }
}
