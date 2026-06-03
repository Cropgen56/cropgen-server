import mongoose from "mongoose";
import {
  ADMIN_ASSIGNMENT_STATUS,
  ADMIN_LEVELS,
} from "../constants/adminLevels.js";

const { Schema } = mongoose;

const adminAssignmentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    level: {
      type: String,
      enum: ADMIN_LEVELS,
      required: true,
    },
    /** Always BioDrops tenant organization. */
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    countryCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: null,
    },
    stateCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10,
      default: null,
    },
    districtCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 32,
      default: null,
    },
    managedOrganizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    status: {
      type: String,
      enum: ADMIN_ASSIGNMENT_STATUS,
      default: "active",
      index: true,
    },
    appointedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

const activePartial = { status: "active" };

adminAssignmentSchema.index(
  { tenantId: 1, level: 1 },
  {
    unique: true,
    partialFilterExpression: { ...activePartial, level: "super" },
  },
);

adminAssignmentSchema.index(
  { tenantId: 1, countryCode: 1 },
  {
    unique: true,
    partialFilterExpression: { ...activePartial, level: "country" },
  },
);

adminAssignmentSchema.index(
  { tenantId: 1, countryCode: 1, stateCode: 1 },
  {
    unique: true,
    partialFilterExpression: { ...activePartial, level: "state" },
  },
);

adminAssignmentSchema.index(
  { tenantId: 1, countryCode: 1, stateCode: 1, districtCode: 1 },
  {
    unique: true,
    partialFilterExpression: { ...activePartial, level: "district" },
  },
);

adminAssignmentSchema.index({ userId: 1, status: 1 });

const BiodropsAdminAssignment =
  mongoose.models.BiodropsAdminAssignment ||
  mongoose.model("BiodropsAdminAssignment", adminAssignmentSchema);

export default BiodropsAdminAssignment;
