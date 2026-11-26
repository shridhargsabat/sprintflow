"""Link-integrity + member-delete-disclosure tests (black-box HTTP + db lib).

Covers: (1) one-to-one user<->member links with 409 conflicts, (2) ghost-link
suppression + startup backfill, (3) DELETE /team semantics (default unassign,
optional ?reassignTo), (4) assignee/member-name validation.
"""
import itertools
import sqlite3
import uuid

import pytest
from fastapi import HTTPException

import auth as auth_lib
import db as db_lib

_counter = itertools.count()


def _unique_user(role="member"):
    n = next(_counter)
    email = f"linkprobe-{uuid.uuid4().hex[:8]}-{n}@sprintflow.local"
    return auth_lib.create_user(email, f"Probe {n}", "Probe123!", role)


def _team_by_id(client):
    resp = client.get("/api/team")
    assert resp.status_code == 200
    return {m["id"]: m for m in resp.json()}


def _add_member(client, **kwargs):
    body = {"name": "Probe Member", "role": "Engineer"}
    body.update(kwargs)
    resp = client.post("/api/team", json=body)
    return resp


def _insert_dangling(member_id, user_id):
    """Insert a member row pointing at a nonexistent user (FK off, raw SQL)."""
    with db_lib.get_conn() as conn:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute(
            "INSERT INTO team_members (id, name, role, color, user_id) VALUES (?, ?, ?, ?, ?)",
            (member_id, "Dangling", "Engineer", "bg-indigo-600", user_id),
        )


def _delete_member_row(member_id):
    with db_lib.get_conn() as conn:
        conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))


# ---------- (1) one-to-one links ----------

def test_link_user_to_member_ok(client):
    user = _unique_user()
    resp = _add_member(client, userId=user["id"])
    assert resp.status_code == 201
    body = resp.json()
    assert body["userId"] == user["id"]
    assert body["linkedUser"] == {"name": user["name"], "email": user["email"]}


def test_link_same_user_to_second_member_409(client):
    user = _unique_user()
    first = _add_member(client, name="First", userId=user["id"])
    assert first.status_code == 201
    second = _add_member(client, name="Second", userId=user["id"])
    assert second.status_code == 409


def test_put_conflicting_userId_409_but_same_member_reput_ok(client):
    user = _unique_user()
    a = _add_member(client, name="Member A", userId=user["id"])
    assert a.status_code == 201
    b = _add_member(client, name="Member B")
    assert b.status_code == 201
    b_id = b.json()["id"]

    # Linking B to A's user -> 409.
    resp = client.put(f"/api/team/{b_id}", json={"name": "Member B", "userId": user["id"]})
    assert resp.status_code == 409

    # Re-PUT of A with its own userId -> fine (200).
    a_id = a.json()["id"]
    resp = client.put(f"/api/team/{a_id}", json={"name": "Member A2", "userId": user["id"]})
    assert resp.status_code == 200
    assert resp.json()["userId"] == user["id"]


def test_put_explicit_null_unlinks(client):
    user = _unique_user()
    created = _add_member(client, name="Linked", userId=user["id"])
    assert created.status_code == 201
    mid = created.json()["id"]
    resp = client.put(f"/api/team/{mid}", json={"name": "Linked", "userId": None})
    assert resp.status_code == 200
    assert resp.json()["userId"] is None
    assert resp.json()["linkedUser"] is None


def test_link_unknown_user_400(client):
    resp = _add_member(client, name="Ghost", userId=999999999)
    assert resp.status_code == 400


def test_partial_unique_index_exists_allows_many_nulls(client):
    with db_lib.get_conn() as conn:
        idx = conn.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'uq_team_members_user_id'"
        ).fetchone()
    assert idx is not None and "WHERE user_id IS NOT NULL" in idx["sql"]
    # Two unlinked members coexist fine.
    assert _add_member(client, name="Null One").status_code == 201
    assert _add_member(client, name="Null Two").status_code == 201


# ---------- (2) ghost links ----------

def test_dangling_user_id_renders_null_linkedUser(client):
    _insert_dangling("m-dangling-probe", 42424242)
    try:
        members = _team_by_id(client)
        assert members["m-dangling-probe"]["linkedUser"] is None
    finally:
        _delete_member_row("m-dangling-probe")


def test_startup_backfill_nulls_dangling_user_id(client):
    _insert_dangling("m-backfill-probe", 43434343)
    try:
        db_lib.init_db()  # startup migrations
        members = _team_by_id(client)
        assert members["m-backfill-probe"]["userId"] is None
        assert members["m-backfill-probe"]["linkedUser"] is None
    finally:
        _delete_member_row("m-backfill-probe")


