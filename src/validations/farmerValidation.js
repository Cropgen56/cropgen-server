import Joi from "joi";
import pkg from "google-libphonenumber";

const { PhoneNumberUtil } = pkg;
const phoneUtil = PhoneNumberUtil.getInstance();

const phoneValidator = (value, helpers) => {
  try {
    const number = phoneUtil.parse(value);
    if (!phoneUtil.isValidNumber(number)) {
      return helpers.error("any.invalid");
    }
    return value;
  } catch (err) {
    return helpers.error("any.invalid");
  }
};

export const validateFarmer = (data) =>
  Joi.object({
    name: Joi.string().min(2).required(),
    contact: Joi.string().custom(phoneValidator).required(),
  }).validate(data);
