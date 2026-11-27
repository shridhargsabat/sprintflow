"""Black-box HTTP tests for multi-tagging: task.tags arrays over the
task_tags join table, master validation, legacy migration backfill, and
import/export round-trips (including the legacy single-tag shape)."""
import db as db_lib

TASK_KEYS = {
    "id", "title", "description", "assignees",
    "dueDate", "status", "priority", "sprint", "points", "tags",
}


def _payload(title="Multi-tag probe", **overrides):
    data = {
        "title": title,
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


def _all_tasks(client):
    resp = client.get("/api/tasks")
    assert resp.status_code == 200
    return resp.json()


def _tag_counts(client):
    return {t["name"]: t["taskCount"] for t in client.get("/api/tags").json()}


# ---------- response shape ----------

def test_task_shape_carries_tags_array_not_tag(client):
    tasks = _all_tasks(client)
    assert tasks
    for task in tasks:
        assert TASK_KEYS <= set(task), f"task missing keys: {task}"
        assert "tag" not in task
        assert isinstance(task["tags"], list)


# ---------- create / update ----------

def test_create_task_with_two_tags(client):
    resp = client.post("/api/tasks", json=_payload(tags=["QA", "Backend"]))
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert created["tags"] == ["Backend", "QA"]  # canonical NOCASE order
    got = next(t for t in _all_tasks(client) if t["id"] == created["id"])
    assert got["tags"] == ["Backend", "QA"]


def test_create_task_omitted_tags_defaults_to_frontend(client):
    body = _payload()
    del body["tags"]
    resp = client.post("/api/tasks", json=body)
    assert resp.status_code == 201, resp.text
    assert resp.json()["tags"] == ["Frontend"]


def test_create_task_empty_tags_stays_untagged(client):
    resp = client.post("/api/tasks", json=_payload(tags=[]))
    assert resp.status_code == 201, resp.text
    assert resp.json()["tags"] == []


def test_create_task_dedupes_and_canonicalizes_tags(client):
    resp = client.post(
        "/api/tasks", json=_payload(tags=["backend", "QA", "Backend", "qa"])
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["tags"] == ["Backend", "QA"]


def test_update_task_replaces_and_clears_tags(client):
    created = client.post("/api/tasks", json=_payload(tags=["QA"])).json()
    assert created["tags"] == ["QA"]

    updated = client.put(
        f"/api/tasks/{created['id']}", json=_payload(tags=["API", "Design"])
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["tags"] == ["API", "Design"]

    cleared = client.put(
        f"/api/tasks/{created['id']}", json=_payload(tags=[])
    )
    assert cleared.status_code == 200
    assert cleared.json()["tags"] == []

    # Omitted tags on PUT resets to the ["Frontend"] default (same as the
    # old single-tag default; PUT is a full replacement).
    body = _payload()
    del body["tags"]
    defaulted = client.put(f"/api/tasks/{created['id']}", json=body)
    assert defaulted.status_code == 200
    assert defaulted.json()["tags"] == ["Frontend"]


def test_create_and_update_unknown_tag_400_and_stored_tags_intact(client):
    resp = client.post("/api/tasks", json=_payload(tags=["QA", "No Such Tag"]))
    assert resp.status_code == 400
    assert "No Such Tag" in resp.text

    created = client.post("/api/tasks", json=_payload(tags=["QA"])).json()
    resp = client.put(
        f"/api/tasks/{created['id']}", json=_payload(tags=["No Such Tag"])
    )
    assert resp.status_code == 400
    got = next(t for t in _all_tasks(client) if t["id"] == created["id"])
    assert got["tags"] == ["QA"]


def test_tags_must_be_a_list_of_short_strings(client):
    base = {"title": "t", "dueDate": "2026-12-05"}
    assert client.post("/api/tasks", json={**base, "tags": "QA"}).status_code == 422
    assert client.post(
        "/api/tasks", json={**base, "tags": ["t" * 61]}
    ).status_code == 422


# ---------- tag master interplay ----------

def test_multitag_task_counts_for_every_tag(client):
    before = _tag_counts(client)
    created = client.post("/api/tasks", json=_payload(tags=["API", "QA"])).json()
    after = _tag_counts(client)
    assert after["API"] == before["API"] + 1
    assert after["QA"] == before["QA"] + 1
    # Detaching decrements only the detached tag.
    client.put(f"/api/tasks/{created['id']}", json=_payload(tags=["QA"]))
    final = _tag_counts(client)
    assert final["API"] == before["API"]
    assert final["QA"] == before["QA"] + 1


def test_rename_tag_updates_every_task_link(client):
    created = client.post("/api/tags", json={"name": "Mobile"}).json()
    one = client.post("/api/tasks", json=_payload(tags=["Mobile", "QA"])).json()
    two = client.post("/api/tasks", json=_payload(tags=["Mobile"])).json()
    resp = client.put(f"/api/tags/{created['id']}", json={"name": "Mobile Apps"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["taskCount"] == 2
    got = {t["id"]: t for t in _all_tasks(client)}
    assert got[one["id"]]["tags"] == ["Mobile Apps", "QA"]
    assert got[two["id"]]["tags"] == ["Mobile Apps"]


def test_delete_tag_used_by_multitagged_task_409(client):
    before = _tag_counts(client)
    assert before["Frontend"] > 0
    resp = client.delete("/api/tags/frontend")
    assert resp.status_code == 409, resp.text
    assert resp.json() == {"tasks": before["Frontend"]}
    assert "frontend" in {t["id"] for t in client.get("/api/tags").json()}


def test_search_matches_tag_names(client):
    probe = client.post(
        "/api/tasks",
        json=_payload(title="Zebra qzx probe", tags=["DevOps"]),
    ).json()
    resp = client.get("/api/tasks", params={"search": "devops"})
    assert resp.status_code == 200
    assert probe["id"] in {t["id"] for t in resp.json()}


# ---------- legacy migration ----------

def test_legacy_tag_column_migrated_to_join_table(tmp_path):
    """Legacy DB (tasks.tag column) backfills task_tags, then drops it."""
    import sqlite3

    legacy = str(tmp_path / "legacy-tags.db")
    conn = sqlite3.connect(legacy)
    conn.executescript(
        """
        CREATE TABLE team_members (id TEXT PRIMARY KEY, name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Engineer', color TEXT NOT NULL DEFAULT 'bg-indigo-600',
            user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL);
        CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '', due_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'medium',
            sprint TEXT NOT NULL DEFAULT 'Sprint 14', points INTEGER NOT NULL DEFAULT 3,
            tag TEXT NOT NULL DEFAULT 'Frontend',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL, password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL DEFAULT (datetime('now')));
        INSERT INTO tasks (id, title, due_date, tag) VALUES ('DEV-800', 'Known', '2026-12-01', 'QA');
        INSERT INTO tasks (id, title, due_date, tag) VALUES ('DEV-801', 'Unknown stream', '2026-12-01', 'Observability');
        INSERT INTO tasks (id, title, due_date, tag) VALUES ('DEV-802', 'Blank', '2026-12-01', '   ');
        """
    )
    conn.commit()
    conn.close()

    db_lib.init_db(legacy)  # must not raise; backfills then drops the column
    db_lib.init_db(legacy)  # idempotent re-run

    with db_lib.get_conn(legacy) as conn:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()]
        assert "tag" not in cols
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
        # Unknown legacy values are get-or-created in the master, never lost.
        names = {r["name"] for r in conn.execute("SELECT name FROM tags").fetchall()}
        assert {"QA", "Observability", "Frontend"} <= names
    tasks = {t["id"]: t for t in db_lib.list_tasks(db_path=legacy)}
    assert tasks["DEV-800"]["tags"] == ["QA"]
    assert tasks["DEV-801"]["tags"] == ["Observability"]
    assert tasks["DEV-802"]["tags"] == ["Frontend"]


# ---------- import / export ----------

def test_export_import_round_trip_preserves_tags(client):
    client.post("/api/tasks", json=_payload(title="Two-tag probe", tags=["API", "QA"]))
    client.post("/api/tasks", json=_payload(title="Untagged probe", tags=[]))
    exported = client.get("/api/export").json()
    assert all("tags" in t and "tag" not in t for t in exported["tasks"])

    resp = client.post(
        "/api/import",
        json={"team": exported["team"], "tasks": exported["tasks"]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["warnings"] == []
    got = {t["id"]: t for t in _all_tasks(client)}
    want = {t["id"]: t["tags"] for t in exported["tasks"]}
    assert {t["id"] for t in got.values()} == set(want)
    for task_id, tags in want.items():
        assert got[task_id]["tags"] == tags, task_id


def test_import_legacy_single_tag_rows_migrate_to_tags(client):
    payload = {
        "team": [],
        "tasks": [
            {
                "id": "LEG-1", "title": "Legacy tagged", "description": "",
                "assignees": [], "dueDate": "2026-12-20", "status": "todo",
                "priority": "medium", "sprint": "Sprint 99", "points": 3,
                "tag": "Backend",
            },
            {
                "id": "LEG-2", "title": "Legacy new stream", "description": "",
                "assignees": [], "dueDate": "2026-12-20", "status": "todo",
                "priority": "low", "sprint": "Sprint 99", "points": 2,
                "tag": "Observability",
            },
        ],
    }
    resp = client.post("/api/import", json=payload)
    assert resp.status_code == 200, resp.text
    assert any("Observability" in w for w in resp.json()["warnings"])
    got = {t["id"]: t for t in _all_tasks(client)}
    assert got["LEG-1"]["tags"] == ["Backend"]
    assert got["LEG-2"]["tags"] == ["Observability"]


def test_import_malformed_tags_400_and_data_intact(client):
    before = (client.get("/api/team").json(), client.get("/api/tasks").json())
    bad_row = {
        "id": "BAD-T", "title": "t", "description": "", "assignees": [],
        "dueDate": "2026-12-20", "status": "todo", "priority": "medium",
        "sprint": "Sprint 99", "points": 3, "tags": "QA",
    }
    resp = client.post("/api/import", json={"team": [], "tasks": [bad_row]})
    assert resp.status_code == 400, resp.text
    assert "tasks[0]" in resp.text
    assert (client.get("/api/team").json(), client.get("/api/tasks").json()) == before
