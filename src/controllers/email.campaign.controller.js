import EmailCampaing from "../models/email.campaign.model.js";
import EmailStatus from "../models/email.status.model.js";
import User from "../models/user.model.js";
import { enqueueBatchEmail } from "../utils/emailQueue.js";
import { buildSafeUserFilter } from "../utils/segments.js";
import { isDeliverableEmail } from "../utils/emailValidation.js";
import { emailQueue } from "../utils/emailQueue.js";

const BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE || "100", 10);

// Create campaign
export const createCampaign = async (req, res) => {
  try {
    const { name, subject, html, from, segment } = req.body || {};
    if (!name || !subject || !html || !from)
      return res.status(400).json({ error: "Missing required fields" });

    const campaign = await EmailCampaing.create({
      name,
      subject,
      html,
      from,
      segment: segment || null,
      status: "draft",
      createdBy: req.user?.id || null,
    });

    return res.status(201).json({ success: true, campaign });
  } catch (err) {
    console.error("[createCampaign] error:", err);
    return res.status(500).json({ error: "server error" });
  }
};

// List campaigns (paginated, filterable)
export const listCampaigns = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const skip = (page - 1) * limit;

    const { status, q } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (q) filter.name = { $regex: q, $options: "i" };

    const [items, total] = await Promise.all([
      EmailCampaing.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EmailCampaing.countDocuments(filter),
    ]);

    return res.status(200).json({ success: true, page, limit, total, items });
  } catch (err) {
    console.error("[listCampaigns] error:", err);
    return res.status(500).json({ error: "server error" });
  }
};

// Audience preview (count only)
export const getCampaignSegmentStats = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const campaign = await EmailCampaing.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: "campaign not found" });

    const filter = buildSafeUserFilter(campaign.segment || {});
    const total = await User.countDocuments(filter);

    return res
      .status(200)
      .json({ success: true, segmentFilter: filter, totalRecipients: total });
  } catch (err) {
    console.error("[getCampaignSegmentStats] error:", err);
    return res.status(500).json({ error: "server error" });
  }
};

// Test mode: send to one test email only (doesn't change campaign totals)
export const testCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { to } = req.body || {};
    if (!to)
      return res.status(400).json({ error: "test 'to' email is required" });

    const campaign = await EmailCampaing.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: "campaign not found" });

    const isValid = await isDeliverableEmail(String(to).trim());
    if (!isValid)
      return res.status(400).json({ error: "test email not deliverable" });

    await enqueueBatchEmail({
      campaignId: campaign._id.toString(),
      subject: campaign.subject,
      html: campaign.html,
      from: campaign.from,
      recipients: [
        { email: String(to).trim(), name: "Test Recipient", userId: null },
      ],
      test: true,
    });

    return res
      .status(200)
      .json({ success: true, message: "test email enqueued" });
  } catch (err) {
    console.error("[testCampaign] error:", err);
    return res.status(500).json({ error: "server error" });
  }
};

// Start campaign (validates, batches, enqueues)
export const startCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const campaign = await EmailCampaing.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: "campaign not found" });
    if (["queued", "sending", "completed"].includes(campaign.status))
      return res
        .status(400)
        .json({ error: `campaign already ${campaign.status}` });

    const filter = buildSafeUserFilter(campaign.segment || {});
    const total = await User.countDocuments(filter);
    if (total === 0) return res.status(400).json({ error: "no recipients" });

    campaign.totalRecipients = total;
    campaign.status = "queued";
    await campaign.save();

    const cursor = User.find(filter, {
      email: 1,
      firstName: 1,
      name: 1,
    }).cursor();

    let batch = [];
    let enqueued = 0;
    let skippedInvalid = 0;
    let skippedMissingEmail = 0;

    for await (const user of cursor) {
      const email = (user.email || "").trim();
      const name = user.firstName || user.name || "";
      if (!email) {
        skippedMissingEmail++;
        continue;
      }

      const deliverable = await isDeliverableEmail(email);
      if (!deliverable) {
        skippedInvalid++;
        try {
          await EmailStatus.create({
            campaign: campaign._id,
            recipient: email,
            status: "failed",
            error: { message: "Pre-validation failed (format/domain/MX)" },
            attempts: 0,
            lastAttemptAt: new Date(),
            isTest: false,
          });
        } catch (werr) {
          console.warn(
            "[EmailStatus pre-fail write error]",
            werr?.message || werr
          );
        }
        continue;
      }

      batch.push({ email, name, userId: user._id });
      if (batch.length >= BATCH_SIZE) {
        await enqueueBatchEmail({
          campaignId: campaign._id.toString(),
          subject: campaign.subject,
          html: campaign.html,
          from: campaign.from,
          recipients: batch,
        });
        enqueued++;
        batch = [];
      }
    }

    if (batch.length) {
      await enqueueBatchEmail({
        campaignId: campaign._id.toString(),
        subject: campaign.subject,
        html: campaign.html,
        from: campaign.from,
        recipients: batch,
      });
      enqueued++;
    }

    campaign.enqueuedBatches = enqueued;
    campaign.status = "sending";
    await campaign.save();

    return res.status(200).json({
      success: true,
      totalRecipients: total,
      enqueuedBatches: enqueued,
      skippedInvalidEmails: skippedInvalid,
      skippedMissingEmail,
    });
  } catch (err) {
    console.error("[startCampaign] error:", err);
    return res.status(500).json({ error: "server error" });
  }
};

