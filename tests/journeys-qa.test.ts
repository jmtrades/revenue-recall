import { describe, expect, it } from "vitest";
import { webinarLeak } from "@/lib/webinar/leak";
import { simulateAttribution, simulateChat, simulateMeta, simulatePlatforms, simulateQuietHours } from "@/lib/journeys/simulate";

describe("webinar leak", () => {
  it("prices no-shows at the attendee close rate", () => {
    const leak = webinarLeak({ registrants: 100, showRate: 0.4, offerPrice: 2000, closeRate: 0.1 });
    expect(leak?.missed).toBe(60);
    expect(leak?.leaked).toBe(12000);
  });

  it("rejects a show rate above 100 percent", () => {
    expect(webinarLeak({ registrants: 10, showRate: 1.4, offerPrice: 100, closeRate: 0.1 })).toBeNull();
  });
});

describe("dry-run journeys", () => {
  it("queues a call, a text, and an email for every webinar platform without dialing", () => {
    const rows = simulatePlatforms();
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      expect(row.placedCall).toBe(false);
      expect(row.hasSms, row.provider).toBe(true);
      expect(row.hasEmail, row.provider).toBe(true);
      expect(row.callReady, row.provider).toBe(true);
    }
  });

  it("keeps the live leave call and holds the later text during quiet hours", () => {
    const quiet = simulateQuietHours();
    expect(quiet.liveCallReady).toBe(true);
    expect(quiet.laterSmsHeld).toBe(true);
  });

  it("reads an Instagram DM, a price comment, and a lead ad", async () => {
    const meta = await simulateMeta();
    expect(meta).toEqual({ dm: true, comment: true, lead: true });
  });

  it("books from chat, stops on STOP, and stays silent when paused", () => {
    const chat = simulateChat("https://revenue-recall-relaunch.onrender.com/book/local");
    expect(chat.books).toBe(true);
    expect(chat.discloses).toBe(true);
    expect(chat.stopped).toBe(true);
    expect(chat.paused).toBe(true);
  });

  it("turns a Calendly booking and a purchase into ROAS", () => {
    const ads = simulateAttribution();
    expect(ads.bookingEmail).toBe("qa@example.com");
    expect(ads.leads).toBe(1);
    expect(ads.bookings).toBe(1);
    expect(ads.sales).toBe(1);
    expect(ads.roas).toBe(4);
  });
});
