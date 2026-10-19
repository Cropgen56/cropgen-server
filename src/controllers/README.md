# Controllers

HTTP handlers grouped by **domain**, aligned with `src/routes/` mount names.

## Layout

```
controllers/
├── auth/                 # /v1/api/auth (platform + barrel exports)
├── analytics/            # /v1/api/analytics
├── blog/                 # /v1/api/blog
├── carbon/               # /v1/api/carbon
├── chat/                 # /api/chats, /v3/api/chats
├── common/               # /v1/api/common
├── crop/                 # /v1/api/crop
├── email/                # /v1/api/email
├── farmer/               # chat admin (farmers)
├── field/                # /v1/api/field
├── operation/            # /v1/api/operation
├── organization/         # /v1/api/org + chat org admin
│   ├── organization.controller.js   # org CRUD API
│   └── chat.controller.js         # chat routes org helpers
├── post/                 # /v1/api/posts
├── subscription/         # /v1/api/subscription
├── subscription-plan/    # /v1/api/subscription-plans
└── whatsapp/             # /v1/api/whatsapp
```

## Conventions

- **One folder per API domain** — matches the route module that imports it.
- **File names:** `<action>.controller.js` or domain name (`blog.controller.js`).
- **Barrel exports:** `index.js` re-exports handlers when a domain has many controllers (`auth/`, `subscription/`, `whatsapp/`).
- **White-label clients:** client-only handlers live under `src/clients/<client>/controllers/` (e.g. Biodrops WhatsApp auth), not here.

## Feature modules

Large product areas live under `src/features/`:

| Feature | Path | Notes |
| ------- | ---- | ----- |
| Advisory | `src/features/advisory/` | Routes, services, workers, LLM advisory |
| Agent | `src/features/agent/` | AI chat core, Socket.IO, WhatsApp auto-reply |

Example: `features/advisory/controllers/advisory.controller.js`. Agent logic is **not** under `src/controllers/` — see [`features/agent/README.md`](../features/agent/README.md).

## Adding a new domain

1. Create `src/controllers/<domain>/`.
2. Add `*.controller.js` handler(s).
3. Import from `src/routes/<domain>.routes.js`.
4. Use `../../models`, `../../services`, etc. for imports from a domain subfolder.
