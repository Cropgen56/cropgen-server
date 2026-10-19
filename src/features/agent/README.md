# Agent feature

AI farming assistant: OpenAI Agents SDK (`@openai/agents`), real-time Socket.IO chat, and WhatsApp auto-replies.

## Layout

```
features/agent/
├── index.js                 # Public exports
├── core/
│   ├── agent.js             # createPublicAgent, createAppAgent, Agents SDK Agent + Runner
│   └── systemPrompts.js     # CropGen vs Biodrops/Satagro personas
├── tools/
│   └── cropKnowledgeTool.js # get_crop_knowledge: pests/diseases/cultivation from `crops` collection
├── utils/
│   └── farmContext.js       # Crop timeline + advisory text for prompts
├── services/
│   ├── appSocket.service.js       # Logged-in app chat (JWT /app namespace)
│   ├── publicSocket.service.js    # Marketing site chat (/public namespace)
│   ├── whatsappAgent.service.js   # Inbound WhatsApp AI replies
│   └── whatsappSettings.service.js # Global automation on/off
└── socket/
    └── setupSocket.js       # Socket.IO wiring (path: /v3/socket.io)
```

## Entry points

| Consumer | Import from |
| -------- | ----------- |
| Server boot | `setupSocket`, `logWhatsAppAgentStatus` from `features/agent/index.js` |
| WhatsApp webhook | `generateWhatsAppAgentReply` |
| Admin WhatsApp API | `getWhatsAppAgentSettingsPayload`, `setGlobalReplyMode` |
| Dev UI | `GET /dev/agent-test` → `views/agent-test.ejs` |

## Related (outside this folder)

- REST chat admin: `src/routes/chat.routes.js` + `src/controllers/chat/`
- WhatsApp HTTP API: `src/routes/whatsapp.routes.js`
- Advisory data in prompts: `features/advisory/models/farmAdvisory.model.js`
