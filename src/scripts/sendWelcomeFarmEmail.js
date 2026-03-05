import mongoose from "mongoose";
import { connectToDatabase } from "../config/db.js";
import User from "../models/usersModel.js";
import FarmField from "../models/fieldModel.js";
import { createWelcomeFarmNotification } from "../services/notification.service.js";

await connectToDatabase();

// Find users who have email and no farms
const usersWithEmail = await User.find({
  email: { $exists: true, $ne: null },
}).lean();

console.log(`Found ${usersWithEmail.length} users with email`);

for (const user of usersWithEmail) {
  const farmCount = await FarmField.countDocuments({ user: user._id });
  if (farmCount === 0) {
    await createWelcomeFarmNotification(user._id);
    console.log(`Created welcome notification for user ${user.email}`);
  }
}

console.log("Script completed");
process.exit();
