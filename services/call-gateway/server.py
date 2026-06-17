"""Call-gateway HTTP/WS server.

- POST /voice : the app's comms webhook contract — place an in-house call.
- POST /sms   : optional, send SMS over the same trunk (seam).
- WS /media/<id> : FreeSWITCH connects here; we run the live agent on the call.
- GET /health : liveness + which in-house pieces are wired.
"""
import asyncio
import hmac
import logging
import os
import re
import time
import uuid

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

import amd
import calllog
import config
from agent import CallAgent, DEFAULT_OPENER
from transport import WebSocketMediaTransport
from twilio_media import TwilioMediaTransport

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("call-gateway")

app = FastAPI(title="Revenue Recall — in-house call gateway")

# call_id -> context passed from /voice to the media agent.
_pending: dict[str, dict] = {}

# call_id -> (Twilio AnsweredBy, monotonic ts). Populated by the async-AMD
# callback; consumed by _finish_call to log an accurate human/voicemail outcome.
_amd_results: dict[str, tuple[str, float]] = {}

# Calls that never open a media WS (no-answer, busy, voicemail-then-hangup,
# carrier reject, or Twilio failing to reach our wss) would otherwise leave their
# context in _pending forever. Reap entries older than this on each new call so a
# high-volume dialer can't grow _pending unbounded → OOM.
_PENDING_TTL_SEC = 300


def _reap_pending() -> None:
    now = time.monotonic()
    for cid in [c for c, ctx in _pending.items() if now - ctx.get("_ts", now) > _PENDING_TTL_SEC]:
        _pending.pop(cid, None)
    # An AMD verdict that arrives after its call already finished (or for a call
    # that never connected media) would otherwise linger forever — reap by TTL too.
    for cid in [c for c, (_, ts) in _amd_results.items() if now - ts > _PENDING_TTL_SEC]:
        _amd_results.pop(cid, None)


def _transcript_text(turns: list[dict]) -> str:
    """Render the agent's turns as a readable transcript for the CRM timeline."""
    return calllog.transcript_text(turns)


def _post_call_status(payload: dict) -> None:
    """POST a finished call's transcript + outcome to the app (best-effort, blocking;
    call via asyncio.to_thread). Delegates to the stdlib-only, unit-tested helper."""
    calllog.post_call_status(config.CALL_STATUS_WEBHOOK_URL, config.COMMS_WEBHOOK_TOKEN, payload, log=log)


def _authorized(request: Request) -> bool:
    """Verify the app's shared webhook secret (COMMS_WEBHOOK_TOKEN), constant-time.
    Fail CLOSED when no secret is set — an open call endpoint can burn real money.
    Set GATEWAY_ALLOW_INSECURE=true to deliberately allow it (local dev only)."""
    token = config.COMMS_WEBHOOK_TOKEN
    if not token:
        if os.environ.get("GATEWAY_ALLOW_INSECURE", "").lower() in ("1", "true", "yes"):
            return True
        log.error("refusing request: COMMS_WEBHOOK_TOKEN is not set (set it, or GATEWAY_ALLOW_INSECURE=true for local dev)")
        return False
    return hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {token}")


# A real dialable number — rejects SIP URIs, hostnames, paths, or script payloads
# that could turn originate() into an SSRF / call-routing abuse.
_PHONE_RE = re.compile(r"^\+?[0-9][0-9\s().\-]{5,38}$")


def _valid_number(to: str) -> bool:
    return bool(isinstance(to, str) and _PHONE_RE.match(to.strip()))


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "voice": bool(config.NEURAL_VOICE_URL),
        "brain": bool(config.ANTHROPIC_API_KEY),
        "trunk": bool(config.SIP_TRUNK_GATEWAY),
        "twilio": config.twilio_ready(),
        "transport": "twilio" if config.twilio_ready() else "freeswitch",
        "logsBack": bool(config.CALL_STATUS_WEBHOOK_URL),
        "amd": config.AMD_ENABLED,
    }


