"""Black-box HTTP tests for /api/tasks (list, filters, CRUD, status, promote)."""
import pytest

import db as db_lib

TASK_KEYS = {
    "id", "title", "description", "assigneeId", "assigneeUserId", "assignedUser",
    "dueDate", "status", "priority", "sprint", "points", "tag",
}
MISSING_ID = "DEV-999999"
UNKNOWN_USER_ID = 999999


def _payload(title="New test task", **overrides):
    data = {
        "title": title,
        "description": "created by pytest",
        "assigneeId": None,
        "dueDate": "2026-12-05",
        "status": "todo",
        "priority": "medium",
        "sprint": "Sprint 14",
        "points": 3,
        "tag": "QA",
    }
    data.update(overrides)
    return data


def _all_tasks(client):
    resp = client.get("/api/tasks")
    assert resp.status_code == 200
    return resp.json()


def _first_member_id(client):
    resp = client.get("/api/team")
    assert resp.status_code == 200
    assert resp.json(), "seed team must be non-empty"
    return resp.json()[0]["id"]


# ---------- list ----------

def test_list_returns_seeded_tasks_with_shape(client):
    tasks = _all_tasks(client)
    assert isinstance(tasks, list) and tasks, "seed tasks must be non-empty"
    for task in tasks:
        assert TASK_KEYS <= set(task), f"task missing keys: {task}"


def test_list_filter_sprint(client):
    tasks = _all_tasks(client)
    sprint = next(t["sprint"] for t in tasks if t["sprint"] != "Backlog")
    resp = client.get("/api/tasks", params={"sprint": sprint})
    assert resp.status_code == 200
    got = resp.json()
    assert got, "filtered list should be non-empty"
    assert {t["id"] for t in got} == {t["id"] for t in tasks if t["sprint"] == sprint}
    assert all(t["sprint"] == sprint for t in got)


def test_list_filter_sprint_backlog_includes_backlog_status(client):
    tasks = _all_tasks(client)
    resp = client.get("/api/tasks", params={"sprint": "Backlog"})
    assert resp.status_code == 200
    got = resp.json()
    expected = {t["id"] for t in tasks if t["sprint"] == "Backlog" or t["status"] == "backlog"}
    assert {t["id"] for t in got} == expected


def test_list_filter_status(client):
    tasks = _all_tasks(client)
    resp = client.get("/api/tasks", params={"status": "done"})
    assert resp.status_code == 200
    got = resp.json()
    assert {t["id"] for t in got} == {t["id"] for t in tasks if t["status"] == "done"}
    assert all(t["status"] == "done" for t in got)


def test_list_filter_priority(client):
    tasks = _all_tasks(client)
    resp = client.get("/api/tasks", params={"priority": "critical"})
    assert resp.status_code == 200
    got = resp.json()
    assert {t["id"] for t in got} == {t["id"] for t in tasks if t["priority"] == "critical"}
    assert all(t["priority"] == "critical" for t in got)


def test_list_filter_assignee(client):
    tasks = _all_tasks(client)
    seeded = next((t for t in tasks if t.get("assigneeId")), None)
    if seeded is None:  # fall back to a task we assign ourselves
        member_id = _first_member_id(client)
        created = client.post("/api/tasks", json=_payload(assigneeId=member_id)).json()
        assignee = created["assigneeId"]
        expected_ids = {created["id"]}
    else:
        assignee = seeded["assigneeId"]
        expected_ids = {t["id"] for t in tasks if t.get("assigneeId") == assignee}
    resp = client.get("/api/tasks", params={"assigneeId": assignee})
    assert resp.status_code == 200
    got = resp.json()
    assert got
    assert {t["id"] for t in got} == expected_ids
    assert all(t["assigneeId"] == assignee for t in got)


def test_list_filter_search(client):
    tasks = _all_tasks(client)
    word = next(w for w in tasks[0]["title"].split() if len(w) >= 4)
    resp = client.get("/api/tasks", params={"search": word})
    assert resp.status_code == 200
    got = resp.json()
    assert tasks[0]["id"] in {t["id"] for t in got}

    def _haystack(t):
        return " ".join([t["id"], t["title"], t["description"], t["tag"]]).lower()

    assert all(word.lower() in _haystack(t) for t in got)


