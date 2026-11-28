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


def _delete_demo_user(client):
    """Remove the demo login if present (keeps the suite hermetic)."""
    users = client.get("/api/auth/users").json()
    for u in users:
        if u["email"] == DEMO_EMAIL:
            resp = client.delete(f"/api/auth/users/{u['id']}")
            assert resp.status_code == 200


def _demo_user_rows(client):
    users = client.get("/api/auth/users").json()
    return [u for u in users if u["email"] == DEMO_EMAIL]


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


def test_demo_reset_disabled_404(client, anon_client, monkeypatch):
    _disable_demo(monkeypatch)
    before = client.get("/api/tasks").json()
    resp = anon_client.post("/api/demo/reset")
    assert resp.status_code == 404
    after = client.get("/api/tasks").json()
    assert after == before


def test_demo_reset_seeds_samples_and_demo_user(client, anon_client, monkeypatch):
    _enable_demo(monkeypatch)
    _delete_demo_user(client)
    try:
        resp = anon_client.post("/api/demo/reset")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["tasks"] > 0
        login = anon_client.post(
            "/api/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        )
        assert login.status_code == 200
        assert login.json()["access_token"]
        assert login.json()["user"]["role"] == "admin"
        tasks = client.get("/api/tasks").json()
        assert len(tasks) == body["tasks"]
        assert len(tasks) > 0
    finally:
        _delete_demo_user(client)


def test_demo_reset_is_idempotent(client, anon_client, monkeypatch):
    _enable_demo(monkeypatch)
    _delete_demo_user(client)
    try:
        first = anon_client.post("/api/demo/reset")
        assert first.status_code == 200
        second = anon_client.post("/api/demo/reset")
        assert second.status_code == 200
        assert second.json()["tasks"] == first.json()["tasks"]
        assert len(_demo_user_rows(client)) == 1
    finally:
        _delete_demo_user(client)


def test_demo_reset_never_overwrites_demo_user(client, anon_client, monkeypatch):
    _enable_demo(monkeypatch)
    _delete_demo_user(client)
    original_password = "OriginalPass123"
    try:
        created = client.post(
            "/api/auth/users",
            json={
                "email": DEMO_EMAIL,
                "name": "Demo",
                "password": original_password,
                "role": "member",
            },
        )
        assert created.status_code == 201
        resp = anon_client.post("/api/demo/reset")
        assert resp.status_code == 200
        # INSERT OR IGNORE proof: original password + role survive the reset.
        login = anon_client.post(
            "/api/auth/login",
            json={"email": DEMO_EMAIL, "password": original_password},
        )
        assert login.status_code == 200
        assert login.json()["user"]["role"] == "member"
        assert len(_demo_user_rows(client)) == 1
    finally:
        _delete_demo_user(client)


def test_demo_reset_wipes_existing_board_data(client, anon_client, monkeypatch):
    _enable_demo(monkeypatch)
    created = client.post(
        "/api/tasks",
        json={"title": "custom probe doomed by demo reset", "dueDate": "2026-12-08"},
    )
    assert created.status_code in (200, 201)
    custom_id = created.json()["id"]
    resp = anon_client.post("/api/demo/reset")
    assert resp.status_code == 200
    # Demo reset is destructive to the LOCAL board — same blast radius as
    # /api/reset: custom work is gone, fresh samples are back.
    tasks = client.get("/api/tasks").json()
    assert all(t["id"] != custom_id for t in tasks)
    assert len(tasks) == resp.json()["tasks"] > 0
