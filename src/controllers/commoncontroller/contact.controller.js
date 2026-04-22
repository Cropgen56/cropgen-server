import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const satagroSesClient = new SESClient({
  region:
    process.env.AWS_REGION_SATAGRO ||
    process.env.AWS_REGION_CROPGEN ||
    process.env.AWS_REGION,
  credentials: {
    accessKeyId:
      process.env.AWS_ACCESS_KEY_ID_SATAGRO ||
      process.env.AWS_ACCESS_KEY_ID_CROPGEN ||
      process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.AWS_SECRET_ACCESS_KEY_SATAGRO ||
      process.env.AWS_SECRET_ACCESS_KEY_CROPGEN ||
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
    } = req.body;

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

    const html = `
      <h3>New Contact Message from SatAgro Website</h3>
      <p><strong>Name:</strong> ${senderNameSafe}</p>
      <p><strong>Email:</strong> ${senderEmailSafe}</p>
      <p><strong>Phone:</strong> ${senderPhoneSafe}</p>
      <p><strong>Organisation/Farm:</strong> ${senderOrganizationSafe}</p>
      <p><strong>Topic:</strong> ${senderTopicSafe}</p>
      <hr />
      <p><strong>Message:</strong></p>
      <p>${messageHtmlSafe}</p>
    `;

    const text = `
New Contact Message from SatAgro Website

Name: ${fullName}
Email: ${senderEmail || "N/A"}
Phone: ${senderPhone}
Organisation/Farm: ${senderOrganization}
Topic: ${senderTopic}

Message:
${messageBody}
    `.trim();

    const fromEmail =
      process.env.SES_FROM_EMAIL_SATAGRO ||
      process.env.SES_FROM_EMAIL_BIODROPS ||
      process.env.SES_FROM_EMAIL;
    const fromName =
      process.env.SES_FROM_NAME_SATAGRO ||
      process.env.SES_FROM_NAME_BIODROPS ||
      "SatAgro";
    const replyToEmail =
      senderEmail ||
      process.env.SES_REPLY_TO_SATAGRO ||
      process.env.SES_REPLY_TO_BIODROPS ||
      process.env.SES_REPLY_TO ||
      fromEmail;

    if (!fromEmail) {
      return res.status(500).json({
        success: false,
        message: "Mail sender is not configured.",
      });
    }

    const command = new SendEmailCommand({
      Source: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
      Destination: { ToAddresses: CONTACT_RECIPIENTS },
      ReplyToAddresses: replyToEmail ? [replyToEmail] : undefined,
      Message: {
        Subject: { Data: "New Contact Message - SatAgro Website", Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: text, Charset: "UTF-8" },
        },
      },
    });
    const result = await satagroSesClient.send(command);

    return res.status(200).json({
      success: true,
      message: "Message sent successfully.",
      messageId: result.MessageId,
      sentTo: CONTACT_RECIPIENTS,
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
