import mongoose from "mongoose";

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    firstName: {
      type: String,
      maxlength: 50,
      trim: true,
    },

    lastName: {
      type: String,
      maxlength: 50,
      trim: true,
    },

    avatar: {
      type: String,
      default: null,
    },

    email: {
      type: String,
      sparse: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^\+\d{8,15}$/.test(v);
        },
        message: (props) => `${props.value} is not a valid phone number!`,
      },
    },

    country: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: null,
    },
    state: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10,
      default: null,
    },
    city: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    village: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    role: {
      type: String,
      enum: ["farmer", "admin", "developer", "client"],
      default: "farmer",
    },

    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },

    language: {
      type: String,
      enum: [
        "as",
        "bn",
        "brx",
        "doi",
        "en",
        "gu",
        "hi",
        "kn",
        "ks",
        "kok",
        "ml",
        "mni",
        "mr",
        "mai",
        "ne",
        "or",
        "pa",
        "sa",
        "sat",
        "sd",
        "ta",
        "te",
        "ur",
      ],
      default: "en",
      index: true,
    },

    terms: {
      type: Boolean,
      required: true,
    },

    otp: { type: String, default: null },
    otpExpires: { type: Date, default: null },
    otpAttemptCount: { type: Number, default: 0 },
    lastOtpSentAt: { type: Date, default: null },

    lastLoginAt: { type: Date, default: null },

    lastActiveAt: {
      type: Date,
    },

    refreshTokenId: { type: String, default: null },

    firebaseUid: {
      type: String,
      default: null,
    },

    clientSource: {
      type: String,
      enum: ["web", "android", "ios", "webview", "unknown"],
      default: "unknown",
    },

    razorpayCustomerId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ createdAt: 1 });
userSchema.index({ lastActiveAt: 1 });
userSchema.index({ role: 1 });
userSchema.index(
  { phone: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { phone: { $type: "string", $ne: "" } },
  },
);

const User = mongoose.model("User", userSchema);

export default User;
