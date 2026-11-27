#!/usr/bin/env python3
"""Rules-engine message keys for all 23 advisory languages. Merged into utils/i18n/messages/<lang>.json.

Usage: python3 engine_messages.py ../../utils/i18n/messages
Other languages: keys fall back to English at runtime until translated
(run the existing scripts/sync-advisory-locale-keys.mjs, then translate).
"""
import json
import re
import sys
from pathlib import Path

EN = {
    # Spray
    "rk_spray_none": "No pest or disease risk from the weather. No spray needed today.",
    "rk_spray_no_weather": "Weather data is incomplete, so spray risk could not be checked. Inspect the crop before spraying.",
    "rk_spray_indoor": "Indoor crop - no field spray advice.",
    "rk_spray_now": "High risk of {pest}. Spray {product} at {dose}, {timing}.",
    "rk_spray_wait": "High risk of {pest}, but {blocker}. Spray {product} at {dose} on {date}.",
    "rk_spray_wait_nodate": "High risk of {pest}, but {blocker}. Spray {product} at {dose} on the next dry, calm day.",
    "rk_spray_monitor": "Risk of {pest} is rising. Inspect the field in the next 2 days; spray only if you see it.",
    "rk_spray_monitor_product": "Risk of {pest} is rising. Inspect the field in the next 2 days. If you see it, spray {product} at {dose}.",
    "rk_spray_recent": "{pest}: sprayed on {date}. No repeat spray needed now - keep watching.",
    "rk_spray_consult": "High risk of {pest}. No registered product in our list for your country - follow the local label or your agronomist.",
    "rk_spray_harvest": "Risk of {pest}, but the crop is near harvest. Do not use chemical sprays now.",
    "rk_block_rain": "rain is expected today",
    "rk_block_wind": "wind is too strong today",
    "rk_time_spray_morning": "early morning when there is no wind",
    "rk_time_spray_evening": "after 5 PM (hot day)",
    # Irrigation
    "rk_irr_indoor": "Indoor crop - keep room humidity at 80-90%.",
    "rk_irr_skip_rain": "Rain expected today (~{rain} mm). Do not irrigate.",
    "rk_irr_drain": "Heavy rain (~{rain} mm in 3 days). Open field drainage and do not irrigate for 3 days.",
    "rk_irr_stop_harvest": "Crop is near harvest. Stop irrigation now.",
    "rk_irr_drip": "Run drip for {minutes} min {timing} (~{mm} mm).",
    "rk_irr_drip_plant": "Run drip for {minutes} min {timing} (~{litres} L per plant).",
    "rk_irr_sprinkler": "Run sprinkler for {hours} h {timing} (~{mm} mm).",
    "rk_irr_flood": "Give one irrigation of about {mm} mm {timing}.",
    "rk_irr_flood_hours": "Give one irrigation of about {mm} mm (~{hours} h with your pump) {timing}.",
    "rk_irr_critical_suffix": "Crop is at a critical stage - do not let it suffer water stress.",
    "rk_irr_protective": "Soil is dry at a critical stage. If you have water, give one protective irrigation (~{mm} mm).",
    "rk_irr_conserve": "Soil is drying. Save moisture: mulch and do light hoeing.",
    "rk_irr_postpone": "Soil is drying, but about {rain} mm rain is expected in 2 days. Wait for the rain.",
    "rk_irr_light_heat": "Very hot day ({tmax}°C). Give a light irrigation in the evening.",
    "rk_irr_light_frost": "Frost risk tonight ({tmin}°C). Give a light irrigation in the evening.",
    "rk_irr_check": "Soil moisture data is not available. Check by hand: irrigate if a soil ball from root depth crumbles.",
    "rk_irr_none": "Soil moisture is enough. Next irrigation in about {days} days.",
    "rk_irr_rainfed_ok": "Rainfed field: soil moisture is fine for now.",
    "rk_time_irr_morning": "in the early morning",
    "rk_time_irr_evening": "in the evening",
    "rk_time_irr_night": "at night or early morning (windy day)",
    # Fertilizer / monitoring
    "rk_fert_already": "Fertilizer for this stage was applied on {date}. No repeat needed.",
    "rk_monitor_pest": "Look for {pest}.",
    # Alerts
    "rk_alert_title_heavy_rain": "Heavy rain alert",
    "rk_alert_title_heat": "Heat alert",
    "rk_alert_title_frost": "Frost alert",
    "rk_alert_title_wind": "Strong wind alert",
    "rk_alert_title_dry_spell": "Dry spell alert",
    "rk_alert_title_pest": "Pest / disease alert",
    "rk_alert_title_waterlog": "Waterlogging alert",
    "rk_alert_title_sat_stress": "Crop stress seen from satellite",
    "rk_alert_heavy_rain": "Heavy rain expected (~{rain} mm). Stop spraying and irrigation; open field drainage.",
    "rk_alert_heat": "Very hot weather ({tmax}°C). Irrigate in the evening; do not spray at midday.",
    "rk_alert_frost": "Frost risk tonight ({tmin}°C). Give a light irrigation in the evening.",
    "rk_alert_wind": "Strong wind ({wind} km/h). Do not spray; support tall plants.",
    "rk_alert_dry_spell": "No rain for {days} days. Save soil moisture: mulch and light hoeing; irrigate if you can.",
    "rk_alert_pest": "High risk of {pest} in the coming days. Recommended: {product} {dose}.",
    "rk_alert_waterlog": "Water may stand in the field (~{rain} mm in 3 days). Drain within 24 hours to save the roots.",
    "rk_alert_sat_stress": "Crop looks weaker in part of your field. Check for pests, water or nutrient problems.",
    # WhatsApp
    "rk_wa_farmer": "Farmer",
    "rk_wa_field": "Your field",
    "rk_wa_daily_preview": "🌾 {name} | {crop} - {field}\n💧 {irrigation}\n🧴 {spray}",
    "rk_wa_alert_preview": "⚠️ {field} - {title}\n{message}",
    "rk_wa_fert_preview": "🌱 {field} | {crop}\n{line}",
}

