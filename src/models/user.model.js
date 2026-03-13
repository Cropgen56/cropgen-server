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
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^\+\d{10,12}$/.test(v);
        },
        message: (props) => `${props.value} is not a valid phone number!`,
      },
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
      enum: ["en", "hi", "mr", "fr", "gu", "bn", "ta", "ur", "de", "es"],
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
  },
  {
    timestamps: true,
  },
);

userSchema.index({ createdAt: 1 });
userSchema.index({ lastActiveAt: 1 });
userSchema.index({ role: 1 });

const User = mongoose.model("User", userSchema);

export default User;
