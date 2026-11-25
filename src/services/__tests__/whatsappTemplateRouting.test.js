import { jest } from "@jest/globals";
const postMock = jest.fn(async () => ({ data: {} }));

jest.unstable_mockModule("axios", () => ({
  default: { post: postMock },
}));

const { sendWhatsAppTemplate } = await import("../whatsapp.service.js");

describe("WhatsApp template routing by organization", () => {
  beforeEach(() => {
    postMock.mockClear();
    process.env.WHATSAPP_PHONE_NUMBER_ID = "cropgen-phone";
    process.env.WHATSAPP_ACCESS_TOKEN = "cropgen-token";
    process.env.BIODROPS_WHATSAPP_PHONE_NUMBER_ID = "satagro-phone";
    process.env.BIODROPS_WHATSAPP_ACCESS_TOKEN = "satagro-token";
  });

  test("CropGen users use the CropGen number and template names", async () => {
    await sendWhatsAppTemplate({
      to: "919999999999",
      templateName: "advisory",
      parameters: ["a"],
      organizationCode: "CROPGEN",
    });
    const [url, body, config] = postMock.mock.calls[0];
    expect(url).toContain("/cropgen-phone/messages");
    expect(body.template.name).toBe("advisory");
    expect(config.headers.Authorization).toBe("Bearer cropgen-token");
  });

  test("Satagro (BIODROPS) users use the Satagro number and satagro_ templates", async () => {
    await sendWhatsAppTemplate({
      to: "919999999999",
      templateName: "plan_expiry_reminder_notification",
      parameters: ["a"],
      organizationCode: "BIODROPS",
    });
    const [url, body, config] = postMock.mock.calls[0];
    expect(url).toContain("/satagro-phone/messages");
    expect(body.template.name).toBe("satagro_plan_expiry_reminder_notification_utility");
    expect(config.headers.Authorization).toBe("Bearer satagro-token");
  });

  test("Satagro activation and advisory map to satagro_ names", async () => {
    await sendWhatsAppTemplate({ to: "1", templateName: "plan_activation_notification", organizationCode: "biodrops" });
    await sendWhatsAppTemplate({ to: "1", templateName: "advisory", organizationCode: "BIODROPS" });
    expect(postMock.mock.calls[0][1].template.name).toBe("satagro_plan_activation_notification");
    expect(postMock.mock.calls[1][1].template.name).toBe("satagro_advisory");
  });
});
