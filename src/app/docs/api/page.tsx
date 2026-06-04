import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "API & integrations",
  description: "Push leads into Revenue Recall, sync your pipeline back out, embed a capture form, and receive signed webhook events.",
};

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://app.recall-touch.com").replace(/\/$/, "");

function Code({ children }: { children: string }) {
  return <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface-2 p-4 font-mono text-[12px] leading-relaxed text-fg">{children}</pre>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border py-10">
      <h2 className="font-display text-xl font-semibold text-fg">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

const NAV = [
  ["auth", "Authentication"],
  ["create", "Create a lead"],
  ["list", "List leads & deals"],
  ["form", "Embeddable form"],
  ["webhooks", "Webhooks"],
];

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-[13px] font-bold text-white">RR</span>
            <span className="font-display text-[15px] font-semibold text-fg">Revenue Recall</span>
          </Link>
          <Link href="/signup" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand/90">Start free</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-8">
        <div className="py-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">API &amp; integrations</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Push leads into Revenue Recall from anywhere, sync your pipeline back out, embed a capture form on any site,
            and receive signed events in real time. Every captured lead is immediately worked by the autonomous engine.
            Manage your key, form, and webhook in <span className="text-fg">Settings → Developer</span>.
          </p>
          <nav className="mt-5 flex flex-wrap gap-2">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted transition hover:text-fg">{label}</a>
            ))}
          </nav>
        </div>

        <Section id="auth" title="Authentication">
          <p>
            All API requests authenticate with your workspace key (generate it in Settings → Developer). Send it as a
            bearer token or an <code className="text-fg">x-api-key</code> header. Keys look like{" "}
            <code className="text-fg">rr_live_…</code> — keep them server-side.
          </p>
          <Code>{`Authorization: Bearer rr_live_xxxxxxxxxxxxxxxx
# or
x-api-key: rr_live_xxxxxxxxxxxxxxxx`}</Code>
          <p>Base URL: <code className="text-fg">{BASE}</code></p>
        </Section>

        <Section id="create" title="Create a lead">
          <p>
            <code className="text-fg">POST /api/v1/leads</code> — creates a contact and an open deal. Requires{" "}
            <code className="text-fg">name</code> and either <code className="text-fg">email</code> or{" "}
            <code className="text-fg">phone</code>. Optional: <code className="text-fg">company</code>,{" "}
            <code className="text-fg">title</code>, <code className="text-fg">value</code>,{" "}
            <code className="text-fg">source</code>, <code className="text-fg">notes</code>,{" "}
            <code className="text-fg">dealTitle</code>, <code className="text-fg">sequenceId</code>.
          </p>
          <Code>{`curl -X POST ${BASE}/api/v1/leads \\
  -H "Authorization: Bearer rr_live_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Jane Doe",
    "email": "jane@acme.com",
    "company": "Acme",
    "value": 5000,
    "source": "website"
  }'

# 201 Created
{ "ok": true, "contactId": "c_…", "dealId": "o_…", "enrolled": false }`}</Code>
          <p className="pt-1">
            Need a contact without a deal? <code className="text-fg">POST /api/v1/contacts</code> (same fields, no deal
            created) and <code className="text-fg">PATCH /api/v1/contacts/:id</code> to update one.
          </p>
        </Section>

        <Section id="list" title="List leads & deals">
          <p>
            <code className="text-fg">GET /api/v1/leads</code>, <code className="text-fg">GET /api/v1/deals</code>, and{" "}
            <code className="text-fg">GET /api/v1/contacts</code> — return your records in a stable shape. All accept{" "}
            <code className="text-fg">?limit=</code> (default 50, max 200).
          </p>
          <Code>{`curl ${BASE}/api/v1/deals?limit=50 \\
  -H "Authorization: Bearer rr_live_xxxxxxxxxxxxxxxx"

# 200 OK
{ "data": [ { "id": "o_…", "title": "Acme — Jane Doe", "value": 5000,
  "currency": "USD", "stage": "New", "contactId": "c_…" } ], "count": 1, "total": 1 }`}</Code>
          <p className="pt-1">
            Create a deal for an existing contact with <code className="text-fg">POST /api/v1/deals</code> (
            <code className="text-fg">contactId</code> required; optional <code className="text-fg">title</code>,{" "}
            <code className="text-fg">value</code>, <code className="text-fg">stageId</code>). Update one with{" "}
            <code className="text-fg">PATCH /api/v1/deals/:id</code> — move its stage with{" "}
            <code className="text-fg">stageId</code>, or mark the outcome with{" "}
            <code className="text-fg">status: &quot;won&quot;</code> / <code className="text-fg">&quot;lost&quot;</code>.
          </p>
          <Code>{`curl -X PATCH ${BASE}/api/v1/deals/o_123 \\
  -H "Authorization: Bearer rr_live_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"won"}'

# 200 OK
{ "ok": true, "deal": { "id": "o_123", "title": "Acme — Jane Doe", "stage": "Won" } }`}</Code>
        </Section>

        <Section id="form" title="Embeddable capture form">
          <p>
            Prefer no code? Embed your hosted form — every submission becomes a worked lead. Copy the iframe from
            Settings → Developer (it carries a write-only token, safe for public pages).
          </p>
          <Code>{`<iframe src="${BASE}/f/YOUR_ORG?k=YOUR_FORM_TOKEN"
  title="Contact form" width="100%" height="520"
  style="border:0;max-width:480px" loading="lazy"></iframe>`}</Code>
        </Section>

        <Section id="webhooks" title="Webhooks">
          <p>
            Set an https endpoint in Settings → Developer to receive events. We POST signed JSON. Events:{" "}
            <code className="text-fg">lead.created</code> (every API and form capture),{" "}
            <code className="text-fg">contact.created</code>, <code className="text-fg">contact.updated</code>,{" "}
            <code className="text-fg">deal.created</code>, <code className="text-fg">deal.stage_changed</code>,{" "}
            <code className="text-fg">deal.won</code>, and <code className="text-fg">deal.lost</code>. Verify each
            delivery with the signing secret shown when you save the endpoint.
          </p>
          <Code>{`POST (your endpoint)
X-RR-Event: lead.created
X-RR-Signature: sha256=<hmac>
Content-Type: application/json

{ "event": "lead.created", "data": { "contactId": "c_…", "dealId": "o_…",
  "name": "Jane Doe", "email": "jane@acme.com" }, "sentAt": "2026-01-01T00:00:00.000Z" }`}</Code>
          <p>Verify the signature (Node.js):</p>
          <Code>{`import crypto from "node:crypto";

function verify(rawBody, signatureHeader, secret) {
  const expected = "sha256=" + crypto.createHmac("sha256", secret)
    .update(rawBody, "utf8").digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}`}</Code>
        </Section>

        <div className="border-t border-border py-10 text-sm text-muted">
          Ready to wire it up? <Link href="/signup" className="text-brand hover:underline">Create an account</Link> and open
          Settings → Developer.
        </div>
      </main>
      <Footer />
    </div>
  );
}
