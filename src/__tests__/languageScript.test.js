import { replyInProfileScript } from "../features/agent/utils/languageScript.js";

const MARATHI = "गहू पेरण्यासाठी योग्य वेळ सामान्यतः रब्बी हंगामात असतो, म्हणजेच ऑक्टोबर ते नोव्हेंबर.";
const ENGLISH = "The best time to sow wheat is during the rabi season, from October to early November.";
const TAMIL = "கோதுமையை விதைக்க சிறந்த நேரம் ரபி பருவத்தில் அக்டோபர் முதல் நவம்பர் வரை ஆகும்.";

describe("replyInProfileScript", () => {
  test("Devanagari reply passes for Hindi/Marathi, fails for English/Tamil profile", () => {
    expect(replyInProfileScript(MARATHI, "mr")).toBe(true);
    expect(replyInProfileScript(MARATHI, "hi")).toBe(true);
    expect(replyInProfileScript(MARATHI, "en")).toBe(false);
    expect(replyInProfileScript(MARATHI, "ta")).toBe(false);
  });
  test("English reply fails for a Marathi profile, passes for English", () => {
    expect(replyInProfileScript(ENGLISH, "mr")).toBe(false);
    expect(replyInProfileScript(ENGLISH, "en")).toBe(true);
  });
  test("Tamil", () => {
    expect(replyInProfileScript(TAMIL, "ta")).toBe(true);
    expect(replyInProfileScript(TAMIL, "hi")).toBe(false);
  });
  test("brand/crop names in Latin inside a Marathi reply are fine", () => {
    expect(replyInProfileScript(MARATHI + " Salem, NPK, KVK", "mr")).toBe(true);
  });
  test("very short replies and unchecked languages are not judged", () => {
    expect(replyInProfileScript("ठीक आहे", "en")).toBe(true);
    expect(replyInProfileScript(ENGLISH, "ks")).toBe(true);
    expect(replyInProfileScript(ENGLISH, undefined)).toBe(true);
  });

  test("Hindi vs Marathi (same script) is told apart by common words", () => {
    const hindi = "गेहूँ बोने का सही समय रबी मौसम है। आप अक्टूबर से नवंबर के बीच बुवाई करें और बीज उपचार भी करें, यह आपके खेत के लिए ठीक है।";
    const marathi = "गहू पेरण्यासाठी योग्य वेळ रब्बी हंगाम आहे. तुम्ही ऑक्टोबर ते नोव्हेंबर दरम्यान पेरणी करावी आणि बीज प्रक्रिया करावी, हे तुमच्या शेतासाठी चांगले आहे.";
    expect(replyInProfileScript(hindi, "hi")).toBe(true);
    expect(replyInProfileScript(marathi, "mr")).toBe(true);
    expect(replyInProfileScript(marathi, "hi")).toBe(false);
    expect(replyInProfileScript(hindi, "mr")).toBe(false);
  });

  test("links, domains and [1] markers do not count as English", () => {
    const withSources = MARATHI + " [1]\n\nस्रोत:\n[1] pib.gov.in — https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2330414&lang=1";
    expect(replyInProfileScript(withSources, "mr")).toBe(true);
  });
});
