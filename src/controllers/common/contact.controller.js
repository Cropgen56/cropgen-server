import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({
  region:
    process.env.AWS_REGION_CROPGEN ||
    process.env.AWS_REGION_SATAGRO ||
    process.env.AWS_REGION,
  credentials: {
    accessKeyId:
      process.env.AWS_ACCESS_KEY_ID_CROPGEN ||
      process.env.AWS_ACCESS_KEY_ID_SATAGRO ||
      process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.AWS_SECRET_ACCESS_KEY_CROPGEN ||
      process.env.AWS_SECRET_ACCESS_KEY_SATAGRO ||
      process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const CONTACT_RECIPIENTS = ["cropgenapp@gmail.com", "support@biodrops.ai"];

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** cropgen → SES_FROM_* ; satagro / biodrops → SES_FROM_*_BIODROPS */
function resolveContactBrand(rawSource) {
  const key = String(rawSource || "")
    .trim()
    .toLowerCase();
  if (key === "satagro" || key === "biodrops" || key === "satagro.ai") {
    return "satagro";
  }
  return "cropgen";
}

function getBrandMailConfig(brand) {
  if (brand === "satagro") {
    return {
      fromEmail: process.env.SES_FROM_EMAIL_BIODROPS,
      fromName: process.env.SES_FROM_NAME_BIODROPS || "Satagro.ai",
      replyToDefault: process.env.SES_REPLY_TO_BIODROPS,
      subject: "New Contact Message - SatAgro Website",
      heading: "New Contact Message from SatAgro Website",
      textHeading: "New Contact Message from SatAgro Website",
    };
  }

  return {
    fromEmail: process.env.SES_FROM_EMAIL,
    fromName: process.env.SES_FROM_NAME || "CropGen",
    replyToDefault: process.env.SES_REPLY_TO,
    subject: "New Contact Message - CropGen Website",
    heading: "New Contact Message from CropGen Website",
    textHeading: "New Contact Message from CropGen Website",
  };
}

export const contactUs = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      name,
      email,
      phone,
      organization,
      topic,
      content,
      message,
      source,
      website,
    } = req.body;

    const brand = resolveContactBrand(
      source || website || req.headers["x-contact-source"],
    );
    const mailConfig = getBrandMailConfig(brand);

    const messageBody = String(message || content || "").trim();
    if (!messageBody) {
      return res.status(400).json({
        success: false,
        message: "Message content is required.",
      });
    }

    const fullName =
      String(name || "").trim() ||
      [firstName, lastName].filter(Boolean).join(" ").trim() ||
      "N/A";
    const senderEmail = String(email || "").trim();
    const senderPhone = String(phone || "").trim() || "N/A";
    const senderOrganization = String(organization || "").trim() || "N/A";
    const senderTopic = String(topic || "").trim() || "General Inquiry";
    const senderNameSafe = escapeHtml(fullName);
    const senderEmailSafe = escapeHtml(senderEmail || "N/A");
    const senderPhoneSafe = escapeHtml(senderPhone);
    const senderOrganizationSafe = escapeHtml(senderOrganization);
    const senderTopicSafe = escapeHtml(senderTopic);
    const messageHtmlSafe = escapeHtml(messageBody).replace(/\n/g, "<br/>");

    const hasPhone = Boolean(String(phone || "").trim());
    const hasOrganization = Boolean(String(organization || "").trim());
    const hasTopic = Boolean(String(topic || "").trim());

    const html = `
      <h3>${mailConfig.heading}</h3>
      <p><strong>Name:</strong> ${senderNameSafe}</p>
      <p><strong>Email:</strong> ${senderEmailSafe}</p>
      ${hasPhone ? `<p><strong>Phone:</strong> ${senderPhoneSafe}</p>` : ""}
      ${hasOrganization ? `<p><strong>Organisation/Farm:</strong> ${senderOrganizationSafe}</p>` : ""}
      ${hasTopic ? `<p><strong>Topic:</strong> ${senderTopicSafe}</p>` : ""}
      <hr />
      <p><strong>Message:</strong></p>
      <p>${messageHtmlSafe}</p>
    `;

    const text = `
${mailConfig.textHeading}

Name: ${fullName}
Email: ${senderEmail || "N/A"}
${hasPhone ? `Phone: ${senderPhone}\n` : ""}${hasOrganization ? `Organisation/Farm: ${senderOrganization}\n` : ""}${hasTopic ? `Topic: ${senderTopic}\n` : ""}
Message:
${messageBody}
    `.trim();

    const fromEmail = mailConfig.fromEmail;
    const fromName = mailConfig.fromName;
    const replyToEmail =
      senderEmail || mailConfig.replyToDefault || fromEmail;

    if (!fromEmail) {
      return res.status(500).json({
        success: false,
        message:
          brand === "satagro"
            ? "SatAgro mail sender is not configured (SES_FROM_EMAIL_BIODROPS)."
            : "CropGen mail sender is not configured (SES_FROM_EMAIL).",
      });
    }

    const command = new SendEmailCommand({
      Source: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
      Destination: { ToAddresses: CONTACT_RECIPIENTS },
      ReplyToAddresses: replyToEmail ? [replyToEmail] : undefined,
      Message: {
        Subject: { Data: mailConfig.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: text, Charset: "UTF-8" },
        },
      },
    });
    const result = await sesClient.send(command);

    return res.status(200).json({
      success: true,
      message: "Message sent successfully.",
      messageId: result.MessageId,
      sentTo: CONTACT_RECIPIENTS,
      brand,
    });
  } catch (error) {
    console.error("contactUs error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send message.",
      error: error.code || "InternalServerError",
    });
  }
};
