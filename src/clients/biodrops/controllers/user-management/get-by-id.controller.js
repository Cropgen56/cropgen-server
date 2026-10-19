import User from "../../../../models/user.model.js";
import { ORGANIZATION_CODE } from "../../constants.js";
import { resolveOrganizationByCode } from "../../../../utils/auth/authUtils.js";
import {
  formatCrmUser,
  loadActiveAssignmentsByUserId,
  loadAllAssignmentsForUser,
  loadLatestInvitationsByUserId,
} from "../../utils/crmUserFormat.js";
import {
  resolveCrmUserBaseQuery,
  buildCrmTeamUserQuery,
  buildCrmTeamUserByIdQuery,
} from "../../utils/crmUserQuery.js";
import { canManageUserAssignment } from "../../utils/adminScope.js";

export const getUserManagementById = async (req, res) => {
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);
    const teamQuery = await buildCrmTeamUserQuery(baseQuery, org._id);

    const user = await User.findOne(
      buildCrmTeamUserByIdQuery(teamQuery, req.params.id),
    )
      .select("-password -otp -__v")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const assignmentMap = await loadActiveAssignmentsByUserId([user._id]);
    const assignment = assignmentMap.get(String(user._id)) || null;
    const invitationMap = await loadLatestInvitationsByUserId([user._id], org._id);
    const invitation = invitationMap.get(String(user._id)) || null;
    const allAssignments = await loadAllAssignmentsForUser(user._id);

    const formattedUser = formatCrmUser(user, assignment, invitation);
    formattedUser.canManage = canManageUserAssignment(
      req.adminActor,
      assignment,
      org._id,
    );

    return res.status(200).json({
      success: true,
      user: formattedUser,
      assignments: allAssignments.map((a) => ({
        id: String(a._id),
        level: a.level,
        status: a.status,
        countryCode: a.countryCode,
        stateCode: a.stateCode,
        districtCode: a.districtCode,
        appointedBy: a.appointedBy
          ? {
              id: String(a.appointedBy._id),
              name: [a.appointedBy.firstName, a.appointedBy.lastName]
                .filter(Boolean)
                .join(" "),
            }
          : null,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("getUserManagementById:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to load user.",
    });
  }
};
