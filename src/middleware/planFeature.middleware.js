import mongoose from "mongoose";
import UserSubscription from "../models/user-subscription.model.js";
import Operation from "../models/operation.model.js";
import FarmField from "../models/field.model.js";

/**
 * Server-side enforcement of a plan feature flag for a farm field.
 *
 * Mirrors the web/mobile UI locks (see cropgen-web-application
 * utils/subscriptionAccess.js) but is deliberately conservative: it only
 * denies when it can positively see an ACTIVE, non-expired subscription for the
 * field whose plan carries a features map with the flag not `true`. Anything it
 * cannot resolve (no subscription, trial/org/credit flows handled elsewhere, a
 * removed plan, a plan without a features map) falls through, so a paying user
 * is never locked out by incomplete data.
 */
export async function fieldLacksPlanFeature(fieldId, featureKey, now = new Date()) {
  if (!fieldId || !mongoose.isValidObjectId(fieldId)) return false;

  const subs = await UserSubscription.find({
    fieldId,
    status: "active",
  })
    .populate("planId")
    .sort({ startDate: -1, createdAt: -1 })
    .lean();

  const live = subs.find((s) => !(s.endDate && new Date(s.endDate) < now));
  const features = live?.planId?.features;
  if (!features || typeof features !== "object") return false;

  return features[featureKey] !== true;
}

const denied = (res, featureKey) =>
  res.status(403).json({
    success: false,
    code: "FEATURE_NOT_IN_PLAN",
    feature: featureKey,
    message: "This feature is not included in the farm's current plan.",
  });

/** Field id comes from a route param (default `farmFieldId`). */
export const requirePlanFeature =
  (featureKey, param = "farmFieldId") =>
  async (req, res, next) => {
    try {
      if (await fieldLacksPlanFeature(req.params[param], featureKey)) {
        return denied(res, featureKey);
      }
      return next();
    } catch (err) {
      console.error("requirePlanFeature:", err);
      return next(); // fail open: never block on an enforcement error
    }
  };

/** Field id is resolved from an operation document id (`:operationId`). */
export const requireOperationPlanFeature =
  (featureKey, param = "operationId") =>
  async (req, res, next) => {
    try {
      const id = req.params[param];
      if (!mongoose.isValidObjectId(id)) return next();
      const op = await Operation.findById(id).select("farmField").lean();
      if (op && (await fieldLacksPlanFeature(op.farmField, featureKey))) {
        return denied(res, featureKey);
      }
      return next();
    } catch (err) {
      console.error("requireOperationPlanFeature:", err);
      return next();
    }
  };

/**
 * For endpoints that take the field in the request body (`fieldId`) rather than
 * the URL (e.g. POST /soil-health/report).
 *
 * - `fieldId` sent: the caller must be authenticated and own the field (any
 *   non-farmer staff/admin/client role may act on a field they manage), and the
 *   field's active plan must include `featureKey`.
 * - `fieldId` missing: allowed for backward compatibility with already-installed
 *   app builds, until the `requireEnv` env var is set to "true".
 */
export const requireBodyFieldPlanFeature =
  (featureKey, { requireEnv } = {}) =>
  async (req, res, next) => {
    try {
      const fieldId = req.body?.fieldId;
      if (!fieldId) {
        if (requireEnv && process.env[requireEnv] === "true") {
          return res.status(400).json({
            success: false,
            code: "FIELD_ID_REQUIRED",
            message: "fieldId is required.",
          });
        }
        return next();
      }
      if (!mongoose.isValidObjectId(fieldId)) {
        return res.status(400).json({ success: false, message: "Invalid fieldId." });
      }
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: "Authentication is required when fieldId is provided.",
        });
      }
      const field = await FarmField.findById(fieldId).select("user").lean();
      if (!field) {
        return res.status(404).json({ success: false, message: "Field not found." });
      }
      const isOwner = String(field.user) === String(req.user.id);
      if (!isOwner && req.user.role === "farmer") {
        return res.status(403).json({
          success: false,
          message: "You can only generate reports for your own farms.",
        });
      }
      if (await fieldLacksPlanFeature(fieldId, featureKey)) {
        return denied(res, featureKey);
      }
      return next();
    } catch (err) {
      console.error("requireBodyFieldPlanFeature:", err);
      return next();
    }
  };
