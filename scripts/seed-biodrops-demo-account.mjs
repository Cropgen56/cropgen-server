/**
 * Seeds the Biodrops app-store demo account:
 *   Phone: +91 9999999999  →  +919999999999
 *   OTP:   123456 (static; handled in src/clients/biodrops/controllers/whatsapp.controller.js)
 *
 * Usage: node scripts/seed-biodrops-demo-account.mjs
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectToDatabase } from "../src/config/db.js";
import User from "../src/models/user.model.js";
import FarmField from "../src/models/field.model.js";
import UserSubscription from "../src/models/user-subscription.model.js";
import SubscriptionPlan from "../src/models/subscription-plan.model.js";
import FarmAdvisory from "../src/features/advisory/models/farmAdvisory.model.js";
import {
  BIODROPS_DEMO_PHONE,
  BIODROPS_DEMO_USER_PROFILE,
} from "../src/clients/biodrops/utils/demoAccount.js";
import { resolveOrganizationByCode } from "../src/utils/auth/authUtils.js";

dotenv.config();

const DEMO_FIELD = {
  fieldName: "Demo Wheat Plot",
  cropName: "Wheat",
  variety: "HD-3086",
  sowingDate: "2025-11-15",
  acre: 2.5,
  typeOfIrrigation: "Drip",
  typeOfFarming: "Integrated",
  isBarrenLand: false,
  field: [
    { lat: 18.5204, lng: 73.8567 },
    { lat: 18.521, lng: 73.8575 },
    { lat: 18.52, lng: 73.858 },
    { lat: 18.5195, lng: 73.857 },
  ],
};

async function findMobilePlan() {
  return SubscriptionPlan.findOne({
    platform: "mobile",
    active: true,
    isInternal: { $ne: true },
  }).sort({ createdAt: -1 });
}

async function ensureActiveSubscription(userId, fieldId, plan) {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setFullYear(endDate.getFullYear() + 1);

  const pricing = plan.pricing?.find((p) => p.currency === "INR") || plan.pricing?.[0];
  const pricePerUnitMinor = pricing?.pricePerUnitMinor ?? 0;

  await UserSubscription.findOneAndUpdate(
    { userId, fieldId, billingCycle: "yearly" },
    {
      userId,
      fieldId,
      planId: plan._id,
      platform: "mobile",
      area: DEMO_FIELD.acre,
      unit: "acre",
      billingCycle: "yearly",
      displayCurrency: "INR",
      pricePerUnitMinor,
      totalAmountMinor: Math.round(pricePerUnitMinor * DEMO_FIELD.acre),
      chargedCurrency: "INR",
      status: "active",
      activatedByAdmin: true,
      startDate: now,
      endDate,
      termStart: now,
      termEnd: endDate,
      currentPeriodStart: now,
      currentPeriodEnd: endDate,
      subscriptionPhase: "active_paid",
    },
    { upsert: true, new: true },
  );
}

async function ensureSampleAdvisory(farmFieldId) {
  const existing = await FarmAdvisory.findOne({ farmFieldId }).sort({ createdAt: -1 });
  if (existing) return existing;

  return FarmAdvisory.create({
    farmFieldId,
    activitiesToDo: [
      {
        type: "IRRIGATION",
        title: "Schedule irrigation",
        message:
          "Soil moisture is trending low. Irrigate 25–30 mm within the next 48 hours for optimal tillering.",
        details: { priority: "medium" },
      },
      {
        type: "SPRAY",
        title: "Monitor for rust",
        message:
          "Humid conditions favor leaf rust. Scout lower canopy; apply fungicide only if lesions exceed 5% leaf area.",
        details: { priority: "low" },
      },
      {
        type: "FERTIGATION",
        title: "Top-dress nitrogen",
        message: "Apply 20 kg N/acre as urea split to support stem elongation.",
        details: { priority: "medium" },
      },
    ],
    cropHealth: {
      score: 78,
      percentage: 78,
      category: "Good",
      recommendation: "Crop vigor is healthy; maintain irrigation and scout weekly.",
    },
    yield: {
      standardYield: 45,
      aiYield: 42,
      unit: "quintal",
      explanation: "Yield outlook is near regional average for this growth stage.",
    },
    plantGrowthActivity: {
      bbchStage: 31,
      stageName: "Stem elongation",
      description: "Active vegetative growth; monitor nitrogen and water stress.",
      cumulativeGDD: 420,
    },
    activitiesSource: "rules",
  });
}

async function main() {
  await connectToDatabase();

  const { org: biodropsOrg } = await resolveOrganizationByCode("BIODROPS");

  let user = await User.findOne({ phone: BIODROPS_DEMO_PHONE });
  if (!user) {
    user = await User.create({
      phone: BIODROPS_DEMO_PHONE,
      ...BIODROPS_DEMO_USER_PROFILE,
      organization: biodropsOrg._id,
      clientSource: "android",
      lastLoginAt: new Date(),
      lastActiveAt: new Date(),
    });
    console.log("Created demo user:", user._id.toString());
  } else {
    Object.assign(user, BIODROPS_DEMO_USER_PROFILE, {
      organization: biodropsOrg._id,
    });
    await user.save();
    console.log("Updated demo user:", user._id.toString());
  }

  let farm = await FarmField.findOne({ user: user._id, fieldName: DEMO_FIELD.fieldName });
  if (!farm) {
    farm = await FarmField.create({ ...DEMO_FIELD, user: user._id });
    console.log("Created demo farm:", farm._id.toString());
  } else {
    Object.assign(farm, DEMO_FIELD);
    await farm.save();
    console.log("Updated demo farm:", farm._id.toString());
  }

  const plan = await findMobilePlan();
  if (plan) {
    await ensureActiveSubscription(user._id, farm._id, plan);
    console.log("Active subscription linked to plan:", plan.slug || plan.name);
  } else {
    console.warn(
      "No active mobile subscription plan found — run seed:mobile-plans or create a plan in admin.",
    );
  }

  const advisory = await ensureSampleAdvisory(farm._id);
  console.log("Demo advisory ready:", advisory._id.toString());

  console.log("\nDemo credentials:");
  console.log("  Mobile: 9999999999 (India +91)");
  console.log("  E.164: ", BIODROPS_DEMO_PHONE);
  console.log("  OTP:    123456");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
