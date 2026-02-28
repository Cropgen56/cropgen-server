const sanitize = (text = "") => text.toString().replace(/\s+/g, " ").trim();

export const buildSubscriptionActivationEmailTemplate = ({
  userName,
  planName,
  platform,
  billingCycle,
  fieldName,
  area,
  startDate,
  endDate,
}) => {
  return `
  <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;line-height:1.6;">
    
    <h2 style="color:#16a34a;">🎉 Subscription Activated Successfully</h2>

    <p>Hello <strong>${sanitize(userName)}</strong>,</p>

    <p>Your CropGen subscription has been successfully activated.</p>

    <div style="background:#f4f6f8;padding:15px;border-radius:8px;margin-top:15px;">
      <p><strong>📦 Plan:</strong> ${sanitize(planName)}</p>
      <p><strong>🖥 Platform:</strong> ${sanitize(platform)}</p>
      <p><strong>💰 Type:</strong> ${sanitize(billingCycle)}</p>
      <p><strong>🌾 Field:</strong> ${sanitize(fieldName)}</p>
      <p><strong>📏 Area:</strong> ${sanitize(area)} acres</p>
      <p><strong>📅 Start Date:</strong> ${sanitize(startDate)}</p>
      <p><strong>📅 End Date:</strong> ${sanitize(endDate)}</p>
    </div>

    <p style="margin-top:20px;color:#15803d;font-weight:bold;">
      You can now access premium CropGen features 🚜
    </p>

    <p style="font-size:12px;color:#6b7280;margin-top:30px;">
      This is an automated notification from CropGen.
    </p>

  </div>
  `;
};
