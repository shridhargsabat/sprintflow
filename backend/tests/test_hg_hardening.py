"""Hermaguard Batch C regression tests: M1 (seed-once), M4 (import validation),
M5 (boolean userId rejection). M7 (AuthContext boot session) is a TSX-only
change with no frontend test runner — it is covered by `npm run build` (tsc).

M1 tests use isolated tmp DB files (never the shared session DB) so deleting
the seed admin here cannot break the suite's shared auth fixture.
"""
import logging
import uuid

import pytest

import db as db_lib


def _snapshot(client):
    return (client.get("/api/team").json(), client.get("/api/tasks").json())


def _assert_intact(client, before):
    assert _snapshot(client) == before


def _import_task(id="T-1", **overrides):
    row = {
        "id": id, "title": "t", "description": "", "assignees": [],
        "dueDate": "2026-12-20", "status": "todo", "priority": "medium",
        "sprint": "Sprint 99", "points": 3, "tag": "Backend",
    }
    row.update(overrides)
    return row


def _fresh_user_email(tag):
    return f"hg-{tag}-{uuid.uuid4().hex[:8]}@sprintflow.local"


# ---------- M1: seed admin only on fresh (empty-users) systems ----------

def test_m1_fresh_db_seeds_admin_with_public_password(tmp_path):
    import bcrypt

    p = str(tmp_path / "m1-fresh.db")
    db_lib.init_db(p)
    with db_lib.get_conn(p) as conn:
        rows = conn.execute("SELECT email, name, password_hash, role FROM users").fetchall()
    assert len(rows) == 1
    assert rows[0]["email"] == db_lib.SEED_ADMIN_EMAIL
    assert rows[0]["role"] == "admin"
    assert bcrypt.checkpw(b"Admin123!", rows[0]["password_hash"].encode("utf-8"))


def test_m1_seeding_logs_loudly_but_repeat_init_is_silent(tmp_path, caplog):
    p = str(tmp_path / "m1-log.db")
    with caplog.at_level(logging.WARNING, logger="sprintflow.db"):
        db_lib.init_db(p)
    assert "seeded default admin" in caplog.text
    assert db_lib.SEED_ADMIN_EMAIL in caplog.text
    caplog.clear()
    with db_lib.get_conn(p) as conn:
        before = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    with caplog.at_level(logging.WARNING, logger="sprintflow.db"):
        db_lib.init_db(p)
    assert caplog.text == ""
    with db_lib.get_conn(p) as conn:
        after = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    assert (before, after) == (1, 1)


def test_m1_deleted_admin_not_resurrected_while_other_users_exist(tmp_path):
    import bcrypt

    p = str(tmp_path / "m1-nores.db")
    db_lib.init_db(p)
    other_hash = bcrypt.hashpw(b"Other123!", bcrypt.gensalt()).decode("utf-8")
    with db_lib.get_conn(p) as conn:
        conn.execute(
            "INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)",
            ("keeper@sprintflow.local", "Keeper", other_hash, "admin"),
        )
        conn.execute("DELETE FROM users WHERE email = ?", (db_lib.SEED_ADMIN_EMAIL,))
    db_lib.init_db(p)  # simulated restart must NOT resurrect the seed admin
    with db_lib.get_conn(p) as conn:
        rows = conn.execute("SELECT email FROM users").fetchall()
    assert [r["email"] for r in rows] == ["keeper@sprintflow.local"]


# ---------- M4: import validates rows with single-item rules ----------

def test_m4_import_missing_title_400_with_row_error_and_data_intact(client):
    before = _snapshot(client)
    resp = client.post("/api/import", json={"team": [], "tasks": [_import_task(id="BAD-1", title=None)]})
    # title=None is dropped below; build a truly title-less row instead
    assert resp.status_code == 400  # explicit null is malformed too
    row = _import_task(id="BAD-1")
    del row["title"]
    resp = client.post("/api/import", json={"team": [], "tasks": [row]})
    assert resp.status_code == 400, resp.text
    errors = resp.json()["detail"]["errors"]
    assert any("tasks[0]" in e and "title" in e for e in errors), errors
    _assert_intact(client, before)


