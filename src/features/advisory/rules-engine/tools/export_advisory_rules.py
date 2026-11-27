#!/usr/bin/env python3
"""Export the CropGen advisory rules workbook (Excel) to the JSON the engine reads.

Usage:
    pip install openpyxl
    python3 export_advisory_rules.py CropGen_Advisory_Rules_v3.xlsx \
        ../data/advisoryRules.json [--messages ../../utils/i18n/messages]

--messages DIR also writes the Message Templates tab back to DIR/<lang>.json
(keys missing in the sheet are kept from the existing file).

The JSON contains ALL rows with their review status. The engine decides at
runtime which statuses go live (Settings → live_statuses, or the env var
ADVISORY_LIVE_STATUSES). Validation errors stop the export (exit code 1) so a
broken sheet can never reach production.
"""
import hashlib
import json
import re
import sys
from datetime import datetime, timezone

from openpyxl import load_workbook

FARMING_TYPES = {"Organic", "Integrated", "Inorganic"}
STATUSES = {"Draft", "Reviewed", "Approved", "Rejected"}
REF_STATUSES = STATUSES | {"Example"}  # 'Example' rows are never live
CHANNELS = {"popup", "popup+whatsapp", "none"}
PLACEHOLDER = re.compile(r"\{(\w+)\}")


class Sheet:
    def __init__(self, wb, name):
        if name not in wb.sheetnames:
            raise SystemExit(f"Missing tab: {name}")
        self.name = name
        self.ws = wb[name]
        header_row = next(self.ws.iter_rows(min_row=1, max_row=1, values_only=True))
        self.headers = [str(h).strip() if h is not None else "" for h in header_row]

    def rows(self):
        for idx, values in enumerate(self.ws.iter_rows(min_row=2, values_only=True), start=2):
            if values is None or values[0] in (None, ""):
                # Tables end at the first empty id cell (notes may follow below).
                break
            yield idx, {h: v for h, v in zip(self.headers, values) if h}


def text(v):
    return "" if v is None else str(v).strip()


def num(v, field, errors, where, allow_none=False):
    if v in (None, ""):
        if allow_none:
            return None
        errors.append(f"{where}: '{field}' is empty")
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        errors.append(f"{where}: '{field}' is not a number ({v!r})")
        return None


def ranges(v):
    out = []
    for part in filter(None, re.split(r"[,\s]+", text(v))):
        m = re.fullmatch(r"(\d+)-(\d+)", part)
        if m:
            out.append([int(m.group(1)), int(m.group(2))])
    return out


def first_int(v):
    m = re.search(r"\d+", text(v))
    return int(m.group()) if m else None


def split_list(v):
    return [p.strip() for p in re.split(r"[,;]", text(v)) if p.strip()]


def region_list(v):
    """'MH, KA' -> ['MH', 'KA']; blank -> ['ALL']."""
    return [x.upper() for x in split_list(v)] or ["ALL"]


def month_list(v, errors, where):
    out = []
    for part in split_list(v):
        if not re.fullmatch(r"\d{1,2}", part) or not 1 <= int(part) <= 12:
            errors.append(f"{where}: month '{part}' must be 1-12")
            continue
        out.append(int(part))
    return out


def optional_tab(wb, name, warnings):
    if name in wb.sheetnames:
        return Sheet(wb, name)
    warnings.append(f"tab '{name}' not found - section exported empty")
    return None


