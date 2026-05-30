# In-house neural voice service — self-hosted, no vendor API in the hot path.
# CPU image (works anywhere). For GPU, base on an nvidia/cuda image and install
# the CUDA onnxruntime; synthesize() is unchanged.
FROM python:3.11-slim

WORKDIR /app

# espeak-ng is Piper's phonemizer backend.
RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the default voice into the image so a fresh container is ready to speak.
# download_voices saves into the working dir; _resolve_model_path() finds it there.
ARG PIPER_VOICE=en_US-amy-medium
ENV PIPER_VOICE=${PIPER_VOICE}
RUN python -m piper.download_voices ${PIPER_VOICE}

COPY server.py .

EXPOSE 8765
ENV NEURAL_VOICE_HOST=0.0.0.0 NEURAL_VOICE_PORT=8765
CMD ["python", "server.py"]
