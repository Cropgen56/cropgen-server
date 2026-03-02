import mongoose from "mongoose";
import Notification from "../models/notification.model.js";

await mongoose.connect("mongodb://127.0.0.1:27017/cropgen_db");

await Notification.create({
  userId: "6985cc24710299d6de37b4c9",
  type: "SUBSCRIPTION_EXPIRY",
  referenceId: "69a540b7f865d3edcafdd639",
  templateName: "plan_expiry_reminder_notification",
  parameters: [
    "Mahesh",
    "Premium Plan",
    "Mobile",
    "monthly",
    "Wheat",
    "Green Farm",
    "5.25",
    "2026-03-01",
    "2026-03-08",
    "7",
  ],
});

console.log("Test notification created");
process.exit();
