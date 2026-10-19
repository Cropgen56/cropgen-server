import { resolveCrmUserBaseQuery, fetchCrmScopedUsers } from "../../utils/crmUserQuery.js";

export const listUserManagement = async (req, res) => {
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);
    const { page, limit, status, search, q } = req.query;
    const result = await fetchCrmScopedUsers({
      baseQuery,
      org,
      page,
      limit,
      status,
      search: search || q,
      actor: req.adminActor,
    });

    return res.status(200).json({
      success: true,
      users: result.users,
      pagination: result.pagination,
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("listUserManagement:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to load users.",
    });
  }
};
