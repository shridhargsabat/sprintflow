"""Black-box HTTP tests for the flag-gated demo endpoints.

GET /api/demo/status and POST /api/demo/reset exist for local GitHub
evaluation only: both 404 unless SPRINTFLOW_ENABLE_DEMO=1.
"""

DEMO_EMAIL = "demo@sprintflow.local"
DEMO_PASSWORD = "Demo123!"


def _enable_demo(monkeypatch):
    monkeypatch.setenv("SPRINTFLOW_ENABLE_DEMO", "1")


def _disable_demo(monkeypatch):
    monkeypatch.delenv("SPRINTFLOW_ENABLE_DEMO", raising=False)


def test_demo_status_disabled_by_default(anon_client, monkeypatch):
    _disable_demo(monkeypatch)
    resp = anon_client.get("/api/demo/status")
    assert resp.status_code == 404


def test_demo_status_enabled(anon_client, monkeypatch):
    _enable_demo(monkeypatch)
    resp = anon_client.get("/api/demo/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is True
    # "seeded" = at least one task row exists (conftest seeds samples).
    assert body["seeded"] is True
