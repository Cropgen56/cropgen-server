import User from "../../../../models/user.model.js";
import Organization from "../../../../models/organization.model.js";
import BiodropsAdminAssignment from "../../models/admin-assignment.model.js";
import { ORGANIZATION_CODE } from "../../constants.js";
import { createAdminAssignmentSchema } from "../../validation/admin-assignment.schema.js";
import {
  canCreateAssignment,
  validateAssignmentFields,
} from "../../utils/adminScope.js";
import { resolveBiodropsTenantId } from "../../utils/authPayload.js";

async function resolveManagedOrganizationId({
  managedOrganizationId,
  managedOrganizationCode,
}) {
  if (managedOrganizationId) return managedOrganizationId;
  if (!managedOrganizationCode) return null;
  const org = await Organization.findOne({
    organizationCode: String(managedOrganizationCode).toUpperCase(),
  }).lean();
  if (!org) {
    const err = new Error(
      `Managed organization '${managedOrganizationCode}' not found.`,
    );
    err.status = 404;
    throw err;
  }
  return org._id;
}

export const createBiodropsAdminAssignment = async (req, res) => {
  try {
    const { error, value } = createAdminAssignmentSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details.map((d) => d.message).join("; "),
      });
    }

    const orgCode = String(value.organizationCode || ORGANIZATION_CODE).toUpperCase();
    if (orgCode !== ORGANIZATION_CODE) {
      return res.status(400).json({
        success: false,
        message: `Only ${ORGANIZATION_CODE} admin assignments are supported.`,
      });
    }

    const targetUser = await User.findById(value.userId).populate(
      "organization",
      "organizationCode",
    );
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "Target user not found.",
      });
    }

    const targetOrgCode = String(
      targetUser.organization?.organizationCode || "",
    ).toUpperCase();
    if (targetOrgCode && targetOrgCode !== ORGANIZATION_CODE) {
      return res.status(400).json({
        success: false,
        message: "Target user must belong to the BIODROPS organization.",
      });
    }

    const tenantId = await resolveBiodropsTenantId();
    const managedOrganizationId = await resolveManagedOrganizationId(value);

    const fieldCheck = validateAssignmentFields(value.level, {
      tenantId,
      countryCode: value.countryCode,
      stateCode: value.stateCode,
      districtCode: value.districtCode,
      managedOrganizationId,
    });

    if (!fieldCheck.ok) {
      return res.status(400).json({ success: false, message: fieldCheck.message });
    }

    const newAssignmentShape = {
      level: value.level,
      tenantId,
      countryCode: fieldCheck.countryCode,
      stateCode: fieldCheck.stateCode,
      districtCode: fieldCheck.districtCode,
      managedOrganizationId:
        value.level === "ground" ? managedOrganizationId : null,
    };

    if (!canCreateAssignment(req.adminActor, newAssignmentShape)) {
      return res.status(403).json({
        success: false,
        message:
          "You cannot create this admin assignment. A higher-level BioDrops admin is required.",
      });
    }

    const assignment = await BiodropsAdminAssignment.create({
      userId: value.userId,
      level: value.level,
      tenantId,
      countryCode: newAssignmentShape.countryCode,
      stateCode: newAssignmentShape.stateCode,
      districtCode: newAssignmentShape.districtCode,
      managedOrganizationId: newAssignmentShape.managedOrganizationId,
      appointedBy: req.adminActor?.id || null,
      status: "active",
    });

    if (!targetUser.organization) {
      targetUser.organization = tenantId;
    }
    if (targetUser.role === "farmer") {
      targetUser.role = "staff";
    }
    await targetUser.save();

    const populated = await BiodropsAdminAssignment.findById(assignment._id)
      .populate("userId", "firstName lastName email phone role")
      .populate("tenantId", "organizationCode organizationName")
      .populate("managedOrganizationId", "organizationCode organizationName")
      .lean();

    return res.status(201).json({
      success: true,
      message: "BioDrops admin assignment created.",
      assignment: populated,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "An active BioDrops admin already exists for this level and scope.",
      });
    }
    console.error("createBiodropsAdminAssignment:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Failed to create admin assignment.",
    });
  }
};
