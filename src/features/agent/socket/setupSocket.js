import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import publicSocketService from "../services/publicSocket.service.js";
import appSocketService from "../services/appSocket.service.js";

/**
 * Persona brand from the connecting client (CropGen app vs Satagro/Biodrops).
 * Prefer this over the user's DB organization so CropGen app never speaks as Satagro.
 * @param {import("socket.io").Socket} socket
 * @param {string|null} [fallback="CROPGEN"]
 */
function resolveOrgCodeFromSocket(socket, fallback = "CROPGEN") {
  const fromQuery = String(socket.handshake.query?.clientBrand || "").toLowerCase();
  const fromHeader = String(
    socket.handshake.headers?.["x-client-brand"] || "",
  ).toLowerCase();
  const fromApp = String(
    socket.handshake.query?.clientApp ||
      socket.handshake.headers?.["x-client-app"] ||
      "",
  ).toLowerCase();
  const brand = fromQuery || fromHeader;

  if (brand === "biodrops" || brand === "satagro") return "BIODROPS";
  if (brand === "cropgen") return "CROPGEN";
  if (fromApp.startsWith("satagro") || fromApp.startsWith("biodrops")) {
    return "BIODROPS";
  }
  if (fromApp.startsWith("cropgen")) return "CROPGEN";
  return fallback;
}

function getAppAgentOptions(socket) {
  const organizationCode = resolveOrgCodeFromSocket(socket, null);
  return organizationCode ? { organizationCode } : {};
}

/** @param {import("socket.io").Namespace} ns */
function wirePublicNamespace(ns) {
  ns.on("connection", (socket) => {
    const userId = socket.id;
    const orgCode = resolveOrgCodeFromSocket(socket);
    publicSocketService.initializeUser(userId, orgCode);

    const welcomeMsg =
      "Welcome! To help you better, could you tell me who you are?";
    socket.emit("ai_response", welcomeMsg);
    publicSocketService.recordMessage(userId, "ai", welcomeMsg);

    socket.on("user_message", async (msg) => {
      const state = publicSocketService.getUserState(userId);
      const cleanedMsg = (msg || "").toString().trim();
      publicSocketService.recordMessage(userId, "user", cleanedMsg);

      if (state.type === null) {
        const result = publicSocketService.handleRoleSelection(cleanedMsg, state);
        socket.emit("ai_response", result.reply);
        publicSocketService.recordMessage(userId, "ai", result.reply);
        publicSocketService.setUserState(userId, result.state);
        return;
      }

      if (["organization", "farmer"].includes(state.type)) {
        const step = state.step;
        const fields = publicSocketService.getFieldsForType(state.type);
        const field = fields[step];
        const errorMsg = publicSocketService.validateField(field, cleanedMsg);

        if (errorMsg) {
          socket.emit("ai_response", errorMsg);
          publicSocketService.recordMessage(userId, "ai", errorMsg);
          socket.emit("ai_response", state.questions[step]);
          publicSocketService.recordMessage(userId, "ai", state.questions[step]);
          return;
        }

        state.data[field] = cleanedMsg;
        state.step++;

        if (state.step < state.questions.length) {
          const reply = state.questions[state.step];
          socket.emit("ai_response", reply);
          publicSocketService.recordMessage(userId, "ai", reply);
        } else {
          const validation = publicSocketService.validateUserData(state.type, state.data);
          if (validation.error) {
            const validationError =
              validation.error.details?.[0]?.message || "Invalid input";
            socket.emit("ai_response", `Invalid input: ${validationError}`);
            publicSocketService.recordMessage(
              userId,
              "ai",
              `Invalid input: ${validationError}`,
            );
            state.step = 0;
            state.data = {};
            socket.emit("ai_response", state.questions[0]);
            publicSocketService.recordMessage(userId, "ai", state.questions[0]);
          } else {
            try {
              const savedUser = await publicSocketService.saveUser(state.type, state.data);
              state.userObject = savedUser;
              publicSocketService.recordMessage(
                userId,
                "ai",
                `${state.type} details saved successfully.`,
              );
              socket.emit("ai_response", "How can I assist you further?");
              state.type = "general";
              state.step = 0;
              state.data = {};
            } catch (err) {
              console.error("DB save error:", err);
              socket.emit("ai_response", "Server error while saving data.");
              publicSocketService.recordMessage(userId, "ai", "Server error while saving data.");
            }
          }
        }
        publicSocketService.setUserState(userId, state);
        return;
      }

      if (state.type === "general") {
        const reply = await publicSocketService.handleAIConversation(userId, cleanedMsg);
        socket.emit("ai_response", reply);
        publicSocketService.recordMessage(userId, "ai", reply);
        return;
      }
    });

    socket.on("reset_conversation", () => {
      publicSocketService.resetConversation(userId);
      const resetMsg = "Conversation reset. Let's start fresh!";
      socket.emit("ai_response", resetMsg);
      publicSocketService.recordMessage(userId, "ai", resetMsg);
    });

    socket.on("get_history", async () => {
      const chatHistory = await publicSocketService.getChatHistory(userId);
      socket.emit("chat_history", { conversations: chatHistory });
    });

    socket.on("disconnect", () => {
      publicSocketService.cleanupUser(userId);
    });
  });
}

