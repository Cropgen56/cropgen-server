# Mongoose models

All platform models use the same file naming: **`<name>.model.js`** in **kebab-case**.

## Examples

| File | Mongoose model |
| ---- | -------------- |
| `user.model.js` | User |
| `organization.model.js` | Organization (tenant / BIODROPS / CROPGEN) |
| `agent-organization.model.js` | AgentOrganization (public socket onboarding) |
| `farmer.model.js` | Farmer (public socket onboarding) |
| `user-chat.model.js` | UserChat (legacy marketing chat history) |
| `app-user-chat.model.js` | AppUserChat (logged-in app AI chat) |
| `subscription-plan.model.js` | SubscriptionPlan |
| `user-subscription.model.js` | UserSubscription |

## Feature-owned models

Advisory and other large features may define models under `src/features/<feature>/models/` (e.g. `farmAdvisory.model.js`). Prefer kebab-case there too when adding new files.

## Import

```js
import User from "../models/user.model.js";
import SubscriptionPlan from "../models/subscription-plan.model.js";
```