def main(src, dst, messages_dir=None):
    wb = load_workbook(src, data_only=True, read_only=True)
    errors, warnings = [], []

    # Settings
    settings = {}
    for idx, r in Sheet(wb, "Settings").rows():
        k = text(r.get("key"))
        v = r.get("Value")
        if isinstance(v, str):
            try:
                v = float(v) if re.fullmatch(r"-?\d+(\.\d+)?", v.strip()) else v.strip()
            except ValueError:
                pass
        settings[k] = v
    for required in ("live_statuses", "default_country", "spray_max_wind_kmh", "irr_rain_skip_mm"):
        if required not in settings:
            errors.append(f"Settings: missing key {required}")

    # Crops
    crops = {}
    for idx, r in Sheet(wb, "Crops").rows():
        where = f"Crops row {idx}"
        key = text(r.get("crop_key"))
        if key in crops:
            errors.append(f"{where}: duplicate crop_key {key}")
        group = text(r.get("Group code"))
        indoor = group == "MUSH"
        crops[key] = {
            "key": key,
            "name": text(r.get("Crop name")),
            "group": group,
            "groupName": text(r.get("Group")),
            "category": text(r.get("Category")),
            "lifecycle": text(r.get("Lifecycle")) or "Annual",
            "indoor": indoor,
            "kc": None if indoor else {
                "ini": num(r.get("Kc initial"), "Kc initial", errors, where),
                "mid": num(r.get("Kc mid"), "Kc mid", errors, where),
                "end": num(r.get("Kc end"), "Kc end", errors, where),
            },
            "rootDepthM": None if indoor else num(r.get("Root depth (m)"), "Root depth", errors, where),
            "p": None if indoor else num(r.get("Depletion fraction p"), "p", errors, where),
            "waterloggingSensitivity": text(r.get("Waterlogging sensitivity")),
            "criticalStages": text(r.get("Critical irrigation stages")),
            "criticalBbch": ranges(r.get("Critical BBCH ranges (engine)")),
            "recommendedIrrigation": text(r.get("Recommended irrigation")),
            "avoidIrrigation": text(r.get("Avoid irrigation")),
            "stopIrrigationDays": first_int(r.get("Stop irrigation before harvest (days)")),
            "irrigationNote": text(r.get("Irrigation note")),
            "heatLimitC": num(r.get("Heat stress limit (°C)"), "Heat limit", errors, where, allow_none=True),
            "coldLimitC": num(r.get("Cold stress limit (°C)"), "Cold limit", errors, where, allow_none=True),
            "seasonDays": num(r.get("Season days (annual)"), "Season days", errors, where, allow_none=True),
            "status": text(r.get("Review status")) or "Draft",
        }
        if crops[key]["status"] not in STATUSES:
            errors.append(f"{where}: unknown review status {crops[key]['status']}")

    # Targets
    targets = {}
    for idx, r in Sheet(wb, "Pest-Disease Triggers").rows():
        where = f"Pest-Disease Triggers row {idx}"
        tid = text(r.get("Target ID"))
        rain = text(r.get("Rain condition")).lower()
        if rain not in ("wet", "dry", "any"):
            errors.append(f"{where}: rain condition must be wet/dry/any")
        targets[tid] = {
            "id": tid,
            "name": text(r.get("Pest / disease")),
            "type": text(r.get("Type")),
            "tmin": num(r.get("Temp min (°C)"), "Temp min", errors, where),
            "tmax": num(r.get("Temp max (°C)"), "Temp max", errors, where),
            "rhmin": num(r.get("RH min (%)"), "RH min", errors, where),
            "rhmax": num(r.get("RH max (%)"), "RH max", errors, where),
            "rain": rain,
            "rainMm": num(r.get("Rain threshold (mm, 3-day)"), "Rain threshold", errors, where),
            "days": int(num(r.get("Consecutive days for HIGH"), "Consecutive days", errors, where) or 1),
            "method": text(r.get("Application")),
            "scout": text(r.get("What farmer should look for")),
            "etl": text(r.get("Action threshold (ETL)")),
        }

    # Products
    products = []
    for idx, r in Sheet(wb, "Products").rows():
        where = f"Products row {idx}"
        tid = text(r.get("Target ID"))
        if tid not in targets:
            errors.append(f"{where}: unknown Target ID {tid}")
        farming = split_list(r.get("Allowed farming types"))
        bad = [f for f in farming if f not in FARMING_TYPES]
        if bad or not farming:
            errors.append(f"{where}: bad farming types {farming}")
        kind = text(r.get("Product kind"))
        if "Organic" in farming and kind == "Chemical":
            errors.append(f"{where}: a Chemical product cannot be allowed for Organic farms")
        status = text(r.get("Review status")) or "Draft"
        if status not in STATUSES:
            errors.append(f"{where}: unknown review status {status}")
        products.append({
            "id": text(r.get("product_id")),
            "targetId": tid,
            "name": text(r.get("Product (active ingredient & formulation)")),
            "dose": text(r.get("Dose")),
            "group": text(r.get("FRAC / IRAC group")),
            "kind": kind,
            "farmingTypes": farming,
            "preference": int(num(r.get("Preference (1 = first)"), "Preference", errors, where) or 9),
            "note": text(r.get("Caution / note")),
            "countries": [c.upper() for c in split_list(r.get("Registered countries (ISO codes)"))] or ["IN"],
            "regions": region_list(r.get("Regions (state codes or ALL)")),
            "registrationChecked": text(r.get("CIB&RC crop registration checked")),
            "status": status,
        })

    # Spray rules
    spray_rules = []
    for idx, r in Sheet(wb, "Spray Rules").rows():
        where = f"Spray Rules row {idx}"
        ck, tid = text(r.get("crop_key")), text(r.get("Target ID"))
        if ck not in crops:
            errors.append(f"{where}: unknown crop_key {ck}")
        if tid not in targets:
            errors.append(f"{where}: unknown Target ID {tid}")
        elif not any(p["targetId"] == tid for p in products):
            errors.append(f"{where}: no products for target {tid}")
        bmin = num(r.get("BBCH min"), "BBCH min", errors, where)
        bmax = num(r.get("BBCH max"), "BBCH max", errors, where)
        if bmin is not None and bmax is not None and bmin > bmax:
            errors.append(f"{where}: BBCH min > max")
        status = text(r.get("Review status")) or "Draft"
        if status not in STATUSES:
            errors.append(f"{where}: unknown review status {status}")
        spray_rules.append({
            "id": text(r.get("rule_id")),
            "cropKey": ck,
            "targetId": tid,
            "bbchMin": bmin,
            "bbchMax": bmax,
            "active": text(r.get("Active")).lower() == "yes",
            "status": status,
            "note": text(r.get("Crop-specific note")),
        })

    # Irrigation methods
    methods = []
    for idx, r in Sheet(wb, "Irrigation Methods").rows():
        name = text(r.get("Irrigation type (as in app)"))
        if not name or name.startswith("Run-time calculator"):
            break
        where = f"Irrigation Methods row {idx}"
        family = text(r.get("Engine family"))
        if family not in ("drip", "sprinkler", "flood", "rainfed"):
            break  # calculator block below the table
        methods.append({
            "name": name,
            "family": family,
            "efficiency": num(r.get("Application efficiency"), "efficiency", errors, where),
            "unit": text(r.get("Advice unit")),
            "defaultRateMmPerHour": num(r.get("Default application rate (mm/h)"), "rate", errors, where, allow_none=True),
            "bestTime": text(r.get("Best time")),
            "avoid": text(r.get("Avoid")),
            "fertilizerMethod": text(r.get("Fertilizer with this method")),
        })

    # Soils
    soils = {}
    for idx, r in Sheet(wb, "Soil Types").rows():
        where = f"Soil Types row {idx}"
        name = text(r.get("Soil type (as in app)"))
        fc = num(r.get("Field capacity (m³/m³)"), "FC", errors, where)
        wp = num(r.get("Wilting point (m³/m³)"), "WP", errors, where)
        if fc is not None and wp is not None and fc <= wp:
            errors.append(f"{where}: field capacity must be above wilting point")
        soils[re.sub(r"[^a-z]", "", name.lower())] = {
            "name": name, "fc": fc, "wp": wp,
            "infiltrationMmPerHour": num(r.get("Infiltration rate (mm/h)"), "infiltration", errors, where),
        }

    # Alerts
    alerts = {}
    for idx, r in Sheet(wb, "Weather Alerts").rows():
        where = f"Weather Alerts row {idx}"
        aid = text(r.get("alert_id"))
        alerts[aid] = {
            "id": aid,
            "name": text(r.get("Alert")),
            "severity": text(r.get("Severity")),
            "cooldownHours": num(r.get("Cooldown (hours)"), "cooldown", errors, where),
            "channels": text(r.get("Channels")),
            "active": text(r.get("Active")).lower() == "yes",
        }

    product_ids = {p["id"] for p in products}

    # Product registrations (country × region × crop)
    registrations = []
    sh = optional_tab(wb, "Product Registrations", warnings)
    for idx, r in (sh.rows() if sh else []):
        where = f"Product Registrations row {idx}"
        status = text(r.get("Review status")) or "Draft"
        if status not in REF_STATUSES:
            errors.append(f"{where}: unknown review status {status}")
        pid, ck = text(r.get("product_id")), text(r.get("crop_key"))
        country = text(r.get("Country (ISO)")).upper()
        if status != "Example":
            if pid not in product_ids:
                errors.append(f"{where}: unknown product_id {pid}")
            if ck not in crops:
                errors.append(f"{where}: unknown crop_key {ck}")
            if not re.fullmatch(r"[A-Z]{2}", country):
                errors.append(f"{where}: country must be a 2-letter ISO code")
        phi = num(r.get("PHI (days)"), "PHI", errors, where, allow_none=True)
        registrations.append({
            "id": text(r.get("reg_id")),
            "productId": pid,
            "country": country,
            "regions": region_list(r.get("Regions (state codes or ALL)")),
            "cropKey": ck,
            "dose": text(r.get("Label dose (this country)")) or None,
            "phiDays": int(phi) if phi is not None else None,
            "brands": split_list(r.get("Local brand names")),
            "source": text(r.get("Registration source / number")) or None,
            "status": status,
        })

    # Pest presence by region / month
    pest_regions = []
    sh = optional_tab(wb, "Pest Region Map", warnings)
    for idx, r in (sh.rows() if sh else []):
        where = f"Pest Region Map row {idx}"
        tid = text(r.get("Target ID"))
        status = text(r.get("Review status")) or "Draft"
        if status not in REF_STATUSES:
            errors.append(f"{where}: unknown review status {status}")
        if tid not in targets:
            errors.append(f"{where}: unknown Target ID {tid}")
        pest_regions.append({
            "id": text(r.get("row_id")),
            "targetId": tid,
            "country": text(r.get("Country (ISO)")).upper(),
            "regions": region_list(r.get("Regions (state codes or ALL)")),
            "months": month_list(r.get("Months present (1-12, blank = all year)"), errors, where),
            "status": status,
        })

    # Expected curves: "<group|category|crop_key>:<INDEX>" -> [{bbchMin, bbchMax, value, tolerance}]
    expected = {}
    sh = optional_tab(wb, "Expected Curves", warnings)
    for idx, r in (sh.rows() if sh else []):
        where = f"Expected Curves row {idx}"
        status = text(r.get("Review status")) or "Draft"
        if status == "Rejected":
            continue
        k = f'{text(r.get("Curve key (group code or category)"))}:{text(r.get("Index")).upper() or "NDVI"}'
        lo = num(r.get("BBCH min"), "BBCH min", errors, where)
        hi = num(r.get("BBCH max"), "BBCH max", errors, where)
        val = num(r.get("Expected value"), "Expected value", errors, where)
        if lo is not None and hi is not None and lo > hi:
            errors.append(f"{where}: BBCH min > max")
        if val is not None and not -1 <= val <= 1:
            errors.append(f"{where}: expected value must be between -1 and 1")
        expected.setdefault(k, []).append({
            "bbchMin": lo, "bbchMax": hi, "value": val,
            "tolerance": num(r.get("Tolerance (below = alert)"), "Tolerance", errors, where, allow_none=True),
            "status": status,
        })
    for k, rows_ in expected.items():
        rows_.sort(key=lambda x: x["bbchMin"] or 0)

    # Monitoring rules (event type -> lifecycle config)
    monitoring = {}
    sh = optional_tab(wb, "Monitoring Rules", warnings)
    for idx, r in (sh.rows() if sh else []):
        where = f"Monitoring Rules row {idx}"
        etype = text(r.get("Event type"))
        ch = text(r.get("Channels"))
        if ch not in CHANNELS:
            errors.append(f"{where}: channels must be one of {sorted(CHANNELS)}")
        kind = text(r.get("Kind (state = stays open while true; point = one-off)")).lower()
        if kind not in ("state", "point"):
            errors.append(f"{where}: kind must be state or point")
        status = text(r.get("Review status")) or "Draft"
        if status not in STATUSES:
            errors.append(f"{where}: unknown review status {status}")
        monitoring[etype] = {
            "kind": kind,
            "channels": ch,
            "cooldownHours": num(r.get("Cooldown (hours)"), "Cooldown", errors, where),
            "expiresDays": num(r.get("Expires after (days)"), "Expires", errors, where),
            "active": text(r.get("Active")).lower() == "yes",
            "status": status,
        }

    # Cross checks
    for key, c in crops.items():
        if not c["indoor"] and not any(s["cropKey"] == key for s in spray_rules):
            warnings.append(f"Crop {c['name']} has no spray rules")

    if errors:
        print("EXPORT FAILED - fix these rows in the workbook:")
        for e in errors[:200]:
            print("  -", e)
        if len(errors) > 200:
            print(f"  ... and {len(errors) - 200} more")
        sys.exit(1)

    body = {
        "settings": settings,
        "crops": crops,
        "targets": targets,
        "products": products,
        "sprayRules": spray_rules,
        "irrigationMethods": methods,
        "soils": soils,
        "alerts": alerts,
        "productRegistrations": registrations,
        "pestRegions": pest_regions,
        "expectedCurves": expected,
        "monitoring": monitoring,
    }
    digest = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]
    out = {
        "version": digest,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": src.split("/")[-1],
        **body,
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    counts = {k: len(v) for k, v in body.items() if k != "settings"}
    print(f"OK version={digest} -> {dst}")
    print("   ", counts)
    for w in warnings:
        print("  warning:", w)
    if messages_dir:
        export_messages(wb, messages_dir)


def export_messages(wb, out_dir):
    """Write the Message Templates tab back to <out_dir>/<lang>.json, checking placeholders against English."""
    import os

    sh = Sheet(wb, "Message Templates")
    langs = [(i, h.split(" ")[0]) for i, h in enumerate(sh.headers) if i > 0 and h]
    tables = {lang: {} for _, lang in langs}
    problems = []
    for idx, values in enumerate(sh.ws.iter_rows(min_row=2, values_only=True), start=2):
        if not values or values[0] in (None, ""):
            break
        k = text(values[0])
        en = text(values[1]) if len(values) > 1 else ""
        want = set(PLACEHOLDER.findall(en))
        for i, lang in langs:
            v = values[i] if i < len(values) else None
            if v in (None, ""):
                continue
            got = set(PLACEHOLDER.findall(str(v)))
            if got != want:
                problems.append(f"row {idx} {k} [{lang}]: placeholders {sorted(got)} != en {sorted(want)}")
                continue
            tables[lang][k] = str(v)
    if problems:
        print("MESSAGES NOT WRITTEN - fix placeholders:")
        for p in problems[:100]:
            print("  -", p)
        sys.exit(1)
    os.makedirs(out_dir, exist_ok=True)
    for lang, tbl in tables.items():
        path = os.path.join(out_dir, f"{lang}.json")
        existing = {}
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                existing = json.load(f)
        existing.update(tbl)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
            f.write("\n")
    print(f"messages: {len(tables)} languages -> {out_dir}")


if __name__ == "__main__":
    args = sys.argv[1:]
    msg_dir = None
    if "--messages" in args:
        i = args.index("--messages")
        if i + 1 >= len(args):
            raise SystemExit(__doc__)
        msg_dir = args[i + 1]
        del args[i:i + 2]
    if len(args) != 2:
        raise SystemExit(__doc__)
    main(args[0], args[1], msg_dir)
