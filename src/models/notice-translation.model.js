import mongoose from "mongoose";

/** Server-written chat messages translated once per language (see features/agent/utils/noticeText.js). */
const noticeTranslationSchema = new mongoose.Schema(
  {
    language: { type: String, required: true, unique: true },
    /** Hash of the English source — a changed English text invalidates the stored translation. */
    sourceHash: { type: String, required: true },
    strings: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

const NoticeTranslation =
  mongoose.models.NoticeTranslation ||
  mongoose.model("NoticeTranslation", noticeTranslationSchema);
export default NoticeTranslation;
