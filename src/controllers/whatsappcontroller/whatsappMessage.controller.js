import WhatsAppMessage from "../../models/whatsappmessage.model.js";
import User from "../../models/user.model.js";
import { sendCustomWhatsAppMessage } from "../../services/whatsappService.js";

export const getAllWhatsAppMessages = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 2000,
      phone,
      direction,
      farmerId,
      advisoryId,
    } = req.query;

    const filter = {};

    if (phone) filter.phone = phone;
    if (direction) filter.direction = direction;
    if (farmerId) filter.farmerId = farmerId;
    if (advisoryId) filter.advisoryId = advisoryId;

    const messages = await WhatsAppMessage.find(filter)
      .populate("farmerId", "firstName lastName avatar phone")
      .populate("advisoryId")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await WhatsAppMessage.countDocuments(filter);

    return res.json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      data: messages,
    });
  } catch (error) {
    console.error("getAllWhatsAppMessages error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// get message by id
export const getWhatsAppMessageById = async (req, res) => {
  try {
    const { id } = req.params;

    const message = await WhatsAppMessage.findById(id)
      .populate("farmerId", "name phone")
      .populate("advisoryId");

    if (!message) {
      return res.status(404).json({
        success: false,
        error: "WhatsApp message not found",
      });
    }

    return res.json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error("getWhatsAppMessageById error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const deleteWhatsAppMessage = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await WhatsAppMessage.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: "WhatsApp message not found",
      });
    }

    return res.json({
      success: true,
      message: "WhatsApp message deleted successfully",
    });
  } catch (error) {
    console.error("deleteWhatsAppMessage error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const updateWhatsAppMessage = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await WhatsAppMessage.findByIdAndUpdate(id, req.body, {
      new: true,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: "WhatsApp message not found",
      });
    }

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("updateWhatsAppMessage error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const replyToWhatsAppMessage = async (req, res) => {
  try {
    const { phone, message, farmerId } = req.body;

    /* ================= 1️⃣ VALIDATION ================= */
    if (!phone || !message || !farmerId) {
      return res.status(400).json({
        success: false,
        error: "phone, message and farmerId are required",
      });
    }

    /* ================= 2️⃣ FIND FARMER ================= */
    const farmer = await User.findById(farmerId);

    if (!farmer) {
      return res.status(404).json({
        success: false,
        error: "Farmer not found",
      });
    }

    /* ================= 3️⃣ SEND WHATSAPP MESSAGE ================= */
    const result = await sendCustomWhatsAppMessage(phone, message);

    if (!result.success) {
      return res.status(result.status || 500).json({
        success: false,
        error: result.error,
      });
    }

    /* ================= 4️⃣ SAVE MESSAGE IN DB ================= */
    const savedMessage = await WhatsAppMessage.create({
      farmerId: farmer._id,
      phone,
      direction: "OUT",
      messageType: "text",
      text: message,
      rawPayload: result.data,
    });

    /* ================= SUCCESS ================= */
    return res.json({
      success: true,
      message: "Reply sent successfully",
      data: savedMessage,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error("replyToWhatsAppMessage error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
