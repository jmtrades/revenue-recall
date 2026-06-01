"""Call-gateway HTTP/WS server.

- POST /voice : the app's comms webhook contract — place an in-house call.
- POST /sms   : optional, send SMS over the same trunk (seam).
- WS /media/<id> : FreeSWITCH connects here; we run the live agent on the call.
- GET /health : liveness + which in-house pieces are wired.
"""
import uuid

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

import config
from agent import CallAgent, DEFAULT_OPENER
from transport import WebSocketMediaTransport

app = FastAPI(title="Revenue Recall — in-house call gateway")

# call_id -> context passed from /voice to the media agent.
_pending: dict[str, dict] = {}


def _authorized(request: Request) -> bool:
    """Verify the app's shared webhook secret (COMMS_WEBHOOK_TOKEN)."""
    if not config.COMMS_WEBHOOK_TOKEN:
        return True  # no secret configured → open (set one in prod)
    return request.headers.get("authorization", "") == f"Bearer {config.COMMS_WEBHOOK_TOKEN}"


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "voice": bool(config.NEURAL_VOICE_URL),
        "brain": bool(config.ANTHROPIC_API_KEY),
        "trunk": bool(config.SIP_TRUNK_GATEWAY),
    }


@app.post("/voice")
async def voice(request: Request):
    if not _authorized(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    body = await request.json()
    to = (body or {}).get("to")
    if not to:
        return JSONResponse({"error": "missing 'to'"}, status_code=400)
    call_id = uuid.uuid4().hex
    # Optional richer context the app can send (deal/contact/brief) — used by the
    # agent for what to say. Falls back to a generic opener if absent.
    _pending[call_id] = {
        "context": (body or {}).get("context", ""),
        "voiceId": (body or {}).get("voiceId"),
        "opener": (body or {}).get("opener"),
    }
    try:
        from sip import originate

        reply = originate(to, call_id)
    except Exception as e:  # FreeSWITCH/trunk not reachable from here — surfaced honestly
        return JSONResponse({"id": call_id, "status": "failed", "provider": "call-gateway", "detail": str(e)}, status_code=502)
    return {"id": call_id, "status": "queued", "provider": "call-gateway", "detail": reply.strip()}


@app.post("/sms")
async def sms(request: Request):
    if not _authorized(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    # SMS over your SIP trunk is provider-specific (SMPP or the trunk's REST API).
    # Wire it here; until then the app's own SMS_WEBHOOK_URL/Twilio path can serve.
    return JSONResponse({"status": "not_implemented", "provider": "call-gateway",
                         "detail": "Wire your SIP-trunk SMS API here."}, status_code=501)


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
    try:
        await agent.run(transport)
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass
    # NOTE: post-call, POST agent.turns back to the app to log the call + outcome.
