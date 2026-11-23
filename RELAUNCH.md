# Relaunch

What has to be true before Revenue Recall dials real people off a webinar, and which of those values are secrets only Junior can paste.

The app boots with nothing set (in-memory demo, no live sends). Webinar recovery is inert until `WEBINAR_WEBHOOK_SECRET` is set. A leave webhook still will not place a real call until a voice transport is configured. "Logged" in the health check means the step was decided and not sent.

## Ask Junior for these secrets

Paste each value into the host's environment. No other action is required from him for the app to read them. Webhook URLs and dashboard clicks are listed separately so they are not mixed into this list.

None of these are in the repo, and none were set in the workspace this change was built in (checked 2026-11-23). Production may already have some of them on the host. This list is what the code reads.

| Secret | Required for | In this workspace |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Database | Missing |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Database + auth | Missing |
| `SUPABASE_SERVICE_ROLE_KEY` | Server writes, provisioning | Missing |
| `ENCRYPTION_KEY` | Encrypt stored connection secrets; signs call meta | Missing |
| `ADMIN_TOKEN` | `/api/admin/bootstrap`, `/api/webinar/status`, operator health detail | Missing |
| `CRON_SECRET` | `/api/agent/cron` and `/api/webinar/tick` | Missing |
| `INBOUND_SIGNING_SECRET` or `INBOUND_TOKEN` | Org-scoped webhook token (`?org=&t=`) | Missing |
| `WEBINAR_WEBHOOK_SECRET` | Authenticate webinar webhooks | Missing |
| `ZOOM_WEBHOOK_SECRET` | Zoom signature, if Zoom is the webinar platform | Missing |
| `DEMIO_WEBHOOK_SECRET` | Demio, if used (falls back to `WEBINAR_WEBHOOK_SECRET`) | Missing |
| `WEBINARJAM_WEBHOOK_SECRET` | WebinarJam / EverWebinar, if used | Missing |
| `GOTO_WEBHOOK_SECRET` | GoTo Webinar, if used | Missing |
| `ANTHROPIC_API_KEY` | Live replies and call brain | Missing |
| `ELEVENLABS_API_KEY` | Spoken voice | Missing |
| `ELEVENLABS_AGENT_ID` | Live two-way call agent | Missing |
| `VOICE_WEBHOOK_URL` | Where the app POSTs the outbound call (the call gateway) | Missing |
| `COMMS_WEBHOOK_TOKEN` | Bearer the gateway and the app share | Missing |
| `CALL_STATUS_WEBHOOK_URL` | Gateway → `https://<host>/api/calls/log` | Missing |
| `TWILIO_ACCOUNT_SID` | SMS + dialing, if not using the generic voice/SMS webhooks | Missing |
| `TWILIO_AUTH_TOKEN` | Twilio | Missing |
| `TWILIO_FROM_NUMBER` | Caller ID / SMS from | Missing |
| `RESEND_API_KEY` or `SENDGRID_API_KEY` | Email | Missing |
| `EMAIL_FROM` | From address on a domain you control | Missing |
| `COMPLIANCE_ADDRESS` | Postal address in commercial email | Missing |
| `STRIPE_SECRET_KEY` | Billing | Missing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhooks | Missing |
| `STRIPE_PUBLISHABLE_KEY` | Embedded checkout | Missing |
| Price ids (`STRIPE_PRICE_GROWTH`, `_TEAM`, `_SCALE`, annual, top-ups) | Checkout | Missing |

Set these attestations only after the underlying account work is done. They are not passwords. Until they are `true`, autonomous email/SMS is held rather than sent.

| Flag | Meaning |
| --- | --- |
| `EMAIL_DOMAIN_VERIFIED=true` | SPF, DKIM, and DMARC pass for `EMAIL_FROM` |
| `SMS_A2P_REGISTERED=true` | A2P 10DLC brand + campaign approved (US SMS). UK SMS uses the same gate as a "this sender is registered" switch. |

Optional, already defaulted in code (do not set unless you want to change the limit): every `WEBINAR_MAX_*`, `WEBINAR_QUIET_*`, `WEBINAR_BLOCK_SUNDAY`, `WEBINAR_REQUIRE_*_CONSENT`, `WEBINAR_LIVE_CALL_OVERRIDE`, `WEBINAR_DEFAULT_TIMEZONE` (`Europe/London`).

`SUPABASE_DB_URL` is the Postgres connection string if migrations are applied with `npm run db:migrate` instead of the Supabase dashboard. It is a secret. Migration `0059_webinar.sql` has to be applied before webinar rows will persist. Without it the process falls back to memory and a restart loses in-flight recovery.

## Webhook URLs

These are not secrets. They are the addresses to paste into provider dashboards once the secrets above exist. `GET /api/webinar/status` with `Authorization: Bearer <ADMIN_TOKEN>` returns the org-scoped webinar URL.

