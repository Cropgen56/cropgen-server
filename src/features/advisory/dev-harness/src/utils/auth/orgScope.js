export function sameOrg(user, org) { return !user?.organization || !org || String(user.organization) === String(org?._id || org); }
export function getOrgScopeId(u) { return u?.organization || null; } export async function getOrgScopedUserIds() { return []; }
