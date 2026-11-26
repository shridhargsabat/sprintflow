"""Black-box HTTP tests for /api/auth/* and RBAC enforcement.

- login ok / bad credentials
- /me requires a token
- viewer blocked from POST /api/tasks, admin allowed
- spot checks: unauthenticated reads rejected, health stays open,
  lead/member/viewer permission boundaries
"""
import pytest

import auth as auth_lib

ADMIN = {"email": "admin@sprintflow.local", "password": "Admin123!"}


def _login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _ensure_user(email, name, password, role):
    try:
        return auth_lib.create_user(email, name, password, role)
    except ValueError:
        return auth_lib.get_user_by_email(email)


@pytest.fixture(scope="module")
def role_users():
    return {
        "lead": _ensure_user("lead@sprintflow.local", "Lead", "Lead123!", "lead"),
        "member": _ensure_user("member@sprintflow.local", "Member", "Member123!", "member"),
        "viewer": _ensure_user("viewer@sprintflow.local", "Viewer", "Viewer123!", "viewer"),
    }


def _token_for(client, email, password):
    resp = _login(client, email, password)
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth_headers(client, email, password):
    return {"Authorization": f"Bearer {_token_for(client, email, password)}"}


# ---------- login ----------

def test_login_ok_returns_exact_contract(client):
    resp = _login(client, ADMIN["email"], ADMIN["password"])
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"access_token", "token_type", "user"}
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert set(body["user"].keys()) == {"id", "email", "name", "role"}
    assert body["user"]["email"] == ADMIN["email"]
    assert body["user"]["role"] == "admin"


@pytest.mark.parametrize(
    "email,password",
    [
        ("admin@sprintflow.local", "wrong-password"),
        ("nobody@sprintflow.local", "Admin123!"),
        ("admin@sprintflow.local", ""),
    ],
)
def test_login_bad_credentials_401(anon_client, email, password):
    resp = _login(anon_client, email, password)
    assert resp.status_code == 401


# ---------- /me ----------

def test_me_without_token_401(anon_client):
    resp = anon_client.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_with_token_returns_user_and_permissions(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"id", "email", "name", "role", "permissions"}
    assert body["email"] == ADMIN["email"]
    assert body["role"] == "admin"
    assert "tasks.delete" in body["permissions"]
    assert "data.reset" in body["permissions"]


def test_me_viewer_permissions(anon_client, role_users):
    headers = _auth_headers(anon_client, "viewer@sprintflow.local", "Viewer123!")
    resp = anon_client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["permissions"] == ["tasks.view", "sprints.view"]


# ---------- RBAC on tasks ----------

_TASK_PAYLOAD = {"title": "RBAC probe task", "dueDate": "2026-12-08"}


def test_viewer_blocked_from_post_tasks(anon_client, role_users):
    headers = _auth_headers(anon_client, "viewer@sprintflow.local", "Viewer123!")
    resp = anon_client.post("/api/tasks", json=_TASK_PAYLOAD, headers=headers)
    assert resp.status_code == 403


def test_admin_allowed_post_tasks(client):
    resp = client.post("/api/tasks", json=_TASK_PAYLOAD)
    assert resp.status_code == 201
    assert resp.json()["title"] == _TASK_PAYLOAD["title"]


def test_member_allowed_post_tasks_but_not_delete(anon_client, role_users):
    headers = _auth_headers(anon_client, "member@sprintflow.local", "Member123!")
    created = anon_client.post("/api/tasks", json=_TASK_PAYLOAD, headers=headers)
    assert created.status_code == 201
    resp = anon_client.delete(f"/api/tasks/{created.json()['id']}", headers=headers)
    assert resp.status_code == 403


def test_tasks_read_requires_auth(anon_client):
    assert anon_client.get("/api/tasks").status_code == 401


def test_viewer_can_read_tasks_but_not_team(anon_client, role_users):
    headers = _auth_headers(anon_client, "viewer@sprintflow.local", "Viewer123!")
    assert anon_client.get("/api/tasks", headers=headers).status_code == 200
    assert anon_client.get("/api/sprints", headers=headers).status_code == 200
    assert anon_client.get("/api/team", headers=headers).status_code == 403


# ---------- RBAC spot checks: sprints / team / data ----------

def test_lead_cannot_reset_or_manage_team(anon_client, role_users):
    headers = _auth_headers(anon_client, "lead@sprintflow.local", "Lead123!")
    assert anon_client.post("/api/reset", headers=headers).status_code == 403
    assert (
        anon_client.post(
            "/api/team", json={"name": "Nope"}, headers=headers
        ).status_code
        == 403
    )
    assert (
        anon_client.put(
            "/api/sprints/Sprint 14", json={"lengthDays": 7}, headers=headers
        ).status_code
        == 200
    )


def test_member_can_export_but_not_import(anon_client, role_users):
    headers = _auth_headers(anon_client, "member@sprintflow.local", "Member123!")
    assert anon_client.get("/api/export", headers=headers).status_code == 200
    assert (
        anon_client.post(
            "/api/import", json={"team": [], "tasks": []}, headers=headers
        ).status_code
        == 403
    )


def test_health_stays_open(anon_client):
    resp = anon_client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "database": "sqlite"}
