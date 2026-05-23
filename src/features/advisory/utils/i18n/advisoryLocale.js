/**
 * Farmer-facing advisory strings (en / hi / mr).
 * Evidence may stay in English for the LLM; hints and rule-based activities use this.
 */

export function normalizeAdvisoryLanguage(lang) {
  const code = String(lang || "en").toLowerCase().replace(/[^a-z]/g, "").slice(0, 2);
  if (code === "hi" || code === "mr") return code;
  return "en";
}

const MESSAGES = {
  en: {
    no_spray: "No spray required today.",
    no_fertigation: "No fertigation needed today.",
    no_irrigation: "No irrigation needed today.",
    apply_fertigation: "Apply {fertilizer}: {quantity}.",
    barren_no_spray: "No pre-emergence spray on bare soil this close to sowing unless needed for weeds/stubble.",
    barren_spray_rain_delay:
      "Rain forecast — delay herbicide/stubble treatment until the field is dry.",
    barren_spray_consider:
      "Consider weed/stubble management on barren field before sowing (not crop foliar spray).",
    barren_spray_hint:
      "If heavy weeds or stubble: use recommended pre-sowing herbicide or remove mechanically. Avoid spray within 48 hours of expected rain.",
    barren_fert_plan:
      "Basal fertilizer is applied at or just before sowing. Prepare quantities for planned {crop}.",
    barren_fert_active: "Sowing window active — prepare and apply basal dose for {crop}.",
    barren_irr_ok:
      "Soil moisture adequate for land prep. Avoid waterlogging before sowing.",
    barren_irr_dry_optional:
      "Soil moisture low but not yet sowing week — light irrigation optional before final tillage.",
    barren_irr_pre_sowing_only:
      "Pre-sowing irrigation only if seedbed is dry at sowing depth.",
    barren_irr_rain_hold:
      "Rain expected this week — do not irrigate until drainage is confirmed.",
    barren_irr_dry_sow:
      "Soil is dry ahead of sowing — light pre-sowing irrigation to bring moisture to seed depth.",
    barren_irr_light:
      "One light irrigation 2–4 days before sowing (or soak if furrow sowing). Stop if rain is forecast.",
    barren_monitoring:
      "Check weed pressure, soil moisture at 10–15 cm, and field levelness. Update expected sowing date after sowing.",
    barren_sowing_passed:
      "Expected sowing date has passed. Reassess soil moisture and variety window before sowing.",
    barren_heavy_rain:
      "Heavy rain expected in the next 3 days. Delay final land prep and sowing until topsoil drains.",
    barren_heat:
      "Very high temperatures forecast. Prefer evening sowing or wait for a cooler spell.",
    barren_rain_sowing_week:
      "Moderate rain near sowing week. Complete primary tillage now; sow after rain clears.",
    barren_dry_window:
      "Relatively dry window ahead — good for land leveling, final tillage, and basal fertilizer incorporation.",
    barren_monitor_weekly:
      "Monitor forecast weekly. Complete deep ploughing and residue management before the sowing week.",
    title_spray_barren: "Weed / stubble (pre-sowing)",
    title_fert_barren: "Basal fertilizer",
    title_irr_barren: "Pre-sowing irrigation",
    title_weather_barren: "Sowing window & weather",
    title_risk_barren: "Pre-sowing risk",
    title_monitor_barren: "Field readiness",
    title_carbon_barren: "Soil & carbon (pre-sowing)",
  },
  hi: {
    no_spray: "आज छिड़काव की आवश्यकता नहीं है।",
    no_fertigation: "आज फर्टिगेशन की आवश्यकता नहीं है।",
    no_irrigation: "आज सिंचाई की आवश्यकता नहीं है।",
    apply_fertigation: "{fertilizer} दें: {quantity}.",
    barren_no_spray:
      "बुवाई के इतने करीब खाली खेत पर पूर्व-अंकुरण छिड़काव न करें, जब तक घास/ठूंठ के लिए आवश्यक न हो।",
    barren_spray_rain_delay:
      "बारिश का पूर्वानुमान — खेत सूखने तक शाकनाशी/ठूंठ उपचार स्थगित करें।",
    barren_spray_consider:
      "बुवाई से पहले खाली खेत पर घास/ठूंठ प्रबंधन पर विचार करें (फसल पर पर्ण छिड़काव नहीं)।",
    barren_spray_hint:
      "यदि भारी जंगली घास या ठूंठ हैं: अनुशंसित पूर्व-बीज हर्बिसाइड से उपचार करें या यांत्रिक रूप से हटा दें। अपेक्षित बारिश से 48 घंटे पहले स्प्रे से बचें।",
    barren_fert_plan:
      "बेसल उर्वरक बुवाई के समय या ठीक पहले दिया जाता है। योजनाबद्ध {crop} के लिए मात्रा तैयार करें।",
    barren_fert_active: "बुवाई खिड़की सक्रिय — {crop} के लिए बेसल खुराक तैयार करें और लागू करें।",
    barren_irr_ok:
      "जमीन की तैयारी के लिए मिट्टी की नमी पर्याप्त है। बुवाई से पहले जलभराव से बचें।",
    barren_irr_dry_optional:
      "मिट्टी सूखी है पर अभी बुवाई सप्ताह नहीं — अंतिम जुताई से पहले हल्की सिंचाई वैकल्पिक।",
    barren_irr_pre_sowing_only:
      "पूर्व-बुवाई सिंचाई केवल तब जब बीज की गहराई पर मिट्टी सूखी हो।",
    barren_irr_rain_hold:
      "इस सप्ताह बारिश की संभावना — निकासी पुष्ट होने तक सिंचाई न करें।",
    barren_irr_dry_sow:
      "बुवाई से पहले मिट्टी सूखी है — बीज की गहराई तक नमी के लिए हल्की पूर्व-बुवाई सिंचाई।",
    barren_irr_light:
      "बुवाई से 2–4 दिन पहले एक हल्की सिंचाई (या फरो सिंचाई)। बारिश का पूर्वानुमान हो तो रोकें।",
    barren_monitoring:
      "जंगली घास का दबाव, 10–15 सेमी पर मिट्टी की नमी और खेत की समतलता की जांच करें। बुवाई के बाद अपेक्षित बुवाई तिथि अपडेट करें।",
    barren_sowing_passed:
      "अपेक्षित बुवाई तिथि बीत चुकी है। बुवाई से पहले मिट्टी की नमी और किस्म की खिड़की पुनः जांचें।",
    barren_heavy_rain:
      "अगले 3 दिनों में भारी बारिश की संभावना। ऊपरी मिट्टी सूखने तक अंतिम जमीन तैयारी और बुवाई स्थगित करें।",
    barren_heat:
      "बहुत अधिक तापमान का पूर्वानुमान। शाम की बुवाई करें या ठंडे मौसम की प्रतीक्षा करें।",
    barren_rain_sowing_week:
      "बुवाई सप्ताह के पास मध्यम बारिश। अभी प्राथमिक जुताई पूरी करें; बारिश साफ होने के बाद बोएं।",
    barren_dry_window:
      "आगे अपेक्षित सूखा मौसम — समतलीकरण, अंतिम जुताई और बेसल उर्वरक मिलाने के लिए अच्छा।",
    barren_monitor_weekly:
      "साप्ताहिक पूर्वानुमान देखें। बुवाई सप्ताह से पहले गहरी जुताई और अवशेष प्रबंधन पूरा करें।",
    title_spray_barren: "घास / ठूंठ (बुवाई से पहले)",
    title_fert_barren: "बेसल उर्वरक",
    title_irr_barren: "पूर्व-बुवाई सिंचाई",
    title_weather_barren: "बुवाई खिड़की और मौसम",
    title_risk_barren: "पूर्व-बुवाई जोखिम",
    title_monitor_barren: "खेत की तैयारी",
    title_carbon_barren: "मिट्टी और कार्बन (बुवाई से पहले)",
  },
  mr: {
    no_spray: "आज फवारणीची गरज नाही.",
    no_fertigation: "आज फर्टिगेशनची गरज नाही.",
    no_irrigation: "आज सिंचनाची गरज नाही.",
    apply_fertigation: "{fertilizer} द्या: {quantity}.",
    barren_no_spray:
      "पेरणीइतके जवळ रानटी शेतावर तण/काडे नसल्यास पूर्व-अंकुरण फवारणी करू नका.",
    barren_spray_rain_delay:
      "पाऊस अपेक्षित — शेत कोरडे होईपर्यंत तणनाशक/काडे उपचार स्थगित करा.",
    barren_spray_consider:
      "पेरणीपूर्व रानटी शेतावर तण/काडे व्यवस्थापन करा (पिकाची पान फवारणी नाही).",
    barren_spray_hint:
      "जड वाढलेली तणे किंवा काडे असल्यास: शिफारस केलेले पूर्व-बीज तणनाशक वापरा किंवा यंत्राने काढा. अपेक्षित पाऊसापूर्वी 48 तास फवारणी टाळा.",
    barren_fert_plan:
      "बेसल खत पेरणीच्या वेळी किंवा अगोदर दिले जाते. {crop} साठी प्रमाण तयार करा.",
    barren_fert_active: "पेरणी खिडकी सक्रिय — {crop} साठी बेसल डोस तयार करा आणि द्या.",
    barren_irr_ok:
      "जमीन तयारीसाठी मातीतील ओलावा पुरेसा आहे. पेरणीपूर्व पाणथळ टाळा.",
    barren_irr_dry_optional:
      "माती कोरडी आहे पण अजून पेरणी आठवडा नाही — अंतिम नांगरणीपूर्व हलके सिंचन पर्यायी.",
    barren_irr_pre_sowing_only:
      "पूर्व-पेरणी सिंचन फक्त बियाणे खोलीवर माती कोरडी असल्यास.",
    barren_irr_rain_hold:
      "या आठवड्यात पाऊस अपेक्षित — निचरा खात्री होईपर्यंत सिंचन करू नका.",
    barren_irr_dry_sow:
      "पेरणीपूर्व माती कोरडी — बियाणे खोलीपर्यंत ओलाव्यासाठी हलके पूर्व-पेरणी सिंचन.",
    barren_irr_light:
      "पेरणीपूर्व 2–4 दिवसांनी एक हलके सिंचन. पाऊस अपेक्षित असल्यास थांबवा.",
    barren_monitoring:
      "तणांचा दबाव, 10–15 सेमी खोलीवर मातीचा ओलावा आणि शेताची सपाटता तपासा. पेरणीनंतर अपेक्षित तारीख अद्यतनित करा.",
    barren_sowing_passed:
      "अपेक्षित पेरणी तारीख उलटली. पेरणीपूर्व मातीचा ओलावा आणि जात खिडकी पुन्हा तपासा.",
    barren_heavy_rain:
      "पुढील 3 दिवसांत जोरदार पाऊस. वरची माती कोरडी होईपर्यंत अंतिम तयारी आणि पेरणी स्थगित करा.",
    barren_heat:
      "खूप उष्णतेचा अंदाज. संध्याकाळी पेरणी करा किंवा थंड हवामानाची वाट पहा.",
    barren_rain_sowing_week:
      "पेरणी आठवड्याजवळ मध्यम पाऊस. आता प्राथमिक नांगरणी पूर्ण करा; पाऊस थांबल्यावर पेरा.",
    barren_dry_window:
      "पुढे तुलनेने कोरडी खिडकी — समतल करणे, अंतिम नांगरणी आणि बेसल खत मिसळण्यासाठी चांगले.",
    barren_monitor_weekly:
      "साप्ताहिक हवामान पाहा. पेरणी आठवड्यापूर्वी खोल नांगरणी आणि अवशेष व्यवस्थापन पूर्ण करा.",
    title_spray_barren: "तण / काडे (पेरणीपूर्व)",
    title_fert_barren: "बेसल खत",
    title_irr_barren: "पूर्व-पेरणी सिंचन",
    title_weather_barren: "पेरणी खिडकी आणि हवामान",
    title_risk_barren: "पेरणीपूर्व धोका",
    title_monitor_barren: "शेत तयारी",
    title_carbon_barren: "माती आणि कार्बन (पेरणीपूर्व)",
  },
};

