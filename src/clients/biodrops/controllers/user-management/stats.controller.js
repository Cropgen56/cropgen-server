import { resolveCrmUserBaseQuery, computeCrmUserStats } from "../../utils/crmUserQuery.js";

export const getUserManagementStats = async (req, res) => {
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);
    const stats = await computeCrmUserStats(baseQuery, org);
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