HI = {
    "rk_spray_none": "मौसम से कीट या रोग का खतरा नहीं है। आज छिड़काव की ज़रूरत नहीं।",
    "rk_spray_no_weather": "मौसम का पूरा डेटा नहीं मिला, इसलिए छिड़काव का खतरा जाँचा नहीं जा सका। छिड़काव से पहले फसल देखें।",
    "rk_spray_indoor": "घर के अंदर उगाई फसल - खेत में छिड़काव की सलाह लागू नहीं।",
    "rk_spray_now": "{pest} का अधिक खतरा। {product} {dose} की दर से छिड़काव करें, {timing}।",
    "rk_spray_wait": "{pest} का अधिक खतरा, लेकिन {blocker}। {date} को {product} {dose} का छिड़काव करें।",
    "rk_spray_wait_nodate": "{pest} का अधिक खतरा, लेकिन {blocker}। अगले सूखे और शांत दिन {product} {dose} का छिड़काव करें।",
    "rk_spray_monitor": "{pest} का खतरा बढ़ रहा है। अगले 2 दिन में खेत देखें; दिखे तभी छिड़काव करें।",
    "rk_spray_monitor_product": "{pest} का खतरा बढ़ रहा है। अगले 2 दिन में खेत देखें। दिखे तो {product} {dose} का छिड़काव करें।",
    "rk_spray_recent": "{pest}: {date} को छिड़काव हो चुका है। अभी दोबारा ज़रूरत नहीं - निगरानी रखें।",
    "rk_spray_consult": "{pest} का अधिक खतरा। आपके देश के लिए हमारी सूची में पंजीकृत दवा नहीं है - स्थानीय लेबल या कृषि विशेषज्ञ की सलाह लें।",
    "rk_spray_harvest": "{pest} का खतरा है, लेकिन फसल कटाई के पास है। अभी रासायनिक छिड़काव न करें।",
    "rk_block_rain": "आज बारिश की संभावना है",
    "rk_block_wind": "आज हवा बहुत तेज़ है",
    "rk_time_spray_morning": "सुबह जल्दी जब हवा न हो",
    "rk_time_spray_evening": "शाम 5 बजे के बाद (गर्म दिन)",
    "rk_irr_indoor": "घर के अंदर उगाई फसल - कमरे की नमी 80-90% रखें।",
    "rk_irr_skip_rain": "आज बारिश की संभावना (~{rain} mm)। सिंचाई न करें।",
    "rk_irr_drain": "भारी बारिश (3 दिन में ~{rain} mm)। खेत से पानी निकासी खोलें, 3 दिन सिंचाई न करें।",
    "rk_irr_stop_harvest": "फसल कटाई के पास है। अब सिंचाई बंद करें।",
    "rk_irr_drip": "ड्रिप {minutes} मिनट चलाएँ, {timing} (~{mm} mm)।",
    "rk_irr_drip_plant": "ड्रिप {minutes} मिनट चलाएँ, {timing} (~{litres} लीटर प्रति पौधा)।",
    "rk_irr_sprinkler": "स्प्रिंकलर {hours} घंटे चलाएँ, {timing} (~{mm} mm)।",
    "rk_irr_flood": "लगभग {mm} mm की एक सिंचाई दें, {timing}।",
    "rk_irr_flood_hours": "लगभग {mm} mm की एक सिंचाई दें (आपके पंप से ~{hours} घंटे), {timing}।",
    "rk_irr_critical_suffix": "फसल नाज़ुक अवस्था में है - पानी की कमी न होने दें।",
    "rk_irr_protective": "नाज़ुक अवस्था में मिट्टी सूखी है। पानी हो तो एक बचाव सिंचाई दें (~{mm} mm)।",
    "rk_irr_conserve": "मिट्टी सूख रही है। नमी बचाएँ: मल्चिंग और हल्की निराई-गुड़ाई करें।",
    "rk_irr_postpone": "मिट्टी सूख रही है, लेकिन 2 दिन में लगभग {rain} mm बारिश की संभावना है। बारिश का इंतज़ार करें।",
    "rk_irr_light_heat": "बहुत गर्म दिन ({tmax}°C)। शाम को हल्की सिंचाई दें।",
    "rk_irr_light_frost": "आज रात पाले का खतरा ({tmin}°C)। शाम को हल्की सिंचाई दें।",
    "rk_irr_check": "मिट्टी की नमी का डेटा नहीं है। हाथ से जाँचें: जड़ की गहराई की मिट्टी का गोला बिखर जाए तो सिंचाई करें।",
    "rk_irr_none": "मिट्टी में पर्याप्त नमी है। अगली सिंचाई लगभग {days} दिन में।",
    "rk_irr_rainfed_ok": "बारानी खेत: अभी मिट्टी की नमी ठीक है।",
    "rk_time_irr_morning": "सुबह जल्दी",
    "rk_time_irr_evening": "शाम को",
    "rk_time_irr_night": "रात में या सुबह जल्दी (तेज़ हवा)",
    "rk_fert_already": "इस अवस्था का खाद {date} को दिया जा चुका है। दोबारा ज़रूरत नहीं।",
    "rk_monitor_pest": "{pest} पर नज़र रखें।",
    "rk_alert_title_heavy_rain": "भारी बारिश की चेतावनी",
    "rk_alert_title_heat": "गर्मी की चेतावनी",
    "rk_alert_title_frost": "पाले की चेतावनी",
    "rk_alert_title_wind": "तेज़ हवा की चेतावनी",
    "rk_alert_title_dry_spell": "सूखे की चेतावनी",
    "rk_alert_title_pest": "कीट / रोग की चेतावनी",
    "rk_alert_title_waterlog": "जलभराव की चेतावनी",
    "rk_alert_title_sat_stress": "सैटेलाइट से फसल में तनाव दिखा",
    "rk_alert_heavy_rain": "भारी बारिश की संभावना (~{rain} mm)। छिड़काव और सिंचाई रोकें, खेत से पानी निकासी खोलें।",
    "rk_alert_heat": "बहुत गर्मी ({tmax}°C)। शाम को सिंचाई करें, दोपहर में छिड़काव न करें।",
    "rk_alert_frost": "आज रात पाले का खतरा ({tmin}°C)। शाम को हल्की सिंचाई दें।",
    "rk_alert_wind": "तेज़ हवा ({wind} km/h)। छिड़काव न करें, ऊँचे पौधों को सहारा दें।",
    "rk_alert_dry_spell": "{days} दिन से बारिश नहीं। मल्चिंग और हल्की गुड़ाई से नमी बचाएँ; हो सके तो सिंचाई करें।",
    "rk_alert_pest": "आने वाले दिनों में {pest} का अधिक खतरा। सलाह: {product} {dose}।",
    "rk_alert_waterlog": "खेत में पानी रुक सकता है (3 दिन में ~{rain} mm)। जड़ें बचाने के लिए 24 घंटे में निकासी करें।",
    "rk_alert_sat_stress": "आपके खेत के एक हिस्से में फसल कमज़ोर दिख रही है। कीट, पानी या पोषण की जाँच करें।",
    "rk_wa_farmer": "किसान",
    "rk_wa_field": "आपका खेत",
    "rk_wa_daily_preview": "🌾 {name} | {crop} - {field}\n💧 {irrigation}\n🧴 {spray}",
    "rk_wa_alert_preview": "⚠️ {field} - {title}\n{message}",
    "rk_wa_fert_preview": "🌱 {field} | {crop}\n{line}",
}

