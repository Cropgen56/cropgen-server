# Crop Growth Stage Engine

This folder keeps crop growth-stage estimation logic isolated from the rest of advisory modules.

## Purpose

The engine computes a robust `plantGrowthActivity` using:

- `sowingDate` (calendar age / DAE)
- weather-derived GDD (historical first, forecast fallback)
- NDVI time-series phenology curve
- BBCH stage templates

## Flow

1. **Inputs prepared**
   - `cropName`
   - `sowingDateISO`
   - `historicalWeather`
   - `weatherSummary`
   - `ndvi` (`series` preferred, fallback to `values`)

2. **Signal 1: Calendar stage**
   - Compute `cropAgeDays = today - sowingDate`.
   - Map age into category-level BBCH windows.

3. **Signal 2: GDD stage**
   - Compute cumulative GDD with crop base temperature.
   - Apply max temperature cap (`GDD_MAX_TEMP_CAP_C`).
   - Prefer historical daily data; fallback to forecast-based estimate.
   - Convert cumulative GDD to BBCH stage.

4. **Signal 3: NDVI phenology stage**
   - Analyze NDVI curve for phase:
     - `pre_emergence`, `emergence`, `vegetative`, `peak`, `senescence`, `mature`.
   - Convert phase to BBCH position.

5. **Hybrid fusion**
   - Weight GDD + calendar + NDVI based on confidence/data quality.
   - Snap fused score to nearest valid BBCH stage.
   - Output confidence and signal breakdown.

## Output Shape

`resolveHybridCropStage()` returns:

- `plantGrowthActivity` (`bbchStage`, `stageName`, `overallProgress`, `stageConfidence`, etc.)
- `cumulativeGDD`, `cropAgeDays`, `gddSeries`
- diagnostics: `phenology`, `calendarStage`, `gddStage`, `ndviStage`

## Integration Points

- Main module: `src/features/advisory/modules/gddBbch.module.js`
- Weather/GDD fallback helper: `src/features/advisory/utils/weather/gddFromWeatherSummary.js`

## Public API

- `resolveHybridCropStage()`
- `analyzeNdviPhenology()`
- `GDD_MAX_TEMP_CAP_C`

## File Structure

- `constants.js` — growth-stage constants.
- `hybridStageEngine.js` — full hybrid implementation (DAE + GDD + NDVI + BBCH fusion).
- `index.js` — module exports for consumers.

