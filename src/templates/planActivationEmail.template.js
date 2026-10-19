const sanitize = (text = "") => text?.toString().replace(/\s+/g, " ").trim();

const formatDate = (date) => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatArea = (area) => {
  const num = Number(area);
  if (isNaN(num)) return "0.00";
  return num.toFixed(2);
};

export const planActivationEmailTemplate = ({ parameters = [], createdAt }) => {
  if (!Array.isArray(parameters)) {
    throw new Error("Invalid template parameters");
  }

  const [
    userName = "",
    planName = "",
    platform = "",
    planType = "",
    cropName = "",
    fieldName = "",
    area = "",
    startDate = "",
    endDate = "",
  ] = parameters;

  const safeName = sanitize(userName) || "Farmer";

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:auto;background:#ffffff;padding:25px;border-radius:10px;border:1px solid #e5e7eb;">
    
    <h2 style="color:#15803d;">🎉 Subscription Activated Successfully</h2>

    <p>Hello <strong>${safeName}</strong>,</p>

    <div style="background:#f9fafb;padding:18px;border-radius:8px;margin-top:15px;border:1px solid #e5e7eb;">
      
      <p><strong>📦 Plan:</strong> ${sanitize(planName)}</p>
      <p><strong>🖥 Platform:</strong> ${sanitize(platform)}</p>
      <p><strong>💰 Type:</strong> ${sanitize(planType)}</p>

      <hr style="margin:15px 0;">

      <p><strong>🌾 Crop:</strong> ${sanitize(cropName)}</p>
      <p><strong>🏞 Field:</strong> ${sanitize(fieldName)}</p>
     <p><strong>📏 Area:</strong> ${sanitize(area)}</p>

      <hr style="margin:15px 0;">

      <p><strong>📅 Start Date:</strong> ${formatDate(startDate)}</p>
      <p><strong>📅 End Date:</strong> ${formatDate(endDate)}</p>

    </div>

    <p style="margin-top:20px;color:#166534;font-weight:600;">
      You can now enjoy all premium CropGen features 🚜
    </p>

    <p style="font-size:12px;color:#6b7280;margin-top:30px;">
      Thank you for choosing CropGen for smarter farming decisions.
    </p>

  </div>
  `;
};
