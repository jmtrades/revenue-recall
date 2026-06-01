"""FreeSWITCH bridge — call control over ESL. Places the outbound PSTN call via
YOUR SIP trunk and forks its media to our agent WebSocket.

This is the seam that needs your infrastructure (FreeSWITCH + a SIP trunk); it
can't run from CI without a trunk + a phone. The dialplan/media wiring is in the
README. `originate()` itself speaks the real ESL inbound protocol.
"""
import socket

from config import (
    FREESWITCH_ESL_HOST,
    FREESWITCH_ESL_PORT,
    FREESWITCH_ESL_PASSWORD,
    SIP_TRUNK_GATEWAY,
    CALLER_ID,
    PUBLIC_WS_BASE,
)


def _read_block(f) -> str:
    headers = {}
    while True:
        line = f.readline().decode("utf-8", "replace").strip()
        if line == "":
            break
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip()] = v.strip()
    n = int(headers.get("Content-Length", "0") or 0)
    return f.read(n).decode("utf-8", "replace") if n else ""


def _esl_api(command: str) -> str:
    """Minimal ESL inbound client: connect, authenticate, run one `api` command."""
    if not FREESWITCH_ESL_PASSWORD:
        raise RuntimeError("FREESWITCH_ESL_PASSWORD not set — set your FreeSWITCH ESL password")
    s = socket.create_connection((FREESWITCH_ESL_HOST, FREESWITCH_ESL_PORT), timeout=10)
    try:
        f = s.makefile("rwb")
        _read_block(f)  # auth/request banner
        f.write(f"auth {FREESWITCH_ESL_PASSWORD}\n\n".encode())
        f.flush()
        _read_block(f)
        f.write(f"api {command}\n\n".encode())
        f.flush()
        return _read_block(f)
    finally:
        s.close()


def originate(to: str, call_id: str) -> str:
    """Dial `to` over your SIP trunk; FreeSWITCH forks audio to /media/<call_id>.

    The agent WebSocket then runs the conversation. Configure mod_audio_fork (or a
    socket app) in your dialplan to stream to PUBLIC_WS_BASE/media/<call_id> — see
    the README. Returns the raw ESL reply (UUID on success)."""
    if not SIP_TRUNK_GATEWAY:
        raise RuntimeError("SIP_TRUNK_GATEWAY not set — add your SIP trunk as a FreeSWITCH gateway")
    ws_url = f"{PUBLIC_WS_BASE}/media/{call_id}"
    variables = f"{{origination_caller_id_number={CALLER_ID},rr_call_id={call_id},rr_media_ws={ws_url}}}"
    # The dialplan extension `rr_agent` (README) attaches mod_audio_fork to rr_media_ws.
    command = f"originate {variables}sofia/gateway/{SIP_TRUNK_GATEWAY}/{to} &lua(rr_agent.lua)"
    return _esl_api(command)
