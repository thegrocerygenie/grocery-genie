# One image for the api, worker and beat services; compose picks the command.
# Build from the repo root: docker compose -f docker/docker-compose.yml build
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first, so a code-only change reuses this layer. They come
# from the lockfile export (make backend-lock), pinned with hashes, so every
# build installs the versions the tests ran on. Every runtime dependency ships
# a wheel (opencv-python-headless, psycopg[binary], asyncpg), so no compiler
# or system libraries are needed.
COPY backend/requirements.lock.txt .
RUN pip install --require-hashes -r requirements.lock.txt

COPY backend/ .

# Run as a non-root user. /app/storage is the receipt_images mount point; a
# new named volume takes this directory's owner, so the app can write to it.
RUN useradd --create-home --uid 1000 app \
    && mkdir -p /app/storage \
    && chown app:app /app/storage
USER app

# V1.1 item matching (PI-02): download the default embedding model
# (settings.embedding_model) now, so no container fetches it at runtime.
ENV HF_HOME=/home/app/.cache/huggingface
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2', device='cpu')"

EXPOSE 8000

# Caddy is the only client, so trust its X-Forwarded-For: the per-IP auth rate
# limit then sees the caller's address instead of Caddy's.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--proxy-headers", "--forwarded-allow-ips", "*"]
