import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import { fileURLToPath } from "url";
import path from "path";
import bodyParser from "body-parser";
import { connectToDatabase } from "./src/config/db.js";
import authRoutes from "./src/routes/authRoutes.js";
import fieldRoutes from "./src/routes/fieldRoutes.js";
import blogRoutes from "./src/routes/blogRoutes.js";
import organizationRoutes from "./src/routes/organizationRoutes.js";
import operationRoutes from "./src/routes/operationRoutes.js";
import cropRoutes from "./src/routes/cropRoutes.js";
import postsRoutes from "./src/routes/postRoutes.js";
import commonRoutes from "./src/routes/commonRoutes.js";
import analyticRoutes from "./src/routes/analyticsRoutes.js";
import whatsappRoutes from "./src/routes/whatsappRoutes.js";
import "./src/config/firebaseConfig.js";
import subscriptionPlanRoutes from "./src/routes/subscriptionplan.routes.js";
import subscriptionRoutes from "./src/routes/subscription.routes.js";
// import emailRoutes from "./src/routes/emailRoutes.js";

// import corn jobs
import { startSubscriptionExpiryJob } from "./src/jobs/subscriptionExpiryJob.js";

dotenv.config();

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 7070;
const NODE_ENV = process.env.NODE_ENV || "development";

// allowedOrigins as you already have
const allowedOrigins = [
  "https://admin.cropgenapp.com",
  "https://www.cropgenapp.com",
  "https://app.cropgenapp.com",
  "https://cropydeals.cropgenapp.com",
  "https://test.cropgenapp.com",
  "http://localhost:3000",
  "http://localhost:5173",
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

// Apply middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use("/v1/api/user-subscriptions/webhook", (req, res, next) => {
  bodyParser.raw({ type: "application/json" })(req, res, () => {
    req.rawBody = req.body;
    try {
      req.body = JSON.parse(req.body.toString());
    } catch (err) {
      return res.status(400).json({ error: "Invalid JSON" });
    }
    next();
  });
});

app.use(express.json());
app.use(cookieParser());

// crops jobs
startSubscriptionExpiryJob();

// Routes
app.use("/v1/api/auth", authRoutes);
app.use("/v1/api/field", fieldRoutes);
app.use("/v1/api/blog", blogRoutes);
app.use("/v1/api/org", organizationRoutes);
app.use("/v1/api/operation", operationRoutes);
app.use("/v1/api/crop", cropRoutes);
// app.use("/v1/api/email", emailRoutes);
app.use("/v1/api/subscription", subscriptionRoutes);
app.use("/v1/api/subscription-plans", subscriptionPlanRoutes);
app.use("/v1/api/posts", postsRoutes);
app.use("/v1/api/common", commonRoutes);
app.use("/v1/api/analytics", analyticRoutes);
app.use("/v1/api/whatsapp", whatsappRoutes);

app.get("/health", (req, res) => {
  return res.status(200).json({
    status: true,
    message: "server is good and running ",
    cookies: req.cookies,
  });
});

// Start server
const startServer = async () => {
  try {
    await connectToDatabase();
    http.createServer(app).listen(PORT, "0.0.0.0", () => {
      console.log(`✅ HTTP Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server failed to start:", error.message);
    process.exit(1);
  }
};

startServer();
