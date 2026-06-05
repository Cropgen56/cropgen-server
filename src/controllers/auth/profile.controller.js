import User from "../../models/user.model.js";

export const getProfile = async (req, res) => {
  const { id } = req.user;

  try {
    const user = await User.findById(id)
      .select(
        "_id email phone role firstName lastName avatar terms lastLoginAt createdAt organization lastActiveAt language country state city village",
      )
      .populate({
        path: "organization",
        select:
          "_id organizationName organizationCode email phoneNumber address",
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User fetched successfully.",
      user: {
        ...user,
        id: String(user._id),
      },
    });
  } catch (error) {
    console.error(`Error fetching user with ID ${id}:`, error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user.",
    });
  }
};
