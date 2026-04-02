import farmerService from "../services/farmerService.js";

class FarmerController {
  async getAllFarmers(req, res) {
    try {
      const farmers = await farmerService.getAllFarmers();
      res.json(farmers);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }

  async getFarmerById(req, res) {
    try {
      const { id } = req.params;
      const farmer = await farmerService.getFarmerById(id);

      if (!farmer) {
        return res.status(404).json({ message: "Farmer not found" });
      }

      res.json(farmer);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }

  async deleteFarmer(req, res) {
    try {
      const { id } = req.params;

      const farmer = await farmerService.deleteFarmerWithChat(id);

      if (!farmer) {
        return res.status(404).json({ message: "Farmer not found" });
      }

      res.json({ message: "Farmer and their chat deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
}

export default new FarmerController();
