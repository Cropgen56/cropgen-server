import User from "../../../../models/user.model.js";
import BiodropsAdminAssignment from "../../models/admin-assignment.model.js";
import { resolveCrmUserBaseQuery } from "../../utils/crmUserQuery.js";
import { formatCrmUser, loadActiveAssignmentsByUserId } from "../../utils/crmUserFormat.js";

/** Lightweight list for manager / reports-to pickers. */
export const listCrmAdminsForPicker = async (req, res) => {
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);

    const assignmentUserIds = await BiodropsAdminAssignment.distinct("userId", {
      tenantId: org._id,
      status: "active",
    });

    const users = await User.find({
      ...baseQuery,
      _id: { $in: assignmentUserIds },
    })
      .select("firstName lastName email phone role")
      .sort({ firstName: 1 })
      .lean();

    const map = await loadActiveAssignmentsByUserId(users.map((u) => u._id));

    const admins = users.map((u) => {
      const formatted = formatCrmUser(u, map.get(String(u._id)) || null);
      return {
        id: formatted.id,
        name: formatted.name,
        role: formatted.role,
        level: formatted.adminLevel,
      };
    });

    return res.status(200).json({ success: true, admins });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("listCrmAdminsForPicker:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to load admins.",
    });
  }
};
