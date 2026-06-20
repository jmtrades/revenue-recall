# Call-gateway image: the live phone agent — local Whisper STT → Opus brain →
# ElevenLabs TTS — in one container, deployable from a single image URL (no
# Blueprint, no private-network wiring). Voice is ElevenLabs-only, so there is no
# in-house voice service to co-host any more. Build context is services/ :
#
#   docker build -f services/Dockerfile -t call-gateway services
#
# The gateway listens on $PORT (public, for Twilio + the app).
FROM python:3.11-slim

WORKDIR /app

# ffmpeg: faster-whisper audio · curl: model fetch.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps first (best layer caching).
COPY call-gateway/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Bake the Whisper STT model (base.en) so the first call doesn't wait on a download.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8')"

# App code. (The baked STT model above survives this COPY — it isn't in the tree.)
COPY call-gateway/ /app/call-gateway/

ENV WHISPER_MODEL=base.en

WORKDIR /app/call-gateway
# Public gateway on the host-injected $PORT (Render/Railway/Fly), else 8080.
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"]
