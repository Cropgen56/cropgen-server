import { createProductImagePresignedUrl } from "../../../../utils/storage/s3.js";

export const getCrmProductImagePresign = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { fileType } = req.body;

    if (!fileType || !fileType.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Valid image content type is required",
      });
    }

    const { key, uploadUrl, fileUrl } = await createProductImagePresignedUrl({
      userId,
      fileType,
    });

    return res.status(200).json({
      success: true,
      uploadUrl,
      publicUrl: fileUrl,
      key,
    });
  } catch (error) {
    console.error("getCrmProductImagePresign:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate upload URL",
    });
  }
};