def test_list_combined_filters(client):
    tasks = _all_tasks(client)
    probe = next(t for t in tasks if t["status"] != "backlog")
    resp = client.get("/api/tasks", params={"sprint": probe["sprint"], "status": probe["status"]})
    assert resp.status_code == 200
    got = resp.json()
    assert probe["id"] in {t["id"] for t in got}
    assert all(t["sprint"] == probe["sprint"] and t["status"] == probe["status"] for t in got)


# ---------- create ----------

def test_create_task_returns_201_and_shape(client):
    member_id = _first_member_id(client)
    body = _payload(title="Ship dark mode", assigneeId=member_id, priority="high", points=5)
    resp = client.post("/api/tasks", json=body)
    assert resp.status_code == 201
    created = resp.json()
    assert TASK_KEYS <= set(created)
    assert created["id"].startswith("DEV-")
    for key, value in body.items():
        assert created[key] == value, f"create echo mismatch on {key}"
    assert created["id"] in {t["id"] for t in _all_tasks(client)}


def test_create_task_applies_defaults(client):
    resp = client.post("/api/tasks", json={"title": "Minimal task", "dueDate": "2026-12-06"})
    assert resp.status_code == 201
    created = resp.json()
    assert created["status"] == "todo"
    assert created["priority"] == "medium"
    assert created["sprint"] == "Sprint 14"
    assert created["points"] == 3
    assert created["tag"] == "Frontend"
    assert created["description"] == ""
    assert created["assigneeId"] is None


@pytest.mark.parametrize("body", [
    {"title": "", "dueDate": "2026-12-05"},  # empty title
    {"dueDate": "2026-12-05"},  # missing title
    {"title": "No due date"},  # missing dueDate
    {"title": "Bad points", "dueDate": "2026-12-05", "points": 0},
    {"title": "Bad status", "dueDate": "2026-12-05", "status": "bogus"},
    {"title": "Bad priority", "dueDate": "2026-12-05", "priority": "urgent"},
])
def test_create_task_rejects_bad_payload_with_422(client, body):
    resp = client.post("/api/tasks", json=body)
    assert resp.status_code == 422


# ---------- update ----------

def test_update_task(client):
    created = client.post("/api/tasks", json=_payload()).json()
    body = _payload(title="Renamed task", status="in_progress", priority="critical", points=8)
    resp = client.put(f"/api/tasks/{created['id']}", json=body)
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["id"] == created["id"]
    for key, value in body.items():
        assert updated[key] == value, f"update echo mismatch on {key}"


def test_update_task_rejects_empty_title_with_422(client):
    created = client.post("/api/tasks", json=_payload()).json()
    resp = client.put(f"/api/tasks/{created['id']}", json=_payload(title=""))
    assert resp.status_code == 422


def test_update_unknown_task_404(client):
    resp = client.put(f"/api/tasks/{MISSING_ID}", json=_payload())
    assert resp.status_code == 404


# ---------- status patch ----------

