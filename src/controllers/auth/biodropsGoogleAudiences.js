/**
 * Biodrops Google OAuth audiences (idToken `aud`).
 * Accept web + native Firebase web clients so satagro-app and biodrops-web share one user pool.
 */
export function resolveBiodropsGoogleAudiences() {
  const audiences = [
    process.env.BIODROPS_GOOGLE_CLIENT_ID,
    process.env.BIODROPS_GOOGLE_MOBILE_WEB_CLIENT_ID,
    process.env.BIODROPS_GOOGLE_WEB_CLIENT_ID,
    process.env.BIODROPS_GOOGLE_OAUTH_CLIENT_ID,
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean);

  return [...new Set(audiences)];
}
