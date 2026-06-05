import {
  ADMIN_LEVELS,
  ADMIN_LEVEL_RANK,
  ADMIN_PARENT_LEVEL,
  CROPGEN_PLATFORM_ROLES,
} from "../constants/adminLevels.js";
import { ORGANIZATION_CODE } from "../constants.js";

function normalizeCode(value) {
  if (value == null || value === "") return null;
  return String(value).trim().toUpperCase();
}

function tenantKey(tenantId) {
  if (tenantId == null) return null;
  return String(tenantId);
}

export function serializeAssignment(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    level: doc.level,
    tenantId: doc.tenantId ? String(doc.tenantId) : null,
    countryCode: doc.countryCode || null,
    stateCode: doc.stateCode || null,
    districtCode: doc.districtCode || null,
    managedOrganizationId: doc.managedOrganizationId
      ? String(doc.managedOrganizationId)
      : null,
  };
}

export function getHighestAdminLevel(assignments = []) {
  let max = 0;
  let level = null;
  for (const a of assignments) {
    const rank = ADMIN_LEVEL_RANK[a.level] || 0;
    if (rank > max) {
      max = rank;
      level = a.level;
    }
  }
  return level;
}

export function buildUserScopeFilter(assignments = []) {
  if (!assignments?.length) return {};

  const orClauses = [];

  for (const a of assignments) {
    const clause = { organization: a.tenantId };

    const country = normalizeCode(a.countryCode);
    const state = normalizeCode(a.stateCode);
    const district = normalizeCode(a.districtCode);

    if (country) clause.country = country;
    if (state) clause.state = state;
    if (district) clause.district = district;

    if (a.managedOrganizationId) {
      clause.organization = a.managedOrganizationId;
    }

    orClauses.push(clause);
  }

  if (orClauses.length === 1) return orClauses[0];
  return { $or: orClauses };
}

function assignmentCoversTarget(assignment, target) {
  const aTenant = tenantKey(assignment.tenantId);
  const tTenant = tenantKey(target.tenantId);
  if (aTenant !== tTenant) return false;

  if (assignment.level === "super") return true;

  const aCountry = normalizeCode(assignment.countryCode);
  const tCountry = normalizeCode(target.countryCode);
  if (assignment.level === "country") {
    return aCountry && aCountry === tCountry;
  }

  const aState = normalizeCode(assignment.stateCode);
  const tState = normalizeCode(target.stateCode);
  if (assignment.level === "state") {
    return aCountry === tCountry && aState && aState === tState;
  }

  const aDistrict = normalizeCode(assignment.districtCode);
  const tDistrict = normalizeCode(target.districtCode);
  if (assignment.level === "district") {
    return (
      aCountry === tCountry &&
      aState === tState &&
      aDistrict &&
      aDistrict === tDistrict
    );
  }

  if (assignment.level === "ground") {
    const geoOk =
      aCountry === tCountry &&
      aState === tState &&
      aDistrict === tDistrict;
    if (!geoOk) return false;
    const aManaged = assignment.managedOrganizationId
      ? String(assignment.managedOrganizationId)
      : null;
    const tManaged = target.managedOrganizationId
      ? String(target.managedOrganizationId)
      : null;
    if (aManaged && tManaged) return aManaged === tManaged;
    return true;
  }

  return false;
}

export function canManageAssignment(actor, targetAssignment) {
  if (!actor || !targetAssignment) return false;

  if (CROPGEN_PLATFORM_ROLES.has(actor.role)) return true;

  const assignments = actor.adminAssignments || [];
  if (!assignments.length) return false;

  const targetRank = ADMIN_LEVEL_RANK[targetAssignment.level] || 0;

  for (const a of assignments) {
    const actorRank = ADMIN_LEVEL_RANK[a.level] || 0;
    if (actorRank <= targetRank) continue;
    if (assignmentCoversTarget(a, targetAssignment)) return true;
  }

  return false;
}