@pytest.mark.parametrize("field,value", [
    ("status", "hacked"),
    ("priority", "urgent"),
    ("points", 999999999),
    ("points", 0),
    ("points", "not-a-number"),
    ("dueDate", "x"),
    ("description", "d" * 10001),
    ("sprint", "s" * 101),
    ("tag", "t" * 61),
    ("title", "t" * 201),
])
def test_m4_import_malformed_task_values_400(client, field, value):
    before = _snapshot(client)
    resp = client.post(
        "/api/import", json={"team": [], "tasks": [_import_task(id="BAD-2", **{field: value})]}
    )
    assert resp.status_code == 400, (field, resp.text)
    assert "tasks[0]" in resp.text
    _assert_intact(client, before)


def test_m4_import_missing_blank_duplicate_ids_400(client):
    before = _snapshot(client)
    no_id = _import_task(id="X")
    del no_id["id"]
    resp = client.post("/api/import", json={"team": [], "tasks": [no_id]})
    assert resp.status_code == 400 and "tasks[0].id" in resp.text
    resp = client.post("/api/import", json={
        "team": [], "tasks": [_import_task(id="DUP"), _import_task(id="DUP")]})
    assert resp.status_code == 400 and "duplicate task id" in resp.text
    resp = client.post("/api/import", json={
        "team": [
            {"id": "m1", "name": "A"},
            {"id": "m1", "name": "B"},
        ], "tasks": []})
    assert resp.status_code == 400 and "duplicate member id" in resp.text
    resp = client.post("/api/import", json={"team": ["nope"], "tasks": [42]})
    assert resp.status_code == 400
    assert "team[0]" in resp.text and "tasks[0]" in resp.text
    _assert_intact(client, before)


def test_m4_import_team_row_requires_name(client):
    before = _snapshot(client)
    resp = client.post("/api/import", json={
        "team": [{"id": "mx", "role": "Dev"}], "tasks": []})
    assert resp.status_code == 400, resp.text
    assert "team[0]" in resp.text and "name" in resp.text
    resp = client.post("/api/import", json={
        "team": [{"id": "mx", "name": "   "}], "tasks": []})
    assert resp.status_code == 400 and "blank" in resp.text
    resp = client.post("/api/import", json={
        "team": [{"id": "mx", "name": "n", "role": "r" * 101}], "tasks": []})
    assert resp.status_code == 400 and "team[0]" in resp.text
    _assert_intact(client, before)


def test_m4_import_minimal_rows_with_defaults_still_pass(client):
    resp = client.post("/api/import", json={
        "team": [{"id": "mm", "name": "Minimal"}],
        "tasks": [{"id": "MIN-1", "title": "Minimal task"}],
    })
    assert resp.status_code == 200, resp.text
    got = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert got["MIN-1"]["status"] == "todo"
    assert got["MIN-1"]["points"] == 3


def test_m4_import_too_many_assignees_400(client):
    members = client.get("/api/team").json()
    refs = [{"type": "member", "id": m["id"]} for m in members] * 3  # 18 > 10
    before = _snapshot(client)
    resp = client.post("/api/import", json={
        "team": [], "tasks": [_import_task(id="MANY", assignees=refs)]})
    assert resp.status_code == 400 and "assignees" in resp.text
    _assert_intact(client, before)


def test_m4_import_team_list_cap_400(client):
    before = _snapshot(client)
    team = [{"id": f"mcap-{i}", "name": "Cap"} for i in range(1001)]
    resp = client.post("/api/import", json={"team": team, "tasks": []})
    assert resp.status_code == 400 and "Too many team members" in resp.text
    _assert_intact(client, before)


def test_m4_import_tasks_list_cap_400(client):
    before = _snapshot(client)
    tasks = [{"id": f"cap-{i}", "title": "t"} for i in range(10001)]
    resp = client.post("/api/import", json={"team": [], "tasks": tasks})
    assert resp.status_code == 400 and "Too many tasks" in resp.text
    _assert_intact(client, before)