@app.post("/voice")
async def voice(request: Request):
    if not _authorized(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    body = await request.json()
    to = (body or {}).get("to")
    if not to:
        return JSONResponse({"error": "missing 'to'"}, status_code=400)
    if not _valid_number(to):
        return JSONResponse({"error": "invalid 'to' — must be a phone number"}, status_code=400)
    call_id = uuid.uuid4().hex
    _reap_pending()  # drop contexts from calls that never connected media
    # Optional richer context the app can send (deal/contact/brief) — used by the
    # agent for what to say. Falls back to a generic opener if absent.
    _pending[call_id] = {
        "to": to,
        "context": (body or {}).get("context", ""),
        "voiceId": (body or {}).get("voiceId"),
        "opener": (body or {}).get("opener"),
        # Spoken if the line goes to voicemail (when answering-machine detection is
        # wired at the telephony layer); carried here so the agent has it ready.
        "voicemail": (body or {}).get("voicemail"),
        "meta": (body or {}).get("meta") or {},
        "_ts": time.monotonic(),
    }
    # Per-call caller ID = this org's own number (the app sends it as "from");
    # falls back to TWILIO_FROM_NUMBER if absent. This is what makes every org
    # call from their OWN number rather than one shared line.
    frm = ((body or {}).get("from") or "").strip()
    # Twilio path (fastest, no FreeSWITCH) when configured; else the SIP trunk.
    provider = "twilio-stream" if config.twilio_ready() else "call-gateway"
    try:
        if config.twilio_ready():
            from twilio_out import originate
            reply = originate(to, call_id, frm)
        else:
            from sip import originate
            reply = originate(to, call_id)
    except Exception as e:  # carrier/trunk not reachable from here — surfaced honestly
        _pending.pop(call_id, None)
        return JSONResponse({"id": call_id, "status": "failed", "provider": provider, "detail": str(e)}, status_code=502)
    log.info("placed call %s to %s via %s", call_id, to, provider)
    return {"id": call_id, "status": "queued", "provider": provider, "detail": str(reply).strip()}


@app.post("/twilio/amd")
async def twilio_amd(request: Request):
    """Twilio async-AMD status callback: record the human/voicemail verdict for a
    call so _finish_call logs an accurate outcome (and the app fires its voicemail
    follow-up). Authenticated by a per-call token in the URL — Twilio can't send
    our bearer secret, and an unauthenticated mutation here could mislabel calls.
    Best-effort: a forged/garbled callback is simply ignored."""
    call_id = request.query_params.get("callId", "")
    secret = config.COMMS_WEBHOOK_TOKEN
    if secret:
        expected = amd.amd_token(call_id, secret)
        if not (expected and hmac.compare_digest(request.query_params.get("t", ""), expected)):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
    elif os.environ.get("GATEWAY_ALLOW_INSECURE", "").lower() not in ("1", "true", "yes"):
        log.error("refusing /twilio/amd: COMMS_WEBHOOK_TOKEN is not set")
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        form = await request.form()
    except Exception:
        form = {}
    answered_by = str(form.get("AnsweredBy", "")).strip()
    if call_id and answered_by:
        _amd_results[call_id] = (answered_by, time.monotonic())
        log.info("amd %s → %s (%s)", call_id, amd.classify(answered_by), answered_by)
    return JSONResponse({"ok": True})


@app.post("/sms")
async def sms(request: Request):
    if not _authorized(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    # SMS over your SIP trunk is provider-specific (SMPP or the trunk's REST API).
    # Wire it here; until then the app's own SMS_WEBHOOK_URL/Twilio path can serve.
    return JSONResponse({"status": "not_implemented", "provider": "call-gateway",
                         "detail": "Wire your SIP-trunk SMS API here."}, status_code=501)


async def _conduct(agent: CallAgent, transport, call_id: str) -> None:
    """Leave a prepared voicemail if Twilio AMD has ALREADY judged this a machine;
    otherwise run the live conversation. Fail-open: with no machine verdict present
    (the common case, incl. every live human), this behaves exactly as before — so
    a real person is never sent to voicemail by a missing or slow AMD signal."""
    verdict = _amd_results.get(call_id, ("", 0.0))[0] if call_id else ""
    if verdict and amd.is_machine(verdict) and getattr(agent, "voicemail", None):
        await agent.leave_voicemail(transport)
    else:
        await agent.run(transport)


async def _finish_call(call_id: str, ctx: dict, agent: CallAgent, started: float) -> None:
    """Close the loop after any call (FreeSWITCH or Twilio): POST the transcript +
    heuristic outcome back to the app so it lands on the CRM timeline."""
    heard_prospect = any(t.get("role") == "prospect" for t in agent.turns)
    # Prefer Twilio's AMD verdict (accurate human/voicemail) over the heard-a-prospect
    # heuristic; 'voicemail' is what drives the app's voicemail follow-up + retry.
    answered_by = (_amd_results.pop(call_id, ("", 0.0))[0]) if call_id else ""
    payload = {
        "callId": call_id,  # stable id so the app dedupes a retried post-back
        "to": ctx.get("to"),
        "meta": ctx.get("meta") or {},
        "outcome": amd.call_outcome(answered_by, heard_prospect),
        "transcript": _transcript_text(agent.turns),
        "durationSec": round(time.monotonic() - started, 1),
    }
    log.info("call %s ended (%s, %d turns)", call_id, payload["outcome"], len(agent.turns))
    await asyncio.to_thread(_post_call_status, payload)


@app.websocket("/twilio/media")
async def twilio_media(ws: WebSocket):
    """Twilio Media Streams connects here (via inline TwiML). We read the `start`
    event to learn the streamSid + which call this is (callId rides in as a custom
    parameter), then run the in-house agent over the bridged audio — no FreeSWITCH."""
    await ws.accept()
    transport = TwilioMediaTransport(ws)
    call_id = ""
    # Read leading events until the stream starts (connected → start).
    while not transport.closed():
        ev = await transport.recv_event()
        if ev is None:
            return
        if ev.get("event") == "start":
            start = ev.get("start", {}) or {}
            transport.stream_sid = start.get("streamSid") or ev.get("streamSid")
            call_id = (start.get("customParameters") or {}).get("callId", "")
            break
        if ev.get("event") == "stop":
            return
    ctx = _pending.pop(call_id, {}) if call_id else {}
    agent = CallAgent(context=ctx.get("context", ""), voice_id=ctx.get("voiceId"), opener=ctx.get("opener") or DEFAULT_OPENER, voicemail=ctx.get("voicemail"))
    started = time.monotonic()
    try:
        await _conduct(agent, transport, call_id)
    except WebSocketDisconnect:
        pass
    except Exception as e:  # pragma: no cover - defensive
        log.warning("twilio media error on %s: %s", call_id, e)
    finally:
        try:
            await ws.close()
        except Exception:
            pass
    await _finish_call(call_id, ctx, agent, started)


@app.websocket("/media/{call_id}")
async def media(ws: WebSocket, call_id: str):
    """FreeSWITCH (mod_audio_fork) streams call audio here; we run the agent."""
    await ws.accept()
    ctx = _pending.pop(call_id, {})
    transport = WebSocketMediaTransport(ws)
    agent = CallAgent(
        context=ctx.get("context", ""),
        voice_id=ctx.get("voiceId"),
        opener=ctx.get("opener") or DEFAULT_OPENER,
        voicemail=ctx.get("voicemail"),
    )
    started = time.monotonic()
    try:
        await _conduct(agent, transport, call_id)
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass
    await _finish_call(call_id, ctx, agent, started)
