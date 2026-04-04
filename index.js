import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import { connectToDatabase } from "./src/config/db.js";

// Core routes
import authRoutes from "./src/routes/auth.routes.js";
import fieldRoutes from "./src/routes/field.routes.js";
import blogRoutes from "./src/routes/blog.routes.js";
import organizationRoutes from "./src/routes/organization.routes.js";
import operationRoutes from "./src/routes/operation.routes.js";
import cropRoutes from "./src/routes/crop.routes.js";
import postsRoutes from "./src/routes/post.routes.js";
import commonRoutes from "./src/routes/common.routes.js";
import analyticRoutes from "./src/routes/analytics.routes.js";
import whatsappRoutes from "./src/routes/whatsapp.routes.js";
import subscriptionPlanRoutes from "./src/routes/subscriptionplan.routes.js";
import subscriptionRoutes from "./src/routes/subscription.routes.js";
import emailRoutes from "./src/routes/email.routes.js";

// Smart advisory routes
import advisoryRoutes from "./src/routes/advisory.routes.js";
import carbonRoutes from "./src/routes/carbon.routes.js";

// Agent chat routes
import chatRoutes from "./src/routes/chat.routes.js";

// Firebase config
import "./src/config/firebaseConfig.js";

// Webhook (raw body must come before express.json)
import { handleRazorpayWebhook } from "./src/controllers/subscriptioncontroller/razorpay.webhook.controller.js";

// Workers
import { startSubscriptionExpiryJob } from "./src/worker/subscriptionExpiry.worker.js";
import { startNotificationWorker } from "./src/worker/notification.worker.js";
import { startWelcomeFarmReminderWorker } from "./src/worker/welcomeFarm.worker.js";
import { runAdvisoryJob } from "./src/worker/advisory.worker.js";

// Agent socket
import { setupSocket } from "./src/socket/setupSocket.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 7070;

const envAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [
  "https://admin.cropgenapp.com",
  "https://www.cropgenapp.com",
  "https://app.cropgenapp.com",
  "https://cropydeals.cropgenapp.com",
  "https://test.cropgenapp.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://10.0.2.2:7070",
  "http://localhost:5176",
  ...envAllowedOrigins,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }
    console.warn("Blocked CORS origin:", origin);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-api-key",
    "X-Requested-With",
  ],
  exposedHeaders: ["Set-Cookie"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.post(
  "/v1/api/user-subscriptions/webhook",
  express.raw({ type: "application/json" }),
  handleRazorpayWebhook,
);

const jsonMiddleware = express.json({ limit: "10mb" });
app.use((req, res, next) => {
  // Engine.IO handles these before Express when the URL matches setupSocket `path`.
  // If nginx rewrites `/v3/socket.io` → `/socket.io`, the request falls through to
  // Express; parsing this POST as JSON returns 400 ("xhr post error" in the client).
  if (req.path.includes("socket.io")) {
    return next();
  }
  return jsonMiddleware(req, res, next);
});
app.use(cookieParser());

// Workers
startNotificationWorker();
startSubscriptionExpiryJob();
startWelcomeFarmReminderWorker();
runAdvisoryJob();

// Core API routes
app.use("/v1/api/auth", authRoutes);
app.use("/v1/api/field", fieldRoutes);
app.use("/v1/api/blog", blogRoutes);
app.use("/v1/api/org", organizationRoutes);
app.use("/v1/api/operation", operationRoutes);
app.use("/v1/api/crop", cropRoutes);
app.use("/v1/api/email", emailRoutes);
app.use("/v1/api/subscription", subscriptionRoutes);
app.use("/v1/api/subscription-plans", subscriptionPlanRoutes);
app.use("/v1/api/posts", postsRoutes);
app.use("/v1/api/common", commonRoutes);
app.use("/v1/api/analytics", analyticRoutes);
app.use("/v1/api/whatsapp", whatsappRoutes);

// Smart advisory routes (v2 matches mobile/web client expectations)
app.use("/v1/api/advisory", advisoryRoutes);
app.use("/v1/api/carbon", carbonRoutes);
app.use("/v2/api/advisory", advisoryRoutes);
app.use("/v2/api/carbon", carbonRoutes);

// Agent chat API routes
app.use("/api/chats", chatRoutes);
app.use("/v3/api/chats", chatRoutes);

app.get("/health", (req, res) => {
  return res.status(200).json({ status: true, message: "Server is running" });
});

// Start server with Socket.IO
const startServer = async () => {
  try {
    await connectToDatabase();

    const httpServer = http.createServer(app);

    // Wire up Socket.IO for the AI chat
    setupSocket(httpServer);

    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(
        `✅ HTTP + Socket.IO Server running at http://localhost:${PORT}`,
      );
    });
  } catch (error) {
    console.error("Server failed to start:", error.message);
    process.exit(1);
  }
};

startServer();
