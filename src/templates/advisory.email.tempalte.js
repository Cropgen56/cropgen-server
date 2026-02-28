const sanitize = (text = "") => text.toString().replace(/\s+/g, " ").trim();

export const advisoryEmailTemplate = ({ userName, farmName, advisory }) => {
  const date = new Date(advisory.createdAt).toLocaleDateString("en-GB");

  /* ================= ACTIVITIES SECTION ================= */

  const activitiesSection = advisory.activitiesToDo
    .map((activity) => {
      const d = activity.details || {};

      return `
        <div style="margin-bottom:20px;padding:15px;background:#f8fafc;border-radius:8px;">
          <h3 style="margin-bottom:5px;color:#16a34a;">
            ${sanitize(activity.type)} 🌱
          </h3>
          
          <p><strong>${sanitize(activity.title)}</strong></p>
          <p>${sanitize(activity.message)}</p>

          ${
            d.chemical
              ? `<p>🧪 <strong>Chemical:</strong> ${sanitize(d.chemical)}</p>`
              : ""
          }
          ${
            d.fertilizer
              ? `<p>💊 <strong>Fertilizer:</strong> ${sanitize(d.fertilizer)}</p>`
              : ""
          }
          ${
            d.quantity
              ? `<p>📦 <strong>Quantity:</strong> ${sanitize(d.quantity)}</p>`
              : ""
          }
          ${
            d.method
              ? `<p>🚜 <strong>Method:</strong> ${sanitize(d.method)}</p>`
              : ""
          }
          ${
            d.time ? `<p>⏰ <strong>Time:</strong> ${sanitize(d.time)}</p>` : ""
          }
        </div>
      `;
    })
    .join("");

  /* ================= CROP HEALTH SECTION ================= */

  const cropHealthSection = advisory.cropHealth
    ? `
      <div style="margin-top:25px;padding:15px;background:#ecfdf5;border-radius:8px;">
        <h3 style="color:#15803d;">🌿 Crop Health</h3>
        <p><strong>Score:</strong> ${advisory.cropHealth.score || "-"}</p>
        <p><strong>Health %:</strong> ${advisory.cropHealth.percentage || "-"}%</p>
        <p><strong>Category:</strong> ${sanitize(advisory.cropHealth.category || "-")}</p>
        <p><strong>Recommendation:</strong> ${sanitize(advisory.cropHealth.recommendation || "-")}</p>
      </div>
    `
    : "";

  /* ================= YIELD SECTION ================= */

  const yieldSection = advisory.yield
    ? `
      <div style="margin-top:25px;padding:15px;background:#eff6ff;border-radius:8px;">
        <h3 style="color:#1d4ed8;">📊 Yield Prediction</h3>
        <p><strong>Standard Yield:</strong> ${advisory.yield.standardYield || "-"} ${advisory.yield.unit}</p>
        <p><strong>AI Predicted Yield:</strong> ${advisory.yield.aiYield || "-"} ${advisory.yield.unit}</p>
        <p>${sanitize(advisory.yield.explanation || "")}</p>
      </div>
    `
    : "";

  /* ================= PLANT GROWTH SECTION ================= */

  const plantGrowthSection = advisory.plantGrowthActivity
    ? `
      <div style="margin-top:25px;padding:15px;background:#fefce8;border-radius:8px;">
        <h3 style="color:#ca8a04;">🌾 Plant Growth Stage</h3>
        <p><strong>BBCH Stage:</strong> ${advisory.plantGrowthActivity.bbchStage || "-"}</p>
        <p><strong>Stage Name:</strong> ${sanitize(advisory.plantGrowthActivity.stageName || "-")}</p>
        <p><strong>Description:</strong> ${sanitize(advisory.plantGrowthActivity.description || "-")}</p>
        <p><strong>Cumulative GDD:</strong> ${advisory.plantGrowthActivity.cumulativeGDD || "-"}</p>
      </div>
    `
    : "";

  /* ================= FINAL TEMPLATE ================= */

  return `
  <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;line-height:1.6;">
    
    <h2 style="color:#16a34a;">🌾 CropGen Smart Farm Advisory</h2>

    <p>Hello <strong>${sanitize(userName)}</strong>,</p>
    <p><strong>Farm:</strong> ${sanitize(farmName)}</p>
    <p><strong>Date:</strong> ${date}</p>

    <hr style="margin:20px 0;" />

    ${activitiesSection}

    ${cropHealthSection}

    ${yieldSection}

    ${plantGrowthSection}

    <hr style="margin:25px 0;" />

    <p style="color:#15803d;font-weight:bold;">
      Please follow the above recommendations for better crop performance 🌿
    </p>

    <p style="font-size:12px;color:#6b7280;margin-top:30px;">
      This advisory is generated using AI-powered crop intelligence by CropGen.
    </p>

  </div>
  `;
};
