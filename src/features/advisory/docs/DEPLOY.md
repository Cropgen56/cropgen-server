# CropGen advisory v2: deployment guide

This folder replaces `src/features/advisory` in the backend. Everything new is **off or in shadow by default**: deploying the code without changing env vars keeps today's farmer-facing behaviour.

## 1. What changes for farmers (once switched on)

| Before | After |
|---|---|
| OpenAI writes the advice from a few parameters | Deterministic rules engine (`rules-engine/`) decides spray, irrigation, fertilizer and alerts from the Excel rule book. The same input always gives the same advice, and every decision carries a rule id. |
| One spray and generic irrigation for every farm | Per crop × stage × farming type (Organic / Integrated / Inorganic) × irrigation method × soil × weather × region |
| Products not tied to country / state | Products filtered by country + state registrations (`Product Registrations` tab), and pests by region / month (`Pest Region Map` tab) |
| One WhatsApp per activity | Only actionable messages: spray + irrigation together (v2 template), alerts separately, fertilizer once per stage window |
| No real-time monitoring | Condition monitor compares previous vs current vs expected (S2, S1, GDD, weather, water balance, pests, operations). It raises events with severity, likely cause and evidence, shows them as app popups, and sends WhatsApp in the farmer's language |

## 2. Install

1. Back up the current `src/features/advisory`, then replace it with this folder (keep `.env`).
2. No new npm packages. The code uses what the backend already has: express, mongoose, axios, bullmq, node-cron, openai.
3. Wire the monitor jobs into the server start, next to where `runAdvisoryJob` / the advisory cron is started:

   ```js
   import { startConditionMonitorJobs } from "./features/advisory/workers/conditionMonitor.worker.js";
   startConditionMonitorJobs(); // no-op unless CONDITION_MONITOR_ENABLED=true
   ```
4. MongoDB: two new collections are created automatically, with their indexes:
   - `fieldevents`
   - `fieldconditionsnapshots` (TTL `MONITOR_SNAPSHOT_RETENTION_DAYS`, default 400 days)

   `farmadvisories` gets new optional fields (`engine`, `decisions`, `alerts`, `whatsappPreview`, `engineShadow`). Existing documents stay valid.

## 3. Model fields the engine reads (add to the backend models)

The engine works without them, using defaults that it flags in `dataQuality` / `reasonCodes`. Every one of them makes the advice more exact.

| Model.field | Type | Used for |
|---|---|---|
| `FarmField.country` | ISO-3166 alpha-2, e.g. `IN`, `ZA` | Product registrations (falls back to `user.country`, then `ADVISORY_DEFAULT_COUNTRY`) |
| `FarmField.state` | Sub-code, e.g. `MH`, `KA`, `WC` | Region-wise products and pest presence (`regionProfile.state` also accepted) |
| `FarmField.soilType` | One of the *Soil Types* tab | Water holding → irrigation amount |
| `FarmField.waterSource`, `waterAvailability` | string | Limited-water advice |
| `FarmField.irrigationDetails` | `{ emitterFlowLph, emitterSpacingM, lateralSpacingM, pumpDischargeLps, usualHoursPerAcre }` | Exact drip minutes / pump hours |
| `FarmField.drainage` | `good` / `poor` | Waterlogging alerts |
| `User.timezone` | IANA, e.g. `Asia/Kolkata` | WhatsApp quiet hours outside India (until then, `ADVISORY_TZ` applies) |
| `Operation.progress` + actual quantity | existing | Rotation, no-repeat spray / fertilizer, water balance anchor |

The full list, with priorities, is in the workbook → *Data Requirements*.

## 4. Environment variables

