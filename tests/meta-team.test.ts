import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { planCommentReply, commentMatches } from "@/lib/social/comment-dm";
import { metaSendMode } from "@/lib/social/meta-window";
import { metaMessagingChannel } from "@/lib/social/meta-messaging";
import { __resetTeamForTests, pickVariant, planTeamReply, scoreBant } from "@/lib/agent/team";

const SAVED = { ...process.env };
afterEach(() => {
  process.env = { ...SAVED };
  __resetTeamForTests();
});

function sign(body: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("Meta messaging", () => {
  it("uses the standard window inside 24 hours and the human_agent tag after", () => {
    const now = Date.parse("2026-11-25T12:00:00Z");
    expect(metaSendMode("2026-11-25T11:00:00Z", now)).toEqual({ messaging_type: "RESPONSE" });
    expect(metaSendMode("2026-11-24T11:00:00Z", now)).toEqual({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  });

  it("accepts META_VERIFY_TOKEN for the Instagram handshake", async () => {
    process.env.META_VERIFY_TOKEN = "shared";
    const channel = metaMessagingChannel("instagram");
    const ok = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "shared", "hub.challenge": "abc" });
    expect(await channel.verifyChallenge!(ok)).toBe("abc");
    expect(await channel.verifyChallenge!(new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "abc" }))).toBeNull();
  });

  it("parses a DM, a story reply, a comment, and a lead ad", async () => {
    process.env.META_APP_SECRET = "sek";
    const channel = metaMessagingChannel("instagram");
    const body = JSON.stringify({
      entry: [
        {
          id: "page",
          messaging: [
            { sender: { id: "u1" }, recipient: { id: "page" }, timestamp: 1700000000000, message: { mid: "m1", text: "hi" } },
            { sender: { id: "u2" }, timestamp: 1700000001000, message: { mid: "m2", text: "nice story", reply_to: { story: { id: "s1" } } } },
          ],
          changes: [
            { field: "comments", value: { id: "c1", text: "what's the price?", from: { id: "u3", username: "sam" } } },
            { field: "leadgen", value: { leadgen_id: "L1", page_id: "page", created_time: 1700000000 } },
          ],
        },
      ],
    });
    const msgs = await channel.parseWebhook({ rawBody: body, headers: { "x-hub-signature-256": sign(body, "sek") }, query: new URLSearchParams() });
    expect(msgs.map((m) => m.kind)).toEqual(["dm", "story_reply", "comment", "lead"]);
    expect(msgs[2].commentId).toBe("c1");
    expect(msgs[3].externalMessageId).toBe("leadgen:L1");
  });
});

describe("comment to DM and the sales team", () => {
  it("matches a keyword and plans a public plus private reply", () => {
    expect(commentMatches("send the price please")).toBe(true);
    const plan = planCommentReply("send the price please");
    expect(plan.match).toBe(true);
    expect(plan.publicReply.length).toBeGreaterThan(0);
    expect(plan.privateReply.length).toBeGreaterThan(0);
    expect(planCommentReply("love the photo").match).toBe(false);
  });

  it("scores BANT, picks a stable variant, and stops on STOP", () => {
    const score = scoreBant("I'm the founder and I need this this month, budget is fine");
    expect(score.fit).toBeGreaterThan(50);
    expect(pickVariant("sdr", "contact-1").id).toBe(pickVariant("sdr", "contact-1").id);
    const stopped = planTeamReply({ text: "STOP", channel: "instagram", seed: "c1" });
    expect(stopped.optOut).toBe(true);
    expect(stopped.paused).toBe(true);
    const live = planTeamReply({ text: "can we book a call?", channel: "web", seed: "c1", bookingUrl: "https://revenue-recall-relaunch.onrender.com/book/local" });
    expect(live.role).toBe("setter");
    expect(live.body).toContain("AI assistant");
    expect(live.action).toBe("dm");
  });
});