| Purpose | URL |
| --- | --- |
| Webinar events | `https://<host>/api/webinar/events?org=<ORG_ID>&t=<inbound token>&provider=zoom` (or `demio`, `goto`, `webinarjam`, `generic`) |
| Zoom validation + events | Same URL. Zoom's URL-validation handshake is handled. Header `x-zm-signature`. |
| Recovery tick | `https://<host>/api/webinar/tick` with `Authorization: Bearer <CRON_SECRET>`. `vercel.json` schedules this every minute. Vercel Hobby only allows a daily cron; a minute schedule needs Pro, or any external pinger hitting that URL. |
| Autopilot cron | `https://<host>/api/agent/cron` (also drains due webinar steps once an hour) |
| Inbound SMS | `https://<host>/api/inbound/sms?org=<ORG_ID>&t=<token>` |
| Call outcomes | `https://<host>/api/calls/log` |
| Stripe | `https://<host>/api/billing/webhook` |
| Health | `https://<host>/api/health` |

Generic events are JSON. HMAC-SHA256 of the raw body, hex, header `x-webinar-signature` (`sha256=` prefix optional). The same secret is accepted as `?token=` when a provider cannot sign.

Minimum leave payload:

```json
{
  "id": "evt_123",
  "type": "attendance.left",
  "occurredAt": "2026-11-25T15:04:00.000Z",
  "session": {
    "id": "sess_1",
    "title": "Offer workshop",
    "phase": "live",
    "offerAt": "2026-11-25T15:40:00.000Z",
    "rejoinUrl": "https://...",
    "replayUrl": "https://..."
  },
  "registrant": {
    "email": "sam@example.com",
    "phone": "+447700900123",
    "name": "Sam Taylor",
    "timezone": "Europe/London",
    "consent": { "call": true, "sms": true }
  }
}
```

`consent.call` and `consent.sms` must be true or the call/SMS is skipped. The email on the registration is enough for email about that event.

Other `type` values: `registrant.registered`, `attendance.joined`, `attendance.replay_started`, `attendance.replay_completed`, `session.upsert` with `phase` `ended`.

## Order of operations

1. Paste the Supabase keys. Apply migrations through `0059_webinar.sql`.
2. Paste `ENCRYPTION_KEY`, `ADMIN_TOKEN`, `CRON_SECRET`, `INBOUND_SIGNING_SECRET`.
3. `POST /api/admin/bootstrap` with the admin token once, if the project has no org yet. Copy the org id.
4. Paste `WEBINAR_WEBHOOK_SECRET` and `WEBINAR_BEACON_TOKEN`, plus the secret for each platform you actually use (table below).
5. Paste voice: `VOICE_WEBHOOK_URL` + `COMMS_WEBHOOK_TOKEN` + `CALL_STATUS_WEBHOOK_URL`, or the three Twilio variables. For the spoken voicemail drop and the conversational agent, the voice URL has to be the call gateway, not a static TwiML bin.
6. Paste `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`.
7. Paste `ANTHROPIC_API_KEY`.
8. Paste email (`RESEND_API_KEY` or `SENDGRID_API_KEY`, `EMAIL_FROM`, `COMPLIANCE_ADDRESS`) and set `EMAIL_DOMAIN_VERIFIED=true` after DNS is in place.
9. For US SMS, finish A2P and set `SMS_A2P_REGISTERED=true`.
10. Paste Stripe keys if billing should enforce.
11. Open `/api/health` with the admin token. `launch.ready` should be true and `capabilities.webinar` true. Warnings that remain name the channel that is still log-only.

## Checks

- `GET /api/health` — public verdict. With the admin bearer, blocker text is included. `capabilities.webinar` is true when any webinar secret is set. `capabilities.webinarPlatforms` is one row per platform (`id`, `armed`, `detection`) and does not include secrets.
- `GET /api/webinar/status` — counts by lifecycle state, the compliance limits in effect, and the webhook URL. No phone numbers.
- Admin → Webinar platforms lists every platform and whether its secret is set.
- A leave event's response includes `latencyMs`: milliseconds from receipt to call initiation. The scenario test S34 locks this under 1000ms.

## Per-platform secrets and setup

Webhook URL for every platform that can POST: `https://<host>/api/webinar/events?org=<ORG_ID>&t=<org token>&provider=<id>`. GoTo also sends a GET to that URL to validate it; the route returns 200. Signature headers are checked when the platform's secret is set. `?token=<secret>` is accepted when a platform cannot sign.

Beacon, for every platform that has no leave webhook. Paste on a page you control (not inside Zoom, YouTube, Vimeo, or StreamYard):

```html
<script>
  window.RR_WEBINAR = {
    endpoint: "https://<host>/api/webinar/beacon?org=<ORG_ID>&t=<org token>&provider=webinarjam",
    sessionId: "SESSION",
    email: "person@example.com",
    phone: "+447700900123",
    name: "Sam Taylor",
    provider: "webinarjam",
    consent: { call: true, sms: true }
  };
</script>
<script src="https://<host>/api/webinar/beacon.js"></script>
```

