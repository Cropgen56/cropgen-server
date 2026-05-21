# CropGen Advisory — Output Format Specification v2.0

## Top-level Response Shape

```json
{
  "activitiesToDo": [
    { "type": "SPRAY",           ... },
    { "type": "FERTIGATION",     ... },
    { "type": "IRRIGATION",      ... },
    { "type": "WEATHER",         ... },
    { "type": "CROP_RISK",       ... },
    { "type": "MONITORING",      ... },
    { "type": "CARBON_TRACKING", ... }
  ]
}
```

---

## SPRAY

```json
{
  "type": "SPRAY",
  "title": "Fungal Spray Advisory",
  "message": "Mancozeb 75% WP 2 g/litre + Metalaxyl 1 g/litre — 200 litre/acre — sakali 6–9 vajata favarani kara.",
  "details": {
    "products": [
      {
        "name": "Mancozeb 75% WP",
        "category": "CHEMICAL",
        "target": "Early Blight / Alternaria",
        "dose": "2 g/litre, 200 litre water/acre",
        "applicationMethod": "Power sprayer, foliar",
        "timing": "Morning 6–9 AM or Evening 4–6 PM",
        "waterPerAcre": "200 litre",
        "note": "Do not spray if rain expected within 4 hours"
      }
    ],
    "applicationMethod": "Foliar spray",
    "timing": "Morning 6–9 AM",
    "notes": "Wear PPE. Avoid spray during peak heat."
  }
}
```

**Rules:**

- Must include: molecule name + % + formulation type (WP/SC/EC/SL)
- Must include: dose in g or ml per litre of water
- Must include: total water volume per acre (standard: 200 litre)
- Must include: target disease/pest
- Organic: bio-pesticides allowed (Neem Oil, Beauveria bassiana, Trichoderma, Copper Oxychloride)
- Spray BLOCKED if: rain >10mm in 24h, wind >15 km/h, BBCH ≥85

---

## FERTIGATION

```json
{
  "type": "FERTIGATION",
  "title": "रासायनिक फर्टिगेशन",
  "message": "MKP 0:52:34 — 3 kg/acre (एकूण 7.5 kg) — ठिबकद्वारे सकाळी द्या.",
  "details": {
    "products": [
      {
        "name": "MKP 0:52:34 (Mono Potassium Phosphate)",
        "category": "CHEMICAL",
        "purpose": "Critical for flowering — P+K for fruit set",
        "dosage": "3 kg/acre (total 7.5 kg for 2.5 acre)",
        "timing": "Morning 6–9 AM, 2x per week",
        "note": "Dissolve fully. Do NOT mix with Calcium Nitrate."
      },
      {
        "name": "Calcium Nitrate 15.5:0:0 + 19% Ca",
        "category": "CHEMICAL",
        "purpose": "Calcium for fruit quality, prevents BER",
        "dosage": "4 kg/acre (total 10 kg for 2.5 acre)",
        "timing": "Alternate days from MKP — SEPARATE TANK",
        "note": "⚠️ INCOMPATIBLE with phosphate products"
      }
    ],
    "micronutrients": [
      {
        "name": "Zinc EDTA Chelated 12%",
        "category": "MICRONUTRIENT",
        "purpose": "Zinc deficiency correction",
        "dosage": "200 g/acre (500 g total for 2.5 acre)",
        "method": "Foliar spray: 200 litre/acre",
        "timing": "Morning, weekly once"
      },
      {
        "name": "Boron 20 SL",
        "category": "MICRONUTRIENT",
        "purpose": "Improve pollination and fruit set",
        "dosage": "150 g/acre",
        "method": "Foliar: 0.75 g/litre",
        "timing": "Pre-flowering"
      }
    ],
    "applicationMethod": "Drip fertigation",
    "timing": "Morning 6–10 AM",
    "reason": "Flowering stage — P and K demand peak",
    "compatibilityWarning": "⚠️ Calcium Nitrate and Phosphate on SEPARATE days",
    "notes": "Dissolve each product separately; irrigate plain water 15 min after"
  }
}
```

**Product selection by BBCH stage:**

| Stage      | BBCH  | Primary Products                                 |
| ---------- | ----- | ------------------------------------------------ |
| Vegetative | 0–39  | NPK 19:19:19 (max 5 kg/acre), Water Soluble Urea |
| Flowering  | 40–65 | MKP 0:52:34, SOP 0:0:50, Calcium Nitrate         |
| Fruiting   | 66–79 | SOP, Calcium Nitrate, Magnesium Sulphate         |
| Maturity   | 80+   | Reduce/stop fertigation                          |

