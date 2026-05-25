import Joi from "joi";
import { phoneValidator } from "../shared/phone.js";

export const validateOrganization = (data) =>
  Joi.object({
    name: Joi.string().min(2).required(),
    contact: Joi.string().custom(phoneValidator).required(),
    email: Joi.string().email().required(),
  }).validate(data);
