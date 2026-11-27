"""Black-box HTTP tests for the configurable story-points scale.

GET /api/settings/points-scale is open to all authed roles;
PUT is admin-only. Task writes must use a scale value (400 when the
value is a valid int outside the scale); pre-existing tasks keep any
value they already hold.
"""
import pytest

DEFAULT_SCALE = [1, 2, 3, 5, 8, 13]

MEMBER_EMAIL = "scalemember@sprintflow.local"
MEMBER_PASSWORD = "Scalemember123!"
VIEWER_EMAIL = "scaleviewer@sprintflow.local"
VIEWER_PASSWORD = "Scaleviewer123!"


def _ensure_user(client, email, name, password, role):
    resp = client.post(
        "/api/auth/users",
        json={"email": email, "name": name, "password": password, "role": role},
    )
    assert resp.status_code in (201, 400), resp.text


def _headers_for(client, email, password):
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _member_headers(client):
    _ensure_user(client, MEMBER_EMAIL, "Scale Member", MEMBER_PASSWORD, "member")
    return _headers_for(client, MEMBER_EMAIL, MEMBER_PASSWORD)


def _viewer_headers(client):
    _ensure_user(client, VIEWER_EMAIL, "Scale Viewer", VIEWER_PASSWORD, "viewer")
    return _headers_for(client, VIEWER_EMAIL, VIEWER_PASSWORD)


def _task_payload(**overrides):
    data = {
        "title": "Scale probe",
        "description": "",
        "assignees": [],
        "dueDate": "2026-12-05",
        "status": "todo",
        "priority": "medium",
        "sprint": "Sprint 14",
        "points": 3,
        "tags": ["QA"],
    }
    data.update(overrides)
    return data


# ---------- get ----------

def test_get_default_scale(client):
    resp = client.get("/api/settings/points-scale")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"scale": DEFAULT_SCALE}


def test_get_scale_open_to_member_and_viewer(client):
    for headers in (_member_headers(client), _viewer_headers(client)):
        resp = client.get("/api/settings/points-scale", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"scale": DEFAULT_SCALE}


def test_get_scale_requires_auth(anon_client):
    resp = anon_client.get("/api/settings/points-scale")
    assert resp.status_code == 401


# ---------- update ----------

def test_update_scale_as_admin_persists(client):
    resp = client.put("/api/settings/points-scale", json={"scale": [1, 2, 4, 7]})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"scale": [1, 2, 4, 7]}
    # Persisted: a fresh GET reflects the change.
    assert client.get("/api/settings/points-scale").json() == {"scale": [1, 2, 4, 7]}


def test_update_scale_sorts_unsorted_input(client):
    resp = client.put("/api/settings/points-scale", json={"scale": [8, 1, 3]})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"scale": [1, 3, 8]}


def test_update_scale_non_admin_403(client):
    for headers in (_member_headers(client), _viewer_headers(client)):
        resp = client.put(
            "/api/settings/points-scale", json={"scale": [1, 2]}, headers=headers
        )
        assert resp.status_code == 403, resp.text
    # Rejected writes leave the scale untouched.
    assert client.get("/api/settings/points-scale").json() == {"scale": DEFAULT_SCALE}


def test_update_scale_requires_auth(anon_client):
    resp = anon_client.put("/api/settings/points-scale", json={"scale": [1, 2]})
    assert resp.status_code == 401


@pytest.mark.parametrize("body", [
    {"scale": []},  # empty
    {"scale": [1, 1, 2]},  # duplicates
    {"scale": [0]},  # below range
    {"scale": [51]},  # above range
    {"scale": [-3]},  # negative
    {"scale": [2.5]},  # float
    {"scale": ["3"]},  # numeric string
    {"scale": [True]},  # bool is not an int
    {"scale": [None]},  # null entry
    {"scale": "1,2,3"},  # not a list
    {"scale": list(range(1, 32))},  # too many (max 30)
    {},  # missing scale
])
def test_update_scale_invalid_422(client, body):
    resp = client.put("/api/settings/points-scale", json=body)
    assert resp.status_code == 422, (body, resp.text)
    assert client.get("/api/settings/points-scale").json() == {"scale": DEFAULT_SCALE}


def test_reset_restores_default_scale(client):
    assert client.put("/api/settings/points-scale", json={"scale": [1, 2]}).status_code == 200
    assert client.post("/api/reset").status_code == 200
    assert client.get("/api/settings/points-scale").json() == {"scale": DEFAULT_SCALE}


# ---------- task writes vs scale ----------

def test_create_task_in_scale_points_201(client):
    resp = client.post("/api/tasks", json=_task_payload(points=8))
    assert resp.status_code == 201, resp.text
    assert resp.json()["points"] == 8


def test_create_task_out_of_scale_points_400(client):
    resp = client.post("/api/tasks", json=_task_payload(points=4))
    assert resp.status_code == 400, resp.text
    assert "scale" in resp.text.lower()


def test_create_task_out_of_range_points_still_422(client):
    for points in (0, 51):
        resp = client.post("/api/tasks", json=_task_payload(points=points))
        assert resp.status_code == 422, (points, resp.text)


def test_create_task_follows_updated_scale(client):
    assert client.put("/api/settings/points-scale", json={"scale": [1, 2, 4]}).status_code == 200
    ok = client.post("/api/tasks", json=_task_payload(points=4))
    assert ok.status_code == 201, ok.text
    bad = client.post("/api/tasks", json=_task_payload(points=8))
    assert bad.status_code == 400, bad.text


def test_update_task_out_of_scale_points_400(client):
    created = client.post("/api/tasks", json=_task_payload(points=3)).json()
    resp = client.put(
        f"/api/tasks/{created['id']}", json=_task_payload(points=4)
    )
    assert resp.status_code == 400, resp.text
    # The failed edit left the stored task untouched.
    got = client.get("/api/tasks").json()
    assert next(t for t in got if t["id"] == created["id"])["points"] == 3


def test_existing_out_of_scale_task_still_reads(client):
    created = client.post("/api/tasks", json=_task_payload(points=8)).json()
    # Narrow the scale so the stored 8 falls outside it: no data rewrite,
    # and the old value still surfaces on reads (list, summary).
    assert client.put("/api/settings/points-scale", json={"scale": [1, 2]}).status_code == 200
    got = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert got[created["id"]]["points"] == 8
    summary = client.get(
        "/api/dashboard/summary", params={"sprint": "Sprint 14"}
    ).json()
    assert summary["totalPoints"] >= 8
