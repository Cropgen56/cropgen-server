import mongoose from "mongoose";
import User from "../../models/user.model.js";
import { createAvatarPresignedUrl } from "../../utils/s3.js";

export const getAvatarPresignedUrl = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { fileType } = req.body;

    if (!fileType || !fileType.startsWith("image/")) {
      return res
        .status(400)
        .json({ message: "Valid image content type is required" });
    }

    const { key, uploadUrl, fileUrl } = await createAvatarPresignedUrl({
      userId,
      fileType,
    });

    await User.findByIdAndUpdate(userId, { avatar: fileUrl });

    return res.status(200).json({
      message: "Avatar presigned URL generated",
      data: {
        uploadUrl,
        fileUrl,
      },
    });
  } catch (error) {
    console.error("getAvatarPresignedUrl error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