MR = {
    "rk_spray_none": "हवामानामुळे कीड किंवा रोगाचा धोका नाही. आज फवारणीची गरज नाही.",
    "rk_spray_no_weather": "हवामानाची पूर्ण माहिती मिळाली नाही, त्यामुळे फवारणीचा धोका तपासता आला नाही. फवारणीपूर्वी पीक पाहा.",
    "rk_spray_indoor": "बंदिस्त जागेतील पीक - शेतातील फवारणीचा सल्ला लागू नाही.",
    "rk_spray_now": "{pest} चा जास्त धोका. {product} {dose} या प्रमाणात फवारणी करा, {timing}.",
    "rk_spray_wait": "{pest} चा जास्त धोका, पण {blocker}. {date} रोजी {product} {dose} फवारणी करा.",
    "rk_spray_wait_nodate": "{pest} चा जास्त धोका, पण {blocker}. पुढच्या कोरड्या व शांत दिवशी {product} {dose} फवारणी करा.",
    "rk_spray_monitor": "{pest} चा धोका वाढत आहे. पुढील 2 दिवसांत शेत पाहा; दिसल्यासच फवारणी करा.",
    "rk_spray_monitor_product": "{pest} चा धोका वाढत आहे. पुढील 2 दिवसांत शेत पाहा. दिसल्यास {product} {dose} फवारणी करा.",
    "rk_spray_recent": "{pest}: {date} रोजी फवारणी झाली आहे. आत्ता पुन्हा गरज नाही - लक्ष ठेवा.",
    "rk_spray_consult": "{pest} चा जास्त धोका. तुमच्या देशासाठी आमच्या यादीत नोंदणीकृत औषध नाही - स्थानिक लेबल किंवा कृषी तज्ज्ञांचा सल्ला घ्या.",
    "rk_spray_harvest": "{pest} चा धोका आहे, पण पीक काढणीजवळ आहे. आत्ता रासायनिक फवारणी करू नका.",
    "rk_block_rain": "आज पावसाची शक्यता आहे",
    "rk_block_wind": "आज वारा खूप जोरात आहे",
    "rk_time_spray_morning": "सकाळी लवकर, वारा नसताना",
    "rk_time_spray_evening": "संध्याकाळी 5 नंतर (उष्ण दिवस)",
    "rk_irr_indoor": "बंदिस्त जागेतील पीक - खोलीतील आर्द्रता 80-90% ठेवा.",
    "rk_irr_skip_rain": "आज पावसाची शक्यता (~{rain} mm). पाणी देऊ नका.",
    "rk_irr_drain": "जोरदार पाऊस (3 दिवसांत ~{rain} mm). शेतातील पाण्याचा निचरा करा, 3 दिवस पाणी देऊ नका.",
    "rk_irr_stop_harvest": "पीक काढणीजवळ आहे. आता पाणी देणे थांबवा.",
    "rk_irr_drip": "ठिबक {minutes} मिनिटे चालवा, {timing} (~{mm} mm).",
    "rk_irr_drip_plant": "ठिबक {minutes} मिनिटे चालवा, {timing} (~{litres} लिटर प्रति झाड).",
    "rk_irr_sprinkler": "तुषार सिंचन {hours} तास चालवा, {timing} (~{mm} mm).",
    "rk_irr_flood": "सुमारे {mm} mm चे एक पाणी द्या, {timing}.",
    "rk_irr_flood_hours": "सुमारे {mm} mm चे एक पाणी द्या (तुमच्या पंपाने ~{hours} तास), {timing}.",
    "rk_irr_critical_suffix": "पीक नाजूक अवस्थेत आहे - पाण्याचा ताण येऊ देऊ नका.",
    "rk_irr_protective": "नाजूक अवस्थेत माती कोरडी आहे. पाणी असल्यास एक संरक्षक पाणी द्या (~{mm} mm).",
    "rk_irr_conserve": "माती कोरडी होत आहे. ओलावा टिकवा: आच्छादन करा आणि हलकी कोळपणी करा.",
    "rk_irr_postpone": "माती कोरडी होत आहे, पण 2 दिवसांत सुमारे {rain} mm पावसाची शक्यता आहे. पावसाची वाट पाहा.",
    "rk_irr_light_heat": "खूप उष्ण दिवस ({tmax}°C). संध्याकाळी हलके पाणी द्या.",
    "rk_irr_light_frost": "आज रात्री दवाचा/थंडीचा धोका ({tmin}°C). संध्याकाळी हलके पाणी द्या.",
    "rk_irr_check": "मातीतील ओलाव्याची माहिती उपलब्ध नाही. हाताने तपासा: मुळांच्या खोलीवरील मातीचा गोळा फुटत असेल तर पाणी द्या.",
    "rk_irr_none": "मातीत पुरेसा ओलावा आहे. पुढील पाणी सुमारे {days} दिवसांनी.",
    "rk_irr_rainfed_ok": "कोरडवाहू शेत: सध्या मातीतील ओलावा ठीक आहे.",
    "rk_time_irr_morning": "सकाळी लवकर",
    "rk_time_irr_evening": "संध्याकाळी",
    "rk_time_irr_night": "रात्री किंवा पहाटे (जोरदार वारा)",
    "rk_fert_already": "या अवस्थेचे खत {date} रोजी दिले आहे. पुन्हा गरज नाही.",
    "rk_monitor_pest": "{pest} वर लक्ष ठेवा.",
    "rk_alert_title_heavy_rain": "जोरदार पावसाचा इशारा",
    "rk_alert_title_heat": "उष्णतेचा इशारा",
    "rk_alert_title_frost": "थंडी/दवाचा इशारा",
    "rk_alert_title_wind": "जोरदार वाऱ्याचा इशारा",
    "rk_alert_title_dry_spell": "पावसाच्या खंडाचा इशारा",
    "rk_alert_title_pest": "कीड / रोगाचा इशारा",
    "rk_alert_title_waterlog": "पाणी साचण्याचा इशारा",
    "rk_alert_title_sat_stress": "उपग्रहातून पिकावर ताण दिसला",
    "rk_alert_heavy_rain": "जोरदार पावसाची शक्यता (~{rain} mm). फवारणी व पाणी देणे थांबवा, शेतातील पाण्याचा निचरा करा.",
    "rk_alert_heat": "खूप उष्ण हवामान ({tmax}°C). संध्याकाळी पाणी द्या, दुपारी फवारणी करू नका.",
    "rk_alert_frost": "आज रात्री थंडीचा धोका ({tmin}°C). संध्याकाळी हलके पाणी द्या.",
    "rk_alert_wind": "जोरदार वारा ({wind} km/h). फवारणी करू नका, उंच झाडांना आधार द्या.",
    "rk_alert_dry_spell": "{days} दिवस पाऊस नाही. आच्छादन व हलकी कोळपणी करून ओलावा टिकवा; शक्य असल्यास पाणी द्या.",
    "rk_alert_pest": "पुढील दिवसांत {pest} चा जास्त धोका. सल्ला: {product} {dose}.",
    "rk_alert_waterlog": "शेतात पाणी साचू शकते (3 दिवसांत ~{rain} mm). मुळे वाचवण्यासाठी 24 तासांत निचरा करा.",
    "rk_alert_sat_stress": "तुमच्या शेताच्या एका भागात पीक कमजोर दिसत आहे. कीड, पाणी किंवा अन्नद्रव्यांची तपासणी करा.",
    "rk_wa_farmer": "शेतकरी",
    "rk_wa_field": "तुमचे शेत",
    "rk_wa_daily_preview": "🌾 {name} | {crop} - {field}\n💧 {irrigation}\n🧴 {spray}",
    "rk_wa_alert_preview": "⚠️ {field} - {title}\n{message}",
    "rk_wa_fert_preview": "🌱 {field} | {crop}\n{line}",
}

