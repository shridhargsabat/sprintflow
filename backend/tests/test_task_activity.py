"""Black-box HTTP tests for the per-task activity trail.

Covers GET /api/tasks/{id}/activity plus the log_activity wiring in task
create / update / status / promote / delete and sprint-close rollover.
"""
import json

ADMIN_NAME = "Admin"
ADMIN_EMAIL = "admin@sprintflow.local"


def _payload(title="Activity test task", **overrides):
    data = {
        "title": title,
        "description": "created by test_task_activity",
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


def _create(client, **overrides):
    resp = client.post("/api/tasks", json=_payload(**overrides))
    assert resp.status_code == 201, resp.text
    return resp.json()


def _trail(client, task_id):
    resp = client.get(f"/api/tasks/{task_id}/activity")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _update(client, task, **overrides):
    body = {
        "title": task["title"],
        "description": task["description"],
        "assignees": [{"type": a["type"], "id": a["id"]} for a in task["assignees"]],
        "dueDate": task["dueDate"],
        "status": task["status"],
        "priority": task["priority"],
        "sprint": task["sprint"],
        "points": task["points"],
        "tags": list(task["tags"]),
    }
    body.update(overrides)
    resp = client.put(f"/api/tasks/{task['id']}", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _fields(entries):
    return [(e["action"], e["field"]) for e in entries]


# ---------- create ----------

def test_create_logs_created_with_actor(client):
    task = _create(client)
    trail = _trail(client, task["id"])
    assert len(trail) == 1
    entry = trail[0]
    assert entry["action"] == "created"
    assert entry["field"] is None
    assert entry["newValue"] == task["title"]
    assert entry["taskId"] == task["id"]
    assert entry["actor"] == ADMIN_NAME
    assert entry["actorEmail"] == ADMIN_EMAIL
    assert entry["createdAt"]


def test_actor_recorded_for_second_user(client):
    # A different login user mutating a task is recorded as the actor.
    resp = client.post(
        "/api/auth/users",
        json={
            "email": "trail-actor@example.com",
            "name": "Trail Actor",
            "password": "Actor123!",
            "role": "member",
        },
    )
    assert resp.status_code in (200, 201), resp.text
    login = client.post(
        "/api/auth/login",
        json={"email": "trail-actor@example.com", "password": "Actor123!"},
    )
    assert login.status_code == 200, login.text

    task = _create(client)
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    body = _payload(status="in_progress")
    resp = client.put(f"/api/tasks/{task['id']}", json=body, headers=headers)
    assert resp.status_code == 200, resp.text

    trail = _trail(client, task["id"])
    latest = trail[0]
    assert latest["action"] == "updated" and latest["field"] == "status"
    assert latest["actor"] == "Trail Actor"
    assert latest["actorEmail"] == "trail-actor@example.com"


# ---------- one test per update event type ----------

def test_update_status_logged(client):
    task = _create(client)
    _update(client, task, status="in_progress")
    trail = _trail(client, task["id"])
    assert _fields(trail) == [("updated", "status"), ("created", None)]
    assert (trail[0]["oldValue"], trail[0]["newValue"]) == ("todo", "in_progress")


def test_update_priority_logged(client):
    task = _create(client)
    _update(client, task, priority="high")
    trail = _trail(client, task["id"])
    assert _fields(trail) == [("updated", "priority"), ("created", None)]
    assert (trail[0]["oldValue"], trail[0]["newValue"]) == ("medium", "high")


def test_update_points_logged(client):
    task = _create(client)
    _update(client, task, points=8)
    trail = _trail(client, task["id"])
    assert _fields(trail) == [("updated", "points"), ("created", None)]
    assert (trail[0]["oldValue"], trail[0]["newValue"]) == ("3", "8")


def test_update_sprint_logged(client):
    task = _create(client)
    _update(client, task, sprint="Sprint 15")
    trail = _trail(client, task["id"])
    assert _fields(trail) == [("updated", "sprint"), ("created", None)]
    assert (trail[0]["oldValue"], trail[0]["newValue"]) == ("Sprint 14", "Sprint 15")


def test_update_assignees_logged(client):
    member_id = client.get("/api/team").json()[0]["id"]
    member_name = client.get("/api/team").json()[0]["name"]
    task = _create(client)
    _update(client, task, assignees=[{"type": "member", "id": member_id}])
    trail = _trail(client, task["id"])
    assert _fields(trail) == [("updated", "assignees"), ("created", None)]
    assert json.loads(trail[0]["oldValue"]) == []
    assert json.loads(trail[0]["newValue"]) == [member_name]


def test_update_tags_logged(client):
    task = _create(client)
    _update(client, task, tags=["Backend", "QA"])
    trail = _trail(client, task["id"])
    assert _fields(trail) == [("updated", "tags"), ("created", None)]
    assert json.loads(trail[0]["oldValue"]) == ["QA"]
    assert json.loads(trail[0]["newValue"]) == ["Backend", "QA"]


def test_update_duedate_logged(client):
    task = _create(client)
    _update(client, task, dueDate="2026-12-20")
    trail = _trail(client, task["id"])
    assert _fields(trail) == [("updated", "dueDate"), ("created", None)]
    assert (trail[0]["oldValue"], trail[0]["newValue"]) == ("2026-12-05", "2026-12-20")


def test_update_title_logged(client):
    task = _create(client)
    _update(client, task, title="Renamed activity task")
    trail = _trail(client, task["id"])
    assert _fields(trail) == [("updated", "title"), ("created", None)]


# ---------- diff-only + ordering + legacy ----------

def test_unchanged_fields_produce_no_rows(client):
    task = _create(client)
    _update(client, task)  # identical payload: no-op
    trail = _trail(client, task["id"])
    assert _fields(trail) == [("created", None)]


def test_multi_field_update_logs_each_changed_field_only(client):
    task = _create(client)
    _update(client, task, status="done", priority="low")
    trail = _trail(client, task["id"])
    assert sorted(f for _, f in _fields(trail) if f) == ["priority", "status"]
    assert len(trail) == 3  # 2 updates + created


def test_newest_first_ordering(client):
    task = _create(client)
    after_status = _update(client, task, status="in_progress")
    _update(client, after_status, priority="critical")
    trail = _trail(client, task["id"])
    assert [e["field"] for e in trail] == ["priority", "status", None]
    ids = [e["id"] for e in trail]
    assert ids == sorted(ids, reverse=True)


def test_legacy_task_empty_trail(client):
    tasks = client.get("/api/tasks").json()
    assert tasks, "seed tasks must be non-empty"
    for task in tasks:
        assert _trail(client, task["id"]) == []


def test_unknown_task_empty_trail(client):
    assert _trail(client, "DEV-999999") == []


def test_activity_requires_auth(anon_client):
    resp = anon_client.get("/api/tasks/DEV-101/activity")
    assert resp.status_code == 401


def test_other_tasks_trails_isolated(client):
    first = _create(client, title="First trail task")
    second = _create(client, title="Second trail task")
    _update(client, first, status="done")
    assert len(_trail(client, first["id"])) == 2
    assert len(_trail(client, second["id"])) == 1


# ---------- status / promote / delete / rollover ----------

def test_patch_status_logged(client):
    task = _create(client)
    resp = client.patch(f"/api/tasks/{task['id']}/status", json={"status": "in_review"})
    assert resp.status_code == 200, resp.text
    trail = _trail(client, task["id"])
    assert _fields(trail) == [("updated", "status"), ("created", None)]
    assert (trail[0]["oldValue"], trail[0]["newValue"]) == ("todo", "in_review")


def test_patch_status_same_value_logs_nothing(client):
    task = _create(client)  # status already todo
    resp = client.patch(f"/api/tasks/{task['id']}/status", json={"status": "todo"})
    assert resp.status_code == 200, resp.text
    assert _fields(_trail(client, task["id"])) == [("created", None)]


def test_promote_logs_status_and_sprint(client):
    task = _create(client, status="backlog", sprint="Backlog")
    resp = client.post(f"/api/tasks/{task['id']}/promote")
    assert resp.status_code == 200, resp.text
    trail = _trail(client, task["id"])
    assert _fields(trail) == [("updated", "sprint"), ("updated", "status"), ("created", None)]
    assert (trail[1]["oldValue"], trail[1]["newValue"]) == ("backlog", "todo")
    assert trail[0]["oldValue"] == "Backlog"
    assert trail[0]["newValue"] == resp.json()["sprint"]


def test_delete_logs_deleted_tombstone(client):
    task = _create(client)
    _update(client, task, status="done")
    resp = client.delete(f"/api/tasks/{task['id']}")
    assert resp.status_code == 200, resp.text
    # The trail (incl. the 'deleted' tombstone) stays queryable after deletion.
    trail = _trail(client, task["id"])
    assert _fields(trail) == [
        ("deleted", None),
        ("updated", "status"),
        ("created", None),
    ]
    assert trail[0]["actor"] == ADMIN_NAME


def test_close_rollover_logs_moves_per_task(client):
    before = {t["id"]: t for t in client.get("/api/tasks").json()}
    moved_ids = {tid for tid, t in before.items() if t["sprint"] == "Sprint 14" and t["status"] != "done"}
    assert moved_ids, "seed must have unfinished Sprint 14 tasks"
    resp = client.post("/api/sprints/Sprint 14/close", json={"rolloverTo": "Sprint 15"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["moved"] == len(moved_ids)
    for task_id in moved_ids:
        trail = _trail(client, task_id)
        rollovers = [e for e in trail if e["action"] == "rollover"]
        assert len(rollovers) == 1
        assert (rollovers[0]["oldValue"], rollovers[0]["newValue"]) == ("Sprint 14", "Sprint 15")
        assert rollovers[0]["actor"] == ADMIN_NAME
    # Finished tasks stay put and gain no rollover entry.
    done_ids = [tid for tid, t in before.items() if t["status"] == "done"]
    assert done_ids
    for task_id in done_ids:
        assert all(e["action"] != "rollover" for e in _trail(client, task_id))


def test_close_without_target_logs_backlog_status(client):
    target_id = next(
        t["id"] for t in client.get("/api/tasks").json()
        if t["sprint"] == "Sprint 14" and t["status"] not in ("done", "backlog")
    )
    resp = client.post("/api/sprints/Sprint 14/close", json={})
    assert resp.status_code == 200, resp.text
    trail = _trail(client, target_id)
    assert any(
        e["action"] == "updated" and e["field"] == "status" and e["newValue"] == "backlog"
        for e in trail
    )
