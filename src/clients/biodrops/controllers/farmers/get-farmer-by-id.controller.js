import User from "../../../../models/user.model.js";
import FarmField from "../../../../models/field.model.js";
import FieldCrop from "../../../../models/field-crop.model.js";
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

    // Multi-crop: attach each field's currently-active crops.
    const fieldIds = fields.map((f) => f._id);
    const activeCrops = fieldIds.length
      ? await FieldCrop.find({ farmField: { $in: fieldIds }, isActive: true }).lean()
      : [];
    const cropsByFieldId = new Map();
    activeCrops.forEach((c) => {
      const key = String(c.farmField);
      if (!cropsByFieldId.has(key)) cropsByFieldId.set(key, []);
      cropsByFieldId.get(key).push(c);
    });
    const fieldsWithCrops = fields.map((f) => ({
      ...f,
      crops: cropsByFieldId.get(String(f._id)) || [],
    }));

    return res.status(200).json({
      success: true,
      farmer: formatCrmFarmerDetail(user, { fields: fieldsWithCrops }),
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
