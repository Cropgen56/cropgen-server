import Notification from "../models/notification.model.js";

export const createNotification = async ({
  user,
  type,
  referenceId,
  templateName,
  parameters,
}) => {
  if (!user) return;

  await Notification.create({
    userId: user._id,
    type,
    referenceId,
    templateName,
    parameters,
    status: "pending",
  });
};
