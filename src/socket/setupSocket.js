import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import socketService from "../services/socketService.js";
import appSocketService from "../services/appSocketService.js";

export const setupSocket = (httpServer) => {
  const io = new Server(httpServer, {
    path: "/v3/socket.io",
    cors: { origin: "*" },
  });

  // ─── PUBLIC NAMESPACE (/public) — website visitors ───
  const publicNs = io.of("/public");

  publicNs.on("connection", (socket) => {
    const userId = socket.id;
    socketService.initializeUser(userId);

    const welcomeMsg = "Welcome! To help you better, could you tell me who you are?";
    socket.emit("ai_response", welcomeMsg);
    socketService.recordMessage(userId, "ai", welcomeMsg);

    socket.on("user_message", async (msg) => {
      const state = socketService.getUserState(userId);
      const cleanedMsg = (msg || "").toString().trim();
      socketService.recordMessage(userId, "user", cleanedMsg);

      if (state.type === null) {
        const result = socketService.handleRoleSelection(cleanedMsg, state);
        socket.emit("ai_response", result.reply);
        socketService.recordMessage(userId, "ai", result.reply);
        socketService.setUserState(userId, result.state);
        return;
      }

      if (["organization", "farmer"].includes(state.type)) {
        const step = state.step;
        const fields = socketService.getFieldsForType(state.type);
        const field = fields[step];
        const errorMsg = socketService.validateField(field, cleanedMsg);

        if (errorMsg) {
          socket.emit("ai_response", errorMsg);
          socketService.recordMessage(userId, "ai", errorMsg);
          socket.emit("ai_response", state.questions[step]);
          socketService.recordMessage(userId, "ai", state.questions[step]);
          return;
        }

        state.data[field] = cleanedMsg;
        state.step++;

        if (state.step < state.questions.length) {
          const reply = state.questions[state.step];
          socket.emit("ai_response", reply);
          socketService.recordMessage(userId, "ai", reply);
        } else {
          const validation = socketService.validateUserData(state.type, state.data);
          if (validation.error) {
            const validationError = validation.error.details?.[0]?.message || "Invalid input";
            socket.emit("ai_response", `Invalid input: ${validationError}`);
            socketService.recordMessage(userId, "ai", `Invalid input: ${validationError}`);
            state.step = 0;
            state.data = {};
            socket.emit("ai_response", state.questions[0]);
            socketService.recordMessage(userId, "ai", state.questions[0]);
          } else {
            try {
              const savedUser = await socketService.saveUser(state.type, state.data);
              state.userObject = savedUser;
              socketService.recordMessage(userId, "ai", `${state.type} details saved successfully.`);
              socket.emit("ai_response", "How can I assist you further?");
              state.type = "general";
              state.step = 0;
              state.data = {};
            } catch (err) {
              console.error("DB save error:", err);
              socket.emit("ai_response", "Server error while saving data.");
              socketService.recordMessage(userId, "ai", "Server error while saving data.");
            }
          }
        }
        socketService.setUserState(userId, state);
        return;
      }

      if (state.type === "general") {
        const reply = await socketService.handleAIConversation(userId, cleanedMsg);
        socket.emit("ai_response", reply);
        socketService.recordMessage(userId, "ai", reply);
        return;
      }
    });

    socket.on("reset_conversation", () => {
      socketService.resetConversation(userId);
      const resetMsg = "Conversation reset. Let's start fresh!";
      socket.emit("ai_response", resetMsg);
      socketService.recordMessage(userId, "ai", resetMsg);
    });

    socket.on("get_history", async () => {
      const chatHistory = await socketService.getChatHistory(userId);
      socket.emit("chat_history", { conversations: chatHistory });
    });

    socket.on("disconnect", () => {
      socketService.cleanupUser(userId);
    });
  });

  // ─── APP NAMESPACE (/app) — logged-in users with JWT auth ───
  const appNs = io.of("/app");

  appNs.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication required. Please log in."));
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.userId = payload.id || payload._id || payload.userId;
      if (!socket.userId) {
        return next(new Error("Invalid token payload."));
      }
      next();
    } catch (err) {
      return next(new Error("Invalid or expired token."));
    }
  });

  appNs.on("connection", async (socket) => {
    const userId = socket.userId;

    try {
      const welcomeMsg = await appSocketService.initializeUser(userId);
      socket.emit("ai_response", welcomeMsg);
    } catch (err) {
      console.error("App socket init error:", err);
      socket.emit("ai_response", "Welcome to CropGen AI! How can I help with your farm today?");
    }

    socket.on("user_message", async (msg) => {
      const cleanedMsg = (msg || "").toString().trim();
      if (!cleanedMsg) return;

      await appSocketService.recordMessage(userId, "user", cleanedMsg);
      const reply = await appSocketService.handleMessage(userId, cleanedMsg);
      socket.emit("ai_response", reply);
      await appSocketService.recordMessage(userId, "ai", reply);
    });

    socket.on("reset_conversation", async () => {
      await appSocketService.resetConversation(userId);
      const resetMsg = "Conversation reset. How can I help with your farm?";
      socket.emit("ai_response", resetMsg);
    });

    socket.on("set_active_farm", async (fieldId) => {
      try {
        const reply = await appSocketService.setActiveFarm(userId, fieldId);
        socket.emit("ai_response", reply);
      } catch (err) {
        console.error("set_active_farm error:", err);
        socket.emit(
          "ai_response",
          "Could not switch farm context. Please try again."
        );
      }
    });

    socket.on("get_history", async () => {
      const history = await appSocketService.getChatHistory(userId);
      socket.emit("chat_history", { conversations: history });
    });

    socket.on("disconnect", () => {
      appSocketService.cleanupUser(userId);
    });
  });
};
