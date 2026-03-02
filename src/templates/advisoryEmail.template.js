const sanitize = (text = "") => text?.toString().replace(/\s+/g, " ").trim();

const formatDate = (createdAt) => {
  const dateObj = createdAt ? new Date(createdAt) : new Date();
  return dateObj.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

export const advisoryEmailTemplateFromNotification = ({
  parameters = [],
  createdAt,
}) => {
  if (!Array.isArray(parameters)) {
    throw new Error("Invalid template parameters: expected array");
  }

  const [
    userName = "",
    farmName = "",
    spray = "",
    fertigation = "",
    irrigation = "",
    weather = "",
    cropRisk = "",
  ] = parameters;

  const date = formatDate(createdAt);

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:auto;background:#ffffff;padding:25px;border-radius:10px;border:1px solid #e5e7eb;">
    
    <h2 style="color:#15803d;margin-bottom:10px;">
      🌾 CropGen Smart Farm Advisory
    </h2>

    <p style="margin:0 0 5px 0;">
      Hello <strong>${sanitize(userName)}</strong>,
    </p>
    <p style="margin:0 0 5px 0;">
      <strong>Farm:</strong> ${sanitize(farmName)}
    </p>
    <p style="margin:0 0 15px 0;">
      <strong>Date:</strong> ${date}
    </p>

    <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;" />

    ${buildSection("🧴 Spray Advisory", spray)}
    ${buildSection("💧 Fertigation Advisory", fertigation)}
    ${buildSection("🚿 Irrigation Advisory", irrigation)}
    ${buildSection("🌦 Weather Advisory", weather)}
    ${buildSection("⚠ Crop Risk Alert", cropRisk)}

    <hr style="margin:25px 0;border:none;border-top:1px solid #e5e7eb;" />

    <p style="color:#166534;font-weight:600;margin-bottom:10px;">
      Please follow the above recommendations carefully for optimal crop management.
    </p>

    <p style="font-size:12px;color:#6b7280;margin-top:25px;">
      This advisory is generated using AI-powered crop intelligence and farm-specific data analysis by CropGen.
    </p>

  </div>
  `;
};

function buildSection(title, content) {
  if (!content || !content.trim()) return "";

  return `
    <div style="background:#f9fafb;padding:18px;border-radius:8px;margin-bottom:18px;border:1px solid #e5e7eb;">
      <h3 style="margin-top:0;color:#111827;font-size:16px;">
        ${title}
      </h3>
      <p style="margin:8px 0 0 0;color:#374151;font-size:14px;line-height:1.6;">
        ${sanitize(content)}
      </p>
    </div>
  `;
}
