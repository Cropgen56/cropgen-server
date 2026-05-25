# White-label clients

CropGen is the **default platform** — most code lives under `src/` (routes, controllers, services, models).

Each folder under `src/clients/<clientId>/` is a **white-label client** that shares the same backend but has its own:

- Auth route surface (e.g. `/v1/api/auth/biodrops/*`)
- Brand presets (email, cookies via headers)
- Client-only controllers and utilities

## Important: routes vs folders

HTTP paths are **not** derived from folder names. Client routes are registered in `src/clients/<clientId>/routes/` and **composed** into platform routers (e.g. `src/routes/auth.routes.js`). Mount prefixes in `index.js` stay unchanged.

## Adding a new client

1. Create `src/clients/<clientId>/constants.js` (org code, brand id, auth prefix).
2. Add `middleware/forceBrand.middleware.js` if the client needs forced branding.
3. Add `routes/auth.routes.js` with the same public paths clients will call.
4. Add `brand/email.preset.js` if transactional emails differ.
5. Wire the client router in `src/routes/auth.routes.js` via `router.use(clientAuthRoutes)`.
6. Seed organization in MongoDB and document env vars.

## Current clients

| Client     | Folder                      | Org code              | Auth routes |
| ---------- | --------------------------- | --------------------- | ----------- |
| Biodrops   | `src/clients/biodrops/`     | `BIODROPS` (fixed)    | `/biodrops/*` |
| CropyDeals | `src/clients/cropydeals/`   | From request body     | `POST /cropydeal-register-login` |

LFP auth routes remain in `src/routes/auth.routes.js` for now; they can move to `src/clients/lfp/` later using the same pattern.
