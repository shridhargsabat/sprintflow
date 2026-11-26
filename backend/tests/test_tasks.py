"""Black-box HTTP tests for /api/tasks (list, filters, CRUD, status, promote)."""
import pytest

import db as db_lib

TASK_KEYS = {
    "id", "title", "description", "assignees",
    "dueDate", "status", "priority", "sprint", "points", "tag",
}
MISSING_ID = "DEV-999999"
UNKNOWN_USER_ID = 999999
UNKNOWN_MEMBER_ID = "m-no-such-member"


def _payload(title="New test task", **overrides):
    data = {
        "title": title,
        "description": "created by pytest",
        "assignees": [],
        "dueDate": "2026-12-05",
        "status": "todo",
        "priority": "medium",
        "sprint": "Sprint 14",
        "points": 3,
        "tag": "QA",
    }
    data.update(overrides)
    return data


def _assert_echo(body, got, skip=("assignees",)):
    for key, value in body.items():
        if key in skip:
            continue
        assert got[key] == value, f"echo mismatch on {key}"


def _assignee_refs(task):
    """Normalized (type, id) refs from an enriched assignees array."""
    return {(a["type"], a["id"]) for a in task["assignees"]}


def _member_ref(member_id):
    return {"type": "member", "id": member_id}


def _user_ref(user_id):
    return {"type": "user", "id": user_id}


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
        assert "assigneeId" not in task
        assert "assigneeUserId" not in task
        assert "assignedUser" not in task
        assert isinstance(task["assignees"], list)
        for a in task["assignees"]:
            assert {"type", "id", "name"} <= set(a)
            assert a["type"] in ("member", "user")


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
    seeded = next(
        (t for t in tasks if any(a["type"] == "member" for a in t["assignees"])),
        None,
    )
    if seeded is None:  # fall back to a task we assign ourselves
        member_id = _first_member_id(client)
        created = client.post(
            "/api/tasks", json=_payload(assignees=[_member_ref(member_id)])
        ).json()
        assignee = member_id
        expected_ids = {created["id"]}
    else:
        assignee = next(
            a["id"] for a in seeded["assignees"] if a["type"] == "member"
        )
        expected_ids = {
            t["id"]
            for t in tasks
            if ("member", assignee) in _assignee_refs(t)
        }
    resp = client.get("/api/tasks", params={"assigneeId": assignee})
    assert resp.status_code == 200
    got = resp.json()
    assert got
    assert {t["id"] for t in got} == expected_ids
    assert all(("member", assignee) in _assignee_refs(t) for t in got)


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
    assignees = [_member_ref(member_id)]
    body = _payload(title="Ship dark mode", assignees=assignees, priority="high", points=5)
    resp = client.post("/api/tasks", json=body)
    assert resp.status_code == 201
    created = resp.json()
    assert TASK_KEYS <= set(created)
    assert created["id"].startswith("DEV-")
    _assert_echo(body, created)
    assert _assignee_refs(created) == {("member", member_id)}
    member = next(m for m in client.get("/api/team").json() if m["id"] == member_id)
    assert created["assignees"] == [{
        "type": "member", "id": member_id, "name": member["name"],
        "role": member["role"], "color": member["color"],
    }]
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
    assert created["assignees"] == []


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
    _assert_echo(body, updated)
    assert updated["assignees"] == []


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


# ---------- multi-assignee ----------

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
        "/api/tasks", json=_payload(assignees=[_user_ref(user["id"])])
    )
    assert resp.status_code == 201
    created = resp.json()
    assert TASK_KEYS <= set(created)
    assert created["assignees"] == [{
        "type": "user", "id": user["id"], "name": user["name"],
        "email": user["email"], "role": user["role"],
    }]


def test_create_task_with_member_and_user(client):
    user = _user_assignee(client)
    member_id = _first_member_id(client)
    resp = client.post(
        "/api/tasks",
        json=_payload(assignees=[_member_ref(member_id), _user_ref(user["id"])]),
    )
    assert resp.status_code == 201
    created = resp.json()
    assert _assignee_refs(created) == {("member", member_id), ("user", user["id"])}
    by_type = {a["type"]: a for a in created["assignees"]}
    assert by_type["user"] == {
        "type": "user", "id": user["id"], "name": user["name"],
        "email": user["email"], "role": user["role"],
    }
    assert by_type["member"]["id"] == member_id
    assert by_type["member"]["name"]


