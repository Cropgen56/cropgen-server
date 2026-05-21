# CropGen Advisory Engine — Refinement Changelog

## Files Modified

### 1. `utils/evidence/decisionEngine/fertigationDecision.js` — MAJOR REWRITE

**Problems fixed:**
- NPK 19:19:19 was the only product used — wrong for all stages
- Dose was calculated as `maxDef / 0.19` with no cap → caused 25–40 kg/acre inconsistency
- Vermicompost was being recommended via drip (not drip-compatible)
- No water-soluble product intelligence
- No micronutrients

**What's new:**
- Stage-based product selection (BBCH-aware):
  - Vegetative: NPK 19:19:19 (MAX 5 kg/acre hard cap) + Water Soluble Urea
  - Flowering: MKP 0:52:34 + SOP 0:0:50 + Calcium Nitrate
  - Fruiting: SOP + Calcium Nitrate + Magnesium Sulphate
- Organic fertigation: Jeevamrut (liquid), Seaweed Extract, Humic Acid, Panchagavya — all drip/liquid compatible
- Integrated: 50% water-soluble chem + Humic Acid + Seaweed as organic supplement
- `getMicronutrientRecommendations()` function: Zn, Fe, B, Mg with EDTA chelate logic for high pH soils
- Compatibility warnings: Calcium Nitrate vs Phosphate → auto-splits with warning message
- Dose displayed as: `X kg/acre (total Y kg for Z acre)`

---

### 2. `utils/evidence/decisionEngine/sprayDecision.js` — MAJOR REWRITE

**Problems fixed:**
- Organic = always no spray (wrong — biopesticides are allowed)
- Generic "State exact product" hint — LLM couldn't use it
- No disease modeling — just crop health category check
- No product name, dose, water volume

**What's new:**
- `assessDiseaseRisk()`: models 4 disease types from weather conditions
  - Fungal: humidity >78% + moderate temp
  - Sucking pest: high temp + low humidity
  - Leaf pest: BBCH 30–70 + high disease pressure
  - Blight: post-rain + humid conditions
- Crop-specific disease name resolution (tomato, cotton, wheat, grapes, sugarcane, soybean, banana)
- Chemical AND organic product molecules pre-built for each disease type
- Farming type correctly gates product selection:
  - Organic: Neem Oil, Beauveria bassiana, Trichoderma, Copper Oxychloride, Pseudomonas
  - Integrated mild: organic products
  - Integrated severe or Inorganic: chemical molecules with active %, formulation type, dose
- Full dose string: `"Mancozeb 75% WP 2 g/litre, 200 litre/acre"`
- Multi-risk handling: 2 products if 2+ risks detected
- Weather gate retained: rain >10mm or wind >15km/h = skip spray

---

### 3. `utils/llm/generateSmartAdvisory.js` — MAJOR REWRITE

**Problems fixed:**
- Language switching incomplete — English would bleed through
- LLM prompt too generic — "State exact product" not actionable
- No language glossary — LLM didn't know local terms
- FERTIGATION/SPRAY types not being built correctly from decision hints

**What's new:**
- Extended `LANGUAGE_MAP`: en, hi, mr, te, kn, ta, gu, pa, bn, or
- `LANGUAGE_GLOSSARY`: Hindi/Marathi field terms (ड्रिप, फर्टिगेशन, प्रति एकड़, etc.)
- Prompt now includes:
  - `OUTPUT LANGUAGE: X ONLY. Every single word in X. No English unless language=en.`
  - Spray decision hints from engine passed directly to LLM for product generation
  - Farming type-specific rules embedded in prompt
  - Area-calculated dose instruction with actual acre value
- `buildFertigationActivityFromHints()` now processes `allProducts[]` array with full dosage display
- Organic supplement products shown separately in UI details
- Micronutrient products shown as separate `micronutrients[]` array in details

---

### 4. `utils/llm/postProcessAdvisory.js` — REWRITE

**Problems fixed:**
- Language-aware messages only for Marathi/Hindi, no Telugu/others
- Generic "no irrigation" messages weren't in correct language
- Organic spray override too aggressive

**What's new:**
- Multi-language irrigation messages: en/hi/mr/te
- Water volume in irrigation message: `total ~X litre` 
- Flow rate shown: `X L/min`
- Language-aware character limits per language
- Organic spray override: replaces only if message is generic "no chemical"
- `translateToHindi()` helper for irrigation skip reasons

---

### 5. `utils/evidence/decisionEngine/monitoringDecision.js` — REWRITE

**Problems fixed:**
- Generic "check lower leaves" — not crop-specific
- No alert thresholds
- No disease symptom descriptions

**What's new:**
- `getCropSpecificChecks()`: 8 crop-specific monitoring profiles
  - Tomato/Chilli: TSWV, fruit borer, leaf curl
  - Cotton: pink bollworm, Mg deficiency, whitefly
  - Soybean: yellow mosaic, pod borer, stem fly
  - Sugarcane: top borer, red rot, smut
  - Wheat/Barley: rust types, powdery mildew
  - Grapes: downy/powdery mildew, thrips ring spots
- Priority alerts for: water stress %, nitrogen deficiency %, disease pressure
- `scoutVisit: true` flag when high pressure (for field team routing)
- Alert thresholds with specific symptom descriptions

---

### 6. `ADVISORY_OUTPUT_FORMAT.md` — NEW FILE

Complete output format specification:
- JSON shape for all 7 activity types
- Product selection table by BBCH stage
- Language code table
- Compatibility rules table
- NPK 19:19:19 dose cap documentation

---

## Summary of Key Rule Changes

| Issue | Before | After |
|-------|--------|-------|
| NPK 19:19:19 dose | Uncapped (25–40+ kg/acre) | Hard cap: 5 kg/acre, split over 2 days |
| Fertilizer products | Only NPK 19:19:19 | Stage-based: MKP, SOP, CaNO3, Urea, Mg, etc. |
| Organic fertigation | Vermicompost (not drip-safe) | Jeevamrut, Seaweed, Humic Acid, Panchagavya |
| Micronutrients | Not included | Zn/Fe/B/Mg with EDTA logic + doses |
| Organic spray | "No spray" always | Bio-pesticides: Neem, Beauveria, Trichoderma |
| Spray dose | "State exact product" hint | Full molecule + % + formulation + dose |
| Language | English bleed-through | Strict monolingual output per language code |
| Monitoring | Generic "check leaves" | Crop + stage specific symptoms + alert thresholds |
| Compatibility | Not flagged | Auto-detected + warning + split-day advice |

