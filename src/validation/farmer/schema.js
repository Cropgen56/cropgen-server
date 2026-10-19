import Joi from "joi";
import { phoneValidator } from "../shared/phone.js";

export const validateFarmer = (data) =>
  Joi.object({
    name: Joi.string().min(2).required(),
    contact: Joi.string().custom(phoneValidator).required(),
  }).validate(data);
