import User from "../../../../models/user.model.js";
import { revokeAllRefreshSessions } from "../../../../utils/auth/authUtils.js";
import { resolveCrmUserBaseQuery } from "../../utils/crmUserQuery.js";
import { buildFarmerRoleQuery } from "./list-farmers.controller.js";

/**
 * DELETE /crm/farmers/:id — soft-delete a farmer, the same way accounts are
 * deleted elsewhere: deletedAt is set and every session is revoked, so the
 * farmer drops out of CRM lists and can no longer log in. Farms and history
 * stay in the database. Same scope as the farmer view.
 */
export const deleteBiodropsFarmer = async (req, res) => {
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);
    const roleQuery = await buildFarmerRoleQuery(baseQuery, org);
    const user = await User.findOne({ ...roleQuery, _id: req.params.id });
    if (!user) {
      return res.status(404).json({ success: false, message: "Farmer not found." });
    }

    user.deletedAt = new Date();
    revokeAllRefreshSessions(user);
    await user.save();

    return res.json({ success: true, message: "Farmer deleted." });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("deleteBiodropsFarmer:", error);
    return res.status(status).json({
      success: false,
      message: status >= 500 ? "Failed to delete farmer." : error.message,
    });
  }
};
