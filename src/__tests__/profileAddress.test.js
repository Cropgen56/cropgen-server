import { pickAllowedUpdateFields, validateLocationFields } from "../controllers/auth/update.user.controller.js";

describe("profile address update", () => {
  test("district is now accepted and normalised", () => {
    expect(pickAllowedUpdateFields({ district: "  Sangli  " }).district).toBe("SANGLI");
  });
  test("state names become the 2-letter code, unknown text is kept", () => {
    expect(pickAllowedUpdateFields({ state: "Maharashtra" }).state).toBe("MH");
    expect(pickAllowedUpdateFields({ state: "tamil nadu" }).state).toBe("TN");
    expect(pickAllowedUpdateFields({ state: "MH" }).state).toBe("MH");
    expect(pickAllowedUpdateFields({ state: "Narnia Province" }).state).toBe("NARNIA PROVINCE");
  });
  test("taluka/village/city kept as typed (trimmed, spaces collapsed)", () => {
    const o = pickAllowedUpdateFields({ taluka: " Miraj ", village: "Kavathe  Mahankal", city: "Sangli" });
    expect(o).toEqual({ taluka: "Miraj", village: "Kavathe Mahankal", city: "Sangli" });
  });
  test("empty string clears a field", () => {
    expect(pickAllowedUpdateFields({ district: "" }).district).toBeNull();
    expect(pickAllowedUpdateFields({ taluka: "" }).taluka).toBeNull();
  });
  test("non-address fields still cannot be set (e.g. otp)", () => {
    expect(pickAllowedUpdateFields({ otp: "1234", district: "X" })).not.toHaveProperty("otp");
  });
  test("validation rejects junk, accepts normal names", () => {
    expect(validateLocationFields({ district: "SANGLI", taluka: "Kavathe-Mahankal", village: "St. Mary's (East)" })).toBeNull();
    expect(validateLocationFields({ district: "x'; drop table" })).toMatch(/district/);
    expect(validateLocationFields({ taluka: "<script>" })).toMatch(/taluka/);
    expect(validateLocationFields({ district: "A".repeat(61) })).toMatch(/district/);
    expect(validateLocationFields({ pincode: "413 001" })).toBeNull();
    expect(validateLocationFields({ pincode: "!!" })).toMatch(/pincode/);
  });
  test("Marathi / Devanagari names are allowed", () => {
    expect(validateLocationFields({ district: "सांगली", taluka: "मिरज" })).toBeNull();
  });
});
