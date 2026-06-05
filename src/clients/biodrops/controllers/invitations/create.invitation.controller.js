import User from "../../../../models/user.model.js";
import BiodropsAdminAssignment from "../../models/admin-assignment.model.js";
import CrmInvitation from "../../models/crm-invitation.model.js";
import { ORGANIZATION_CODE } from "../../constants.js";
import { resolveBiodropsTenantId } from "../../utils/authPayload.js";
import {
  canCreateAssignment,
  validateAssignmentFields,
} from "../../utils/adminScope.js";
import { resolveOrganizationByCode } from "../../../../utils/auth/authUtils.js";
import { generateInvitationToken } from "../../utils/invitationToken.js";
import { sendCrmInvitationEmail } from "../../services/crmInvitationEmail.service.js";
import { checkAssignmentAvailability } from "../../utils/assignmentAvailability.js";

const INVITE_EXPIRY_DAYS = 7;

function splitFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: "User", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function normalizePhone(phone) {
  if (!phone) return null;
  const raw = String(phone).trim();
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

async function resolveInviteUser({ normalizedPhone, normalizedEmail, tenantId }) {
  const userByPhone = normalizedPhone
    ? await User.findOne({ phone: normalizedPhone })
    : null;
  const userByEmail = normalizedEmail
    ? await User.findOne({ email: normalizedEmail })
    : null;

  if (
    userByPhone &&
    userByEmail &&
    String(userByPhone._id) !== String(userByEmail._id)
  ) {
    return {
      error: {
        status: 409,
        message:
          "This email and mobile number belong to different accounts. Use matching credentials or contact support.",
      },
    };
  }

  const user = userByPhone || userByEmail || null;
  if (!user) return { user: null };

  const activeAssignment = await BiodropsAdminAssignment.findOne({
    userId: user._id,
    tenantId,
    status: "active",
  }).lean();

  if (activeAssignment) {
    return {
      error: {
        status: 409,
        message:
          "This user is already registered in CRM. Update their profile or resend the invitation from user management.",
      },
    };
  }

  const pendingInvitation = await CrmInvitation.findOne({
    userId: user._id,
    tenantId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  }).lean();

  if (pendingInvitation) {
    return {
      error: {
        status: 409,
        message:
          "An invitation is already pending for this user. Use resend invitation instead.",
      },
    };
  }

  return { user };
}

export const createCrmInvitation = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      level,
      countryCode,
      stateCode,
      districtCode,
      reportsToUserId,
      sendEmail = true,
    } = req.body || {};

    const shouldSendEmail = sendEmail !== false && sendEmail !== "false";

    if (!fullName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Full name is required.",
      });
    }
    if (!level) {
      return res.status(400).json({
        success: false,
        message: "Admin level is required.",
      });
    }
    if (!email?.trim() && !phone?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email or phone is required.",
      });
    }

    if (shouldSendEmail && !email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required to send an invitation link.",
      });
    }

    if (!phone?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Mobile number is required. Invited users sign in to CRM with WhatsApp OTP.",
      });
    }

    const tenantId = await resolveBiodropsTenantId();
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = email?.trim().toLowerCase() || null;

    const resolved = await resolveInviteUser({
      normalizedPhone,
      normalizedEmail,
      tenantId,
    });
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        message: resolved.error.message,
      });
    }

    let user = resolved.user;
    const { firstName, lastName } = splitFullName(fullName);

    if (!user) {
      user = await User.create({
        firstName,
        lastName,
        email: normalizedEmail,
        phone: normalizedPhone,
        role: "staff",
        terms: false,
        organization: tenantId,
        clientSource: "web",
      });
    } else {
      // Reused an existing platform account (matched by phone or email).
      // Apply the invited profile so CRM list/edit match what the admin entered.
      user.firstName = firstName;
      user.lastName = lastName;

      if (normalizedEmail) {
        const emailTaken = await User.findOne({
          email: normalizedEmail,
          _id: { $ne: user._id },
        });
        if (emailTaken) {
          return res.status(409).json({
            success: false,
            message: "This email is already linked to another account.",
          });
        }
        user.email = normalizedEmail;
      }

      if (normalizedPhone) {
        const phoneTaken = await User.findOne({
          phone: normalizedPhone,
          _id: { $ne: user._id },
        });
        if (phoneTaken) {
          return res.status(409).json({
            success: false,
            message: "This mobile number is already linked to another account.",
          });
        }
        user.phone = normalizedPhone;
      }

      if (!user.organization) user.organization = tenantId;
      if (user.role === "farmer") user.role = "staff";
      await user.save();
    }

    const geoCountry = level === "super" ? null : countryCode || null;
    const geoState = level === "super" || level === "country" ? null : stateCode || null;
    const geoDistrict =
      level === "super" || level === "country" || level === "state"
        ? null
        : districtCode || null;

    const newAssignmentShape = {
      level,
      tenantId: String(tenantId),
      countryCode: geoCountry,
      stateCode: geoState,
      districtCode: geoDistrict,
      managedOrganizationId: null,
    };

    const fieldCheck = validateAssignmentFields(level, {
      tenantId,
      countryCode: newAssignmentShape.countryCode,
      stateCode: newAssignmentShape.stateCode,
      districtCode: newAssignmentShape.districtCode,
      managedOrganizationId: null,
    });

    if (!fieldCheck.ok) {
      return res.status(400).json({ success: false, message: fieldCheck.message });
    }

    let allowBootstrapSuperCreation = false;
    if (level === "super") {
      const activeSuperExists = await BiodropsAdminAssignment.exists({
        tenantId,
        level: "super",
        status: "active",
      });
      allowBootstrapSuperCreation = !activeSuperExists;
    }

    if (
      !allowBootstrapSuperCreation &&
      !canCreateAssignment(req.adminActor, newAssignmentShape)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You cannot create this admin assignment. A higher-level BioDrops admin is required.",
      });
    }

    const availability = await checkAssignmentAvailability({
      level,
      tenantId,
      countryCode: fieldCheck.countryCode,
      stateCode: fieldCheck.stateCode,
      districtCode: fieldCheck.districtCode,
    });

    if (!availability.canAssign) {
      return res.status(409).json({
        success: false,
        message: availability.message,
      });
    }

    const assignment = await BiodropsAdminAssignment.create({
      userId: user._id,
      level,
      tenantId,
      countryCode: fieldCheck.countryCode,
      stateCode: fieldCheck.stateCode,
      districtCode: fieldCheck.districtCode,
      managedOrganizationId: null,
      appointedBy: reportsToUserId || req.adminActor?.id || null,
      status: "active",
    });

    if (fieldCheck.countryCode) user.country = fieldCheck.countryCode;
    if (fieldCheck.stateCode) user.state = fieldCheck.stateCode;
    if (fieldCheck.districtCode) user.district = fieldCheck.districtCode;
    await user.save();

    const { org } = await resolveOrganizationByCode(ORGANIZATION_CODE);

    let emailInvitation = null;
    let emailSent = false;
    let emailError = null;

    if (shouldSendEmail && normalizedEmail) {
      const { token, tokenHash } = generateInvitationToken();
      const expiresAt = new Date(
        Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      );

      await CrmInvitation.updateMany(
        { userId: user._id, status: "pending" },
        { status: "cancelled" },
      );

      emailInvitation = await CrmInvitation.create({
        userId: user._id,
        assignmentId: assignment._id,
        tenantId,
        email: normalizedEmail,
        level,
        tokenHash,
        status: "pending",
        invitedBy: req.adminActor?.id || null,
        expiresAt,
      });

      const inviter = await User.findById(req.adminActor?.id).select(
        "firstName lastName",
      );
      const inviterName = [inviter?.firstName, inviter?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      try {
        await sendCrmInvitationEmail({
          to: normalizedEmail,
          inviteeName: [user.firstName, user.lastName].filter(Boolean).join(" "),
          inviterName,
          roleLevel: level,
          token,
          expiresAt,
        });
        emailInvitation.emailSentAt = new Date();
        await emailInvitation.save();
        emailSent = true;
      } catch (mailErr) {
        console.error("createCrmInvitation email:", mailErr);
        emailError = mailErr.message || "Failed to send invitation email.";
      }
    }

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Invitation created and verification email sent."
        : emailError
          ? `User created but email failed: ${emailError}`
          : "Invitation created successfully.",
      emailSent,
      emailError,
      invitation: {
        id: String(assignment._id),
        userId: String(user._id),
        crmInvitationId: emailInvitation ? String(emailInvitation._id) : null,
        level,
        organizationCode: org.organizationCode,
      },
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "An active BioDrops admin already exists for this level and scope.",
      });
    }
    console.error("createCrmInvitation:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Failed to create invitation.",
    });
  }
};
