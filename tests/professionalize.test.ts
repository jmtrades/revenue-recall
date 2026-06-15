import { describe, it, expect } from "vitest";
import { professionalize } from "@/lib/copy";

describe("professionalize — template copy reads like a pro, not a bot", () => {
  it("capitalizes sentence starts and the standalone 'i' (and contractions)", () => {
    expect(professionalize("hey jordan — i'll send it over. i think it fits.")).toBe(
      "Hey jordan — I'll send it over. I think it fits.",
    );
    expect(professionalize("missed you! want another time?")).toBe("Missed you! Want another time?");
    expect(professionalize("i won't keep bugging you")).toBe("I won't keep bugging you");
  });

  it("leaves already-cased text and mid-word i's alone", () => {
    expect(professionalize("Quick one — does Friday work?")).toBe("Quick one — does Friday work?");
    expect(professionalize("the timing is fine")).toBe("The timing is fine"); // 'timing' not touched
  });
});
