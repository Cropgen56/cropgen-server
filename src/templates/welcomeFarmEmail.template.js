const sanitize = (text = "") => text?.toString().replace(/\s+/g, " ").trim();

export const welcomeFarmEmailTemplate = ({ parameters = [] }) => {
  if (!Array.isArray(parameters)) {
    throw new Error("Invalid template parameters: expected array");
  }

  const [userName = ""] = parameters;
  const safeName = sanitize(userName) || "Farmer";

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:auto;background:#ffffff;padding:25px;border-radius:10px;border:1px solid #e5e7eb;line-height:1.6;">
    
    <h2 style="color:#15803d;margin-bottom:10px;">
      🌱 Welcome to CropGen
    </h2>

    <p>
      Hello <strong>${safeName}</strong>,
    </p>

    <p>
      You have successfully logged into <strong>CropGen</strong> 🌱
    </p>

    <p>
      Add your farm to start receiving:
    </p>

    <ul style="padding-left:20px;margin-bottom:20px;">
      <li>🌾 Crop health monitoring</li>
      <li>🛰 Satellite crop monitoring</li>
      <li>🌦 Weather alerts</li>
      <li>📊 Yield prediction</li>
      <li>🧑‍🌾 Smart farming advisory</li>
    </ul>

    <p style="margin-bottom:15px;">
      Create your farm now and let CropGen help improve your harvest 🚜
    </p>

    <!-- Web Dashboard Button -->
    <div style="margin:20px 0;">
      <a href="https://app.cropgenapp.com/" 
         style="background:#15803d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:bold;display:inline-block;">
        🌐 Open CropGen Web Dashboard
      </a>
    </div>

    <!-- Mobile App Button -->
    <div style="margin:15px 0;">
      <a href="https://play.google.com/store/apps/details?id=com.cropgenapp&pcampaignid=web_share" 
         style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:bold;display:inline-block;">
        📱 Download CropGen Mobile App
      </a>
    </div>

    <!-- Tutorial Section -->
    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #e5e7eb;">
      
      <h3 style="margin-bottom:10px;">
        📺 How to Add Your Farm
      </h3>

      <p style="margin-bottom:10px;">
        Watch this quick tutorial to learn how to add your farm and start using CropGen.
      </p>

      <a href="https://youtu.be/U_sVgXnqYPk?si=5qHDPJXihfBDNaal" target="_blank">
        ▶️ Watch the Tutorial Video
      </a>

    </div>

  </div>
  `;
};
