
import farmerService from "../../services/farmerService.js";
import { logActivity } from "../../utils/storage/activityLog.service.js";

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

      // Record successful farmer deletion
      try {
        await logActivity({
          userId: req.user?.id || req.user?._id,
          userName:
            req.user?.email ||
            req.user?.name ||
            req.user?.firstName ||
            "Unknown",
          action: "DELETE",
          module: "Farmers",
          description: `Farmer ${id} and their chat were deleted`,
          status: "SUCCESS",
        });
      } catch (logError) {
        // Logging must never break the main request
        console.error(
          "Failed to record farmer deletion activity:",
          logError.message
        );
      }

      res.json({
        message: "Farmer and their chat deleted successfully",
      });
    } catch (error) {
      // Optional failure log
      try {
        await logActivity({
          userId: req.user?.id || req.user?._id,
          userName:
            req.user?.email ||
            req.user?.name ||
            req.user?.firstName ||
            "Unknown",
          action: "DELETE",
          module: "Farmers",
          description: `Failed to delete farmer ${req.params?.id || "unknown"}`,
          status: "FAILED",
        });
      } catch (logError) {
        console.error(
          "Failed to record farmer deletion failure activity:",
          logError.message
        );
      }

      res.status(500).json({ message: error.message });
    }
  }
}

export default new FarmerController();
