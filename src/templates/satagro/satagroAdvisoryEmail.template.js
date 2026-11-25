import { sanitize, satagroLayout, satagroBox, formatDate } from "./satagroEmailLayout.js";

const section = (title, text) => {
  const body = sanitize(text);
  return `
    <div style="margin:18px 0;">
      <p style="margin:0 0 6px 0;font-weight:700;color:#14532d;">${title}</p>
      <p style="margin:0;">${body || "No update."}</p>
    </div>`;
};

// Same parameter order as the farm_advisory notification (12 values).
export const satagroAdvisoryEmailTemplate = ({ parameters = [], createdAt }) => {
  if (!Array.isArray(parameters)) throw new Error("Invalid template parameters: expected array");
  const [
    userName = "", date = "", crop = "", field = "", area = "",
    spray = "", fertigation = "", irrigation = "", weather = "",
    cropRisk = "", monitoring = "", carbonUpdate = "",
  ] = parameters;

  const displayDate = sanitize(date) || formatDate(createdAt || new Date());

  return satagroLayout({
    title: "🌾 Satagro Smart Farm Advisory",
    color: "#15803d",
    intro: `Hello <strong>${sanitize(userName) || "Farmer"}</strong>,`,
    bodyHtml: `
    ${satagroBox([
      ["Date", displayDate],
      ["Crop", sanitize(crop)],
      ["Field", sanitize(field)],
      ["Area", sanitize(area)],
    ])}
    <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;" />
    ${section("🧴 Spray Advisory", spray)}
    ${section("🧪 Fertigation Advisory", fertigation)}
    ${section("🚿 Irrigation Advisory", irrigation)}
    ${section("🌤 Weather Advisory", weather)}
    ${section("⚠ Crop Risk Alert", cropRisk)}
    ${section("👁 Monitoring", monitoring)}
    ${section("🌍 Carbon Update", carbonUpdate)}`,
    closing: "Please follow the above recommendations carefully for optimal crop management.",
    footerNote: "This advisory is generated using AI-powered crop intelligence and farm-specific data analysis by Satagro.",
  });
};
