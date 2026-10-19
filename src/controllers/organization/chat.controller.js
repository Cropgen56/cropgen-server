import organizationService from "../../services/organizationService.js";

class OrganizationController {
  async getAllOrganizations(req, res) {
    try {
      const organizations = await organizationService.getAllOrganizations();
      res.json(organizations);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }

  async getOrganizationById(req, res) {
    try {
      const { id } = req.params;
      const organization = await organizationService.getOrganizationById(id);

      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json(organization);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }

  async deleteOrganization(req, res) {
    try {
      const { id } = req.params;

      const organization = await organizationService.deleteOrganizationWithChat(id);

      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json({ message: "Organization and their chat deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
}

export default new OrganizationController();
