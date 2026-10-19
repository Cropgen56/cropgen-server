import User from "../models/user.model.js";

export const updateUserActivity = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (userId) {
      await User.findByIdAndUpdate(
        userId,
        { lastActiveAt: new Date() },
        { new: false }
      );
    }

    next();
  } catch (error) {
    // analytics should never block the request
    console.error("updateUserActivity error:", error.message);
    next();
  }
};
