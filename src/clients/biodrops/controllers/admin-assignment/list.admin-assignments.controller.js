import BiodropsAdminAssignment from "../../models/admin-assignment.model.js";
import { listAdminAssignmentsSchema } from "../../validation/admin-assignment.schema.js";
import { buildAdminAssignmentQueryFilter } from "../../utils/adminScope.js";
import { loadBiodropsAssignmentsForUser } from "../../utils/authPayload.js";
import { CROPGEN_PLATFORM_ROLES } from "../../constants/adminLevels.js";
import { resolveBiodropsTenantId } from "../../utils/authPayload.js";

export const listBiodropsAdminAssignments = async (req, res) => {
  try {
    const { error, value } = listAdminAssignmentsSchema.validate(req.query, {
      abortEarly: false,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details.map((d) => d.message).join("; "),
      });
    }

    const tenantId = await resolveBiodropsTenantId();
    const filter = { tenantId };
    if (value.status) filter.status = value.status;
    if (value.level) filter.level = value.level;
    if (value.userId) filter.userId = value.userId;

    const actor = req.adminActor;
    if (!CROPGEN_PLATFORM_ROLES.has(actor.role)) {
      const scopeFilter = buildAdminAssignmentQueryFilter(
        actor.adminAssignments,
      );
      if (scopeFilter.$or) {
        filter.$and = [{ $or: scopeFilter.$or }];
      } else {
        Object.assign(filter, scopeFilter);
      }
    }

    const skip = (value.page - 1) * value.limit;

    const [assignments, total] = await Promise.all([
      BiodropsAdminAssignment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(value.limit)
        .populate("userId", "firstName lastName email phone role")
        .populate("tenantId", "organizationCode organizationName")
        .populate("managedOrganizationId", "organizationCode organizationName")
        .populate("appointedBy", "firstName lastName email")
        .lean(),
      BiodropsAdminAssignment.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      assignments,
      pagination: {
        page: value.page,
        limit: value.limit,
        total,
        totalPages: Math.ceil(total / value.limit) || 1,
      },
    });
  } catch (err) {
    console.error("listBiodropsAdminAssignments:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to list admin assignments.",
    });
  }
};

export const getMyBiodropsAdminAssignments = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const assignments = await loadBiodropsAssignmentsForUser(userId);

    return res.status(200).json({
      success: true,
      assignments,
    });
  } catch (err) {
    console.error("getMyBiodropsAdminAssignments:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch your admin assignments.",
    });
  }
};
