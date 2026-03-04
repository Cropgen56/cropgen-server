const sanitize = (text = "") => text?.toString().replace(/\s+/g, " ").trim();

const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

export const planExpiryReminderEmailTemplate = ({ parameters = [] }) => {
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
    daysRemaining = "",
  ] = parameters;

  return `
  <div style="font-family:Arial;max-width:720px;margin:auto;padding:25px;border:1px solid #e5e7eb;border-radius:10px;">
    
    <h2 style="color:#b91c1c;">⏳ Subscription Expiry Reminder</h2>

    <p>Hello <strong>${sanitize(userName) || "Farmer"}</strong>,</p>

    <div style="background:#fef2f2;padding:18px;border-radius:8px;border:1px solid #fecaca;">
      
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
      <p><strong>⏰ Days Remaining:</strong> ${sanitize(daysRemaining)}</p>
    </div>

    <p style="margin-top:20px;color:#991b1b;font-weight:600;">
      Please renew your subscription before expiry to avoid interruption in advisory services.
    </p>

  </div>
  `;
};
