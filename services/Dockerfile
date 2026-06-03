# Combined "call-stack" image: the in-house neural voice AND the call-gateway in
# ONE container, so the whole calling stack deploys as a single service from a
# single image URL — no Blueprint, no private-network wiring, and no Render<->
# GitHub connection required. Build context is services/ :
#
#   docker build -f services/Dockerfile -t call-stack services
#
# The gateway listens on $PORT (public, for Twilio + the app); the neural voice
# stays internal on loopback :8765. start.sh launches both.
FROM python:3.11-slim

WORKDIR /app

# espeak-ng: TTS phonemizer backend · ffmpeg: faster-whisper audio · curl: model fetch.
RUN apt-get update && apt-get install -y --no-install-recommends \
      espeak-ng ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps first (best layer caching).
COPY requirements-combined.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Bake the Kokoro voice model so a fresh container can speak immediately.
WORKDIR /app/neural-voice
RUN curl -fL -o kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx \
 && curl -fL -o voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

# Bake the Whisper STT model (base.en) so the first call doesn't wait on a download.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8')"

# App code for both halves + the launcher. (Baked models above survive these
# COPYs — they aren't in the source tree.)
COPY neural-voice/ /app/neural-voice/
COPY call-gateway/ /app/call-gateway/
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# The gateway reaches the in-house voice on loopback; the voice binds :8765.
ENV NEURAL_VOICE_HOST=127.0.0.1 \
    NEURAL_VOICE_PORT=8765 \
    VOICE_ENGINE=kokoro \
    WHISPER_MODEL=base.en

WORKDIR /app
CMD ["/app/start.sh"]
