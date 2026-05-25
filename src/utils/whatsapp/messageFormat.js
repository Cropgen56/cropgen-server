export const calculateCropAgeInDays = (sowingDate) => {
  if (!sowingDate) return null;

  const sowing = new Date(sowingDate);
  const today = new Date();

  const diffTime = today.getTime() - sowing.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return diffDays >= 0 ? diffDays : 0;
};

/* ================= ICON MAP ================= */

const TYPE_ICONS = {
  SPRAY: "🧴",
  FERTIGATION: "🌿",
  IRRIGATION: "🚿",
  WEATHER: "🌦️",
  CROP_RISK: "⚠️",
  MONITORING: "👁️",
  CARBON_TRACKING: "🌍",
};

/* ================= FORMAT MESSAGE ================= */

export const formatFarmAdvisoryMessage = (
  activities,
  farmField,
  farmer,
  language = "en",
) => {
  const lang = String(language || "en").toLowerCase().slice(0, 2);
  const farmerName = farmer?.firstName
    ? `${farmer.firstName}${farmer.lastName ? " " + farmer.lastName : ""}`
    : lang === "hi"
      ? "किसान"
      : lang === "mr"
        ? "शेतकरी"
        : "Farmer";

  let message =
    lang === "hi"
      ? `🌾 *कृषि सलाह – आज*\n\n${farmerName}, नमस्ते 🙏\n\n`
      : lang === "mr"
        ? `🌾 *शेती सल्ला – आज*\n\n${farmerName}, नमस्कार 🙏\n\n`
        : `🌾 *Farm Advisory – Today*\n\n${farmerName}, hello 🙏\n\n`;

  /* ================= FARM DETAILS ================= */

  if (farmField) {
    const cropAge = calculateCropAgeInDays(farmField.sowingDate);
    const formattedArea = Number(farmField.acre || 0).toFixed(2);
    const acreLabel = lang === "hi" ? "एकड़" : lang === "mr" ? "एकर" : "Acre";

    if (lang === "hi") {
      message += `📍 *खेत विवरण*\n`;
      message += `• खेत: ${farmField.fieldName}\n`;
      message += `• फसल: ${farmField.cropName} (${farmField.variety})\n`;
      message += `• क्षेत्र: ${formattedArea} ${acreLabel}\n`;
      message += `• खेती: ${farmField.typeOfFarming}\n`;
      message += `• सिंचाई: ${farmField.typeOfIrrigation}\n`;
      if (cropAge !== null) message += `• फसल आयु: ${cropAge} दिन\n`;
    } else if (lang === "mr") {
      message += `📍 *शेत माहिती*\n`;
      message += `• शेत: ${farmField.fieldName}\n`;
      message += `• पीक: ${farmField.cropName} (${farmField.variety})\n`;
      message += `• क्षेत्र: ${formattedArea} ${acreLabel}\n`;
      message += `• शेती: ${farmField.typeOfFarming}\n`;
      message += `• सिंचन: ${farmField.typeOfIrrigation}\n`;
      if (cropAge !== null) message += `• पिक वय: ${cropAge} दिवस\n`;
    } else {
      message += `📍 *Farm Details*\n`;
      message += `• Field: ${farmField.fieldName}\n`;
      message += `• Crop: ${farmField.cropName} (${farmField.variety})\n`;
      message += `• Area: ${formattedArea} ${acreLabel}\n`;
      message += `• Farming Type: ${farmField.typeOfFarming}\n`;
      message += `• Irrigation Type: ${farmField.typeOfIrrigation}\n`;
      if (cropAge !== null) message += `• Crop Age: ${cropAge} days\n`;
    }

    message += `\n——————————————\n\n`;
  }

  /* ================= ACTIVITIES ================= */

  activities.forEach((item, index) => {
    const icon = TYPE_ICONS[item.type] || "📌";

    message += `*${icon} ${item.title}*\n`;
    message += `${item.message}\n`;

    if (item.details && Object.keys(item.details).length > 0) {
      message += `\n🔍 *Details:*\n`;

      if (item.details.chemical)
        message += `• Chemical: ${item.details.chemical}\n`;

      if (item.details.fertilizer)
        message += `• Fertilizer: ${item.details.fertilizer}\n`;

      if (item.details.quantity)
        message += `• Quantity: ${item.details.quantity}\n`;

      if (item.details.method) message += `• Method: ${item.details.method}\n`;

      if (item.details.time) message += `• Time: ${item.details.time}\n`;

      if (item.details.weather)
        message += `• Weather Note: ${item.details.weather}\n`;

      if (item.details.risk) message += `• Risk Alert: ${item.details.risk}\n`;
    }

    if (index !== activities.length - 1) {
      message += `\n——————————————\n\n`;
    }
  });

  message +=
    lang === "hi"
      ? `\n✅ कृपया सलाह का पालन करें।\n📞 सहायता के लिए संपर्क करें।`
      : lang === "mr"
        ? `\n✅ कृपया सल्ल्याचे पालन करा.\n📞 मदतीसाठी संपर्क करा.`
        : `\n✅ Please follow the advisory carefully.\n📞 Contact us if you need any assistance.`;

  return message;
};

