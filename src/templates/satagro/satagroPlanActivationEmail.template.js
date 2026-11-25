import { sanitize, formatDate, satagroLayout, satagroBox } from "./satagroEmailLayout.js";

// Same parameter order as plan_activation_notification (9 values).
export const satagroPlanActivationEmailTemplate = ({ parameters = [] }) => {
  if (!Array.isArray(parameters)) throw new Error("Invalid template parameters");
  const [
    userName = "", planName = "", platform = "", planType = "",
    cropName = "", fieldName = "", area = "", startDate = "", endDate = "",
  ] = parameters;

  return satagroLayout({
    title: "🎉 Your Satagro Plan is Activated",
    color: "#15803d",
    intro: `Hello <strong>${sanitize(userName) || "Farmer"}</strong>, your plan is now active.`,
    bodyHtml: satagroBox([
      ["Plan", sanitize(planName)],
      ["Platform", sanitize(platform)],
      ["Type", sanitize(planType)],
      ["Crop", sanitize(cropName)],
      ["Field", sanitize(fieldName)],
      ["Area", sanitize(area)],
      ["Start date", formatDate(startDate)],
      ["End date", formatDate(endDate)],
    ]),
    closing: "You can now use all premium Satagro features 🚜",
    footerNote: "Thank you for choosing Satagro for smarter farming decisions.",
  });
};
