import Joi from "joi";
import { CROP_LIFECYCLE_TYPES, CROP_ROLES } from "../../constants/farmEnums.js";

export const fieldCropCreateSchema = Joi.object({
  cropName: Joi.string().trim().min(1).max(100).required().messages({
    "string.empty": "Crop name is required",
    "any.required": "Crop name is required",
  }),
  variety: Joi.string().trim().allow("").default(""),
  cropLifecycleType: Joi.string()
    .valid(...CROP_LIFECYCLE_TYPES)
    .default("seasonal")
    .messages({
      "any.only": `Crop lifecycle type must be one of: ${CROP_LIFECYCLE_TYPES.join(", ")}`,
    }),
  cropRole: Joi.string()
    .valid(...CROP_ROLES)
    .default("main")
    .messages({
      "any.only": `Crop role must be one of: ${CROP_ROLES.join(", ")}`,
    }),
  startDate: Joi.date().required().messages({
    "any.required": "Start date is required",
    "date.base": "Start date must be a valid date",
  }),
  expectedEndDate: Joi.date().min(Joi.ref("startDate")).messages({
    "date.min": "Expected end date cannot be before the start date",
  }),
  actualEndDate: Joi.date().min(Joi.ref("startDate")).messages({
    "date.min": "Actual end date cannot be before the start date",
  }),
  isActive: Joi.boolean().default(true),
})
  .custom((value, helpers) => {
    if (value.cropLifecycleType === "seasonal" && !value.expectedEndDate) {
      return helpers.error("any.custom", {
        message: "Expected end date is required for seasonal crops",
      });
    }
    return value;
  }, "seasonal crop requires expectedEndDate")
  .messages({
    "any.custom": "{{#message}}",
  });

// Same shape, but every field optional (partial update / PATCH).
export const fieldCropUpdateSchema = Joi.object({
  cropName: Joi.string().trim().min(1).max(100),
  variety: Joi.string().trim().allow(""),
  cropLifecycleType: Joi.string().valid(...CROP_LIFECYCLE_TYPES),
  cropRole: Joi.string().valid(...CROP_ROLES),
  startDate: Joi.date(),
  expectedEndDate: Joi.date().allow(null),
  actualEndDate: Joi.date().allow(null),
  isActive: Joi.boolean(),
}).min(1);