| Platform | `provider=` | Secret to paste | Events to subscribe | Leave latency |
| --- | --- | --- | --- | --- |
| Zoom Webinars and Meetings | `zoom` | `ZOOM_WEBHOOK_SECRET` | `webinar.participant_joined`, `webinar.participant_left`, `webinar.registration_created`, `webinar.ended`, and the same four with `meeting.` instead of `webinar.`. Zoom also sends `endpoint.url_validation`. | Real-time webhook. A few seconds for Zoom to deliver, then under a second here. |
| GoTo Webinar | `goto` | `GOTO_WEBHOOK_SECRET` | `registrant.added`, `registrant.joined`, `webinar.created`, `webinar.changed`. There is no `registrant.left`. | Join is a webhook. Leave is the beacon (pagehide immediate, missed heartbeat ~12s) unless you relay `attendance.left`. |
| Demio | `demio` | `DEMIO_API_KEY`, `DEMIO_API_SECRET`, `DEMIO_DATE_IDS` | None. Demio does not offer webhooks. | Beacon during the session. The participants report (`left early`, `did not attend`) is polled after the session when `DEMIO_DATE_IDS` is set. |
| WebinarJam | `webinarjam` | `WEBINARJAM_WEBHOOK_SECRET` | registration, attended | Beacon. No leave webhook. |
| EverWebinar | `everwebinar` | `WEBINARJAM_WEBHOOK_SECRET` (same account as WebinarJam) | registration, attended | Beacon. No leave webhook. |
| Livestorm | `livestorm` | `LIVESTORM_WEBHOOK_SECRET` | `people.registered`, `session.started`, `session.ended`, `people.attended`, `people.not_attended`, `people.watched_replay` | Those attendance events fire after the session. Live leave is the beacon. |
| WebinarGeek | `webinargeek` | `WEBINARGEK_WEBHOOK_SECRET` | `webinar_subscribed`, `new_viewer_started_watching`, `new_viewer`, `new_replay_viewer`. Header `Signature` is HMAC-SHA256 of the body. | "Started watching" is when they open the page. "New viewer" is up to 2 hours after they leave. Live leave is the beacon. |
| BigMarker | `bigmarker` | `BIGMARKER_WEBHOOK_SECRET` | new registration; live attendee data (sent when the session ends) | Registration is live. The attendee dump is end-of-session. Live leave is the beacon. |
| Zoho Webinar / Meeting | `zoho` | `ZOHO_WEBHOOK_SECRET` | `webinar_registered`, `webinar_member_joined`, `webinar_member_removed`, `webinar_started`, `webinar_ended` | Join and removal are webhooks. A tab close is the beacon. |
| ClickMeeting | `clickmeeting` | `CLICKMEETING_WEBHOOK_SECRET` | Relay a generic payload, or use the beacon. Connectors poll about every 15 minutes. | Beacon, or your own `attendance.left` POST. |
| ON24 | `on24` | `ON24_WEBHOOK_SECRET` | Relay a generic payload. Their console will not run the snippet. | Beacon on a page you own. |
| StreamYard | `streamyard` | `WEBINAR_BEACON_TOKEN` | None. Their room will not run the snippet. | Beacon on a wrapper page you own only. |
| Kajabi | `kajabi` | `KAJABI_WEBHOOK_SECRET` | Generic registration if you wire one. | Beacon on the Kajabi page. |
| Kartra | `kartra` | `KARTRA_WEBHOOK_SECRET` | Generic registration if you wire one. | Beacon on the Kartra page. |
| HighLevel | `highlevel` | `HIGHLEVEL_WEBHOOK_SECRET` | A workflow webhook in the generic shape for registration. | Beacon on the funnel page. |
| Riverside | `riverside` | `RIVERSIDE_WEBHOOK_SECRET` | None for an audience. | Beacon or a generic leave POST. |
| YouTube Live | `youtube` | `WEBINAR_BEACON_TOKEN` | None. youtube.com does not identify viewers. | Beacon only on your embed page. |
| Vimeo Live | `vimeo` | `WEBINAR_BEACON_TOKEN` | None. vimeo.com does not identify viewers. | Beacon only on your embed page. |
| Generic | `generic` | `WEBINAR_WEBHOOK_SECRET` | `attendance.left`, `attendance.joined`, `registrant.registered`, `session.upsert` | Under a second after your POST. |

`WEBINAR_BEACON_TOKEN` (or the org `t` token) authorizes `POST /api/webinar/beacon`. `WEBINAR_BEACON_GRACE_MS` defaults to 12000.

## Known gaps

- Zoom is the only vendor in this list with a documented real-time leave webhook. Everyone else is the beacon, a post-session report, or a generic POST you send yourself.
- The beacon cannot run inside Zoom, YouTube, Vimeo, StreamYard, or the ON24 console. It only sees pages you can edit.
- The minute tick places the 3-minute and 10-minute redials, and it is also what notices a missed heartbeat if the page never fired pagehide. Vercel Hobby cannot run a minute cron.
- Memory mode (no Supabase) drops recovery state and heartbeats on restart. Production needs the database and migration `0059_webinar.sql`.
