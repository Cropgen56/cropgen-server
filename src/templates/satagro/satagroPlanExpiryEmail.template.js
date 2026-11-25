import { sanitize, formatDate, satagroLayout, satagroBox } from "./satagroEmailLayout.js";

// Same parameter order as plan_expiry_reminder_notification (10 values).
export const satagroPlanExpiryEmailTemplate = ({ parameters = [] }) => {
  if (!Array.isArray(parameters)) throw new Error("Invalid template parameters");
  const [
    userName = "", planName = "", platform = "", planType = "",
    cropName = "", fieldName = "", area = "", startDate = "", endDate = "", daysRemaining = "",
  ] = parameters;

  return satagroLayout({
    title: "⏳ Your Satagro Plan is Expiring Soon",
    color: "#b45309",
    intro: `Hello <strong>${sanitize(userName) || "Farmer"}</strong>, your plan ends in <strong>${sanitize(daysRemaining) || "a few"}</strong> day(s).`,
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
    closing: "Please renew before the end date to avoid interruption to your service.",
    footerNote: "Thank you for choosing Satagro for smarter farming decisions.",
  });
};