def test_m4_import_body_size_cap_400(client):
    before = _snapshot(client)
    big = "x" * 10000
    tasks = [_import_task(id=f"big-{i}", description=big) for i in range(600)]
    resp = client.post("/api/import", json={"team": [], "tasks": tasks})
    assert resp.status_code == 400 and "too large" in resp.text
    _assert_intact(client, before)


def test_m4_single_item_free_text_caps_are_422(client):
    base = {"title": "t", "dueDate": "2026-12-05"}
    assert client.post("/api/tasks", json={**base, "description": "d" * 10001}).status_code == 422
    assert client.post("/api/tasks", json={**base, "sprint": "s" * 101}).status_code == 422
    assert client.post("/api/tasks", json={**base, "tag": "t" * 61}).status_code == 422
    assert client.post("/api/team", json={"name": "n", "role": "r" * 101}).status_code == 422
    assert client.post("/api/team", json={"name": "n", "color": "c" * 41}).status_code == 422
    # Boundary values still pass.
    assert client.post("/api/tasks", json={**base, "description": "d" * 10000}).status_code == 201
    assert client.post("/api/team", json={"name": "n", "role": "r" * 100}).status_code == 201


# ---------- M5: boolean userIds are 400 everywhere ----------

@pytest.mark.parametrize("flag", [True, False])
def test_m5_task_assignee_bool_user_id_400(client, flag):
    base = {"title": "t", "dueDate": "2026-12-05"}
    resp = client.post("/api/tasks", json={**base, "assignees": [{"type": "user", "id": flag}]})
    assert resp.status_code == 400, resp.text
    created = client.post("/api/tasks", json=base).json()
    resp = client.put(
        f"/api/tasks/{created['id']}",
        json={**base, "assignees": [{"type": "user", "id": flag}]},
    )
    assert resp.status_code == 400, resp.text


def test_m5_numeric_string_user_id_still_works(client):
    me = client.get("/api/auth/me").json()
    resp = client.post("/api/tasks", json={
        "title": "t", "dueDate": "2026-12-05",
        "assignees": [{"type": "user", "id": str(me["id"])}],
    })
    assert resp.status_code == 201, resp.text
    assert resp.json()["assignees"][0]["id"] == me["id"]


@pytest.mark.parametrize("flag", [True, False])
def test_m5_member_payload_bool_user_id_400(client, flag):
    member = client.get("/api/team").json()[0]
    resp = client.post("/api/team", json={"name": "Bool Member", "userId": flag})
    assert resp.status_code == 400, resp.text
    resp = client.put(f"/api/team/{member['id']}", json={"name": member["name"], "userId": flag})
    assert resp.status_code == 400, resp.text


def test_m5_member_numeric_string_user_id_still_works(client):
    email = _fresh_user_email("m5str")
    created = client.post("/api/auth/users", json={
        "email": email, "name": "M5 Str", "password": "Str12345!", "role": "member",
    })
    assert created.status_code == 201, created.text
    resp = client.post("/api/team", json={"name": "Str Link", "userId": str(created.json()["id"])})
    assert resp.status_code == 201, resp.text
    assert resp.json()["userId"] == created.json()["id"]


@pytest.mark.parametrize("flag", [True, False])
def test_m5_import_team_userId_bool_400_and_intact(client, flag):
    before = _snapshot(client)
    resp = client.post("/api/import", json={
        "team": [{"id": "mxb", "name": "Bool Link", "userId": flag}], "tasks": []})
    assert resp.status_code == 400, resp.text
    assert "userId" in resp.text
    _assert_intact(client, before)


@pytest.mark.parametrize("flag", [True, False])
def test_m5_import_task_assignee_bool_400_and_intact(client, flag):
    before = _snapshot(client)
    resp = client.post("/api/import", json={
        "team": [],
        "tasks": [_import_task(id="BOOL-1", assignees=[{"type": "user", "id": flag}])],
    })
    assert resp.status_code == 400, resp.text
    legacy = _import_task(id="BOOL-2")
    del legacy["assignees"]
    legacy["assigneeUserId"] = flag
    resp = client.post("/api/import", json={"team": [], "tasks": [legacy]})
    assert resp.status_code == 400, resp.text
    _assert_intact(client, before)
