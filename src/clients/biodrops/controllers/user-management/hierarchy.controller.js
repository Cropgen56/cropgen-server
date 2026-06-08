import { resolveCrmUserBaseQuery } from "../../utils/crmUserQuery.js";
import { buildHierarchyCapabilities } from "../../utils/adminScope.js";

export const getHierarchyCapabilities = async (req, res) => {
  try {
    const { org } = await resolveCrmUserBaseQuery(req);
    const hierarchy = await buildHierarchyCapabilities(req.adminActor, org._id);

    return res.status(200).json({
      success: true,
      hierarchy,
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("getHierarchyCapabilities:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to load hierarchy capabilities.",
    });
  }
};