### Advisory engine
| Var | Default | Meaning |
|---|---|---|
| `ADVISORY_ENGINE` | `shadow` | `llm` = old OpenAI path only · `shadow` = old output to farmers, engine decisions stored in `engineShadow` for comparison · `rules` = engine output to farmers |
| `ADVISORY_LIVE_STATUSES` | Settings → `live_statuses` (`Approved`) | Which review statuses reach farmers. Use `Draft,Reviewed,Approved` **only on staging** |
| `ADVISORY_RULES_PATH` | `rules-engine/data/advisoryRules.json` | Load a different exported rule book without a deploy |
| `ADVISORY_DEFAULT_COUNTRY` | `IN` | Used when neither the farm nor the user has a country |
| `ADVISORY_TZ` | `Asia/Kolkata` | Time zone for quiet hours when the user has none |
| `ADVISORY_OPTICAL_BEFORE_DECISIONS` | `true` | Fetch NDRE / NDMI etc. before deciding (not after saving) |
| `ADVISORY_HISTORY_DAYS` | `120` | Operations history window |
| `ADVISORY_HISTORY_MAX_DAYS` | `180` | Season weather history cap (fetched in 30-day chunks) |
| `ADVISORY_RETIRE_BBCH` | `89` | Stop daily advisory after this stage |
| `NDVI_MAX_CLOUD_PCT` | `40` | Drop optical points from cloudier scenes |

### WhatsApp
| Var | Default | Meaning |
|---|---|---|
| `WHATSAPP_TEMPLATE_MODE` | `legacy` | `legacy` = existing `advisory` template, actionable activities only · `v2` = new templates below |
| `WA_TEMPLATE_DAILY` | `cg_daily_action` | Spray + irrigation in one message |
| `WA_TEMPLATE_ALERT` | `cg_alert` | One alert / monitor event (bundled) |
| `WA_TEMPLATE_FERT` | `cg_fertilizer` | Once per fertilizer stage window |

### Condition monitor
| Var | Default | Meaning |
|---|---|---|
| `CONDITION_MONITOR_ENABLED` | `false` | Master switch. When `true` the monitor owns all alerts and the daily advisory sends none, so there are no duplicates |
| `MONITOR_NOTIFY` | `all` | `off` = compute + store events only · `popup` = app push/popup only · `all` = popup + WhatsApp. **Start with `off`** |
| `MONITOR_WEATHER_CRON` | `15 */3 * * *` | Weather pass (all subscribed fields) |
| `MONITOR_SATELLITE_CRON` | `45 */6 * * *` | Satellite pass: runs fields with a new clear scene, or any field not run for a week |
| `MONITOR_SPREAD_MS` | `3600000` | Spread a pass over this time to protect the APIs |
| `MONITOR_QUEUE_NAME` / `MONITOR_QUEUE_CONCURRENCY` | `conditionMonitorQueue` / `3` | BullMQ (falls back to in-process timers without Redis) |
| `MONITOR_SATELLITE_LOOKBACK_DAYS` | `45` | S2 / S1 history fetched per run |
| `MONITOR_S1_ENABLED` | `true` | Sentinel-1 radar. A 404/501 from the endpoint disables it until restart |
| `SATELLITE_S1_PATH` | `/timeseries/sar/sar` | See `SATELLITE_API_SPEC.md` |
| `MONITOR_PUSH_TEMPLATE` | `field_event` | Push notification template name |
| `MONITOR_SNAPSHOT_RETENTION_DAYS` | `400` | Snapshot TTL |

Secrets stay where they already are (`OBSERVEARTH_API_KEY`, `SATELLITE_API_KEY`, `OPENAI_API_KEY`). No new secrets are added.

## 5. WhatsApp templates to approve in Meta (each language)

| Template | Category | Params | Example (en) |
|---|---|---|---|
| `cg_daily_action` | Utility | {{1}} name · {{2}} field · {{3}} today's actions | *Hi {{1}}, today for {{2}}: {{3}}* |
| `cg_alert` | Utility | {{1}} field · {{2}} title · {{3}} message | *{{1}}: {{2}}. {{3}}* |
| `cg_fertilizer` | Utility | {{1}} name · {{2}} field · {{3}} fertilizer advice | *Hi {{1}}, fertilizer for {{2}}: {{3}}* |
| `field_event` (push) | n/a | title, message | in-app push |

