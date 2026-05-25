import { BRAND_ID } from "../constants.js";

/** Forces biodrops brand on auth requests (X-Client-Brand + body.clientBrand). */
export const forceBiodropsBrand = (req, _res, next) => {
  req.headers["x-client-brand"] = BRAND_ID;
  req.body = { ...(req.body || {}), clientBrand: BRAND_ID };
  next();
};
