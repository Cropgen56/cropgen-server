import User from "../../models/user.model.js"
import { sameOrg } from "../../utils/auth/orgScope.js";


// get user by the id
export const getUserById = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id).populate("organization");

    if (!user || user.deletedAt) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (!sameOrg(req.user, user.organization?._id || user.organization)) {
      return res.status(403).json({
        success: false,
        message: "You can only view users in your organization.",
      });
    }

    res.status(200).json({
      success: true,
      message: "User fetched successfully.",
      user,
    });
  } catch (error) {
    console.error(`Error fetching user with ID ${id}:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user.",
      error: error.message,
    });
  }
};