Until they are approved, keep `WHATSAPP_TEMPLATE_MODE=legacy`. Legacy mode already sends only actionable messages.

## 6. App endpoints (new)

| Method | Path | Auth | Use |
|---|---|---|---|
| GET | `/advisory/events/user/me?status=open` | user | Popup feed across the farmer's fields (High first) |
| GET | `/advisory/events/:farmFieldId?status=open\|all&cropInstanceId=&limit=` | org-scoped | Field event list |
| PATCH | `/advisory/events/item/:eventId` | org-scoped | `{action:"seen"}` · `{action:"resolve"}` · `{action:"feedback", answer, note}`; `answer` must be one of `feedbackOptions` from the event |
| GET | `/advisory/condition/:farmFieldId?days=60` | org-scoped | Latest snapshot + trend (NDVI vs expected, NDRE, NDMI, VV/VH, water depletion, stage) for charts |
| POST | `/advisory/internal/monitor` | `x-api-key` | `{farmFieldId, cropInstanceId?, trigger:"satellite", wait?}`. Call it from the satellite server on new-scene ingest |

Popup shape (`toPopup`): `{ id, farmFieldId, type, severity, confidence, status, title, message, causes[], evidence[], firstSeenAt, lastSeenAt, feedbackOptions[], feedback }`. `title` and `message` are already in the farmer's language.

## 7. Rule book workflow (agronomy team)

1. Edit `CropGen_Advisory_Rules_v3.xlsx`, changing yellow columns only and setting *Review status*.
2. Export and validate. The export stops with row-level errors if anything is wrong:
   ```bash
   python3 rules-engine/tools/export_advisory_rules.py CropGen_Advisory_Rules_v3.xlsx rules-engine/data/advisoryRules.json \
       --messages utils/i18n/messages      # optional: write Message Templates tab back to the locale files
   ```
3. Safety sweep: about 75k scenarios, which must report 0 violations. Then the unit tests:
   ```bash
   node rules-engine/tools/scenario_report.mjs /tmp/scen --statuses Approved
   node --test rules-engine/__tests__/*.test.mjs
   ```
4. Deploy, or point `ADVISORY_RULES_PATH` at the new JSON. `rulesVersion` is stored on every advisory and event.

## 8. Rollout plan (recommended)

| Step | Env | Check before moving on |
|---|---|---|
| 1. Shadow | `ADVISORY_ENGINE=shadow` | Compare `engineShadow` vs LLM output on 50+ real fields per crop; agronomist approves rows (`Approved`) |
| 2. Monitor silent | `CONDITION_MONITOR_ENABLED=true`, `MONITOR_NOTIFY=off` | Events in `fieldevents` look right; tune `mon_*` in Settings; check S1 endpoint works |
| 3. Pilot | `ADVISORY_ENGINE=rules`, `MONITOR_NOTIFY=popup` for pilot users | Popup feedback (`feedback.answer`), with a target of "correct" ≥ 70 % |
| 4. WhatsApp | `MONITOR_NOTIFY=all`, `WHATSAPP_TEMPLATE_MODE=v2` (after Meta approval) | Opt-out / complaint rate, messages per farmer per day (cap 3) |
| 5. Global | Fill *Product Registrations* per country; set `FarmField.country/state` | Engine flags `registration_not_verified` where no registration rows exist yet |

Rollback at any step means setting the env var back. No data migration is needed.

## 9. Tests

- `node --test rules-engine/__tests__/*.test.mjs`: 31 unit tests (engine, monitor, lifecycle, i18n).
- `rules-engine/tools/scenario_report.mjs`: invariant sweep, also usable in CI.
- `dev-harness/`: integration tests that run the real services / controllers / pipeline against in-memory fakes of mongoose, axios, bullmq and the backend models (11 tests). See `dev-harness/README.md`.

The real backend models, `gddCalculator`, `cropHealth`, `npkCalculator`, Observearth and the satellite server are **stubbed in the harness**. Run step 1–2 of the rollout on staging before any farmer sees output.
