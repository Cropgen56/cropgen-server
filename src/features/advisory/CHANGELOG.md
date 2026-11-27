# Changelog: advisory

## 2.0.0: deterministic rules engine + real-time condition monitor

### Added
- `rules-engine/`: deterministic advisory engine driven by the Excel rule book (208 crops, 39 pests/diseases, 154 products, 681 crop × pest rules).
  - **Spray:** weather-triggered risk, gates for wind / rain / heat / harvest, FRAC/IRAC rotation, product choice by farming type, country + state registrations, and pest presence by region / month.
  - **Irrigation:** FAO-56 water balance per method (drip minutes, sprinkler / flood depth, rainfed conserve), plus soil, critical stages, rain skip, heat / frost timing.
  - **Fertilizer:** no repeat within a window; DAP nitrogen credited before urea.
  - **Alerts:** crop heat / cold limits at critical stages.
  - **WhatsApp:** combined daily spray + irrigation, alerts, fertilizer once per window.
- `rules-engine/monitor/`: condition monitor (previous vs current vs expected; S2, S1, GDD, weather, water balance, pests, operations). Events carry severity, cause, confidence, evidence and lifecycle, plus WhatsApp policy.
- `services/conditionMonitor.service.js`, `queue/conditionMonitor.queue.js`, `workers/conditionMonitor.worker.js`, `controllers/fieldEvents.controller.js`, models `FieldEvent` and `FieldConditionSnapshot`, and routes `/events/*`, `/condition/:id`, `/internal/monitor`.
- `services/farmHistory.service.js`: completed operations feed rotation, no-repeat and the water balance.
- `client/satellite.client.js`: Sentinel-1 time series (`SATELLITE_S1_PATH`), plus the monitor's optical series.
- `client/observearth.client.js`: whole-season weather history in 30-day chunks.
- Messages: 131 engine / monitor keys in 23 languages. 14 are drafted; the other 9 are borrowed from a related language until reviewed.
- Workbook v3 adds 5 tabs:
  - Product Registrations
  - Pest Region Map
  - Expected Curves
  - Monitoring Rules
  - Message Templates (with status)

  It also adds crop heat / cold limits and season days, product regions, and 30 new settings.
- Tools:
  - `export_advisory_rules.py`: validates and exports all tabs; `--messages` writes the locale files.
  - `scenario_report.mjs`: about 75k-scenario safety sweep.
- Tests: 31 unit tests (`rules-engine/__tests__`), 11 integration tests (`dev-harness`).

### Changed
- `activity-todo/advisorySuggestion.module.js`: `ADVISORY_ENGINE` = `llm` | `shadow` (default) | `rules`.
- `syncAdvisoryToOperations`: only actionable activities go on the operations calendar, tagged with the rule id.
- `engineNotifications`: only actionable WhatsApps. With the monitor enabled, alerts are sent only by the monitor.
- Optical indices are fetched before decisions (`ADVISORY_OPTICAL_BEFORE_DECISIONS`).

### Fixed
- The rain-probability check never matched (it compared against "likely", a value the API never returns), so the rain-probability spray block never triggered.
- LLM text could override a forced "no spray / no irrigation" decision.
- Fertilizer calculator ignored DAP nitrogen, which over-dosed urea.
- Season weather history kept only one day, which broke GDD stage and disease windows.
- Cloudy NDVI points caused false "crop declining" advice. They are now dropped above `NDVI_MAX_CLOUD_PCT`.
- Daily advisory continued after harvest. It now retires at `ADVISORY_RETIRE_BBCH`.
- Perennial fruit at ripening (BBCH ≥ 87) could get chemical sprays. A harvest block now applies (`spray_harvest_block_perennials`).
- A secondary pest's popup showed the top pest's product. It now says "inspect first, spray only if seen".
- The monitor's WhatsApp daily cap counted events instead of messages.

### Compatibility
- No breaking API changes. New model fields are optional. Every new behaviour is behind an env flag with a safe default (see `docs/DEPLOY.md`).
