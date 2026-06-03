export {
  CLIENT_ID,
  ORGANIZATION_CODE,
  AUTH_ROUTE_PREFIX,
  BRAND_ID,
} from "./constants.js";
export { forceBiodropsBrand } from "./middleware/forceBrand.middleware.js";
export { buildBiodropsBrand } from "./brand/email.preset.js";
export {
  BIODROPS_DEMO_PHONE,
  BIODROPS_DEMO_OTP,
  BIODROPS_DEMO_USER_PROFILE,
  isBiodropsDemoPhone,
  isBiodropsDemoOtp,
  biodropsDemoOtpHash,
} from "./utils/demoAccount.js";
export {
  biodropsSendWhatsappOtp,
  biodropsVerifyWhatsappOtp,
  biodropsResendWhatsappOtp,
} from "./controllers/whatsapp.controller.js";
export { default as biodropsAuthRoutes } from "./routes/auth.routes.js";
export { default as biodropsRoutes } from "./routes/index.js";
export {
  getBiodropsRecommendations,
  resolveBiodropsCropKey,
  buildBiodropsAdvisoryPromptBlock,
} from "./advisory/index.js";
export {
  BIODROPS_BOKASHI_PRODUCT,
  BIODROPS_PRODUCT_CATALOG,
  KERALA_CROP_DOSAGES,
} from "./data/precisionFarmingKit.js";
