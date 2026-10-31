import User from "../../models/user.model.js";
import { revokeAllRefreshSessions } from "../../utils/auth/authUtils.js";
import { emailScopeFilter, headerOrgCode } from "../../utils/auth/orgScope.js";

export const deleteUserByEmail = async (req, res) => {
  const { email } = req.params;

  try {
    // The same email may own an account in several orgs: an org code
    // (X-Organization-Code header or ?organizationCode=) picks one.
    const orgCode =
      headerOrgCode(req) ||
      String(req.query?.organizationCode || "").trim().toUpperCase() ||
      null;
    const users = await User.find({
      email: String(email || "").trim().toLowerCase(),
      deletedAt: null,
      ...(orgCode ? await emailScopeFilter(orgCode) : {}),
    }).populate("organization", "organizationCode");

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (users.length > 1) {
      return res.status(409).json({
        success: false,
        message:
          "This email has accounts in several organizations. Pass organizationCode to choose one.",
        organizations: users.map((u) => u.organization?.organizationCode || null),
      });
    }
    const [user] = users;

    user.deletedAt = new Date();
    revokeAllRefreshSessions(user);
    await user.save();

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: error.message,
    });
  }
};
