import Chathistory from "../models/UserChat.js";
import Farmer from "../models/farmerModel.js";
import Organization from "../models/organizationModel.js";

class ChatService {
  async getChatByUser(userId, userType) {
    const chat = await Chathistory.findOne({ user: userId, userType }).populate("user");
    return chat;
  }

  async getUserModel(userId, userType) {
    if (userType === "Farmer") {
      return await Farmer.findById(userId);
    } else if (userType === "Organization") {
      return await Organization.findById(userId);
    }
    return null;
  }

  async createChat(userId, userType, messages = []) {
    const chat = await Chathistory.create({
      user: userId,
      userType,
      messages,
    });
    return chat;
  }

  async deleteChatByUser(userId, userType) {
    const deletedChat = await Chathistory.findOneAndDelete({
      user: userId,
      userType,
    });
    return deletedChat;
  }

  async addMessage(userId, userType, messageObj) {
    const chat = await Chathistory.findOneAndUpdate(
      { user: userId },
      {
        $push: { messages: messageObj },
        $set: { userType, updatedAt: new Date() },
      },
      { upsert: true, new: true }
    ).populate("user");
    return chat;
  }

  async getChatHistoryByUserId(userObjectId) {
    const chat = await Chathistory.findOne({ user: userObjectId }).populate("user");
    return chat;
  }
}

export default new ChatService();
