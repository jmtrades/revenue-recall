import { describe, it, expect } from "vitest";
import { fillTokens, hasUnfilledTokens } from "@/lib/templates-fill";

describe("fillTokens", () => {
  it("fills contact, sender, and booking tokens", () => {
    const out = fillTokens("Hi {{first_name}} at {{company}} — {{my_name}} here. Book: {{booking_link}}", {
      contactName: "Jordan Alvarez",
      company: "Acme Roofing",
      senderName: "Sam Rivera",
      bookingUrl: "https://cal.com/sam",
    });
    expect(out).toBe("Hi Jordan at Acme Roofing — Sam here. Book: https://cal.com/sam");
  });

  it("resolves industry tokens from contact attributes", () => {
    const out = fillTokens("Your {{vehicle}} for the {{job_type}} quote", {
      attributes: { vehicle: "2022 Tacoma", job_type: "roof repair" },
    });
    expect(out).toBe("Your 2022 Tacoma for the roof repair quote");
  });

  it("leaves unknown tokens visible instead of sending blanks", () => {
    const out = fillTokens("Hi {{first_name}}, about {{decision_date}}", { contactName: "Pat Lee" });
    expect(out).toBe("Hi Pat, about {{decision_date}}");
    expect(hasUnfilledTokens(out)).toBe(true);
    expect(hasUnfilledTokens("all clear")).toBe(false);
  });

  it("ignores boolean/empty attributes and tolerates whitespace in tokens", () => {
    const out = fillTokens("X {{ interest }} Y {{flag}}", { attributes: { interest: "solar", flag: true } });
    expect(out).toBe("X solar Y {{flag}}");
  });
});