export function canCreateAssignment(actor, newAssignment) {
  if (!actor || !newAssignment) return false;

  if (CROPGEN_PLATFORM_ROLES.has(actor.role)) return true;

  const assignments = actor.adminAssignments || [];
  const parentLevel = ADMIN_PARENT_LEVEL[newAssignment.level];

  if (!parentLevel) {
    return assignments.some((a) => a.level === "super");
  }

  const parentTarget = {
    level: parentLevel,
    tenantId: newAssignment.tenantId,
    countryCode: newAssignment.countryCode,
    stateCode:
      parentLevel === "country" ? null : newAssignment.stateCode,
    districtCode:
      parentLevel === "district" || parentLevel === "state"
        ? newAssignment.districtCode
        : null,
    managedOrganizationId: null,
  };

  if (parentLevel === "country") {
    parentTarget.stateCode = null;
    parentTarget.districtCode = null;
  } else if (parentLevel === "state") {
    parentTarget.districtCode = null;
  }

  // Country admin's parent is super — same rank as the actor, so use tenant check.
  if (parentLevel === "super") {
    const tid = tenantKey(newAssignment.tenantId);
    return assignments.some(
      (a) => a.level === "super" && tenantKey(a.tenantId) === tid,
    );
  }

  return canManageAssignment(actor, parentTarget);
}

export function buildAdminAssignmentQueryFilter(assignments = []) {
  if (!assignments?.length) {
    return { _id: { $exists: false } };
  }

  const or = [];

  for (const a of assignments) {
    if (a.level === "super") {
      return { tenantId: a.tenantId };
    }

    const clause = { tenantId: a.tenantId };
    if (a.countryCode) clause.countryCode = normalizeCode(a.countryCode);

    if (a.level === "country") {
      or.push(clause);
      continue;
    }

    if (a.stateCode) clause.stateCode = normalizeCode(a.stateCode);
    if (a.level === "state") {
      or.push(clause);
      continue;
    }

    if (a.districtCode) clause.districtCode = normalizeCode(a.districtCode);
    or.push(clause);
  }

  if (!or.length) return { _id: { $exists: false } };
  return { $or: or };
}

export function validateAssignmentFields(level, fields) {
  const countryCode = normalizeCode(fields.countryCode);
  const stateCode = normalizeCode(fields.stateCode);
  const districtCode = normalizeCode(fields.districtCode);
  const tenantId = fields.tenantId ?? null;
  const managedOrganizationId = fields.managedOrganizationId ?? null;

  if (!tenantId) {
    return {
      ok: false,
      message: `tenantId (${ORGANIZATION_CODE}) is required for all BioDrops admin assignments.`,
    };
  }

  if (level === "super") {
    if (countryCode || stateCode || districtCode || managedOrganizationId) {
      return {
        ok: false,
        message: "Super admin must not have geographic scope fields.",
      };
    }
    return { ok: true, countryCode: null, stateCode: null, districtCode: null, tenantId };
  }

  if (level === "country") {
    if (!countryCode) {
      return { ok: false, message: "countryCode is required for country admin." };
    }
    if (stateCode || districtCode) {
      return {
        ok: false,
        message: "stateCode and districtCode must be empty for country admin.",
      };
    }
    return { ok: true, countryCode, stateCode: null, districtCode: null, tenantId };
  }

  if (level === "state") {
    if (!countryCode || !stateCode) {
      return {
        ok: false,
        message: "countryCode and stateCode are required for state admin.",
      };
    }
    if (districtCode) {
      return {
        ok: false,
        message: "districtCode must be empty for state admin.",
      };
    }
    return { ok: true, countryCode, stateCode, districtCode: null, tenantId };
  }

  if (level === "district") {
    if (!countryCode || !stateCode || !districtCode) {
      return {
        ok: false,
        message:
          "countryCode, stateCode, and districtCode are required for district admin.",
      };
    }
    return { ok: true, countryCode, stateCode, districtCode, tenantId };
  }

  if (level === "ground") {
    if (!countryCode || !stateCode || !districtCode) {
      return {
        ok: false,
        message:
          "countryCode, stateCode, and districtCode are required for ground admin.",
      };
    }
    return {
      ok: true,
      countryCode,
      stateCode,
      districtCode,
      tenantId,
      managedOrganizationId,
    };
  }

  return { ok: false, message: "Invalid admin level." };
}

export function isBiodropsOrganizationCode(code) {
  return String(code || "").toUpperCase() === ORGANIZATION_CODE;
}

function buildAssignmentShape(level, tenantId, geo = {}) {
  const tid = tenantId == null ? null : String(tenantId);
  const countryCode =
    level === "super" ? null : normalizeCode(geo.countryCode) || null;
  const stateCode =
    level === "super" || level === "country"
      ? null
      : normalizeCode(geo.stateCode) || null;
  const districtCode =
    level === "super" || level === "country" || level === "state"
      ? null
      : normalizeCode(geo.districtCode) || null;

  return {
    level,
    tenantId: tid,
    countryCode,
    stateCode,
    districtCode,
    managedOrganizationId: geo.managedOrganizationId ?? null,
  };
}

