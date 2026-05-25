/** White-label client: CropyDeals (webview register / login) */

export const CLIENT_ID = "cropydeals";

/** `X-Client-App` / refresh-cookie key (see authUtils) */
export const CLIENT_APP_KEY = "cropydeals_web";

export const PRODUCTION_ORIGIN = "https://cropydeals.cropgenapp.com";

/** HTTP auth path (mounted under /v1/api/auth) — keep exact path for existing app */
export const AUTH_ROUTE_REGISTER_LOGIN = "/cropydeal-register-login";

/** User.clientSource for new / backfilled CropyDeals users */
export const DEFAULT_CLIENT_SOURCE = "webview";

/** JWT access token lifetime for CropyDeals (no refresh cookie flow) */
export const ACCESS_TOKEN_EXPIRES = "15d";
