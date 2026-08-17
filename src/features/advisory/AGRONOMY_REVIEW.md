# Advisory Agronomy & GIS Review — Tracking

An agronomy + remote-sensing correctness review of the crop advisory pipeline
(growth-stage/GDD, NPK, crop health, yield, irrigation, spray/fertigation
decisions, and satellite scene selection). This file tracks what's been fixed
and what's still open, so the remaining work can be picked up later without
re-deriving the analysis from scratch.

## Status: Priority #1 done, everything else parked

### ✅ Done — Priority #1: Per-crop GDD maturity + calendar-day targets

**Problem:** `BBCH_STAGE_MAP` (`src/utils/crop/growth/bbchStageMap.js`) used
one fixed "total GDD to maturity" per crop *category* (cereal=2400,
pulse=2600, oilseed=2000, vegetable=2000, fruit=3000). Wheat, rice, corn,
barley, millets, and sugarcane were all forced through the same 2400-GDD
"cereal" curve despite hugely different real season-total heat requirements
(wheat ~2000, sugarcane ~5000). The calendar (days-after-sowing) signal in
the hybrid stage engine had the identical flaw one level up
(`CATEGORY_SEASON_DAYS`: every cereal = 125 days, wrong for a ~330-day
sugarcane crop).

**Fix:**
- `src/utils/crop/growth/cropMaturityGDD.js` *(new)* — `CROP_MATURITY_GDD`
  and `CROP_SEASON_DAYS`, both keyed per crop, for 78 annual/single-season
  crops (cereals, pulses, oilseeds, true field vegetables, annual vine
  fruits). Values are cross-checked against each other and against each
  crop's existing `baseTemp` for internal consistency. `PERENNIAL_OR_MULTI_HARVEST_CROPS`
  is an explicit 65-crop exclusion set (perennial trees/vines, plantation,
  nuts, multi-cut forage, mushroom) that deliberately keeps the old
  category-curve/day-count behaviour unchanged — see file header for the
  full reasoning per group.
- `src/utils/crop/growth/gddCalculator.js` — added `getCropStageCurve()`
  (rescales the category's BBCH stage curve onto the crop's own
  `maturityGDD`) and `getCropSeasonDays()` (same pattern for season length).
  Both fall back to the original category-level behaviour for any crop not
  in the annual set.
- `src/features/advisory/cropGrowthStage/hybridStageEngine.js` — the GDD
  signal, calendar signal, and stage-fusion/snapping logic now all resolve
  through the crop-specific curve/day-count instead of reading
  `BBCH_STAGE_MAP[category]` / `CATEGORY_SEASON_DAYS[category]` directly.
  Fusion weighting and the DAE+GDD+NDVI hybrid approach itself — unchanged.

**Verified:** all 143 crops produce valid monotonic curves; the 78 annual
crops hit their exact configured totals; the 65 excluded crops are
byte-identical to pre-change output (zero regression). Wheat/rice/corn/
sugarcane spot-checked against hand calculations.

### ⏭️ Parked — pick up in a future session

In priority order, not yet started:

1. **Perennial-crop growth model (Priority #2).** The whole pipeline is
   structured around `sowingDate` + days-since-sowing, which doesn't map to
   tree/vine/plantation crops (most of the 53 newly-added crops: nuts, stone
   fruits, citrus, cacao, oil palm, etc.) or multi-cut forage. Needs a
   separate model (season-in-year phenology, not DAE) or an explicit
   "not supported by the annual BBCH engine" flag for those crops. This is
   the biggest remaining piece — everything below is smaller and mostly
   depends on this being scoped first.
2. **Chill-hour / dormancy model** for deciduous fruit/nut trees (apple,
   cherry, peach, walnut, pistachio, hazelnut, kiwi, ...). Without
   accumulated winter chilling hours, spring growth-stage predictions for
   these crops will be wrong regardless of GDD accuracy. Naturally pairs
   with #1 above — needs the perennial model underneath it.
3. **Unify NDVI health scoring.** `src/utils/crop/health/cropHealth.js`
   scores NDVI against a coarse 5-category band (`NDVI_RANGES`), while
   `CROP_PROFILES[crop].ndviExpected` (per crop, per stage) is already used
   correctly by the NPK module. Point crop health at the same per-crop curve.
4. **Per-crop `COLD_LIMIT` table**, mirroring the existing crop-specific
   `HEAT_LIMIT` table in `cropHealth.js`. Right now cold-stress is one
   global `<10°C` cutoff for every crop, which is wrong for tropical crops
   (banana, coconut, cacao, oil palm) and irrelevant for cold-hardy ones.
5. **Lower priority / cleanup:**
   - `calculateDailyGDD` in `gddCalculator.js` should floor `Tmin` at
     `baseTemp` *before* averaging (the "modified GDD" method), not just
     clamp the final subtraction to 0 — currently understates GDD on cool
     nights for higher-base-temp crops.
   - Satellite scene selection (`pickLowCloudDate` in
     `satelliteEnrichment.module.js`) filters by whole-scene/tile cloud
     cover, not cloud fraction inside the field polygon itself — worth
     checking whether the upstream provider (Observearth) already does
     field-level masking.
   - Yield model (`yieldCalculator.js`) is an untuned multiplicative-factor
     heuristic with no feedback loop against actual reported harvest yields —
     fine as a v1 estimate, but should eventually be calibrated.
   - NPK "available" nutrients are a proxy stack (N from NDVI, K from NDMI/
     water index, P a flat per-stage constant) — none of it is a measured
     soil value. Should be clearly labeled as indicative to farmers, and
     real soil-test values (when available) should override the heuristic.

## How to resume

Start from item 1 in the parked list, or ask to jump straight to any
specific item (e.g. "do #3 next"). Each item above names the exact files
involved, so no re-discovery pass should be needed.
