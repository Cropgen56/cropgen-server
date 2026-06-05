import User from "../../../../models/user.model.js";
import BiodropsAdminAssignment from "../../models/admin-assignment.model.js";
import { resolveCrmUserBaseQuery } from "../../utils/crmUserQuery.js";
import { formatCrmUser, loadActiveAssignmentsByUserId } from "../../utils/crmUserFormat.js";
import { filterManagersForInvite } from "../../utils/adminScope.js";

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

    const { forLevel, countryCode, stateCode, districtCode } = req.query || {};

    let admins = users.map((u) => {
      const assignment = map.get(String(u._id)) || null;
      const formatted = formatCrmUser(u, assignment);
      return {
        id: formatted.id,
        name: formatted.name,
        role: formatted.role,
        level: formatted.adminLevel,
        countryCode: assignment?.countryCode || null,
        stateCode: assignment?.stateCode || null,
        districtCode: assignment?.districtCode || null,
      };
    });

    if (forLevel) {
      admins = filterManagersForInvite(req.adminActor, admins, {
        level: forLevel,
        tenantId: String(org._id),
        countryCode: countryCode || null,
        stateCode: stateCode || null,
        districtCode: districtCode || null,
      });
    }

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
