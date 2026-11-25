import { jest } from "@jest/globals";

const sendBasicEmailMock = jest.fn(async () => ({}));
jest.unstable_mockModule("../../config/sesClient.js", () => ({
  sendBasicEmail: sendBasicEmailMock,
}));

const { generateEmailFromTemplate, sendEmail } = await import("../email.services.js");

const expiryParams = ["Vishal", "Plan", "Satagro", "Monthly", "Sugarcane", "Field", "1.00", "2026-11-01", "2026-11-30", "3"];

describe("email routing by organization", () => {
  beforeEach(() => sendBasicEmailMock.mockClear());

  test("Satagro expiry reminder is Satagro-branded", () => {
    const { subject, html } = generateEmailFromTemplate(
      "plan_expiry_reminder_notification", expiryParams, new Date(), "BIODROPS",
    );
    expect(subject).toMatch(/Satagro/);
    expect(html).toMatch(/Satagro/);
    expect(html).not.toMatch(/CropGen/);
  });

  test("CropGen expiry reminder uses the CropGen email (not the generic fallback)", () => {
    const { subject, html } = generateEmailFromTemplate(
      "plan_expiry_reminder_notification", expiryParams, new Date(), "CROPGEN",
    );
    expect(subject).toBe("Your CropGen Subscription is Expiring Soon ⏳");
    expect(html).not.toMatch(/Please check your CropGen account/);
  });

  test("Satagro advisory email is Satagro-branded", () => {
    const params = ["Vishal", "2026-11-26", "Sugarcane", "Field", "1 Acre", "a", "b", "c", "d", "e", "f", "g"];
    const { subject, html } = generateEmailFromTemplate("farm_advisory", params, new Date(), "BIODROPS");
    expect(subject).toBe("Satagro Smart Farm Advisory");
    expect(html).toMatch(/Satagro Smart Farm Advisory/);
  });

  test("Satagro mail is sent from the Satagro sender preset", async () => {
    await sendEmail({ to: "a@b.com", subject: "s", html: "h", organizationCode: "BIODROPS" });
    expect(sendBasicEmailMock.mock.calls[0][0]).toMatchObject({ preset: "biodrops", to: "a@b.com" });
    expect(sendBasicEmailMock.mock.calls[0][0].from).toBeUndefined();
  });

  test("CropGen mail is sent from the CropGen sender", async () => {
    process.env.SES_FROM_EMAIL = "info@cropgenapp.com";
    await sendEmail({ to: "a@b.com", subject: "s", html: "h", organizationCode: "CROPGEN" });
    expect(sendBasicEmailMock.mock.calls[0][0]).toMatchObject({ from: "info@cropgenapp.com" });
    expect(sendBasicEmailMock.mock.calls[0][0].preset).toBeUndefined();
  });
});