// Campaign status
export const getCampaignStatus = async (req, res) => {
  try {
    const campaign = await EmailCampaing.findById(req.params.campaignId);
    if (!campaign) return res.status(404).json({ error: "campaign not found" });

    return res.status(200).json({
      success: true,
      campaign: {
        _id: campaign._id,
        name: campaign.name,
        status: campaign.status,
        totalRecipients: campaign.totalRecipients,
        sentCount: campaign.sentCount,
        failedCount: campaign.failedCount,
        enqueuedBatches: campaign.enqueuedBatches,
        segment: campaign.segment || null,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      },
    });
  } catch (err) {
    console.error("[getCampaignStatus] error:", err);
    return res.status(500).json({ error: "server error" });
  }
};

// Failures list (paginated)
export const listCampaignFailures = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const skip = (page - 1) * limit;

    const campaign = await EmailCampaing.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: "campaign not found" });

    const [items, total] = await Promise.all([
      EmailStatus.find({
        campaign: campaign._id,
        status: "failed",
        isTest: false,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EmailStatus.countDocuments({
        campaign: campaign._id,
        status: "failed",
        isTest: false,
      }),
    ]);

    return res.status(200).json({ success: true, page, limit, total, items });
  } catch (err) {
    console.error("[listCampaignFailures] error:", err);
    return res.status(500).json({ error: "server error" });
  }
};

// Retry failures (re-validates)
export const retryCampaignFailures = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const campaign = await EmailCampaing.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: "campaign not found" });

    const failures = await EmailStatus.find({
      campaign: campaign._id,
      status: "failed",
      isTest: false,
    })
      .select({ recipient: 1 })
      .lean();

    if (!failures.length)
      return res
        .status(200)
        .json({ success: true, retriedBatches: 0, retriedRecipients: 0 });

    const valid = [];
    let skippedInvalidFailures = 0;

    for (const f of failures) {
      const email = (f.recipient || "").trim();
      if (!email) {
        skippedInvalidFailures++;
        continue;
      }
      if (await isDeliverableEmail(email))
        valid.push({ email, name: "", userId: null });
      else skippedInvalidFailures++;
    }

    let retriedBatches = 0;
    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const recipients = valid.slice(i, i + BATCH_SIZE);
      await enqueueBatchEmail({
        campaignId: campaign._id.toString(),
        subject: campaign.subject,
        html: campaign.html,
        from: campaign.from,
        recipients,
      });
      retriedBatches++;
    }

    if (campaign.status === "completed" && valid.length) {
      campaign.status = "sending";
      await campaign.save();
    }

    return res.status(200).json({
      success: true,
      retriedBatches,
      retriedRecipients: valid.length,
      skippedInvalidFailures,
    });
  } catch (err) {
    console.error("[retryCampaignFailures] error:", err);
    return res.status(500).json({ error: "server error" });
  }
};

// get campaign details
export const getCampaignDetails = async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Validate ObjectId
    if (!campaignId || !campaignId.match(/^[0-9a-fA-F]{24}$/)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid campaign ID" });
    }

    // Fetch campaign with full details + populate createdBy
    const campaign = await EmailCampaing.findById(campaignId);

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, error: "Campaign not found" });
    }

    // Return full mongoose object
    return res.status(200).json({
      success: true,
      campaign,
    });
  } catch (err) {
    console.error("[getCampaignDetails] error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// Update campaign (draft/queued only)
export const updateCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const allowed = ["name", "subject", "html", "from", "segment"];
    const updates = Object.fromEntries(
      Object.entries(req.body || {}).filter(([k]) => allowed.includes(k))
    );

    const campaign = await EmailCampaing.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: "campaign not found" });
    if (!["draft", "queued"].includes(campaign.status))
      return res.status(400).json({
        error: `cannot update campaign in status: ${campaign.status}`,
      });

    Object.assign(campaign, updates);
    await campaign.save();
    return res.status(200).json({ success: true, campaign });
  } catch (err) {
    console.error("[updateCampaign] error:", err);
    return res.status(500).json({ error: "server error" });
  }
};

// stop campaign
export const stopCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const campaign = await EmailCampaing.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: "campaign not found" });

    if (!["queued", "sending"].includes(campaign.status)) {
      return res
        .status(400)
        .json({ error: `cannot stop campaign in status: ${campaign.status}` });
    }

    // Remove queued/delayed jobs for this campaign
    const jobs = await emailQueue.getJobs(["waiting", "delayed"]);
    await Promise.all(
      jobs
        .filter(
          (j) =>
            j.name === "send-batch" &&
            j.data?.campaignId === String(campaign._id)
        )
        .map((j) => j.remove())
    );

    // Mark as failed (or introduce a "stopped" status if you prefer)
    campaign.status = "failed";
    await campaign.save();

    return res.status(200).json({ success: true, message: "campaign stopped" });
  } catch (err) {
    console.error("[stopCampaign] error:", err);
    return res.status(500).json({ error: "server error" });
  }
};

// Delete campaign (+ its statuses)
export const deleteCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const campaign = await EmailCampaing.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: "campaign not found" });
    if (campaign.status === "sending")
      return res.status(400).json({ error: "cannot delete while sending" });

    await Promise.all([
      EmailCampaing.findByIdAndDelete(campaignId),
      EmailStatus.deleteMany({ campaign: campaignId }),
    ]);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[deleteCampaign] error:", err);
    return res.status(500).json({ error: "server error" });
  }
};