function probeGeosForCreatableCheck(actor) {
  const geos = [{ countryCode: null, stateCode: null, districtCode: null }];
  for (const a of actor?.adminAssignments || []) {
    geos.push({
      countryCode: a.countryCode || null,
      stateCode: a.stateCode || null,
      districtCode: a.districtCode || null,
    });
  }
  return geos;
}

/** Admin levels the actor may invite or assign (any matching geo probe). */
export function getCreatableLevels(actor, tenantId) {
  if (!actor) return [];
  if (CROPGEN_PLATFORM_ROLES.has(actor.role)) return [...ADMIN_LEVELS];

  const tid = String(tenantId);
  const creatable = new Set();

  for (const level of ADMIN_LEVELS) {
    for (const geo of probeGeosForCreatableCheck(actor)) {
      const shape = buildAssignmentShape(level, tid, geo);
      if (canCreateAssignment(actor, shape)) {
        creatable.add(level);
        break;
      }
    }
  }

  return ADMIN_LEVELS.filter((level) => creatable.has(level));
}

export function summarizeActorGeoScope(actor) {
  if (CROPGEN_PLATFORM_ROLES.has(actor?.role)) {
    return { mode: "unrestricted", highestLevel: null };
  }

  const assignments = actor?.adminAssignments || [];
  if (assignments.some((a) => a.level === "super")) {
    return { mode: "unrestricted", highestLevel: "super" };
  }

  const countries = new Set();
  const states = [];
  const districts = [];
  const stateKeys = new Set();
  const districtKeys = new Set();

  for (const a of assignments) {
    const cc = normalizeCode(a.countryCode);
    const st = normalizeCode(a.stateCode);
    const dt = normalizeCode(a.districtCode);

    if (cc) countries.add(cc);
    if (cc && st) {
      const key = `${cc}:${st}`;
      if (!stateKeys.has(key)) {
        stateKeys.add(key);
        states.push({ countryCode: cc, stateCode: st });
      }
    }
    if (cc && st && dt) {
      const key = `${cc}:${st}:${dt}`;
      if (!districtKeys.has(key)) {
        districtKeys.add(key);
        districts.push({ countryCode: cc, stateCode: st, districtCode: dt });
      }
    }
  }

  return {
    mode: "scoped",
    highestLevel: getHighestAdminLevel(assignments),
    countries: [...countries],
    states,
    districts,
  };
}

export function buildHierarchyCapabilities(actor, tenantId) {
  const highestLevel = getHighestAdminLevel(actor?.adminAssignments || []);
  let creatableLevels = getCreatableLevels(actor, tenantId);

  if (highestLevel === "super") {
    creatableLevels = creatableLevels.filter((level) => level !== "super");
  }

  return {
    highestLevel,
    isPlatformAdmin: CROPGEN_PLATFORM_ROLES.has(actor?.role),
    creatableLevels,
    geoScope: summarizeActorGeoScope(actor),
  };
}

export function canManageUserAssignment(actor, assignment, tenantId) {
  if (CROPGEN_PLATFORM_ROLES.has(actor?.role)) return true;
  if (!assignment?.level) return false;

  return canManageAssignment(
    actor,
    buildAssignmentShape(assignment.level, tenantId || assignment.tenantId, {
      countryCode: assignment.countryCode,
      stateCode: assignment.stateCode,
      districtCode: assignment.districtCode,
      managedOrganizationId: assignment.managedOrganizationId,
    }),
  );
}

/** Valid "reports to" managers for an invitee level and region. */
export function filterManagersForInvite(actor, candidates, inviteeShape) {
  if (!inviteeShape?.level) return [];

  const inviteeRank = ADMIN_LEVEL_RANK[inviteeShape.level] || 0;
  const target = buildAssignmentShape(
    inviteeShape.level,
    inviteeShape.tenantId,
    inviteeShape,
  );

  return (candidates || []).filter((candidate) => {
    const managerRank = ADMIN_LEVEL_RANK[candidate.level] || 0;
    if (managerRank <= inviteeRank) return false;

    const managerShape = buildAssignmentShape(
      candidate.level,
      inviteeShape.tenantId,
      {
        countryCode: candidate.countryCode,
        stateCode: candidate.stateCode,
        districtCode: candidate.districtCode,
      },
    );

    return assignmentCoversTarget(managerShape, target);
  });
}
