"""In-memory token-bucket rate limiting for the login endpoint (H2 fix).

Each key (client IP + normalized email) gets its own bucket holding up to
MAX_ATTEMPTS tokens, refilled at MAX_ATTEMPTS per WINDOW_SECONDS. Only
*failed* attempts consume a token, so legitimate users logging in
successfully are never throttled while password guessing is capped at a
handful of bcrypt burns per minute per key. When the bucket is empty the
caller must reject the attempt BEFORE running bcrypt (429 + Retry-After).

NOTE — multi-worker multiplier: buckets live in process memory, and
production runs gunicorn with 3 uvicorn workers, each with its own copy.
The effective cluster-wide limit per key is therefore ~3x MAX_ATTEMPTS per
window. That is acceptable for a guessing throttle; switch to a shared
store (Redis) if exact global accounting is ever required.
"""
from __future__ import annotations

import math
import threading
import time

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 60.0

_REFILL_PER_SECOND = MAX_ATTEMPTS / WINDOW_SECONDS

# key -> [tokens (float), last_refill (monotonic seconds)]
_buckets: dict[str, list[float]] = {}
_lock = threading.Lock()

# Swappable clock for unit tests (monkeypatch `ratelimit._clock`).
_clock = time.monotonic


def key_for(client_ip: str, email: str) -> str:
    """Build the bucket key for a login attempt."""
    return f"{client_ip or 'unknown'}:{email.strip().lower()}"


def _refill(bucket: list[float], now: float) -> None:
    elapsed = now - bucket[1]
    if elapsed > 0:
        bucket[0] = min(float(MAX_ATTEMPTS), bucket[0] + elapsed * _REFILL_PER_SECOND)
        bucket[1] = now


def is_allowed(key: str) -> tuple[bool, float]:
    """Peek at a bucket WITHOUT consuming: (allowed, retry_after_seconds).

    Call this before bcrypt; on denial the caller must reject immediately.
    retry_after is 0.0 when allowed, else seconds until one token refills.
    """
    now = _clock()
    with _lock:
        bucket = _buckets.get(key)
        if bucket is None:
            return True, 0.0
        _refill(bucket, now)
        if bucket[0] >= 1.0:
            return True, 0.0
        deficit = 1.0 - bucket[0]
        return False, deficit / _REFILL_PER_SECOND


def record_failure(key: str) -> None:
    """Consume one token after a failed login attempt."""
    now = _clock()
    with _lock:
        bucket = _buckets.setdefault(key, [float(MAX_ATTEMPTS), now])
        _refill(bucket, now)
        bucket[0] = max(0.0, bucket[0] - 1.0)


def retry_after_header(retry_after: float) -> str:
    """Format Retry-After in whole seconds (minimum 1)."""
    return str(max(1, math.ceil(retry_after)))


def reset() -> None:
    """Clear all buckets (tests only)."""
    with _lock:
        _buckets.clear()
