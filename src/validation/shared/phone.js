import pkg from "google-libphonenumber";

const { PhoneNumberUtil } = pkg;
const phoneUtil = PhoneNumberUtil.getInstance();

/** Joi custom validator for E.164-style numbers with libphonenumber check. */
export function phoneValidator(value, helpers) {
  try {
    const number = phoneUtil.parse(value);
    if (!phoneUtil.isValidNumber(number)) {
      return helpers.error("any.invalid");
    }
    return value;
  } catch {
    return helpers.error("any.invalid");
  }
}