/** @param {import("socket.io").Namespace} ns */
function wireAppNamespace(ns) {
  ns.use((socket, next) => {
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

  ns.on("connection", async (socket) => {
    const userId = socket.userId;
    const agentOptions = getAppAgentOptions(socket);

    try {
      const welcomeMsg = await appSocketService.initializeUser(
        userId,
        agentOptions,
      );
      socket.emit("ai_response", welcomeMsg);
    } catch (err) {
      console.error("App socket init error:", err);
      socket.emit(
        "ai_response",
        "Welcome! How can I help with your farm today?",
      );
    }

    socket.on("user_message", async (msg) => {
      const cleanedMsg = (msg || "").toString().trim();
      if (!cleanedMsg) return;

      appSocketService.recordMessage(userId, "user", cleanedMsg);
      const reply = await appSocketService.handleMessage(userId, cleanedMsg);
      socket.emit("ai_response", reply);
      appSocketService.recordMessage(userId, "ai", reply);
    });

    socket.on("reset_conversation", async () => {
      await appSocketService.resetConversation(userId, agentOptions);
      const resetMsg =
        "Conversation reset. Ask a farming question, or tap a farm for field-specific advice.";
      socket.emit("ai_response", resetMsg);
    });

    socket.on("set_active_farm", async (fieldId) => {
      try {
        const reply = await appSocketService.setActiveFarm(
          userId,
          fieldId,
          agentOptions,
        );
        socket.emit("ai_response", reply);
      } catch (err) {
        console.error("set_active_farm error:", err);
        socket.emit(
          "ai_response",
          "Could not switch farm context. Please try again.",
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
}

/**
 * Default namespace "/" — JWT in handshake.auth → app flow; otherwise public.
 * Lets web clients avoid /app and /public when proxies or older stacks reject
 * custom namespaces (avoids "Invalid namespace" after a successful WS upgrade).
 */
function wireDefaultNamespace(io) {
  const root = io.of("/");

  root.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    socket.cropgenAppUser = false;
    if (!token) {
      return next();
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const uid = payload.id || payload._id || payload.userId;
      if (!uid) {
        return next(new Error("Invalid token payload."));
      }
      socket.userId = uid;
      socket.cropgenAppUser = true;
      next();
    } catch (err) {
      return next(new Error("Invalid or expired token."));
    }
  });

  root.on("connection", async (socket) => {
    if (socket.cropgenAppUser) {
      const userId = socket.userId;
      const agentOptions = getAppAgentOptions(socket);

      try {
        const welcomeMsg = await appSocketService.initializeUser(
          userId,
          agentOptions,
        );
        socket.emit("ai_response", welcomeMsg);
      } catch (err) {
        console.error("App socket init error:", err);
        socket.emit(
          "ai_response",
          "Welcome! How can I help with your farm today?",
        );
      }

      socket.on("user_message", async (msg) => {
        const cleanedMsg = (msg || "").toString().trim();
        if (!cleanedMsg) return;

        appSocketService.recordMessage(userId, "user", cleanedMsg);
        const reply = await appSocketService.handleMessage(userId, cleanedMsg);
        socket.emit("ai_response", reply);
        appSocketService.recordMessage(userId, "ai", reply);
      });

      socket.on("reset_conversation", async () => {
        await appSocketService.resetConversation(userId, agentOptions);
        const resetMsg =
        "Conversation reset. Ask a farming question, or tap a farm for field-specific advice.";
        socket.emit("ai_response", resetMsg);
      });

      socket.on("set_active_farm", async (fieldId) => {
        try {
          const reply = await appSocketService.setActiveFarm(
            userId,
            fieldId,
            agentOptions,
          );
          socket.emit("ai_response", reply);
        } catch (err) {
          console.error("set_active_farm error:", err);
          socket.emit(
            "ai_response",
            "Could not switch farm context. Please try again.",
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
      return;
    }

    const userId = socket.id;
    const orgCode = resolveOrgCodeFromSocket(socket);
    publicSocketService.initializeUser(userId, orgCode);

    const welcomeMsg =
      "Welcome! To help you better, could you tell me who you are?";
    socket.emit("ai_response", welcomeMsg);
    publicSocketService.recordMessage(userId, "ai", welcomeMsg);

    socket.on("user_message", async (msg) => {
      const state = publicSocketService.getUserState(userId);
      const cleanedMsg = (msg || "").toString().trim();
      publicSocketService.recordMessage(userId, "user", cleanedMsg);

      if (state.type === null) {
        const result = publicSocketService.handleRoleSelection(cleanedMsg, state);
        socket.emit("ai_response", result.reply);
        publicSocketService.recordMessage(userId, "ai", result.reply);
        publicSocketService.setUserState(userId, result.state);
        return;
      }

      if (["organization", "farmer"].includes(state.type)) {
        const step = state.step;
        const fields = publicSocketService.getFieldsForType(state.type);
        const field = fields[step];
        const errorMsg = publicSocketService.validateField(field, cleanedMsg);

        if (errorMsg) {
          socket.emit("ai_response", errorMsg);
          publicSocketService.recordMessage(userId, "ai", errorMsg);
          socket.emit("ai_response", state.questions[step]);
          publicSocketService.recordMessage(userId, "ai", state.questions[step]);
          return;
        }

        state.data[field] = cleanedMsg;
        state.step++;

        if (state.step < state.questions.length) {
          const reply = state.questions[state.step];
          socket.emit("ai_response", reply);
          publicSocketService.recordMessage(userId, "ai", reply);
        } else {
          const validation = publicSocketService.validateUserData(state.type, state.data);
          if (validation.error) {
            const validationError =
              validation.error.details?.[0]?.message || "Invalid input";
            socket.emit("ai_response", `Invalid input: ${validationError}`);
            publicSocketService.recordMessage(
              userId,
              "ai",
              `Invalid input: ${validationError}`,
            );
            state.step = 0;
            state.data = {};
            socket.emit("ai_response", state.questions[0]);
            publicSocketService.recordMessage(userId, "ai", state.questions[0]);
          } else {
            try {
              const savedUser = await publicSocketService.saveUser(state.type, state.data);
              state.userObject = savedUser;
              publicSocketService.recordMessage(
                userId,
                "ai",
                `${state.type} details saved successfully.`,
              );
              socket.emit("ai_response", "How can I assist you further?");
              state.type = "general";
              state.step = 0;
              state.data = {};
            } catch (err) {
              console.error("DB save error:", err);
              socket.emit("ai_response", "Server error while saving data.");
              publicSocketService.recordMessage(userId, "ai", "Server error while saving data.");
            }
          }
        }
        publicSocketService.setUserState(userId, state);
        return;
      }

      if (state.type === "general") {
        const reply = await publicSocketService.handleAIConversation(userId, cleanedMsg);
        socket.emit("ai_response", reply);
        publicSocketService.recordMessage(userId, "ai", reply);
        return;
      }
    });

    socket.on("reset_conversation", () => {
      publicSocketService.resetConversation(userId);
      const resetMsg = "Conversation reset. Let's start fresh!";
      socket.emit("ai_response", resetMsg);
      publicSocketService.recordMessage(userId, "ai", resetMsg);
    });

    socket.on("get_history", async () => {
      const chatHistory = await publicSocketService.getChatHistory(userId);
      socket.emit("chat_history", { conversations: chatHistory });
    });

    socket.on("disconnect", () => {
      publicSocketService.cleanupUser(userId);
    });
  });
}

export const setupSocket = (httpServer) => {
  const io = new Server(httpServer, {
    path: "/v3/socket.io",
    cors: { origin: "*" },
  });

  wirePublicNamespace(io.of("/public"));
  wireAppNamespace(io.of("/app"));
  wireDefaultNamespace(io);
};
