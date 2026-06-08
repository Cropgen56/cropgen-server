import User from "../../../../models/user.model.js";
import FarmField from "../../../../models/field.model.js";
import { resolveCrmUserBaseQuery } from "../../utils/crmUserQuery.js";
import { formatCrmFarmerDetail } from "../../utils/formatFarmer.js";

export const getBiodropsFarmerById = async (req, res) => {
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);
    const { id } = req.params;

    const user = await User.findOne({
      ...baseQuery,
      _id: id,
      role: "farmer",
      organization: org._id,
    })
      .select("-password -otp -__v")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Farmer not found.",
      });
    }

    const fields = await FarmField.find({ user: user._id })
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      farmer: formatCrmFarmerDetail(user, { fields }),
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("getBiodropsFarmerById:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to load farmer details.",
    });
  }
};
