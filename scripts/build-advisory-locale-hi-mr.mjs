import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/features/advisory/utils/i18n/messages");
const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8"));

const hiOverrides = {
  no_spray: "आज छिड़काव की आवश्यकता नहीं है।",
  no_fertigation: "आज फर्टिगेशन की आवश्यकता नहीं है।",
  no_irrigation: "आज सिंचाई की आवश्यकता नहीं है।",
  apply_fertigation: "{fertilizer} दें: {quantity}.",
  barren_no_spray:
    "बुवाई के इतने करीब खाली खेत पर पूर्व-अंकुरण छिड़काव न करें, जब तक घास/ठूंठ के लिए आवश्यक न हो।",
  barren_spray_rain_delay: "बारिश का पूर्वानुमान — खेत सूखने तक शाकनाशी/ठूंठ उपचार स्थगित करें।",
  barren_spray_consider:
    "बुवाई से पहले खाली खेत पर घास/ठूंठ प्रबंधन पर विचार करें (फसल पर पर्ण छिड़काव नहीं)।",
  barren_spray_hint:
    "यदि भारी जंगली घास या ठूंठ हैं: अनुशंसित पूर्व-बीज हर्बिसाइड से उपचार करें या यांत्रिक रूप से हटा दें। अपेक्षित बारिश से 48 घंटे पहले स्प्रे से बचें।",
  barren_fert_plan:
    "बेसल उर्वरक बुवाई के समय या ठीक पहले दिया जाता है। योजनाबद्ध {crop} के लिए मात्रा तैयार करें।",
  barren_fert_active: "बुवाई खिड़की सक्रिय — {crop} के लिए बेसल खुराक तैयार करें और लागू करें।",
  barren_irr_ok: "जमीन की तैयारी के लिए मिट्टी की नमी पर्याप्त है। बुवाई से पहले जलभराव से बचें।",
  barren_irr_dry_optional:
    "मिट्टी सूखी है पर अभी बुवाई सप्ताह नहीं — अंतिम जुताई से पहले हल्की सिंचाई वैकल्पिक।",
  barren_irr_pre_sowing_only: "पूर्व-बुवाई सिंचाई केवल तब जब बीज की गहराई पर मिट्टी सूखी हो।",
  barren_irr_rain_hold: "इस सप्ताह बारिश की संभावना — निकासी पुष्ट होने तक सिंचाई न करें।",
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
  barren_heat: "बहुत अधिक तापमान का पूर्वानुमान। शाम की बुवाई करें या ठंडे मौसम की प्रतीक्षा करें।",
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
  weather_days_note_future: " अपेक्षित बुवाई {days} दिन में।",
  weather_days_note_today: " अपेक्षित बुवाई आज है।",
  weather_days_note_overdue:
    " बुवाई तिथि {days} दिन पहले बीत गई — तारीख अपडेट करें या जल्द बोएं।",
  weather_message:
    "मौसम: {temp}. अगले 3 दिन ~{rain3} mm, 7 दिन ~{rain7} mm बारिश.{daysNote} {reason}",
  crop_risk_level_high: "उच्च",
  crop_risk_level_moderate: "मध्यम",
  crop_risk_level_low: "कम",
  crop_risk_cause_delayed: "योजना से बुवाई में देरी",
  crop_risk_cause_heavy_rain: "बुवाई से पहले भारी बारिश",
  crop_risk_cause_wet_soil: "बुवाई के लिए अत्यधिक गीली मिट्टी",
  crop_risk_cause_dry_bed: "सूखा बीज बिस्तर",
  crop_risk_cause_routine: "सामान्य पूर्व-बुवाई जोखिम",
  crop_risk_action_high:
    "बुवाई तिथि या किस्म की खिड़की समायोजित करें; जलभराव वाली मिट्टी में न बोएं।",
  crop_risk_action_low:
    "जमीन तैयारी सूची का पालन करें और बुवाई सप्ताह के पास रोज पूर्वानुमान देखें।",
  crop_risk_message: "{level} जोखिम: {cause}. {action}",
  carbon_prefix_no_crop: "अभी फसल कार्बन अवशोषण नहीं। ",
  carbon_note_organic:
    "बुवाई से पहले सड़ा हुआ FYM/कम्पोस्ट मिलाएं — जैविक पदार्थ और कार्बन संचय बढ़ेगा।",
  carbon_note_conventional: "पहली फसल चक्र से अवशेष संरक्षण और संतुलित खाद की योजना बनाएं।",
  phase_planning: "जमीन की योजना",
  phase_preparation: "जमीन की तैयारी",
  phase_imminent: "बुवाई से पहले (जल्द बुवाई)",
  phase_sowing_day: "बुवाई का दिन",
  phase_overdue: "बुवाई में देरी",
  stage_prefix_presowing: "बुवाई से पहले",
  plant_growth_description: "खाली खेत। {crop} ({variety}) की बुवाई की तैयारी। अपेक्षित बुवाई: {date}।",
  crop_health_recommendation:
    "खाली खेत — फसल नहीं है। {crop} की बुवाई से पहले की तैयारी करें। {reason}",
  yield_explanation:
    "मानक: फसल प्रोफाइल के अनुसार प्रति हेक्टेयर x खेत क्षेत्र। AI: वृद्धि, स्वास्थ्य, हरियाली, पानी, पोषक तत्वों से समायोजन।",
  yield_explanation_short: "मानक: प्रोफ़ाइल × क्षेत्र। AI: वृद्धि, स्वास्थ्य, तापमान, पानी, मिट्टी के आधार पर।",
  yield_skipped_maturity: "उपज अनुमान केवल परिपक्वता/कटाई अवस्था में दिखाया जाता है।",
  yield_skipped_barren: "उपज अनुमान बुवाई के बाद दिखाया जाता है।",
};

