import BiodropsAdminAssignment from "../../models/admin-assignment.model.js";
import CrmInvitation from "../../models/crm-invitation.model.js";
import {
  loadCrmTeamUserForManage,
  assertCanManageCrmUser,
  assertNotLastSuperAdmin,
} from "../../utils/crmUserManage.js";

export const deleteCrmUser = async (req, res) => {
  try {
    const { user, org, assignments, primaryAssignment } =
      await loadCrmTeamUserForManage(req, req.params.id);

    assertCanManageCrmUser(req.adminActor, primaryAssignment, user._id);

    const activeAssignments = assignments.filter((a) => a.status === "active");
    for (const a of activeAssignments) {
      await assertNotLastSuperAdmin(org._id, a);
    }

    await BiodropsAdminAssignment.deleteMany({
      userId: user._id,
      tenantId: org._id,
    });

    await CrmInvitation.updateMany(
      { userId: user._id, tenantId: org._id, status: "pending" },
      { status: "cancelled" },
    );

    return res.status(200).json({
      success: true,
      message:
        "User removed from CRM team. Their account record is kept for audit purposes.",
      userId: String(user._id),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("deleteCrmUser:", err);
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to remove user.",
    });
  }
};