def test_create_task_with_no_assignees_empty_array(client):
    resp = client.post("/api/tasks", json=_payload())
    assert resp.status_code == 201
    assert resp.json()["assignees"] == []
    omitted = client.post(
        "/api/tasks",
        json={k: v for k, v in _payload().items() if k != "assignees"},
    )
    assert omitted.status_code == 201
    assert omitted.json()["assignees"] == []


def test_create_task_dedupes_assignees(client):
    user = _user_assignee(client)
    member_id = _first_member_id(client)
    resp = client.post(
        "/api/tasks",
        json=_payload(assignees=[
            _member_ref(member_id), _member_ref(member_id),
            _user_ref(user["id"]), _user_ref(user["id"]),
        ]),
    )
    assert resp.status_code == 201
    assert _assignee_refs(resp.json()) == {
        ("member", member_id), ("user", user["id"])
    }
    assert len(resp.json()["assignees"]) == 2


def test_create_task_too_many_assignees_400(client):
    members = client.get("/api/team").json()
    refs = [_member_ref(m["id"]) for m in members]
    user = _user_assignee(client)
    refs += [_user_ref(user["id"])] * (11 - len(refs))
    assert len(refs) == 11
    resp = client.post("/api/tasks", json=_payload(assignees=refs))
    assert resp.status_code == 400


def test_update_task_sets_replaces_and_clears_assignees(client):
    user = _user_assignee(client)
    members = [m["id"] for m in client.get("/api/team").json()]
    created = client.post("/api/tasks", json=_payload()).json()
    assert created["assignees"] == []

    updated = client.put(
        f"/api/tasks/{created['id']}",
        json=_payload(assignees=[_member_ref(members[0]), _user_ref(user["id"])]),
    )
    assert updated.status_code == 200
    assert _assignee_refs(updated.json()) == {
        ("member", members[0]), ("user", user["id"])
    }

    # PUT replaces the whole set (member swapped out, user kept).
    replaced = client.put(
        f"/api/tasks/{created['id']}",
        json=_payload(assignees=[_member_ref(members[1]), _user_ref(user["id"])]),
    )
    assert replaced.status_code == 200
    assert _assignee_refs(replaced.json()) == {
        ("member", members[1]), ("user", user["id"])
    }

    # Empty array clears all assignees.
    cleared = client.put(
        f"/api/tasks/{created['id']}", json=_payload(assignees=[])
    )
    assert cleared.status_code == 200
    assert cleared.json()["assignees"] == []
    # Omitted assignees also clears (PUT is a full replacement).
    recleared = client.put(
        f"/api/tasks/{created['id']}",
        json={k: v for k, v in _payload().items() if k != "assignees"},
    )
    assert recleared.status_code == 200
    assert recleared.json()["assignees"] == []


def test_create_task_unknown_member_400(client):
    resp = client.post(
        "/api/tasks", json=_payload(assignees=[_member_ref(UNKNOWN_MEMBER_ID)])
    )
    assert resp.status_code == 400


def test_create_task_unknown_user_400(client):
    resp = client.post(
        "/api/tasks", json=_payload(assignees=[_user_ref(UNKNOWN_USER_ID)])
    )
    assert resp.status_code == 400


def test_update_task_unknown_assignee_400(client):
    created = client.post("/api/tasks", json=_payload()).json()
    resp = client.put(
        f"/api/tasks/{created['id']}",
        json=_payload(assignees=[_user_ref(UNKNOWN_USER_ID)]),
    )
    assert resp.status_code == 400
    resp = client.put(
        f"/api/tasks/{created['id']}",
        json=_payload(assignees=[_member_ref(UNKNOWN_MEMBER_ID)]),
    )
    assert resp.status_code == 400
    # Failed updates leave the stored assignees untouched.
    got = next(t for t in _all_tasks(client) if t["id"] == created["id"])
    assert got["assignees"] == []


