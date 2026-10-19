import WhatsAppMessage from "../../models/whatsapp-message.model.js";
import User from "../../models/user.model.js";
import { sendCustomWhatsAppMessage } from "../../services/whatsappService.js";
import { findUserByWhatsAppPhone } from "../../utils/whatsapp/phoneMatch.js";
import {
  normalizePhoneDigits,
  buildPhoneQueryFilter,
  phoneMatchKey,
} from "../../utils/whatsapp/phoneMatch.js";
import { saveWhatsAppOutbound } from "../../services/whatsappMessageStore.js";
import { clearWhatsAppAgentCache } from "../../features/agent/index.js";
import {
  getWhatsAppAgentSettingsPayload,
  setGlobalReplyMode,
} from "../../features/agent/index.js";

function sanitizeAvatarUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

/** One row per phone — for admin chat sidebar */
export const getWhatsAppChatsSummary = async (req, res) => {
  try {
    const rows = await WhatsAppMessage.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$phone",
          farmerId: { $first: "$farmerId" },
          lastMessage: { $first: "$text" },
          lastTime: { $first: "$createdAt" },
          lastDirection: { $first: "$direction" },
          messageCount: { $sum: 1 },
        },
      },
      { $sort: { lastTime: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "farmerId",
          foreignField: "_id",
          as: "farmer",
        },
      },
      {
        $unwind: {
          path: "$farmer",
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);

    const phones = rows.map((r) => r._id);
    const unreadAgg = await WhatsAppMessage.aggregate([
      {
        $match: {
          phone: { $in: phones },
          direction: "IN",
          readAtAdmin: null,
        },
      },
      { $group: { _id: "$phone", unreadCount: { $sum: 1 } } },
    ]);
    const unreadByKey = {};
    for (const u of unreadAgg) {
      const key = phoneMatchKey(u._id);
      unreadByKey[key] = (unreadByKey[key] || 0) + u.unreadCount;
    }

    const merged = new Map();

    for (const row of rows) {
      const farmer = row.farmer;
      let firstName = farmer?.firstName?.trim() || "";
      let lastName = farmer?.lastName?.trim() || "";
      if (firstName && !lastName && firstName.includes(" ")) {
        const parts = firstName.split(/\s+/).filter(Boolean);
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      }

      const key = phoneMatchKey(row._id);
      const existing = merged.get(key);
      const entry = {
        phone: row._id,
        farmerId: farmer?._id || row.farmerId || null,
        firstName: firstName || "Unknown",
        lastName,
        avatar: sanitizeAvatarUrl(farmer?.avatar),
        lastMessage: row.lastMessage || "",
        lastTime: row.lastTime,
        lastDirection: row.lastDirection,
        messageCount: row.messageCount,
        unreadCount: 0,
      };

      if (!existing) {
        entry.unreadCount = unreadByKey[key] || 0;
        merged.set(key, entry);
        continue;
      }

      existing.messageCount += row.messageCount;
      if (new Date(entry.lastTime) > new Date(existing.lastTime)) {
        existing.phone = entry.phone;
        existing.lastMessage = entry.lastMessage;
        existing.lastTime = entry.lastTime;
        existing.lastDirection = entry.lastDirection;
        if (entry.farmerId) existing.farmerId = entry.farmerId;
        if (entry.firstName !== "Unknown") {
          existing.firstName = entry.firstName;
          existing.lastName = entry.lastName;
        }
        if (entry.avatar) existing.avatar = entry.avatar;
      }
    }

    const data = [...merged.values()]
      .map((entry) => ({
        ...entry,
        unreadCount: unreadByKey[phoneMatchKey(entry.phone)] || entry.unreadCount || 0,
      }))
      .sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));

    return res.json({ success: true, total: data.length, data });
  } catch (error) {
    console.error("getWhatsAppChatsSummary error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

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

    if (phone) {
      Object.assign(filter, buildPhoneQueryFilter(phone));
    } else if (farmerId) {
      filter.farmerId = farmerId;
    }

    if (direction) filter.direction = direction;
    if (advisoryId) filter.advisoryId = advisoryId;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(10000, Math.max(1, Number(limit) || 5000));

    let query = WhatsAppMessage.find(filter)
      .populate("farmerId", "firstName lastName avatar phone")
      .populate({
        path: "advisoryId",
        select: "createdAt farmFieldId cropHealth plantGrowthActivity",
        populate: {
          path: "farmFieldId",
          select: "cropName fieldName acre variety",
        },
      })
      .sort({ timestamp: 1, createdAt: 1 });

    const total = await WhatsAppMessage.countDocuments(filter);

    if (total > limitNum) {
      const skip = Math.max(0, total - limitNum * pageNum);
      query = query.skip(skip).limit(limitNum);
    } else {
      query = query.limit(limitNum);
    }

    const messages = await query.lean();

    const lastInbound = await WhatsAppMessage.findOne({
      ...filter,
      direction: "IN",
    })
      .sort({ timestamp: -1, createdAt: -1 })
      .select("createdAt timestamp")
      .lean();

    const lastInboundAt = lastInbound?.timestamp || lastInbound?.createdAt;
    const sessionWindowOpen = lastInboundAt
      ? Date.now() - new Date(lastInboundAt).getTime() < 24 * 60 * 60 * 1000
      : false;

    const hasMore = total > limitNum * pageNum;

    return res.json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      hasMore,
      sessionWindowOpen,
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

export const markWhatsAppChatRead = async (req, res) => {
  try {
    const phone = normalizePhoneDigits(req.params.phone || req.body?.phone);
    if (!phone) {
      return res.status(400).json({ success: false, error: "phone required" });
    }

    const result = await WhatsAppMessage.updateMany(
      { ...buildPhoneQueryFilter(phone), direction: "IN", readAtAdmin: null },
      { $set: { readAtAdmin: new Date() } },
    );

    return res.json({
      success: true,
      marked: result.modifiedCount,
    });
  } catch (error) {
    console.error("markWhatsAppChatRead error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getWhatsAppMessageById = async (req, res) => {
  try {
    const { id } = req.params;

    const message = await WhatsAppMessage.findById(id)
      .populate("farmerId", "firstName lastName phone avatar")
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
    const allowed = ["text", "readAtAdmin", "deliveryStatus"];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }

    const updated = await WhatsAppMessage.findByIdAndUpdate(id, patch, {
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

    if (!phone || !message?.trim()) {
      return res.status(400).json({
        success: false,
        error: "phone and message are required",
      });
    }

    const normalizedPhone = normalizePhoneDigits(phone);

    let farmer = farmerId ? await User.findById(farmerId) : null;
    if (!farmer) {
      farmer = await findUserByWhatsAppPhone(normalizedPhone);
    }

    if (!farmer) {
      return res.status(404).json({
        success: false,
        error: "Farmer not found for this phone number",
      });
    }

    const lastInbound = await WhatsAppMessage.findOne({
      phone: normalizedPhone,
      direction: "IN",
    })
      .sort({ createdAt: -1 })
      .lean();

    const within24h =
      lastInbound &&
      Date.now() - new Date(lastInbound.createdAt).getTime() < 24 * 60 * 60 * 1000;

    if (!within24h) {
      return res.status(400).json({
        success: false,
        error:
          "WhatsApp 24-hour session expired. Farmer must message first, or send a template advisory from the advisory panel.",
        code: "SESSION_EXPIRED",
      });
    }

    const result = await sendCustomWhatsAppMessage(normalizedPhone, message.trim());

    if (!result.success) {
      return res.status(result.status || 500).json({
        success: false,
        error: result.error,
      });
    }

    const savedMessage = await saveWhatsAppOutbound({
      farmerId: farmer._id,
      phone: normalizedPhone,
      text: message.trim(),
      waMessageId: result.messageId,
      source: "admin_reply",
      rawPayload: result.data,
    });

    clearWhatsAppAgentCache(farmer._id);

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

export const getWhatsAppAgentSettings = async (req, res) => {
  try {
    const data = await getWhatsAppAgentSettingsPayload();
    return res.json({ success: true, data });
  } catch (error) {
    console.error("getWhatsAppAgentSettings error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const patchWhatsAppAgentSettings = async (req, res) => {
  try {
    const { replyMode } = req.body || {};
    if (replyMode !== "automation" && replyMode !== "manual") {
      return res.status(400).json({
        success: false,
        error: 'replyMode must be "automation" or "manual"',
      });
    }

    const data = await setGlobalReplyMode(replyMode, req.user?._id);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("patchWhatsAppAgentSettings error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
