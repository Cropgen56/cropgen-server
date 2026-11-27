# Real-time crop condition monitor: how it works

```
 triggers ─────────────►  runConditionMonitorForCrop()  (services/conditionMonitor.service.js)
  • weather cron (3 h)        1. load: farm, crop, previous snapshot, open events, WhatsApp sent today
  • satellite cron (6 h)      2. fetch: weather (season / 14 d), S2 NDVI-NDRE-NDMI-EVI + S1 VV/VH (45 d)
  • satellite webhook         3. stage: GDD + calendar + NDVI phenology (resolveHybridCropStage)
  • after advisory (+2 min)   4. engine: runRulesEngine() → water balance, pest risk, alerts, today's actions
  • operation completed       5. runConditionMonitor()  (rules-engine/monitor - pure, no I/O)
  • manual / API                 a. snapshot = current signals vs previous scene vs expected curve
                                 b. detectors → candidate events (+ likely cause, confidence, evidence)
                                 c. merge duplicates → lifecycle (cooldown, escalation, resolve, expiry)
                                 d. WhatsApp policy (min severity, quiet hours, daily cap, bundling)
                                 e. render title/message in farmer's language (23 languages)
                              6. save snapshot + events → push popup → WhatsApp (cg_alert)
```

## Events

| Event | Fires when | Default channel |
|---|---|---|
| VEG_DROP | NDVI fell ≥ 0.08 (Medium) / ≥ 0.15 (High) vs the best clear scene 5–20 days earlier | popup + WhatsApp |
| VEG_BELOW_EXPECTED | NDVI below the *Expected Curves* value − tolerance; High if seen on two runs in a row | popup |
| WATER_STRESS | NDMI fell ≥ 0.05 or ≤ 0, or root-zone water used up. If the water balance says enough water was applied, the message asks the farmer to check the system (clogged drippers, leaks) | popup + WhatsApp |
| N_STRESS | NDRE fell ≥ 0.05 while NDVI is steady | popup |
| WATERLOG_SAR | Radar shows standing water | popup + WhatsApp |
| CANOPY_LOSS_SAR | Sudden VH fall: lodging, damage or harvest. Asks the farmer | popup + WhatsApp |
| STAGE_CHANGE | New principal stage (Medium at a critical stage) | popup |
| GROWTH_DELAY | Satellite stage ≥ 20 BBCH behind heat-based stage | popup |
| PEST_RISK | Weather window for a pest turned HIGH (only pests present in the region / month) | popup + WhatsApp |
| IRRIGATION_CRITICAL | Irrigation due at a critical stage (absorbs WATER_STRESS) | popup + WhatsApp |
| TASK_OVERDUE | Spray advised, not marked done after 3 days, risk still high | popup |
| NO_CLEAR_SCENE | No clear S2 image for 15 days (data quality, not shown to farmers) | none |
| WEATHER_* | Heavy rain, heat (crop limit at critical stages), frost, wind, dry spell, waterlogging | popup + WhatsApp |

All thresholds are in the workbook *Settings* tab (`mon_*`), and channels / cooldown / expiry are in *Monitoring Rules*.

## Likely cause

A vigour drop is explained by whatever else is true at the same time:
- dry root zone or low NDMI → water;
- heavy rain plus waterlogging-sensitive crop or radar water → waterlogging;
- heat days above the crop limit → heat;
- HIGH pest risk → that pest;
- NDRE falling faster than NDVI → nitrogen;
- radar VH fall → lodging or damage.

Causes are ranked, and the top two go in the message. Confidence rises with each independent source that agrees: S2 + S1 + weather + water balance.

## Not spamming the farmer

- One open event per problem (`key` = type or type:pest). The next run updates it instead of creating a new one.
- Re-notify only on escalation (Medium → High) or after the cooldown, and never after the farmer pressed "seen".
- State events resolve themselves when the condition clears **and** its data source was checked in that run. Point events expire.
- WhatsApp only for High (by default). Quiet hours run 21:00–06:00 local; held messages go out on the next run.
- At most 3 WhatsApp messages per field per day. All events from one run go out as **one** message ("+2 more alerts in the CropGen app").
- With the monitor on, the daily advisory sends no alerts, so the same alert can't arrive twice.

## Learning loop

Every popup asks "was this right?" (`feedbackOptions` per event type). Answers are stored on the event (`feedback`). Use them to tune `mon_*` thresholds and the expected curves per crop / region. Example query: share of `crop_fine` answers per event type per month.