def test_list_filter_assignee_user_id(client):
    user = _user_assignee(client)
    mine = client.post(
        "/api/tasks",
        json=_payload(
            title="User-filtered task", assignees=[_user_ref(user["id"])]
        ),
    ).json()
    other = client.post("/api/tasks", json=_payload(title="Unassigned task")).json()
    resp = client.get("/api/tasks", params={"assigneeUserId": user["id"]})
    assert resp.status_code == 200
    got = resp.json()
    assert got
    assert mine["id"] in {t["id"] for t in got}
    assert other["id"] not in {t["id"] for t in got}
    assert all(("user", user["id"]) in _assignee_refs(t) for t in got)


def test_list_filter_assignee_user_id_combines_with_status(client):
    user = _user_assignee(client)
    target = client.post(
        "/api/tasks",
        json=_payload(status="in_progress", assignees=[_user_ref(user["id"])]),
    ).json()
    decoy = client.post(
        "/api/tasks", json=_payload(status="todo", assignees=[_user_ref(user["id"])])
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
        ("user", user["id"]) in _assignee_refs(t) and t["status"] == "in_progress"
        for t in got
    )


def test_list_filter_member_and_user_combined(client):
    user = _user_assignee(client)
    members = [m["id"] for m in client.get("/api/team").json()]
    both = client.post(
        "/api/tasks",
        json=_payload(assignees=[_member_ref(members[0]), _user_ref(user["id"])]),
    ).json()
    member_only = client.post(
        "/api/tasks", json=_payload(assignees=[_member_ref(members[0])])
    ).json()
    user_only = client.post(
        "/api/tasks", json=_payload(assignees=[_user_ref(user["id"])])
    ).json()
    resp = client.get(
        "/api/tasks",
        params={"assigneeId": members[0], "assigneeUserId": user["id"]},
    )
    assert resp.status_code == 200
    ids = {t["id"] for t in resp.json()}
    assert both["id"] in ids
    assert member_only["id"] not in ids
    assert user_only["id"] not in ids


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


# ---------- legacy migration ----------

def test_legacy_assignee_columns_migrated_to_join_table(tmp_path):
    """Legacy DB (assignee_id/assignee_user_id columns) migrates cleanly."""
    import sqlite3

    legacy = str(tmp_path / "legacy-assignees.db")
    conn = sqlite3.connect(legacy)
    conn.executescript(
        """
        CREATE TABLE team_members (id TEXT PRIMARY KEY, name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Engineer', color TEXT NOT NULL DEFAULT 'bg-indigo-600',
            user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL);
        CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '', assignee_id TEXT, due_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'medium',
            sprint TEXT NOT NULL DEFAULT 'Sprint 14', points INTEGER NOT NULL DEFAULT 3,
            tag TEXT NOT NULL DEFAULT 'Frontend',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            assignee_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (assignee_id) REFERENCES team_members(id) ON DELETE SET NULL);
        CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL, password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL DEFAULT (datetime('now')));
        INSERT INTO team_members (id, name) VALUES ('m-keep', 'Keeper');
        INSERT INTO users (id, email, name, password_hash, role)
            VALUES (11, 'kept@t.local', 'Kept', 'x', 'member');
        INSERT INTO tasks (id, title, assignee_id, due_date, assignee_user_id)
            VALUES ('DEV-900', 'Both', 'm-keep', '2026-12-01', 11);
        INSERT INTO tasks (id, title, assignee_id, due_date)
            VALUES ('DEV-901', 'Dangling', 'm-ghost', '2026-12-01');
        """
    )
    conn.commit()
    conn.close()

    db_lib.init_db(legacy)  # must not raise; backfills then drops columns
    db_lib.init_db(legacy)  # idempotent re-run

    with db_lib.get_conn(legacy) as conn:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()]
        assert "assignee_id" not in cols
        assert "assignee_user_id" not in cols
        rows = {
            (r["task_id"], r["member_id"], r["user_id"])
            for r in conn.execute("SELECT task_id, member_id, user_id FROM task_assignees")
        }
        assert rows == {("DEV-900", "m-keep", None), ("DEV-900", None, 11)}
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    tasks = {t["id"]: t for t in db_lib.list_tasks(db_path=legacy)}
    assert {(a["type"], a["id"]) for a in tasks["DEV-900"]["assignees"]} == {
        ("member", "m-keep"), ("user", 11)
    }
    assert tasks["DEV-901"]["assignees"] == []
