import Organization from "../models/agent-organization.model.js";
import Chathistory from "../models/user-chat.model.js";

class OrganizationService {
  async getAllOrganizations() {
    const organizations = await Organization.find().sort({ createdAt: -1 });
    return organizations;
  }

  async getOrganizationById(id) {
    const organization = await Organization.findById(id);
    return organization;
  }

  async createOrganization(orgData) {
    const organization = new Organization(orgData);
    const savedOrg = await organization.save();
    return savedOrg;
  }

  async deleteOrganizationById(id) {
    const organization = await Organization.findByIdAndDelete(id);
    return organization;
  }

  async deleteOrganizationWithChat(id) {
    const organization = await Organization.findByIdAndDelete(id);
    if (organization) {
      await Chathistory.findOneAndDelete({ user: id, userType: "Organization" });
    }
    return organization;
  }
}

export default new OrganizationService();
