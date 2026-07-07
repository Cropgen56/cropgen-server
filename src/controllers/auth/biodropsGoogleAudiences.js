/** Biodrops Google OAuth — single web client (satagro.ai / localhost:5173). */
export function resolveBiodropsGoogleAudiences() {
  const clientId = process.env.BIODROPS_GOOGLE_CLIENT_ID;
  return clientId ? [clientId] : [];
}
