"""Call-gateway HTTP/WS server.

- POST /voice : the app's comms webhook contract — place an in-house call.
- POST /sms   : optional, send SMS over the same trunk (seam).
- WS /media/<id> : FreeSWITCH connects here; we run the live agent on the call.
- GET /health : liveness + which in-house pieces are wired.
"""
import asyncio
import hmac
import json
import logging
import os
import re
import time
import urllib.request
import uuid

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

import config
from agent import CallAgent, DEFAULT_OPENER
from transport import WebSocketMediaTransport
from twilio_media import TwilioMediaTransport

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("call-gateway")

app = FastAPI(title="Revenue Recall — in-house call gateway")

# call_id -> context passed from /voice to the media agent.
_pending: dict[str, dict] = {}


def _transcript_text(turns: list[dict]) -> str:
    """Render the agent's turns as a readable transcript for the CRM timeline."""
    label = {"rep": "Rep", "prospect": "Prospect"}
    return "\n".join(f"{label.get(t.get('role'), t.get('role', '?'))}: {t.get('text', '')}".strip() for t in turns)


def _post_call_status(payload: dict) -> None:
    """POST a finished call's transcript + outcome to the app (best-effort, blocking;
    call via asyncio.to_thread). Uses stdlib only — no extra dependency."""
    url = config.CALL_STATUS_WEBHOOK_URL
    if not url:
        return
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if config.COMMS_WEBHOOK_TOKEN:
        headers["Authorization"] = f"Bearer {config.COMMS_WEBHOOK_TOKEN}"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 (operator-configured URL)
            resp.read()
    except Exception as e:  # never let logging-back break the call
        log.warning("call status post failed: %s", e)


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
    # Optional richer context the app can send (deal/contact/brief) — used by the
    # agent for what to say. Falls back to a generic opener if absent.
    _pending[call_id] = {
        "to": to,
        "context": (body or {}).get("context", ""),
        "voiceId": (body or {}).get("voiceId"),
        "opener": (body or {}).get("opener"),
        "meta": (body or {}).get("meta") or {},
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


@app.post("/sms")
async def sms(request: Request):
    if not _authorized(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    # SMS over your SIP trunk is provider-specific (SMPP or the trunk's REST API).
    # Wire it here; until then the app's own SMS_WEBHOOK_URL/Twilio path can serve.
    return JSONResponse({"status": "not_implemented", "provider": "call-gateway",
                         "detail": "Wire your SIP-trunk SMS API here."}, status_code=501)


async def _finish_call(call_id: str, ctx: dict, agent: CallAgent, started: float) -> None:
    """Close the loop after any call (FreeSWITCH or Twilio): POST the transcript +
    heuristic outcome back to the app so it lands on the CRM timeline."""
    heard_prospect = any(t.get("role") == "prospect" for t in agent.turns)
    payload = {
        "to": ctx.get("to"),
        "meta": ctx.get("meta") or {},
        "outcome": "completed" if heard_prospect else "no-answer",
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
    agent = CallAgent(context=ctx.get("context", ""), voice_id=ctx.get("voiceId"), opener=ctx.get("opener") or DEFAULT_OPENER)
    started = time.monotonic()
    try:
        await agent.run(transport)
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
    )
    started = time.monotonic()
    try:
        await agent.run(transport)
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass
    await _finish_call(call_id, ctx, agent, started)
