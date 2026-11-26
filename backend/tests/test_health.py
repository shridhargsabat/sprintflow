"""Smoke-level test for the unauthenticated health endpoint (deploy gate).

The endpoint itself lives in routers/board.py; this test pins only the
deploy-gate contract (HTTP 200 + status ok), not the full response shape
(covered by test_board.py::test_health_shape).
"""

from fastapi.testclient import TestClient

import app


def test_health_ok():
    client = TestClient(app.app)
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
