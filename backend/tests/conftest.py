"""Shared black-box fixtures for the SprintFlow API test suite.

- Points SPRINTFLOW_DB_PATH at an isolated session tmp file BEFORE importing
  the app (the DB layer reads the env var at import time), so the real
  backend/sprintflow.db is never touched.
- Exposes a shared TestClient via the `client` fixture (context-entered so
  the app startup hook creates/seeds the tmp DB). The client is pre-authed
  as the seeded admin (admin@sprintflow.local) so legacy endpoint tests
  exercise the API with full permissions.
- Resets board state via POST /api/reset before every test, keeping tests
  independent and order-free. Reset preserves the users table.

Black-box contract: imports ONLY `app` from app.py plus stdlib / pytest /
fastapi.testclient. No backend internals are touched (auth is performed
over HTTP via /api/auth/login).
"""
import os
import sys
import tempfile

# Backend dir importable + isolated DB selected BEFORE importing the app.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_fd, _TEST_DB_PATH = tempfile.mkstemp(prefix="sprintflow-test-", suffix=".db")
os.close(_fd)
os.environ["SPRINTFLOW_DB_PATH"] = _TEST_DB_PATH
os.environ["SPRINTFLOW_ALLOW_RESET"] = "1"  # tests reset board state before every test
os.environ["SPRINTFLOW_SEED_SAMPLES"] = "1"  # tests boot from the sample dataset

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import app  # noqa: E402

ADMIN_EMAIL = "admin@sprintflow.local"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="session")
def client():
    """Shared HTTP client for the suite (startup hook seeds the tmp DB)."""
    with TestClient(app) as c:
        resp = c.post(
            "/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert resp.status_code == 200, f"admin seed login failed: {resp.text}"
        c.headers.update(
            {"Authorization": f"Bearer {resp.json()['access_token']}"}
        )
        yield c


@pytest.fixture()
def anon_client():
    """Fresh unauthenticated client against the same app/DB (no lifespan
    re-run needed — the session client already seeded the tmp DB file)."""
    with TestClient(app) as c:
        c.headers.pop("Authorization", None)
        yield c


@pytest.fixture(autouse=True)
def _reset_state(client):
    """Restore seed state before every test so tests stay order-free."""
    resp = client.post("/api/reset")
    assert resp.status_code == 200
    yield


@pytest.fixture(scope="session", autouse=True)
def _cleanup_tmp_db():
    """Remove the session tmp DB file once the suite finishes."""
    yield
    try:
        os.unlink(_TEST_DB_PATH)
    except OSError:
        pass
