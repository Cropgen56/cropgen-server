import axios from "axios";

const GRAPH_API_VERSION = "v24.0";

function getWhatsAppAccessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
}

function getGraphMessagesUrl() {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

// send custom message to the users
export async function sendCustomWhatsAppMessage(
  phone,
  messageText,
  options = {},
) {
  const { previewUrl = true } = options;
  const token = getWhatsAppAccessToken();

  if (!token) {
    return {
      success: false,
      error:
        "WhatsApp access token is not configured (WHATSAPP_ACCESS_TOKEN)",
      status: 500,
    };
  }

  const formattedPhone = normalizePhoneDigits(phone);

  if (!formattedPhone.match(/^\d{10,15}$/)) {
    return {
      success: false,
      error:
        "Invalid phone number format. Use international format without + (e.g. 919322396236)",
    };
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: formattedPhone,
    type: "text",
    text: {
      preview_url: previewUrl,
      body: messageText,
    },
  };

  try {
    const response = await axios.post(getGraphMessagesUrl(), payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    const messageId = response.data?.messages?.[0]?.id;

    return {
      success: true,
      data: response.data,
      messageId,
      status: response.status,
    };
  } catch (error) {
    const errorData = error.response?.data?.error || error.message;
    console.error("[WhatsApp Custom Message Error]", {
      phone: formattedPhone,
      error: errorData,
      status: error.response?.status,
    });

    return {
      success: false,
      error: errorData,
      status: error.response?.status || 500,
    };
  }
}

export async function sendWhatsAppReply(to, message) {
  const token = getWhatsAppAccessToken();
  if (!token) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is not configured");
  }

  const formattedPhone = normalizePhoneDigits(to);

  const response = await axios.post(
    getGraphMessagesUrl(),
    {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "text",
      text: {
        body: message,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    },
  );

  return response.data;
}

function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}
