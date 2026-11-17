import nodemailer from "nodemailer";

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SATAGRO_SMTP_USER,
        pass: String(process.env.SATAGRO_SMTP_PASS || "").replace(/\s+/g, ""),
      },
    });
  }
  return transporter;
}

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const satagroContactUs = async (req, res) => {
  try {
    const { name, email, phone, organization, topic, message } = req.body || {};

    const messageBody = String(message || "").trim();
    const senderName = String(name || "").trim();
    const senderEmail = String(email || "").trim();
    if (!messageBody || !senderName || !senderEmail) {
      return res.status(400).json({
        success: false,
        message: "Name, email and message are required.",
      });
    }

    const smtpUser = process.env.SATAGRO_SMTP_USER;
    if (!smtpUser || !process.env.SATAGRO_SMTP_PASS) {
      return res.status(500).json({
        success: false,
        message: "SatAgro mail is not configured.",
      });
    }

    const to = process.env.SATAGRO_CONTACT_TO || "satagroadmin@gmail.com";
    const fields = [
      ["Name", senderName],
      ["Email", senderEmail],
      ["Phone", String(phone || "").trim()],
      ["Organisation/Farm", String(organization || "").trim()],
      ["Topic", String(topic || "").trim()],
    ].filter(([, v]) => v);

    const html = `
      <h3>New Enquiry from SatAgro Website</h3>
      ${fields.map(([k, v]) => `<p><strong>${k}:</strong> ${escapeHtml(v)}</p>`).join("")}
      <hr />
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(messageBody).replace(/\n/g, "<br/>")}</p>
    `;
    const text = `New Enquiry from SatAgro Website\n\n${fields
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n")}\n\nMessage:\n${messageBody}`;

    const info = await getTransporter().sendMail({
      from: `"SatAgro.ai Website" <${smtpUser}>`,
      to,
      replyTo: senderEmail,
      subject: `New Enquiry - SatAgro Website${topic ? ` (${String(topic).trim()})` : ""}`,
      text,
      html,
    });

    return res.status(200).json({
      success: true,
      message: "Message sent successfully.",
      messageId: info.messageId,
    });
  } catch (error) {
    console.error("satagroContactUs error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send message.",
      error: error.code || "InternalServerError",
    });
  }
};
