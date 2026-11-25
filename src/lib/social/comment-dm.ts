/**
 * Comment-to-DM. A matching keyword gets one public reply and one private reply.
 * Nothing is sent when the page token is missing — the caller logs that.
 */

const DEFAULT_KEYWORDS = ["price", "info", "link", "demo", "webinar", "interested"];

export function commentKeywords(raw = process.env.META_COMMENT_KEYWORDS): string[] {
  const list = (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : DEFAULT_KEYWORDS;
}

export function commentMatches(text: string, keywords = commentKeywords()): boolean {
  const hay = text.toLowerCase();
  return keywords.some((k) => k && hay.includes(k));
}

export interface CommentPlan {
  match: boolean;
  keyword?: string;
  publicReply: string;
  privateReply: string;
}

export async function sendCommentReplies(input: {
  commentId: string;
  publicReply: string;
  privateReply: string;
  token?: string;
  fetchImpl?: typeof fetch;
}): Promise<"sent" | "logged" | "failed"> {
  if (!input.token) return "logged";
  const fetchImpl = input.fetchImpl ?? fetch;
  const graph = "https://graph.facebook.com/v21.0";
  try {
    const pub = await fetchImpl(`${graph}/${input.commentId}/replies?access_token=${encodeURIComponent(input.token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: input.publicReply }),
    });
    const priv = await fetchImpl(`${graph}/me/messages?access_token=${encodeURIComponent(input.token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: { comment_id: input.commentId }, message: { text: input.privateReply } }),
    });
    return pub.ok && priv.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export function planCommentReply(text: string, keywords = commentKeywords()): CommentPlan {
  const hit = keywords.find((k) => k && text.toLowerCase().includes(k));
  if (!hit) return { match: false, publicReply: "", privateReply: "" };
  return {
    match: true,
    keyword: hit,
    publicReply: "Sent you a message with the details.",
    privateReply: "Thanks for the comment. I can send the next step or find a time to talk — what works better?",
  };
}
