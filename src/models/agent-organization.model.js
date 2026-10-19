import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contact: { type: String, required: true },
  email: { type: String, required: true },
});

const AgentOrganization =
  mongoose.models.AgentOrganization ||
  mongoose.model("AgentOrganization", organizationSchema);

export default AgentOrganization;
