import { receivesAdvisoryNotifications } from "../utils/advisoryOrganization.js";

describe("advisory WhatsApp/email delivery by organization", () => {
  test.each(["CROPGEN", "AAT", "CROPYDEALS", "aat", ""])(
    "%s farmers receive advisory notifications",
    (code) => {
      expect(receivesAdvisoryNotifications(code)).toBe(true);
    },
  );

  test("BioDrops farmers do not (their template notifications are disabled)", () => {
    expect(receivesAdvisoryNotifications("BIODROPS")).toBe(false);
    expect(receivesAdvisoryNotifications("biodrops")).toBe(false);
  });
});
