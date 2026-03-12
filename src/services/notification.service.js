import Notification from "../models/notification.model.js";
import User from "../models/usersModel.js";
import FarmField from "../models/fieldModel.js";
import SubscriptionPlan from "../models/subscriptionplan.model.js";
import UserSubscription from "../models/usersubscription.model.js";

const formatDate = (date) => new Date(date).toISOString().split("T")[0];

const formatAreaByClientSource = (area, clientSource) => {
  const acre = Number(area || 0);

  // Android / iOS → Acres
  if (clientSource === "android" || clientSource === "ios") {
    return acre.toFixed(2) + " Acre";
  }

  // Web → Convert to Hectare
  if (clientSource === "web") {
    const hectare = acre * 0.404686;
    return hectare.toFixed(2) + " Hectare";
  }

  // Default fallback
  return acre.toFixed(2);
};

export const createSubscriptionActivationNotification = async (
  subscriptionId,
) => {
  const subscription = await UserSubscription.findById(subscriptionId);
  if (!subscription) return;

  const user = await User.findById(subscription.userId);
  const farm = await FarmField.findById(subscription.fieldId);
  const plan = await SubscriptionPlan.findById(subscription.planId);

  if (!user || !farm || !plan) return;

  await Notification.create({
    userId: user._id,
    type: "SUBSCRIPTION_ACTIVATION",
    referenceId: subscription._id,
    templateName: "plan_activation_notification",
    parameters: [
      user.firstName || user.name || "Farmer",
      plan.name,
      plan.platform,
      subscription.billingCycle,
      farm.cropName || "N/A",
      farm.fieldName || farm.name || "Farm",
      formatAreaByClientSource(subscription.area, user.clientSource),
      formatDate(subscription.startDate),
      formatDate(subscription.endDate),
    ],
  });
};

export const createSubscriptionExpiryNotification = async (
  subscription,
  daysRemaining,
) => {
  const user = await User.findById(subscription.userId);
  const farm = await FarmField.findById(subscription.fieldId);
  const plan = await SubscriptionPlan.findById(subscription.planId);

  if (!user || !farm || !plan) return;

  // 🔒 Prevent duplicate reminders
  const existing = await Notification.findOne({
    referenceId: subscription._id,
    type: "SUBSCRIPTION_EXPIRY",
    "parameters.9": daysRemaining.toString(),
  });

  if (existing) return;

  await Notification.create({
    userId: user._id,
    type: "SUBSCRIPTION_EXPIRY",
    referenceId: subscription._id,
    templateName: "plan_expiry_reminder_notification",
    parameters: [
      // {{1}} - Name
      user.firstName || user.name || "Farmer",
      // {{2}} - Plan
      plan.name,
      // {{3}} - Platform
      plan.platform,
      // {{4}} - Type (billing cycle)
      subscription.billingCycle,
      // {{5}} - Crop
      farm.cropName || "N/A",
      // {{6}} - Field
      farm.fieldName || farm.name || "Farm",
      // {{7}} - Area (formatted per client source)
      formatAreaByClientSource(subscription.area, user.clientSource),
      // {{8}} - Start Date
      formatDate(subscription.startDate),
      // {{9}} - End Date
      formatDate(subscription.endDate),
      // {{10}} - Days Remaining
      daysRemaining.toString(),
    ],
  });
};

export const createWelcomeFarmNotification = async (userId) => {
  const user = await User.findById(userId);

  if (!user) return;

  // 🔒 Prevent duplicate notifications
  const existing = await Notification.findOne({
    userId,
    type: "WELCOME_FARM",
  });

  if (existing) return;

  await Notification.create({
    userId,
    type: "WELCOME_FARM",
    referenceId: userId,
    templateName: "cropgen_create_farm_reminder",
    parameters: [user.firstName || "Farmer"],
  });
};
