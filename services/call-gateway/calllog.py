"""Loop-closing call-status post-back — stdlib only (no FastAPI), so it's unit-
testable in the gateway's dependency-free test suite.

The POST here is the ONLY path a finished call's transcript + outcome reaches the
CRM, so it retries with backoff and reports whether it actually got delivered.
"""
import json
import time
import urllib.request


def transcript_text(turns) -> str:
    """Render the agent's turns as a readable transcript for the CRM timeline."""
    label = {"rep": "Rep", "prospect": "Prospect"}
    return "\n".join(
        f"{label.get(t.get('role'), t.get('role', '?'))}: {t.get('text', '')}".strip()
        for t in turns
    )


def post_call_status(
    url,
    token,
    payload,
    *,
    urlopen=urllib.request.urlopen,
    sleep=time.sleep,
    attempts: int = 3,
    log=None,
) -> bool:
    """POST a finished call's transcript/outcome to the app. Returns True when
    delivered, False when it couldn't be (so the caller can surface the loss).

    `urlopen` and `sleep` are injectable so the retry/backoff is testable without
    real network or real delays. With no url configured it returns False WITHOUT
    attempting a request — the classic "calls happen but leave no trace" misconfig.
    """
    if not url:
        if log:
            log.error("CALL_STATUS_WEBHOOK_URL unset — call transcript not delivered")
        return False
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    for attempt in range(attempts):
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urlopen(req, timeout=10) as resp:  # noqa: S310 (operator-configured URL)
                resp.read()
            return True
        except Exception as e:  # never let logging-back break the call
            if log:
                log.warning("call status post failed (attempt %d/%d): %s", attempt + 1, attempts, e)
            if attempt < attempts - 1:
                sleep(2 ** attempt)  # 1s, then 2s
    if log:
        log.error("call status permanently undelivered for %s — transcript not logged", payload.get("to"))
    return False
