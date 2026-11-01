import BiodropsAdminAssignment from "../../models/admin-assignment.model.js";
import {
  canManageAssignment,
  serializeAssignment,
} from "../../utils/adminScope.js";
import { assertNotLastSuperAdmin } from "../../utils/crmUserManage.js";

export const suspendBiodropsAdminAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    const assignment = await BiodropsAdminAssignment.findById(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Admin assignment not found.",
      });
    }

    if (assignment.status === "suspended") {
      return res.status(400).json({
        success: false,
        message: "Assignment is already suspended.",
      });
    }

    const targetShape = serializeAssignment(assignment);
    if (!canManageAssignment(req.adminActor, targetShape)) {
      return res.status(403).json({
        success: false,
        message: "You cannot suspend this admin assignment.",
      });
    }

    await assertNotLastSuperAdmin(assignment.tenantId, assignment);

    assignment.status = "suspended";
    await assignment.save();

    return res.status(200).json({
      success: true,
      message: "BioDrops admin assignment suspended.",
      assignment,
    });
  } catch (err) {
    // Guard errors (e.g. "last active Super Admin") carry their own status
    // and message — surface them instead of a generic 500.
    const status = err.status || 500;
    if (status >= 500) console.error("suspendBiodropsAdminAssignment:", err);
    return res.status(status).json({
      success: false,
      message: status >= 500 ? "Failed to suspend admin assignment." : err.message,
    });
  }
};
