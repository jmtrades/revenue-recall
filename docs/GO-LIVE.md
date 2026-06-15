# Go-Live Runbook — Revenue Recall

This is the single source of truth for taking **this repo** (`jmtrades/revenue-recall`)
live. It exists because three things had drifted apart:

| Thing | What it is |
|---|---|
| **`jmtrades/revenue-recall`** (this repo) | **Canonical app.** All current engineering lands here. |
| `jmtrades/Revenue-operator` (separate repo) | An older codebase the team Vercel projects (`revenue`, `revenue-operator`) point at. **Not used.** |
| `recall-touch.com` | The production domain — on a **personal** Vercel account. Must be pointed at this repo. |

Everything below is the part that can only be done from your own Vercel/Supabase/
provider dashboards (it can't be done from inside the codebase). Do it once and
the app is fully live.

---

## 1. Point the production Vercel project at this repo

In the Vercel account that owns **recall-touch.com**:

1. Open the project serving `recall-touch.com` → **Settings → Git**.
2. **Disconnect** the current repo and **connect `jmtrades/revenue-recall`**,
   production branch `main`.
   - (Or create a new project from `jmtrades/revenue-recall` and move the
     `recall-touch.com` domain onto it under **Settings → Domains**.)
3. Framework preset: **Next.js**. Build command and output are auto-detected.

> Until this is done, anything merged here never reaches the live site.

---

## 2. Environment variables (Vercel → Settings → Environment Variables)

Set these for **Production** (and Preview, if you use preview deploys), then
**redeploy** — Vercel does not apply new env vars to existing builds.

### Required — the app needs these to persist users and run

```
NEXT_PUBLIC_SUPABASE_URL=https://zzdnnxqewqlfrdmbxwln.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase → Project Settings → API → anon/public key>
SUPABASE_SERVICE_ROLE_KEY=<copy from Supabase → Project Settings → API → service_role>
ENCRYPTION_KEY=<32+ char random string — generate one (see below)>
NEXT_PUBLIC_SITE_URL=https://www.recall-touch.com
ADMIN_TOKEN=<random string — generate one (see below)>
```

> The actual values for the anon key, `ENCRYPTION_KEY`, and `ADMIN_TOKEN` were
> shared with you directly in chat — paste those. They are **not** committed to
> this repo on purpose: secrets in source get flagged by the secret scanner and
> leak in git history. Generate fresh ones any time with:
>
> ```
> node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
> ```

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe to expose (it's the public anon key),
  but it still isn't committed here — grab it from the dashboard or chat.
- `SUPABASE_SERVICE_ROLE_KEY` is secret — get it from the Supabase dashboard
  (Project `zzdnnxqewqlfrdmbxwln` → Settings → API → `service_role`). Keep it
  server-side only; never expose it.
- With Supabase set, sign-in is always required and **every user gets their own
  private org** automatically. No `NEXT_PUBLIC_AUTH_REQUIRED` needed.

### Sample data — locked to your account only

```
OPERATOR_EMAIL=jmtrades1990@gmail.com
SAMPLE_DATA_EMAILS=jmtrades1990@gmail.com
```

Demo data only ever loads for these emails. Every other new signup starts empty.

### Lifelike voice (ElevenLabs)

```
ELEVENLABS_API_KEY=<your ElevenLabs key — elevenlabs.io/app/settings/api-keys>
ELEVENLABS_AGENT_ID=<optional: agent_… for the live two-way voice agent>
```

- The whole voice surface self-gates on `ELEVENLABS_API_KEY`. Set it, **redeploy**,
  then in **Settings → Read-aloud voice** you can pick any account voice, **browse
  + add from the full public library**, clone your own, and tune speed/expressiveness.
- If the in-app card still says "not connected" after redeploy, it now prints the
  exact reason (`no_key` vs key-rejected vs not-entitled) — read that, don't guess.
- `ELEVENLABS_AGENT_ID` is only for the live conversational agent (create the agent
  in the ElevenLabs dashboard first). Optional; the rest of the voice works without it.

### Sending channel (required before real outreach goes out)

Pick one email path so sequences/replies can actually send (until then they queue
to Approvals):

```
RESEND_API_KEY=<from resend.com>      # simplest
EMAIL_FROM=sales@recall-touch.com
COMPLIANCE_ADDRESS=<your physical postal address — legally required for email>
```

For SMS + voice calls, add Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM_NUMBER`) or point `SMS_WEBHOOK_URL` / `VOICE_WEBHOOK_URL` at your gateway.

### Recommended secrets

Generate one random value per line and paste (the generated values were also
shared with you in chat):

```
CRON_SECRET=<random>
UNSUBSCRIBE_SECRET=<random>
INBOUND_SIGNING_SECRET=<random>
```

Generate with: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`

### Optional — better AI drafting, billing

```
ANTHROPIC_API_KEY=<for tailored AI outreach; without it, high-quality templates>
STRIPE_SECRET_KEY=...  STRIPE_WEBHOOK_SECRET=...  STRIPE_PUBLISHABLE_KEY=...
STRIPE_PRICE_GROWTH=...  STRIPE_PRICE_TEAM=...  STRIPE_PRICE_SCALE=...
```

---

## 3. Supabase auth configuration (Supabase dashboard)

In project **`zzdnnxqewqlfrdmbxwln`**:

1. **Authentication → URL Configuration**
   - Site URL: `https://www.recall-touch.com`
   - Redirect URLs: add `https://www.recall-touch.com/**`
2. **Authentication → Providers → Email**: enabled (on by default).
3. *(Optional Google sign-in)* **Providers → Google**: enable it and paste your
   Google OAuth client id/secret. The callback URL Supabase shows you goes into the
   Google Cloud console's "Authorized redirect URIs".

The database schema + RLS are already migrated on this project — nothing to run.

---

## 4. After the first deploy

1. Redeploy so all env vars apply.
2. Visit `https://www.recall-touch.com/api/health` — it reports readiness and any
   remaining blockers.
3. Sign up / sign in with `jmtrades1990@gmail.com` → you get the demo workspace.
4. Settings → confirm the ElevenLabs voice card is green; pick/clone a voice.
5. Send yourself a test from a sequence to confirm the sending channel works.

---

## Quick reference — what only you can do vs. what's already done

**Already done (in this repo, verified green):** all app code, the full ElevenLabs
voice library (account + public-library browse/add + cloning + tuning), user/org
persistence, RLS, sample-data lockdown to your email, the Supabase schema migration.

**Only you can do (dashboards):** §1 repo repointing, §2 env vars + redeploy,
§3 Supabase auth URLs, provider keys (ElevenLabs, Resend/Twilio, Stripe).
