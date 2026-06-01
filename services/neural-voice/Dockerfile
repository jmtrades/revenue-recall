# In-house neural voice service — self-hosted, no vendor API in the hot path.
# CPU image (works anywhere). For GPU concurrency, base on an nvidia/cuda image
# and install kokoro-onnx[gpu]; server.py is unchanged.
FROM python:3.11-slim

WORKDIR /app

# espeak-ng is the phonemizer backend used by the TTS engines.
RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the Kokoro model into the image so a fresh container is ready to speak.
# Resolved from the working dir by _find() at runtime.
RUN curl -L -o kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx \
 && curl -L -o voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

# server.py imports text_norm (the spoken-form text front-end) — ship both.
COPY server.py text_norm.py ./

EXPOSE 8765
ENV NEURAL_VOICE_HOST=0.0.0.0 NEURAL_VOICE_PORT=8765 VOICE_ENGINE=kokoro
CMD ["python", "server.py"]
