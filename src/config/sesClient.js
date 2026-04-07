import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({
  region: process.env.AWS_REGION_CROPGEN || process.env.AWS_REGION,
  credentials: {
    accessKeyId:
      process.env.AWS_ACCESS_KEY_ID_CROPGEN || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.AWS_SECRET_ACCESS_KEY_CROPGEN ||
      process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ---------- helpers ----------

function parseFromAddress(from) {
  if (!from) {
    return {
      fromName: process.env.SES_FROM_NAME || "",
      fromEmail: process.env.SES_FROM_EMAIL,
    };
  }
  const m = String(from).match(/^\s*(?:"?([^"]*)"?\s*)?<\s*([^>]+)\s*>\s*$/);
  if (m) return { fromName: m[1] || "", fromEmail: m[2] };
  return { fromName: "", fromEmail: String(from).trim() };
}

function formatAddress(name, email) {
  const nm = (name || "").trim();
  const em = (email || "").trim();
  return nm ? `${nm} <${em}>` : em;
}

function ensureArray(v) {
  return Array.isArray(v) ? v : [v];
}

function isLikelyEmail(s) {
  // Lightweight validation; real validation should be upstream
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function normalizeRecipients(to) {
  const arr = ensureArray(to)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const invalid = arr.filter((x) => !isLikelyEmail(x));
  const valid = arr.filter((x) => isLikelyEmail(x));
  return { valid, invalid };
}

function normalizeSesError(err, context = {}) {
  const msg = String(err?.message || err || "Unknown SES error");

  // Common “sandbox/verification” class of problems
  if (
    (err?.name === "MessageRejected" || err?.name === "SESServiceException") &&
    msg.includes("is not verified")
  ) {
    const failedEmail =
      msg.match(/([^\s]+@[^\s]+)/)?.[0] || context.fromEmail || "";
    return {
      code: "EmailNotVerified",
      message: `SES rejected the message: ${failedEmail} is not verified.`,
      retryable: false,
    };
  }

  // Invalid recipient domain
  if (
    err?.name === "InvalidParameterValue" &&
    /Invalid domain name/i.test(msg)
  ) {
    return {
      code: "InvalidRecipientDomain",
      message: "Recipient domain is invalid (SES)",
      retryable: false,
    };
  }

  // Throttling / transient AWS faults
  if (
    /Throttl/i.test(err?.name || msg) ||
    /Rate\s*exceeded/i.test(msg) ||
    err?.$metadata?.httpStatusCode === 429
  ) {
    return { code: "Throttled", message: msg, retryable: true };
  }

  if (
    /Timeout/i.test(msg) ||
    err?.name === "RequestTimeout" ||
    err?.name === "NetworkingError" ||
    err?.$metadata?.httpStatusCode === 503
  ) {
    return { code: "ServiceUnavailable", message: msg, retryable: true };
  }

  // Fallback
  return {
    code: err?.name || "SESUnknownError",
    message: msg,
    retryable: false,
  };
}

export const sendBasicEmail = async ({
  to,
  subject,
  html,
  text,
  preset,
  from,
  fromEmail = process.env.SES_FROM_EMAIL,
  fromName = process.env.SES_FROM_NAME || "CropGen",
  replyTo = process.env.SES_REPLY_TO || process.env.SES_FROM_EMAIL,
  configurationSet,
  tags,
}) => {
  // Use Satagro sender for Biodrops white-label mails
  if (!from && String(preset || "").toLowerCase() === "biodrops") {
    fromEmail = process.env.SES_FROM_EMAIL_BIODROPS || fromEmail;
    fromName = process.env.SES_FROM_NAME_BIODROPS || fromName;
    replyTo = process.env.SES_REPLY_TO_BIODROPS || replyTo;
  }

  // Resolve sender
  const resolved = from ? parseFromAddress(from) : { fromEmail, fromName };
  if (!resolved.fromEmail) {
    const e = new Error("SES_FROM_EMAIL not set");
    e.code = "FromEmailMissing";
    throw e;
  }

  // Validate recipients
  const { valid: validRecipients, invalid: invalidRecipients } =
    normalizeRecipients(to);
  if (validRecipients.length === 0) {
    const e = new Error("At least one valid recipient (to) is required");
    e.code = "NoValidRecipients";
    e.invalidRecipients = invalidRecipients;
    throw e;
  }

  // Build message body (prefer HTML; fallback to text)
  const htmlBody = html || (text ? `<p>${text}</p>` : "<p></p>");
  const params = {
    Source: formatAddress(resolved.fromName, resolved.fromEmail),
    Destination: { ToAddresses: validRecipients },
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
    Message: {
      Subject: { Data: subject || "", Charset: "UTF-8" },
      Body: {
        Html: { Data: htmlBody, Charset: "UTF-8" },
        ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
      },
    },
    ConfigurationSetName: configurationSet || undefined,
    Tags: Array.isArray(tags) && tags.length ? tags : undefined,
  };

  try {
    const command = new SendEmailCommand(params);
    const res = await sesClient.send(command);
    // Return MessageId and list of any skipped invalid recipients (if any)
    return {
      MessageId: res?.MessageId,
      invalidRecipients: invalidRecipients.length
        ? invalidRecipients
        : undefined,
    };
  } catch (rawErr) {
    const norm = normalizeSesError(rawErr, { fromEmail: resolved.fromEmail });
    const e = new Error(norm.message);
    e.code = norm.code;
    e.retryable = norm.retryable;
    if (invalidRecipients.length) e.invalidRecipients = invalidRecipients;
    throw e;
  }
};