def test_patch_status(client):
    created = client.post("/api/tasks", json=_payload(status="todo")).json()
    resp = client.patch(f"/api/tasks/{created['id']}/status", json={"status": "in_progress"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"
    assert resp.json()["sprint"] == "Sprint 14"


def test_patch_status_backlog_sprint_auto_moves_to_sprint14(client):
    created = client.post("/api/tasks", json=_payload(status="backlog", sprint="Backlog")).json()
    assert created["sprint"] == "Backlog"
    resp = client.patch(f"/api/tasks/{created['id']}/status", json={"status": "todo"})
    assert resp.status_code == 200
    moved = resp.json()
    assert moved["status"] == "todo"
    assert moved["sprint"] == "Sprint 14"


def test_patch_status_keeps_non_backlog_sprint(client):
    created = client.post("/api/tasks", json=_payload(status="backlog", sprint="Sprint 15")).json()
    resp = client.patch(f"/api/tasks/{created['id']}/status", json={"status": "todo"})
    assert resp.status_code == 200
    assert resp.json()["sprint"] == "Sprint 15"


def test_patch_unknown_task_404(client):
    resp = client.patch(f"/api/tasks/{MISSING_ID}/status", json={"status": "todo"})
    assert resp.status_code == 404


def test_patch_invalid_status_422(client):
    created = client.post("/api/tasks", json=_payload()).json()
    resp = client.patch(f"/api/tasks/{created['id']}/status", json={"status": "bogus"})
    assert resp.status_code == 422


# ---------- promote ----------

def test_promote_moves_task_to_current_sprint_todo(client):
    created = client.post("/api/tasks", json=_payload(status="backlog", sprint="Backlog")).json()
    resp = client.post(f"/api/tasks/{created['id']}/promote")
    assert resp.status_code == 200
    promoted = resp.json()
    assert promoted["id"] == created["id"]
    assert promoted["status"] == "todo"
    assert promoted["sprint"] == "Sprint 14"


def test_promote_unknown_task_404(client):
    resp = client.post(f"/api/tasks/{MISSING_ID}/promote")
    assert resp.status_code == 404


# ---------- delete ----------

def test_delete_task(client):
    created = client.post("/api/tasks", json=_payload()).json()
    resp = client.delete(f"/api/tasks/{created['id']}")
    assert resp.status_code == 200
    assert resp.json() == {"deleted": created["id"]}
    assert created["id"] not in {t["id"] for t in _all_tasks(client)}


def test_deleted_task_returns_404(client):
    created = client.post("/api/tasks", json=_payload()).json()
    assert client.delete(f"/api/tasks/{created['id']}").status_code == 200
    assert client.delete(f"/api/tasks/{created['id']}").status_code == 404
    assert client.put(f"/api/tasks/{created['id']}", json=_payload()).status_code == 404
    assert client.patch(f"/api/tasks/{created['id']}/status", json={"status": "todo"}).status_code == 404
    assert client.post(f"/api/tasks/{created['id']}/promote").status_code == 404


def test_delete_unknown_task_404(client):
    assert client.delete(f"/api/tasks/{MISSING_ID}").status_code == 404


# ---------- login-user assignee ----------

def _directory(client):
    resp = client.get("/api/users/directory")
    assert resp.status_code == 200
    return resp.json()


def _ensure_user(client, email, name, password, role):
    resp = client.post(
        "/api/auth/users",
        json={"email": email, "name": name, "password": password, "role": role},
    )
    if resp.status_code == 201:
        return resp.json()
    assert resp.status_code == 400, resp.text  # already registered earlier in session
    found = next(u for u in _directory(client) if u["email"] == email)
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    return {**found, "role": login.json()["user"]["role"]}


def _user_assignee(client):
    return _ensure_user(
        client, "assignee@sprintflow.local", "Task Assignee", "Assignee123!", "member"
    )


def test_create_task_with_user_only(client):
    user = _user_assignee(client)
    resp = client.post(
        "/api/tasks", json=_payload(assigneeId=None, assigneeUserId=user["id"])
    )
    assert resp.status_code == 201
    created = resp.json()
    assert TASK_KEYS <= set(created)
    assert created["assigneeId"] is None
    assert created["assigneeUserId"] == user["id"]
    assert created["assignedUser"] == {"name": user["name"], "email": user["email"]}


def test_create_task_with_both_assignees(client):
    user = _user_assignee(client)
    member_id = _first_member_id(client)
    resp = client.post(
        "/api/tasks",
        json=_payload(assigneeId=member_id, assigneeUserId=user["id"]),
    )
    assert resp.status_code == 201
    created = resp.json()
    assert created["assigneeId"] == member_id
    assert created["assigneeUserId"] == user["id"]
    assert created["assignedUser"] == {"name": user["name"], "email": user["email"]}


def test_create_task_with_neither_assignee_nulls(client):
    resp = client.post("/api/tasks", json=_payload())
    assert resp.status_code == 201
    created = resp.json()
    assert created["assigneeId"] is None
    assert created["assigneeUserId"] is None
    assert created["assignedUser"] is None


def test_update_task_sets_and_clears_user_assignee(client):
    user = _user_assignee(client)
    created = client.post("/api/tasks", json=_payload()).json()
    assert created["assigneeUserId"] is None
    updated = client.put(
        f"/api/tasks/{created['id']}", json=_payload(assigneeUserId=user["id"])
    )
    assert updated.status_code == 200
    assert updated.json()["assigneeUserId"] == user["id"]
    assert updated.json()["assignedUser"] == {
        "name": user["name"],
        "email": user["email"],
    }
    cleared = client.put(
        f"/api/tasks/{created['id']}", json=_payload(assigneeUserId=None)
    )
    assert cleared.status_code == 200
    assert cleared.json()["assigneeUserId"] is None
    assert cleared.json()["assignedUser"] is None


def test_create_task_unknown_user_400(client):
    resp = client.post(
        "/api/tasks", json=_payload(assigneeUserId=UNKNOWN_USER_ID)
    )
    assert resp.status_code == 400


def test_update_task_unknown_user_400(client):
    created = client.post("/api/tasks", json=_payload()).json()
    resp = client.put(
        f"/api/tasks/{created['id']}", json=_payload(assigneeUserId=UNKNOWN_USER_ID)
    )
    assert resp.status_code == 400


def test_list_filter_assignee_user_id(client):
    user = _user_assignee(client)
    mine = client.post(
        "/api/tasks",
        json=_payload(title="User-filtered task", assigneeUserId=user["id"]),
    ).json()
    other = client.post("/api/tasks", json=_payload(title="Unassigned task")).json()
    resp = client.get("/api/tasks", params={"assigneeUserId": user["id"]})
    assert resp.status_code == 200
    got = resp.json()
    assert got
    assert mine["id"] in {t["id"] for t in got}
    assert other["id"] not in {t["id"] for t in got}
    assert all(t["assigneeUserId"] == user["id"] for t in got)


def test_list_filter_assignee_user_id_combines_with_status(client):
    user = _user_assignee(client)
    target = client.post(
        "/api/tasks",
        json=_payload(status="in_progress", assigneeUserId=user["id"]),
    ).json()
    decoy = client.post(
        "/api/tasks", json=_payload(status="todo", assigneeUserId=user["id"])
    ).json()
    resp = client.get(
        "/api/tasks",
        params={"assigneeUserId": user["id"], "status": "in_progress"},
    )
    assert resp.status_code == 200
    got = resp.json()
    assert target["id"] in {t["id"] for t in got}
    assert decoy["id"] not in {t["id"] for t in got}
    assert all(
        t["assigneeUserId"] == user["id"] and t["status"] == "in_progress" for t in got
    )


# ---------- user directory ----------

def test_user_directory_shape_sorted_by_name(client):
    second = _ensure_user(
        client, "aaron@sprintflow.local", "Aaron Aardvark", "Aaron123!", "viewer"
    )
    entries = _directory(client)
    assert entries
    for entry in entries:
        assert set(entry.keys()) == {"id", "name", "email"}
    names = [e["name"] for e in entries]
    assert names == sorted(names, key=str.lower)
    assert {second["email"], "admin@sprintflow.local"} <= {e["email"] for e in entries}


def test_user_directory_open_to_viewer_but_closed_anon(client, anon_client):
    viewer = _ensure_user(
        client, "dirviewer@sprintflow.local", "Dir Viewer", "Dirview123!", "viewer"
    )
    assert viewer["role"] == "viewer"
    login = anon_client.post(
        "/api/auth/login",
        json={"email": "dirviewer@sprintflow.local", "password": "Dirview123!"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    resp = anon_client.get(
        "/api/users/directory", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert anon_client.get("/api/users/directory").status_code == 401


# ---------- migration backfill ----------

def test_backfill_copies_linked_member_user_without_overwriting(client):
    user = _user_assignee(client)
    other = _ensure_user(
        client, "backfill@sprintflow.local", "Backfill Other", "Backfill123!", "member"
    )
    member = client.get("/api/team").json()[0]
    link = client.put(
        f"/api/team/{member['id']}",
        json={"name": member["name"], "userId": user["id"]},
    )
    assert link.status_code == 200
    # Member-only task: no auto-fill on create, backfilled by init_db.
    inherited = client.post(
        "/api/tasks", json=_payload(assigneeId=member["id"])
    ).json()
    assert inherited["assigneeUserId"] is None
    # Explicit user assignee must survive the backfill untouched.
    explicit = client.post(
        "/api/tasks",
        json=_payload(assigneeId=member["id"], assigneeUserId=other["id"]),
    ).json()
    db_lib.init_db()
    tasks = {t["id"]: t for t in _all_tasks(client)}
    assert tasks[inherited["id"]]["assigneeUserId"] == user["id"]
    assert tasks[inherited["id"]]["assignedUser"] == {
        "name": user["name"],
        "email": user["email"],
    }
    assert tasks[explicit["id"]]["assigneeUserId"] == other["id"]
