# syntax: docker/dockerfile:1
# SprintFlow backend: FastAPI + uvicorn + SQLite (uv-managed, Python 3.12).
FROM python:3.12-slim@sha256:191083cdf6c7bda8c76158983163ead5d5cf7b77cf3033e805bb0f5296f51b4b
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    SPRINTFLOW_DB_PATH=/data/sprintflow.db
WORKDIR /app

# uv binary (pinned digest = reproducible installs from uv.lock).
COPY --from=ghcr.io/astral-sh/uv:0.6.14@sha256:3362a526af7eca2fcd8604e6a07e873fb6e4286d8837cb753503558ce1213664 /uv /usr/local/bin/uv

# Deps first (layer cache): pyproject + lockfile only.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# App code.
COPY backend/app.py backend/auth.py backend/db.py backend/models.py ./
COPY backend/routers ./routers

# Non-root runtime user; /data holds the SQLite file (named volume).
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /data && chown -R appuser:appuser /app /data
USER appuser
EXPOSE 8000
CMD [".venv/bin/uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
