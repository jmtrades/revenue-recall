"""Place an outbound call via Twilio's REST API, bridging the call's media to
this gateway's /twilio/media WebSocket with inline TwiML <Connect><Stream>. The
agent (STT → Opus → neural voice) then runs the conversation. Stdlib only — no
Twilio SDK dependency."""
import base64
import json
import urllib.parse
import urllib.request
from xml.sax.saxutils import quoteattr

import amd
import config


def _twiml(call_id: str) -> str:
    ws_url = config.PUBLIC_WSS_BASE.rstrip("/") + "/twilio/media"
    # <Parameter> rides into the Media Streams "start" event as customParameters,
    # so the media handler can look up this call's context/opener by callId.
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response><Connect>"
        f"<Stream url={quoteattr(ws_url)}>"
        f'<Parameter name="callId" value={quoteattr(call_id)}/>'
        "</Stream></Connect></Response>"
    )


def call_params(to: str, call_id: str, caller_id: str) -> dict:
    """Build the Twilio Calls.json form. Pure (no I/O) so it's unit-testable.

    When AMD is enabled, run it ASYNC (AsyncAmd=true): the <Connect><Stream> TwiML
    runs immediately so the agent is live, and Twilio POSTs the human/machine
    verdict to /twilio/amd in parallel — keyed by our callId and signed with a
    per-call token so the callback can't be spoofed."""
    params = {
        "To": to,
        "From": caller_id,
        "Twiml": _twiml(call_id),
    }
    if config.AMD_ENABLED and config.PUBLIC_HTTPS_BASE:
        cb = config.PUBLIC_HTTPS_BASE.rstrip("/") + "/twilio/amd?" + urllib.parse.urlencode(
            {"callId": call_id, "t": amd.amd_token(call_id, config.COMMS_WEBHOOK_TOKEN or "")}
        )
        params.update({
            "MachineDetection": "DetectMessageEnd",  # wait for the greeting to end
            "AsyncAmd": "true",                       # don't delay the live stream
            "AsyncAmdStatusCallback": cb,
            "AsyncAmdStatusCallbackMethod": "POST",
            "MachineDetectionTimeout": str(config.AMD_TIMEOUT_SEC),
        })
    return params


def originate(to: str, call_id: str, from_number: str = "") -> str:
    """Dial `to` and stream media to us. Returns the Twilio call SID. Raises on
    a non-2xx so the caller can surface the failure honestly. `from_number` is the
    per-call caller ID (this org's own number); falls back to TWILIO_FROM_NUMBER."""
    sid = config.TWILIO_ACCOUNT_SID
    caller_id = (from_number or config.TWILIO_FROM_NUMBER or "").strip()
    if not caller_id:
        raise RuntimeError("no caller-ID number (set the org's number, or TWILIO_FROM_NUMBER)")
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Calls.json"
    form = urllib.parse.urlencode(call_params(to, call_id, caller_id)).encode("utf-8")
    auth = base64.b64encode(f"{sid}:{config.TWILIO_AUTH_TOKEN}".encode()).decode("ascii")
    req = urllib.request.Request(
        url,
        data=form,
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 (fixed Twilio host)
        body = json.loads(resp.read().decode("utf-8"))
    return str(body.get("sid") or "")