**NPK 19:19:19 Dose Rule: MAX 5 kg/acre, NEVER exceed. Split over 2 days.**

**Water-soluble only products (drip-compatible):**

- MKP 0:52:34 ✓
- SOP 0:0:50 ✓
- Calcium Nitrate 15.5:0:0 ✓
- MAP 12:61:0 ✓
- Magnesium Sulphate ✓
- Potassium Humate ✓
- Seaweed Extract ✓
- Jeevamrut (liquid) ✓

**NEVER via drip/fertigation:**

- Vermicompost ✗
- FYM ✗
- Compost ✗
- DAP (granular) ✗

---

## IRRIGATION

```json
{
  "type": "IRRIGATION",
  "title": "सिंचाई अनुसूची",
  "message": "ड्रिप 45 मिनट चलाएं। 12 mm पानी दें। सुबह 6–9 बजे।",
  "details": {
    "applicationMethod": "Drip",
    "timing": "Morning (6–10 AM)",
    "duration": "45 minutes",
    "waterQuantity": "12 mm (480 m³ = 480,000 litres for 4 ha)",
    "discharge": "250 L/min",
    "reason": "Soil moisture at 38% — below optimal 50%",
    "frequency": "Every 3 days",
    "criticality": "HIGH",
    "confidence": "high"
  }
}
```

---

## WEATHER

```json
{
  "type": "WEATHER",
  "title": "हवामान अंदाज",
  "message": "तापमान 38°C — सकाळी 9 नंतर फवारणी करू नका. पुढील 3 दिवस कोरडे.",
  "details": {
    "temperature": "38°C",
    "humidity": "48%",
    "rainfallProbability": "5%",
    "windSpeed": "8 km/h",
    "advisory": "High temp: increase irrigation frequency. Low humidity: spray in morning only. 7-day forecast: dry conditions ahead."
  }
}
```

---

## CROP_RISK

```json
{
  "type": "CROP_RISK",
  "title": "पीक धोका",
  "message": "जास्त उष्णता आणि कमी ओलाव्यामुळे फुले गळण्याचा धोका.",
  "details": {
    "riskLevel": "HIGH",
    "cause": "Temperature >35°C during anthesis + humidity <50%",
    "recommendedAction": "Apply 200 ppm boron spray + increase irrigation. Monitor 24h."
  }
}
```

---

## MONITORING

```json
{
  "type": "MONITORING",
  "title": "शेत निरीक्षण",
  "message": "फुलांची गळ >10% असल्यास तातडीने तपासा. पानांच्या खालच्या बाजूला पांढरे पावडर तपासा.",
  "details": {
    "focusAreas": ["flower clusters", "leaf undersides", "growing tips"],
    "whatToCheck": "Flower drop, TSWV bronze spots, thrips, blossom end rot",
    "frequency": "Every 2 days",
    "alertThreshold": ">10% flower drop, or visible disease lesions",
    "scoutVisit": false
  }
}
```

---

## CARBON_TRACKING

```json
{
  "type": "CARBON_TRACKING",
  "title": "कार्बन ट्रॅकिंग",
  "message": "Net carbon: +1,240 kg CO₂e sequestered this cycle.",
  "details": {
    "emissionKgCO2e": 48,
    "captureKgCO2e": 1288,
    "netBalanceKgCO2e": 1240,
    "recommendation": "Maintain organic matter addition to sustain carbon sink status."
  }
}
```

---

## Language Rules

| Code | Language | All text in |
| ---- | -------- | ----------- |
| en   | English  | English     |
| hi   | Hindi    | हिंदी       |
| mr   | Marathi  | मराठी       |
| te   | Telugu   | తెలుగు      |
| kn   | Kannada  | ಕನ್ನಡ       |
| ta   | Tamil    | தமிழ்       |
| gu   | Gujarati | ગુજરાતી     |

**Rule: ALL text (title, message, details.advisory, details.reason, etc.) must be in the selected language. Zero English mixing unless language = "en".**

---

## Compatibility Rules

| Product A        | Product B        | Status                          |
| ---------------- | ---------------- | ------------------------------- |
| Calcium Nitrate  | MAP / MKP / DAP  | ❌ INCOMPATIBLE — separate days |
| SOP              | Calcium Nitrate  | ❌ Risk — separate tanks        |
| Urea             | Most fertilizers | ✓ Compatible                    |
| Neem Oil         | Most bio-inputs  | ✓ Compatible                    |
| Copper fungicide | Sulfur           | ❌ Phytotoxic risk in heat      |