export const formatFarmAdvisoryMessageHindi = () => {
  let message = `🌾 *कृषि सलाह – आज*\n\n`;

  /* ================= GREETING ================= */

  message += `राम राम किसान भाई 🙏\n\n`;

  /* ================= MESSAGE 1 – SPRAY ================= */

  message += `📩 *MESSAGE 1 – स्प्रे*\n\n`;
  message += `🧴 *आज स्प्रे करें*\n`;
  message += `- दवा: कार्बेन्डाजिम 50%\n`;
  message += `- प्रकार: फफूंदनाशक\n`;
  message += `- मात्रा: 200 ग्राम / एकड़\n`;
  message += `- पानी: 200 लीटर / एकड़\n`;
  message += `- समय: सुबह या शाम\n\n`;
  message += `⚠️ सावधानी: हवा तेज हो या बारिश हो तो स्प्रे न करें।\n`;

  message += `\n——————————————\n\n`;

  /* ================= MESSAGE 2 – FERTIGATION ================= */

  message += `📩 *MESSAGE 2 – खाद*\n\n`;
  message += `🧪 *आज खाद दें*\n`;
  message += `- खाद: यूरिया\n`;
  message += `- फार्मुलेशन: 46%\n`;
  message += `- मात्रा: 25 किग्रा / एकड़\n`;
  message += `- तरीका: ड्रिप द्वारा\n`;
  message += `- कब: सिंचाई के बाद\n`;

  message += `\n——————————————\n\n`;

  /* ================= MESSAGE 3 – IRRIGATION ================= */

  message += `📩 *MESSAGE 3 – सिंचाई*\n\n`;
  message += `💧 *आज सिंचाई करें*\n`;
  message += `- तरीका: ड्रिप\n`;
  message += `- समय: 3 घंटे / एकड़\n`;
  message += `- उत्तम समय: सुबह\n`;

  message += `\n——————————————\n\n`;

  /* ================= MESSAGE 4 – MONITORING ================= */

  message += `📩 *MESSAGE 4 – निगरानी*\n\n`;
  message += `👀 *खेत की निगरानी करें*\n`;
  message += `- क्या देखें: पत्तियां और कीट\n`;
  message += `- कहां देखें: पूरे खेत में\n`;
  message += `- यदि 10% क्षेत्र में दिखाई दे तो हमें सूचित करें\n\n`;
  message += `📅 अगली जानकारी: 5 फरवरी 2026\n`;

  message += `\n——————————————\n\n`;

  /* ================= MESSAGE 5 – NO ACTION ================= */

  message += `📩 *MESSAGE 5 – कोई कार्य नहीं*\n\n`;
  message += `🌱 *आज कोई कार्य करने की आवश्यकता नहीं है।*\n`;
  message += `फसल की स्थिति ठीक है।\n\n`;
  message += `📅 अगली जानकारी: 5 फरवरी 2026\n`;

  message += `\n——————————————\n\n`;

  /* ================= MESSAGE 6 – CROP END ================= */

  message += `📩 *MESSAGE 6 – फसल चक्र समाप्त*\n\n`;
  message += `🌾 *इस फसल का कार्य पूर्ण हो गया है।*\n`;
  message += `इस फसल की सलाह अब बंद की जा रही है।\n\n`;
  message += `🌱 नई फसल बोने पर सलाह फिर से शुरू की जाएगी।\n`;

  return message;
};
