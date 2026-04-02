import express from "express";
import chatController from "../controllers/chatController.js";
import farmerController from "../controllers/farmerController.js";
import organizationController from "../controllers/organizationController.js";
import {
  requireAuth,
  isAuthenticated,
  authorizeRoles,
} from "../middleware/auth.middleware.js";
import AppUserChat from "../models/AppUserChat.js";
import User from "../models/user.model.js";

const router = express.Router();

const adminOnly = [isAuthenticated, authorizeRoles("admin", "developer")];

// Public visitor chat routes (admin access)
router.get("/chat-of/:userType/:userId", ...adminOnly, chatController.getChatOfUser);
router.delete(
  "/chat-of/:userType/:userId",
  ...adminOnly,
  chatController.deleteChatOfUser,
);

// Farmer routes (admin access)
router.get("/farmers/all", ...adminOnly, farmerController.getAllFarmers);
router.get("/farmer/:id", ...adminOnly, farmerController.getFarmerById);
router.delete("/farmer/:id", ...adminOnly, farmerController.deleteFarmer);

// Organization routes (admin access)
router.get(
  "/organizations/all",
  ...adminOnly,
  organizationController.getAllOrganizations,
);
router.get("/organization/:id", ...adminOnly, organizationController.getOrganizationById);
router.delete("/organization/:id", ...adminOnly, organizationController.deleteOrganization);

// App user chat routes (current logged-in user)
router.get("/app/history", requireAuth, async (req, res) => {
  try {
    const chat = await AppUserChat.findOne({ user: req.auth.id || req.auth._id }).lean();
    res.json({ messages: chat?.messages || [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/app/history", requireAuth, async (req, res) => {
  try {
    await AppUserChat.findOneAndDelete({ user: req.auth.id || req.auth._id });
    res.json({ message: "Chat history cleared." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin app chat routes
router.get("/app/users", ...adminOnly, async (_req, res) => {
  try {
    const chats = await AppUserChat.find({})
      .populate("user", "firstName lastName email phone role")
      .sort({ updatedAt: -1 })
      .lean();

    const users = chats
      .filter((chat) => chat.user)
      .map((chat) => ({
        _id: chat.user._id,
        firstName: chat.user.firstName || "",
        lastName: chat.user.lastName || "",
        fullName:
          [chat.user.firstName, chat.user.lastName].filter(Boolean).join(" ") || "User",
        email: chat.user.email || "",
        phone: chat.user.phone || "",
        role: chat.user.role || "",
        chatId: chat._id,
        messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0,
        lastMessageAt:
          chat.messages?.[chat.messages.length - 1]?.ts || chat.updatedAt || chat.createdAt,
      }));

    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/app/history/:userId", ...adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const chat = await AppUserChat.findOne({ user: userId })
      .populate("user", "firstName lastName email phone role")
      .lean();

    if (!chat) {
      const user = await User.findById(userId)
        .select("firstName lastName email phone role")
        .lean();
      return res.json({
        user,
        messages: [],
      });
    }

    return res.json(chat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/app/history/:userId", ...adminOnly, async (req, res) => {
  try {
    await AppUserChat.findOneAndDelete({ user: req.params.userId });
    res.json({ message: "App user chat history cleared." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
