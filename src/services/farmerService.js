import Farmer from "../models/farmer.model.js";
import Chathistory from "../models/user-chat.model.js";

class FarmerService {
  async getAllFarmers() {
    const farmers = await Farmer.find().sort({ createdAt: -1 });
    return farmers;
  }

  async getFarmerById(id) {
    const farmer = await Farmer.findById(id);
    return farmer;
  }

  async createFarmer(farmerData) {
    const farmer = new Farmer(farmerData);
    const savedFarmer = await farmer.save();
    return savedFarmer;
  }

  async deleteFarmerById(id) {
    const farmer = await Farmer.findByIdAndDelete(id);
    return farmer;
  }

  async deleteFarmerWithChat(id) {
    const farmer = await Farmer.findByIdAndDelete(id);
    if (farmer) {
      await Chathistory.findOneAndDelete({ user: id, userType: "Farmer" });
    }
    return farmer;
  }
}

export default new FarmerService();
