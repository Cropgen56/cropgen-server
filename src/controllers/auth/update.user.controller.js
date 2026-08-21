import User from "../../models/user.model.js";
import Organization from "../../models/organization.model.js";
import appSocketService from "../../features/agent/services/appSocket.service.js";
import { clearWhatsAppAgentCache } from "../../features/agent/services/whatsappAgent.service.js";

/** Profile fields admins may update (excludes OTP, tokens, activity timestamps). */
const ALLOWED_USER_UPDATE_FIELDS = new Set([
  "firstName",
  "lastName",
  "avatar",
  "email",
  "phone",
  "country",
  "state",
  "city",
  "village",
  "pincode",
  "role",
  "language",
  "terms",
  "clientSource",
  "razorpayCustomerId",
]);

const NULLABLE_STRING_FIELDS = new Set([
  "avatar",
  "email",
  "phone",
  "country",
  "state",
  "city",
  "village",
  "pincode",
  "razorpayCustomerId",
]);

function pickAllowedUpdateFields(body) {
  const updateData = {};
  for (const key of ALLOWED_USER_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      let value = body[key];
      if (NULLABLE_STRING_FIELDS.has(key) && value === "") {
        value = null;
      }
      if (key === "country" || key === "state") {
        value = value == null ? null : String(value).trim().toUpperCase();
      } else if (typeof value === "string" && key !== "email") {
        value = value.trim();
      } else if (key === "email" && typeof value === "string") {
        value = value.trim().toLowerCase();
      }
      updateData[key] = value;
    }
  }
  return updateData;
}

export const updateUserById = async (req, res) => {
  const { id } = req.params;
  let updateData = pickAllowedUpdateFields(req.body);

  try {
    const requesterRole = String(req.user?.role || "").toLowerCase();
    const isPrivileged = ["admin", "developer"].includes(requesterRole);

    // Non-admins can only update their own profile, and cannot change role.
    if (!isPrivileged) {
      if (String(req.user?.id || req.user?._id) !== String(id)) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only update your own profile.",
        });
      }
      delete updateData.role;
    }

    /* ================= PHONE UNIQUE CHECK (OPTIONAL) ================= */
    if (updateData.phone) {
      const existingPhone = await User.findOne({
        phone: updateData.phone,
        _id: { $ne: id },
      });

      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: "Phone number is already in use by another account",
        });
      }
    }

    /* ================= ORGANIZATION HANDLING ================= */
    if (req.body.organizationCode !== undefined) {
      const code = String(req.body.organizationCode || "")
        .trim()
        .toUpperCase() || "CROPGEN";
      const organization = await Organization.findOne({
        organizationCode: code,
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: `Organization '${code}' not found. Leave blank to join CROPGEN.`,
        });
      }

      updateData.organization = organization._id;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    /* ================= UPDATE USER ================= */
    const user = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      {
        new: true,
        runValidators: true,
        context: "query",
      },
    ).populate({
      path: "organization",
      select: "organizationCode name",
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (Object.prototype.hasOwnProperty.call(updateData, "language")) {
      appSocketService.cleanupUser(String(id));
      clearWhatsAppAgentCache(String(id));
    }

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    console.error("Error updating user:", error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];

      return res.status(409).json({
        success: false,
        message: `${field} already exists`,
      });
    }

    if (error.name === "ValidationError") {
      const firstField = Object.values(error.errors || {})[0];
      const friendly =
        firstField?.message ||
        (error.message?.includes("phone")
          ? "Invalid phone number. Use E.164 format, e.g. +919876543210."
          : error.message);

      return res.status(400).json({
        success: false,
        message: friendly,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update user",
    });
  }
};
