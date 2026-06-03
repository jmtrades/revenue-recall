#!/bin/sh
# Launch BOTH halves of the call stack in one container:
#   1) the in-house neural voice on loopback :8765 (internal only)
#   2) the public call-gateway on $PORT (Twilio + the app reach this)
# This is what lets the whole thing deploy as a single image / single service —
# no private-network wiring between two services.
set -eu

# Neural voice on 127.0.0.1:8765. It must NOT inherit the host's injected $PORT
# (that port belongs to the public gateway), so clear it for this process only.
( cd /app/neural-voice && exec env -u PORT NEURAL_VOICE_HOST=127.0.0.1 NEURAL_VOICE_PORT=8765 python server.py ) &

# Wait until the voice socket accepts connections so the first call never races a
# cold model load. Best-effort: continue after ~40s regardless.
python - <<'PY'
import socket, time, sys
for _ in range(80):
    try:
        socket.create_connection(("127.0.0.1", 8765), timeout=1).close()
        print("neural-voice: ready", flush=True)
        sys.exit(0)
    except OSError:
        time.sleep(0.5)
print("neural-voice: not ready after ~40s — continuing (it connects per call)", flush=True)
PY

# Public gateway on the host-injected $PORT (Render/Railway/Fly), else 8080.
cd /app/call-gateway
exec uvicorn server:app --host 0.0.0.0 --port "${PORT:-8080}"