PESTS = {
    # id: (en, hi, mr)
    "PM": ("powdery mildew", "चूर्णिल आसिता (पाउडरी मिल्ड्यू)", "भुरी रोग"),
    "DM": ("downy mildew", "मृदुरोमिल आसिता (डाउनी मिल्ड्यू)", "केवडा रोग"),
    "RUST": ("rust", "रतुआ (गेरुई)", "तांबेरा"),
    "EB": ("early blight / leaf spot", "अगेती झुलसा", "लवकर येणारा करपा"),
    "LB": ("late blight", "पछेती झुलसा", "उशिरा येणारा करपा"),
    "LS": ("leaf spot", "पत्ती धब्बा रोग", "पानावरील ठिपके"),
    "ANTH": ("anthracnose / fruit rot", "एन्थ्रेक्नोज / फल सड़न", "करपा / फळकूज"),
    "BLAST": ("blast", "ब्लास्ट (झोंका)", "करपा (ब्लास्ट)"),
    "SHB": ("sheath blight", "आवरण झुलसा (शीथ ब्लाइट)", "आवरण करपा"),
    "BB": ("bacterial blight / canker", "जीवाणु झुलसा / कैंकर", "जिवाणूजन्य करपा / कॅंकर"),
    "GM": ("grey mould", "ग्रे मोल्ड (धूसर फफूंद)", "राखाडी बुरशी"),
    "PHY": ("Phytophthora rot", "फाइटोफ्थोरा सड़न", "फायटोप्थोरा कूज"),
    "SCAB": ("scab", "स्कैब", "खपली रोग"),
    "SIG": ("Sigatoka leaf spot", "सिगाटोका पत्ती धब्बा", "सिगाटोका पानावरील ठिपके"),
    "DO": ("damping off", "आर्द्र गलन (डैम्पिंग ऑफ)", "रोप कोलमडणे"),
    "WILT": ("wilt / root rot", "उकठा / जड़ सड़न", "मर रोग / मूळकूज"),
    "APH": ("aphids", "माहू (एफिड)", "मावा"),
    "WF": ("whitefly", "सफ़ेद मक्खी", "पांढरी माशी"),
    "THR": ("thrips", "थ्रिप्स", "फुलकिडे"),
    "JAS": ("jassids / hoppers", "जैसिड / फुदका", "तुडतुडे"),
    "MITE": ("mites", "माइट (मकड़ी)", "कोळी"),
    "MB": ("mealybug", "मिलीबग", "पिठ्या ढेकूण"),
    "SCALE": ("scale insects", "स्केल कीट", "खवले कीड"),
    "BPH": ("brown planthopper", "भूरा फुदका", "तपकिरी तुडतुडे"),
    "FB": ("fruit / pod borer", "फल / फली छेदक", "फळ / शेंगा पोखरणारी अळी"),
    "PB": ("pod borer", "फली छेदक", "शेंगा पोखरणारी अळी"),
    "SB": ("stem / shoot borer", "तना / शाखा छेदक", "खोड / शेंडा पोखरणारी अळी"),
    "FAW": ("fall armyworm", "फॉल आर्मीवर्म", "लष्करी अळी"),
    "SPOD": ("leaf-eating caterpillar", "पत्ती खाने वाली इल्ली", "पाने खाणारी अळी"),
    "DBM": ("diamondback moth", "डायमंडबैक मोथ", "चौकोनी ठिपक्यांचा पतंग"),
    "FF": ("fruit fly", "फल मक्खी", "फळमाशी"),
    "SFB": ("shoot & fruit borer", "तना व फल छेदक", "शेंडा व फळ पोखरणारी अळी"),
    "LM": ("leaf miner", "पत्ती सुरंगक (लीफ माइनर)", "नागअळी"),
    "PBW": ("pink bollworm", "गुलाबी सुंडी", "गुलाबी बोंडअळी"),
    "TMB": ("tea mosquito bug", "टी मॉस्किटो बग", "टी मॉस्किटो ढेकूण"),
    "PALM": ("palm beetles", "नारियल भृंग (गैंडा भृंग / लाल घुन)", "माडावरील भुंगे"),
    "CBB": ("coffee berry borer", "कॉफ़ी बेरी छेदक", "कॉफी फळ पोखरणारा भुंगा"),
    "WG": ("white grub", "सफ़ेद लट (व्हाइट ग्रब)", "हुमणी"),
    "TERM": ("termites", "दीमक", "वाळवी"),
}


