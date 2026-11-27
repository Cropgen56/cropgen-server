# Satellite server: what the condition monitor needs

The monitor already uses the existing CropGen satellite endpoints for Sentinel-2 (vegetation and water indices). It needs **three additions** from the satellite server (`CROPGEN_TS_BASE`). Every item degrades gracefully: the monitor keeps running without it, with fewer checks.

## 1. Sentinel-1 radar time series (P0)

`POST {CROPGEN_TS_BASE}{SATELLITE_S1_PATH}` (default path `/timeseries/sar/sar`, headers as for the other satellite calls)

Request:
```json
{
  "geometry": { "type": "Polygon", "coordinates": [[[73.8, 18.5], [73.81, 18.5], [73.81, 18.51], [73.8, 18.5]]] },
  "start_date": "2026-06-01",
  "end_date": "2026-07-15",
  "satellite": "s1",
  "polarizations": ["VV", "VH"],
  "orbit": "both"
}
```
Response (any of these shapes is accepted):
```json
{ "timeseries": [ { "date": "2026-07-03", "vv": -11.8, "vh": -18.2 }, { "date": "2026-07-15", "vv": -20.9, "vh": -24.1 } ] }
```
- One row per acquisition, **field-average backscatter**. dB is preferred; linear values (> 0) are converted automatically.
- Use the same relative orbit when possible (ascending vs descending differ by 1–2 dB). Include `orbit` per row if you mix them.
- Speckle-filter before averaging (e.g. Refined Lee 5×5) and mask polygon edges (10 m buffer).
- Keys `vv`/`VV`/`vv_db` and `date`/`time`/`timestamp` are all accepted.
- Return `404` or `501` if not implemented. The monitor then disables radar checks until restart, with no errors.

Used for:
- `WATERLOG_SAR`: VV ≤ −18 dB, or a VV fall ≥ 3 dB with rain.
- `CANOPY_LOSS_SAR`: VH fall ≥ 3 dB, meaning lodging, damage or harvest.
- Crop status when clouds hide Sentinel-2.

## 2. Cloud percentage inside the field polygon (P0)

Today the optical series carries scene-level cloud %. Please add **in-polygon** cloud / shadow % per point (from SCL classes 3, 8, 9, 10). Return it as `cloud` on each point:
```json
{ "date": "2026-07-12", "NDVI": 0.71, "cloud": 4.5 }
```
Points above `NDVI_MAX_CLOUD_PCT` (40) are dropped. Scene-level cloud causes both false "crop declining" alerts and missed real drops.

## 3. New-scene webhook (P1)

When a new S2 or S1 acquisition is processed for a field, call the backend:
```
POST <backend base URL>/advisory/internal/monitor
x-api-key: <INTERNAL_API_KEY>
{ "farmFieldId": "<id>", "trigger": "satellite" }
```
Response `202 { queued: true }`. Without the webhook the backend polls every 6 h (`MONITOR_SATELLITE_CRON`), so alerts arrive up to 6 h later.

## 4. Nice to have (P2)

- **Zone statistics**: NDVI p10 / p50 / p90 and a 3×3 grid mean per scene, for "check the north-east corner" advice.
- **Sentinel-2 SCL-based snow / water flags** per scene.
- **Harmonised Landsat-Sentinel (HLS)** fallback to shorten cloudy gaps in the monsoon.
