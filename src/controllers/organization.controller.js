import Organization from "../models/organization.model.js";

// Create a new organization
export const createOrganization = async (req, res) => {
  try {
    const { organizationName, organizationCode, address, email, phoneNumber } =
      req.body;

    // Check required fields
    if (!organizationName || !organizationCode) {
      return res.status(400).json({
        success: false,
        message: "Organization name and code are required.",
      });
    }

    // Check for existing organization code
    const existingOrg = await Organization.findOne({
      organizationCode: organizationCode.toUpperCase(),
    });

    if (existingOrg) {
      return res.status(409).json({
        success: false,
        message: "Organization code already exists.",
      });
    }

    // Create organization
    const organization = await Organization.create({
      organizationName,
      organizationCode,
      address,
      email,
      phoneNumber,
    });

    return res.status(201).json({
      success: true,
      message: "Organization created successfully.",
      data: organization,
    });
  } catch (error) {
    console.error("Create Organization Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Get all organizations
export const getAllOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Organizations retrieved successfully.",
      data: organizations,
    });
  } catch (error) {
    console.error("Get All Organizations Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Get single organization by ID
export const getOrganizationById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid organization ID.",
      });
    }

    const organization = await Organization.findById(id);

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Organization retrieved successfully.",
      data: organization,
    });
  } catch (error) {
    console.error("Get Organization Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Update organization
export const updateOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const { organizationName, organizationCode, address, email, phoneNumber } =
      req.body;

    // Validate ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid organization ID.",
      });
    }

    // Check if organization exists
    const organization = await Organization.findById(id);
    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found.",
      });
    }

    // Check for duplicate organization code if provided
    if (organizationCode) {
      const existingOrg = await Organization.findOne({
        organizationCode: organizationCode.toUpperCase(),
        _id: { $ne: id },
      });
      if (existingOrg) {
        return res.status(409).json({
          success: false,
          message: "Organization code already exists.",
        });
      }
    }

    // Update organization
    const updatedOrganization = await Organization.findByIdAndUpdate(
      id,
      {
        organizationName,
        organizationCode,
        address,
        email,
        phoneNumber,
      },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Organization updated successfully.",
      data: updatedOrganization,
    });
  } catch (error) {
    console.error("Update Organization Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Delete organization
export const deleteOrganization = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid organization ID.",
      });
    }

    const organization = await Organization.findByIdAndDelete(id);

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Organization deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Organization Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};
