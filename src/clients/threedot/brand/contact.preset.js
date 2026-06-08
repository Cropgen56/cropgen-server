export function getThreedotContactMailConfig() {
  return {
    fromEmail: process.env.SES_FROM_EMAIL_THREEDOTT,
    fromName: process.env.SES_FROM_NAME_THREEDOTT || "ThreeDott",
    replyToDefault: process.env.SES_REPLY_TO_THREEDOTT,
    subject: "New Contact Message - ThreeDott Website",
    heading: "New Contact Message from ThreeDott Website",
    textHeading: "New Contact Message from ThreeDott Website",
  };
}

export function getThreedotContactRecipients() {
  return [process.env.CONTACT_RECIPIENT_THREEDOTT || "contact@threedott.com"];
}
