# Validation (Joi schemas)

Request and payload validation using [Joi](https://joi.dev/). One folder: **`src/validation/`** (not `validations/`).

## Layout

```
validation/
├── shared/
│   └── phone.js           # libphonenumber custom validator (reused)
├── crop/
│   └── schema.js          # cropValidationSchema
├── subscription/
│   └── schema.js          # subscriptionPlanSchema, idSchema
├── farmer/
│   └── schema.js          # validateFarmer (public socket onboarding)
└── organization/
    └── schema.js          # validateOrganization (public socket onboarding)
```

## Conventions

- **Domain folder** — matches API area (`crop`, `subscription`, etc.).
- **`schema.js`** — Joi schemas and `validate*` helpers for that domain.
- **`shared/`** — cross-domain validators only (phone today).

## Import examples

```js
import { cropValidationSchema } from "../validation/crop/schema.js";
import { subscriptionPlanSchema, idSchema } from "../validation/subscription/schema.js";
import { validateFarmer } from "../validation/farmer/schema.js";
```

## Note: `utils/email/validation.js`

That file is **email deliverability** checking for campaigns, not Joi request schemas. It stays under `src/utils/email/`.
