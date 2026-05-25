# Shared utilities

Domain-grouped helpers used across controllers, services, and features.  
**Feature-specific** logic stays under `src/features/<feature>/utils/` (advisory, agent).

## Layout

```
utils/
├── auth/              # JWT, refresh cookies, org resolution, OTP helpers
├── email/             # Templates, queue, validation, campaign segments
├── storage/           # S3 upload / presign / delete
├── subscription/      # Plan pricing (Razorpay amounts)
├── whatsapp/          # Phone matching, language map, advisory message text
├── format/            # Display formatting (acres)
├── carbon/            # Carbon balance calculator
├── crop/
│   ├── growth/        # GDD, BBCH, crop categories, base temperature
│   └── health/        # NDVI-based crop health score
├── npk/               # NPK / nutrient stress from satellite indices
└── weather/           # AOI, weather snapshots (shared with advisory)
```

## Conventions

- **One folder per concern** — import `utils/<domain>/<file>.js`, not loose root files.
- **Client tokens** — CropyDeals JWT lives in `src/clients/cropydeals/utils/token.js`, not here.
- **White-label email** — Biodrops preset in `src/clients/biodrops/brand/`; platform templates in `email/template.js`.
- **Deep agronomy LLM** — prefer `src/features/advisory/utils/` for advisory-only code.

## Import examples

```js
import { signAccessToken, resolveClientSource } from "../utils/auth/authUtils.js";
import { htmlOtp, getEmailBrand } from "../utils/email/template.js";
import { createAvatarPresignedUrl } from "../utils/storage/s3.js";
import { getBaseTemperature } from "../utils/crop/growth/gddCalculator.js";
import { buildPhoneQueryFilter } from "../utils/whatsapp/phoneMatch.js";
```

## Adding a new util

1. Pick or create a domain folder under `utils/`.
2. Use a descriptive file name (`pricing.js`, not `utils2.js`).
3. Import models/services with `../../` from a one-level-deep folder (e.g. `utils/auth/`).