def test_startup_dedupe_keeps_lowest_rowid(client, tmp_path):
    """Legacy DB (pre-constraint schema, dup user_id) migrates cleanly."""
    legacy = str(tmp_path / "legacy.db")
    conn = sqlite3.connect(legacy)
    conn.execute(
        "CREATE TABLE team_members (id TEXT PRIMARY KEY, name TEXT NOT NULL, "
        "role TEXT NOT NULL DEFAULT 'Engineer', color TEXT NOT NULL DEFAULT 'bg-indigo-600', "
        "user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL)"
    )
    conn.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, "
        "name TEXT NOT NULL, password_hash TEXT NOT NULL, "
        "role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    conn.execute(
        "INSERT INTO users (id, email, name, password_hash, role) VALUES (7, 'dupe@t.local', 'Dupe', 'x', 'member')"
    )
    conn.execute(
        "INSERT INTO team_members (id, name, role, color, user_id) VALUES "
        "('m-dupe-keep', 'Keep', 'Engineer', 'bg-indigo-600', 7)"
    )
    conn.execute(
        "INSERT INTO team_members (id, name, role, color, user_id) VALUES "
        "('m-dupe-drop', 'Drop', 'Engineer', 'bg-indigo-600', 7)"
    )
    conn.commit()
    conn.close()

    db_lib.init_db(legacy)  # must not raise; dedupes then creates the index

    with db_lib.get_conn(legacy) as conn:
        rows = {
            r["id"]: r["user_id"]
            for r in conn.execute(
                "SELECT id, user_id FROM team_members WHERE id LIKE 'm-dupe-%'"
            )
        }
        idx = conn.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'uq_team_members_user_id'"
        ).fetchone()
    assert rows == {"m-dupe-keep": 7, "m-dupe-drop": None}
    assert idx is not None and "WHERE user_id IS NOT NULL" in idx["sql"]


# ---------- (3) DELETE /team ----------

def _seed_task(client, assignee_id):
    resp = client.post("/api/tasks", json={
        "title": "Leaver task", "dueDate": "2026-12-07", "assigneeId": assignee_id,
    })
    assert resp.status_code == 201
    return resp.json()


def test_delete_defaults_to_unassign(client):
    members = _team_by_id(client)
    victim = sorted(members)[-1]
    task = _seed_task(client, victim)
    owned_before = sum(1 for t in client.get("/api/tasks").json() if t["assigneeId"] == victim)
    resp = client.delete(f"/api/team/{victim}")
    assert resp.status_code == 200
    assert resp.json() == {
        "deleted": victim, "reassignedTasks": owned_before, "fallback": None,
    }
    tasks = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert tasks[task["id"]]["assigneeId"] is None
    assert victim not in _team_by_id(client)


def test_delete_with_reassignTo_moves_tasks(client):
    members = _team_by_id(client)
    ids = sorted(members)
    victim, target = ids[-1], ids[0]
    task = _seed_task(client, victim)
    owned_before = sum(1 for t in client.get("/api/tasks").json() if t["assigneeId"] == victim)
    resp = client.delete(f"/api/team/{victim}?reassignTo={target}")
    assert resp.status_code == 200
    assert resp.json() == {
        "deleted": victim, "reassignedTasks": owned_before, "fallback": target,
    }
    tasks = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert tasks[task["id"]]["assigneeId"] == target


def test_delete_with_unknown_reassignTo_400(client):
    members = _team_by_id(client)
    victim = sorted(members)[-1]
    resp = client.delete(f"/api/team/{victim}?reassignTo=m-no-such-member")
    assert resp.status_code == 400
    # Victim untouched.
    assert victim in _team_by_id(client)


def test_reassign_target_check_runs_before_last_member_guard(client):
    members = _team_by_id(client)
    ids = sorted(members)
    for mid in ids[1:]:
        assert client.delete(f"/api/team/{mid}").status_code == 200
    last = ids[0]
    resp = client.delete(f"/api/team/{last}?reassignTo=m-no-such-member")
    assert resp.status_code == 400
    assert "Reassign target" in resp.json()["detail"]


def test_delete_last_member_400_and_unknown_404(client):
    members = _team_by_id(client)
    ids = sorted(members)
    for mid in ids[1:]:
        assert client.delete(f"/api/team/{mid}").status_code == 200
    assert client.delete(f"/api/team/{ids[0]}").status_code == 400
    assert ids[0] in _team_by_id(client)


def test_delete_unknown_member_404(client):
    assert len(_team_by_id(client)) > 1
    assert client.delete("/api/team/m-does-not-exist").status_code == 404


# ---------- (4) validation ----------

def test_validate_assignee_id_rejects_unknown(client):
    members = _team_by_id(client)
    known = sorted(members)[0]
    with db_lib.get_conn() as conn:
        db_lib.validate_assignee_id(conn, None)  # unset: OK
        db_lib.validate_assignee_id(conn, known)  # known: OK
        with pytest.raises(HTTPException) as exc:
            db_lib.validate_assignee_id(conn, "m-no-such-member")
        assert exc.value.status_code == 400


@pytest.mark.parametrize("name", ["   ", "\t\n ", ""])
def test_blank_member_name_rejected(client, name):
    # "" trips pydantic min_length (422); whitespace-only must be 400.
    expected = 422 if name == "" else 400
    assert _add_member(client, name=name).status_code == expected


def test_update_member_blank_name_400(client):
    created = _add_member(client, name="Rename Me")
    assert created.status_code == 201
    resp = client.put(f"/api/team/{created.json()['id']}", json={"name": "   "})
    assert resp.status_code == 400