const mrOverrides = {
  no_spray: "आज फवारणीची गरज नाही.",
  no_fertigation: "आज फर्टिगेशनची गरज नाही.",
  no_irrigation: "आज सिंचनाची गरज नाही.",
  apply_fertigation: "{fertilizer} द्या: {quantity}.",
  barren_no_spray:
    "पेरणीइतके जवळ रानटी शेतावर तण/काडे नसल्यास पूर्व-अंकुरण फवारणी करू नका.",
  barren_spray_rain_delay: "पाऊस अपेक्षित — शेत कोरडे होईपर्यंत तणनाशक/काडे उपचार स्थगित करा.",
  barren_spray_consider:
    "पेरणीपूर्व रानटी शेतावर तण/काडे व्यवस्थापन करा (पिकाची पान फवारणी नाही).",
  barren_spray_hint:
    "जड वाढलेली तणे किंवा काडे असल्यास: शिफारस केलेले पूर्व-बीज तणनाशक वापरा किंवा यंत्राने काढा. अपेक्षित पाऊसापूर्वी 48 तास फवारणी टाळा.",
  barren_fert_plan: "बेसल खत पेरणीच्या वेळी किंवा अगोदर दिले जाते. {crop} साठी प्रमाण तयार करा.",
  barren_fert_active: "पेरणी खिडकी सक्रिय — {crop} साठी बेसल डोस तयार करा आणि द्या.",
  barren_irr_ok: "जमीन तयारीसाठी मातीतील ओलावा पुरेसा आहे. पेरणीपूर्व पाणथळ टाळा.",
  barren_irr_dry_optional:
    "माती कोरडी आहे पण अजून पेरणी आठवडा नाही — अंतिम नांगरणीपूर्व हलके सिंचन पर्यायी.",
  barren_irr_pre_sowing_only: "पूर्व-पेरणी सिंचन फक्त बियाणे खोलीवर माती कोरडी असल्यास.",
  barren_irr_rain_hold: "या आठवड्यात पाऊस अपेक्षित — निचरा खात्री होईपर्यंत सिंचन करू नका.",
  barren_irr_dry_sow:
    "पेरणीपूर्व माती कोरडी — बियाणे खोलीपर्यंत ओलाव्यासाठी हलके पूर्व-पेरणी सिंचन.",
  barren_irr_light: "पेरणीपूर्व 2–4 दिवसांनी एक हलके सिंचन. पाऊस अपेक्षित असल्यास थांबवा.",
  barren_monitoring:
    "तणांचा दबाव, 10–15 सेमी खोलीवर मातीचा ओलावा आणि शेताची सपाटता तपासा. पेरणीनंतर अपेक्षित तारीख अद्यतनित करा.",
  barren_sowing_passed:
    "अपेक्षित पेरणी तारीख उलटली. पेरणीपूर्व मातीचा ओलावा आणि जात खिडकी पुन्हा तपासा.",
  barren_heavy_rain:
    "पुढील 3 दिवसांत जोरदार पाऊस. वरची माती कोरडी होईपर्यंत अंतिम तयारी आणि पेरणी स्थगित करा.",
  barren_heat: "खूप उष्णतेचा अंदाज. संध्याकाळी पेरणी करा किंवा थंड हवामानाची वाट पहा.",
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
  weather_days_note_future: " अपेक्षित पेरणी {days} दिवसात.",
  weather_days_note_today: " अपेक्षित पेरणी आज आहे.",
  weather_days_note_overdue: " पेरणी तारीख {days} दिवसांपूर्वी — तारीख अद्यतनित करा.",
  weather_message:
    "हवामान: {temp}. पुढील 3 दिवस ~{rain3} mm, 7 दिवस ~{rain7} mm पाऊस.{daysNote} {reason}",
  crop_risk_level_high: "उच्च",
  crop_risk_level_moderate: "मध्यम",
  crop_risk_level_low: "कम",
  crop_risk_cause_delayed: "योजनेपेक्षा पेरणी उशीरा",
  crop_risk_cause_heavy_rain: "पेरणीपूर्व जोरदार पाऊस",
  crop_risk_cause_wet_soil: "पेरणीसाठी खूप ओली माती",
  crop_risk_cause_dry_bed: "कोरडा बियाणे बिछाना",
  crop_risk_cause_routine: "सामान्य पेरणीपूर्व धोका",
  crop_risk_action_high:
    "पेरणी तारीख किंवा जात खिडकी समायोजित करा; पाणथळ असलेल्या जमिनीत पेरू नका.",
  crop_risk_action_low: "जमीन तयारी यादी पाळा आणि पेरणी आठवड्याजवळ हवामान पहा.",
  crop_risk_message: "{level} धोका: {cause}. {action}",
  carbon_prefix_no_crop: "अद्याप पिक कार्बन शोषण नाही. ",
  carbon_note_organic:
    "पेरणीपूर्व सडलेले FYM/कंपोस्ट मिसळा — सेंद्रिय पदार्थ आणि कार्बन वाढेल.",
  carbon_note_conventional: "पहिल्या पिकाच्या चक्रापासून अवशेष आणि खताची योजना करा.",
  phase_planning: "जमीन नियोजन",
  phase_preparation: "जमीन तयारी",
  phase_imminent: "पेरणीपूर्व (लवकर पेरणी)",
  phase_sowing_day: "पेरणीचा दिवस",
  phase_overdue: "पेरणी उशीर",
  stage_prefix_presowing: "पेरणीपूर्व",
  plant_growth_description: "रानटी जमीन. {crop} ({variety}) पेरणीपूर्व तयारी. अपेक्षित पेरणी: {date}.",
  crop_health_recommendation: "रानटी जमीन — पिक नाही. {crop} पेरणीपूर्व तयारी करा. {reason}",
  yield_explanation:
    "मानक: पिक प्रोफाइलनुसार हेक्टर दर x शेत क्षेत्र. AI: वाढ, आरोग्य, हिरवळ, पाणी, पोषक तत्वे नुसार दुरुस्ती.",
  yield_explanation_short:
    "मानक उत्पादन: पिक प्रोफाइलनुसार × क्षेत्र. AI: वाढ, आरोग्य, तापमान, पाणी, माती यावर आधारित.",
  yield_skipped_maturity: "उत्पादन अंदाज फक्त परिपक्वता/कापणी टप्प्यावर दाखवला जातो.",
  yield_skipped_barren: "उत्पादन अंदाज फक्त पिक लागवडीनंतर दाखवला जातो.",
};

function build(overrides) {
  const out = { ...en };
  for (const [k, v] of Object.entries(overrides)) {
    if (en[k] !== undefined) out[k] = v;
  }
  return out;
}

writeFileSync(join(dir, "hi.json"), JSON.stringify(build(hiOverrides), null, 2) + "\n");
writeFileSync(join(dir, "mr.json"), JSON.stringify(build(mrOverrides), null, 2) + "\n");
console.log("Wrote hi.json and mr.json");
