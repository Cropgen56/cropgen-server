import { resolveCrmUserBaseQuery, computeCrmUserStats } from "../../utils/crmUserQuery.js";
import { loadOpenInvitations } from "./list-pending.controller.js";

export const getUserManagementStats = async (req, res) => {
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);
    const [stats, openInvitations] = await Promise.all([
      computeCrmUserStats(baseQuery, org),
      loadOpenInvitations(org._id),
    ]);
    // Same list the Pending Invitations page shows, so the badge matches it.
    stats.pendingInvitations = openInvitations.length;
    return res.status(200).json({ success: true, stats });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("getUserManagementStats:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to load user management stats.",
    });
  }
};
