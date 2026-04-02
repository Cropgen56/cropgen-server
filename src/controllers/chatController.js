import chatService from "../services/chatService.js";

class ChatController {
  async getChatOfUser(req, res) {
    try {
      const { userType, userId } = req.params;

      let chat = await chatService.getChatByUser(userId, userType);

      if (!chat) {
        const model = await chatService.getUserModel(userId, userType);
        if (!model) {
          return res.status(404).json({ message: "User not found" });
        }
      }

      res.json(chat);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }

  async deleteChatOfUser(req, res) {
    try {
      const { userType, userId } = req.params;

      const deletedChat = await chatService.deleteChatByUser(userId, userType);

      if (!deletedChat) {
        return res.status(404).json({ message: "Chat not found" });
      }

      res.json({ message: "Chat deleted successfully", deletedChat });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
}

export default new ChatController();
