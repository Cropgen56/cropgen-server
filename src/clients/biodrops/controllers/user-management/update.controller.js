import User from "../../../../models/user.model.js";
import BiodropsAdminAssignment from "../../models/admin-assignment.model.js";
import {
  loadCrmTeamUserForManage,
  assertCanManageCrmUser,
  assertNotLastSuperAdmin,
  splitFullName,
  normalizeCrmPhone,
  buildGeoForLevel,
  validateLevelGeo,
} from "../../utils/crmUserManage.js";
import { canCreateAssignment } from "../../utils/adminScope.js";
import {
  formatCrmUser,
  loadLatestInvitationsByUserId,
} from "../../utils/crmUserFormat.js";

export const updateCrmUser = async (req, res) => {
  try {
    const { user, org, primaryAssignment } = await loadCrmTeamUserForManage(
      req,
      req.params.id,
    );

    assertCanManageCrmUser(
      req.adminActor,
      primaryAssignment,
      user._id,
    );

    const {
      fullName,
      firstName,
      lastName,
      email,
      phone,
      level,
      countryCode,
      stateCode,
      districtCode,
      reportsToUserId,
      assignmentStatus,
    } = req.body || {};

    if (fullName?.trim()) {
      const split = splitFullName(fullName);
      user.firstName = split.firstName;
      user.lastName = split.lastName;
    } else {
      if (firstName?.trim()) user.firstName = firstName.trim();
      if (lastName?.trim()) user.lastName = lastName.trim();
    }

    if (email !== undefined) {
      const normalizedEmail = email?.trim()
        ? email.trim().toLowerCase()
        : null;
      if (normalizedEmail) {
        const dup = await User.findOne({
          email: normalizedEmail,
          _id: { $ne: user._id },
        });
        if (dup) {
          return res.status(409).json({
            success: false,
            message: "Email is already in use by another account.",
          });
        }
      }
      user.email = normalizedEmail;
    }

    if (phone !== undefined) {
      const normalizedPhone = phone?.trim()
        ? normalizeCrmPhone(phone)
        : null;
      if (!normalizedPhone) {
        return res.status(400).json({
          success: false,
          message: "A valid mobile number is required for CRM users.",
        });
      }
      const dup = await User.findOne({
        phone: normalizedPhone,
        _id: { $ne: user._id },
      });
      if (dup) {
        return res.status(409).json({
          success: false,
          message: "Phone number is already in use by another account.",
        });
      }
      user.phone = normalizedPhone;
    }

    const nextLevel = level || primaryAssignment.level;
    const geo = buildGeoForLevel(nextLevel, {
      countryCode: countryCode ?? primaryAssignment.countryCode,
      stateCode: stateCode ?? primaryAssignment.stateCode,
      districtCode: districtCode ?? primaryAssignment.districtCode,
    });

    const fieldCheck = validateLevelGeo(nextLevel, org._id, geo);
    if (!fieldCheck.ok) {
      return res.status(400).json({ success: false, message: fieldCheck.message });
    }

    const newShape = {
      level: nextLevel,
      tenantId: org._id,
      countryCode: fieldCheck.countryCode,
      stateCode: fieldCheck.stateCode,
      districtCode: fieldCheck.districtCode,
      managedOrganizationId: null,
    };

    if (
      nextLevel !== primaryAssignment.level ||
      fieldCheck.countryCode !== (primaryAssignment.countryCode || null) ||
      fieldCheck.stateCode !== (primaryAssignment.stateCode || null) ||
      fieldCheck.districtCode !== (primaryAssignment.districtCode || null)
    ) {
      if (!canCreateAssignment(req.adminActor, newShape)) {
        return res.status(403).json({
          success: false,
          message: "You cannot assign this admin level or region scope.",
        });
      }
    }

    if (assignmentStatus === "suspended") {
      await assertNotLastSuperAdmin(org._id, primaryAssignment);
      primaryAssignment.status = "suspended";
    } else if (assignmentStatus === "active") {
      primaryAssignment.status = "active";
    }

    primaryAssignment.level = nextLevel;
    primaryAssignment.countryCode = fieldCheck.countryCode;
    primaryAssignment.stateCode = fieldCheck.stateCode;
    primaryAssignment.districtCode = fieldCheck.districtCode;

    if (reportsToUserId !== undefined) {
      primaryAssignment.appointedBy = reportsToUserId || null;
    }

    if (fieldCheck.countryCode) user.country = fieldCheck.countryCode;
    else user.country = null;
    if (fieldCheck.stateCode) user.state = fieldCheck.stateCode;
    else user.state = null;
    if (fieldCheck.districtCode) user.district = fieldCheck.districtCode;
    else user.district = null;

    await Promise.all([user.save(), primaryAssignment.save()]);

    await primaryAssignment.populate(
      "appointedBy",
      "firstName lastName email",
    );

    const invitationMap = await loadLatestInvitationsByUserId(
      [user._id],
      org._id,
    );

    return res.status(200).json({
      success: true,
      message: "User updated successfully.",
      user: formatCrmUser(
        user.toObject(),
        primaryAssignment.toObject(),
        invitationMap.get(String(user._id)) || null,
      ),
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "An active admin already exists for this level and region scope.",
      });
    }
    const status = err.status || 500;
    if (status >= 500) console.error("updateCrmUser:", err);
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to update user.",
    });
  }
};
