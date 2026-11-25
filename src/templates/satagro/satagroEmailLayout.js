// Shared Satagro (BioDrops) email look. Brand copy only; no CropGen branding.
export const SATAGRO_SUPPORT_EMAIL = "support@satagro.ai";

export const sanitize = (text = "") =>
  String(text ?? "").replace(/\s+/g, " ").trim();

export const formatDate = (date) => {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return sanitize(date);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
};

export const satagroLayout = ({ title, color, intro, bodyHtml, closing, footerNote }) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:auto;background:#ffffff;padding:25px;border-radius:10px;border:1px solid #e5e7eb;">
    <h2 style="color:${color};margin:0 0 12px 0;">${title}</h2>
    <p style="margin:0 0 15px 0;">${intro}</p>
    ${bodyHtml}
    <p style="color:#166534;font-weight:600;margin-top:25px;">${closing}</p>
    <p style="font-size:12px;color:#6b7280;margin-top:30px;">
      ${footerNote}<br/>
      Satagro.ai · <a href="mailto:${SATAGRO_SUPPORT_EMAIL}" style="color:#6b7280;">${SATAGRO_SUPPORT_EMAIL}</a>
    </p>
  </div>`;

export const satagroBox = (rows) => `
  <div style="background:#f9fafb;padding:18px;border-radius:8px;margin-top:15px;border:1px solid #e5e7eb;">
    ${rows.map(([label, value]) => `<p style="margin:6px 0;"><strong>${label}:</strong> ${value}</p>`).join("\n    ")}
  </div>`;
