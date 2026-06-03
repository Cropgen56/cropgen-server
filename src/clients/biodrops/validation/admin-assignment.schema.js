import Joi from "joi";
import { ADMIN_LEVELS } from "../constants/adminLevels.js";
import { ORGANIZATION_CODE } from "../constants.js";

const objectId = Joi.string().hex().length(24);

export const createAdminAssignmentSchema = Joi.object({
  userId: objectId.required(),
  level: Joi.string()
    .valid(...ADMIN_LEVELS)
    .required(),
  organizationCode: Joi.string()
    .trim()
    .uppercase()
    .default(ORGANIZATION_CODE),
  countryCode: Joi.string().trim().uppercase().max(3).allow(null, ""),
  stateCode: Joi.string().trim().uppercase().max(10).allow(null, ""),
  districtCode: Joi.string().trim().uppercase().max(32).allow(null, ""),
  managedOrganizationId: objectId.allow(null),
  managedOrganizationCode: Joi.string().trim().uppercase(),
});

export const listAdminAssignmentsSchema = Joi.object({
  status: Joi.string().valid("active", "suspended"),
  level: Joi.string().valid(...ADMIN_LEVELS),
  userId: objectId,
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
