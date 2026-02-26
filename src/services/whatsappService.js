import axios from "axios";

// send custom message to the users
export async function sendCustomWhatsAppMessage(
  phone,
  messageText,
  options = {},
) {
  const { previewUrl = true } = options;

  const formattedPhone = phone.replace(/[^\d]/g, "");

  if (!formattedPhone.match(/^\d{10,15}$/)) {
    return {
      success: false,
      error:
        "Invalid phone number format. Use international format without + (e.g. 919322396236)",
    };
  }

  const url = `https://graph.facebook.com/v24.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

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
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
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
  await axios.post(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body: message,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    },
  );
}