export function t(key, lang, vars = {}) {
  const code = normalizeAdvisoryLanguage(lang);
  let text = MESSAGES[code]?.[key] ?? MESSAGES.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, String(v ?? ""));
  }
  return text;
}

/** True when text has almost no Indic script (likely English in hi/mr advisory). */
export function isMostlyLatin(text) {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;
  const indic = (trimmed.match(/[\u0900-\u097F]/g) || []).length;
  return indic / trimmed.length < 0.08;
}

/**
 * Replace English-only activity text with localized rule-based messages (hi/mr).
 */
export function mergeLocalizedActivities(activitiesToDo, fallbackActivities, language) {
  const lang = normalizeAdvisoryLanguage(language);
  if (lang === "en" || !Array.isArray(fallbackActivities)) {
    return activitiesToDo;
  }

  const fallbackMap = new Map(
    fallbackActivities.filter((a) => a?.type).map((a) => [a.type, a]),
  );

  return (activitiesToDo || []).map((act) => {
    const fb = fallbackMap.get(act?.type);
    if (!fb) return act;

    const msg = (act?.message || "").trim();
    const fbMsg = (fb.message || "").trim();
    const titleLatin = isMostlyLatin(act?.title);
    const msgLatin = isMostlyLatin(msg);

    if ((msgLatin && fbMsg && !isMostlyLatin(fbMsg)) || (titleLatin && fb.title)) {
      return {
        ...act,
        title: fb.title || act.title,
        message: fbMsg || msg,
        details:
          fb.details && Object.keys(fb.details).length
            ? fb.details
            : act.details,
      };
    }
    return act;
  });
}
