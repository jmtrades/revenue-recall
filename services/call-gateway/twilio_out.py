"""Place an outbound call via Twilio's REST API, bridging the call's media to
this gateway's /twilio/media WebSocket with inline TwiML <Connect><Stream>. The
agent (STT → Opus → neural voice) then runs the conversation. Stdlib only — no
Twilio SDK dependency."""
import base64
import json
import urllib.parse
import urllib.request
from xml.sax.saxutils import quoteattr

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


def originate(to: str, call_id: str) -> str:
    """Dial `to` and stream media to us. Returns the Twilio call SID. Raises on
    a non-2xx so the caller can surface the failure honestly."""
    sid = config.TWILIO_ACCOUNT_SID
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Calls.json"
    form = urllib.parse.urlencode({
        "To": to,
        "From": config.TWILIO_FROM_NUMBER,
        "Twiml": _twiml(call_id),
    }).encode("utf-8")
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