BORROW = {"mai": "hi", "doi": "hi", "sa": "hi", "kok": "mr", "brx": "as", "mni": "bn",
          "ks": "ur", "sd": "ur", "sat": "sat_rom"}
PLACEHOLDER = re.compile(r"\{\w+\}")


def build_tables():
    """Return {lang: {key: text}} for every language, plus a status map for review."""
    from engine_messages_more import MORE, PEST_MORE, SPLIT_SUFFIX

    from engine_messages_more import DRIP_MAINTAIN

    for _t, _l in ((EN, "en"), (HI, "hi"), (MR, "mr")):
        _t["rk_irr_drip_maintain"] = DRIP_MAINTAIN[_l]
    EN["rk_irr_split_suffix"] = SPLIT_SUFFIX["en"]
    HI["rk_irr_split_suffix"] = SPLIT_SUFFIX["hi"]
    MR["rk_irr_split_suffix"] = SPLIT_SUFFIX["mr"]
    previews = {k: v for k, v in EN.items() if k.startswith("rk_wa_") and k.endswith("_preview")}

    from engine_messages_monitor import MON

    base = {"en": dict(EN), "hi": dict(HI), "mr": dict(MR)}
    for lang, table in MORE.items():
        base[lang] = {**previews, **table}
    for lang, table in MON.items():
        base.setdefault(lang, {}).update(table)
    for idx, lang in ((0, "en"), (1, "hi"), (2, "mr")):
        for pid, names in PESTS.items():
            base[lang][f"pest_{pid}"] = names[idx]
    for lang, names in PEST_MORE.items():
        for pid, name in names.items():
            base[lang][f"pest_{pid}"] = name

    errors = []
    for lang, table in base.items():
        for key, en_text in base["en"].items():
            if key not in table:
                if not key.startswith("pest_"):
                    errors.append(f"{lang}: missing {key}")
                continue
            if set(PLACEHOLDER.findall(table[key])) != set(PLACEHOLDER.findall(en_text)):
                errors.append(f"{lang}: placeholder mismatch in {key}")
    if errors:
        raise SystemExit("Translation check failed:\n  " + "\n  ".join(errors))

    out, status = {}, {}
    for lang in ALL_LANGS:
        if lang in base:
            out[lang] = base[lang]
            status[lang] = "source" if lang == "en" else "draft"
        else:
            src = BORROW[lang]
            out[lang] = dict(base[src])
            status[lang] = f"borrowed from {src}"
    return out, status


ALL_LANGS = ["as", "bn", "brx", "doi", "en", "gu", "hi", "kn", "ks", "kok", "ml", "mni", "mr",
             "mai", "ne", "or", "pa", "sa", "sat", "sd", "ta", "te", "ur"]


def main(messages_dir):
    d = Path(messages_dir)
    tables, status = build_tables()
    for lang, table in tables.items():
        path = d / f"{lang}.json"
        if not path.exists():
            print(f"{lang}: no locale file, skipped")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        data.update(table)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{lang}: {len(table)} engine keys written ({status[lang]})")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "../../utils/i18n/messages")
