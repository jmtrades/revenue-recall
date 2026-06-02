FROM python:3.11-slim

WORKDIR /app

# ffmpeg backs faster-whisper's audio handling.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080
# Listen on $PORT when the host injects one (Render/Railway/Fly/etc.), else 8080.
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"]
