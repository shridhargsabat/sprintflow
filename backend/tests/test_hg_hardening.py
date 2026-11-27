"""Hermaguard Batch C regression tests: M1 (seed-once), M4 (import validation),
M5 (boolean userId rejection). M7 (AuthContext boot session) is a TSX-only
change with no frontend test runner — it is covered by `npm run build` (tsc).

M1 tests use isolated tmp DB files (never the shared session DB) so deleting
the seed admin here cannot break the suite's shared auth fixture.

LOW hygiene sweep (L1-L3, L8-L15): appended below in the same file. L4/L5/L6/
L7/L16 are frontend-only (tsc-covered); every backend LOW fix has tests here.
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
        "sprint": "Sprint 99", "points": 3, "tags": ["Backend"],
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
    ("tags", ["t" * 61]),
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
    assert client.post("/api/tasks", json={**base, "tags": ["t" * 61]}).status_code == 422
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


# ---------- LOW hygiene sweep (L1-L3, L8-L15) ----------
# L4/L5/L6/L7/L16 are TSX/CSS-only (no frontend test runner) — covered by
# `npm run build` (tsc). Every backend fix below has a regression test.

def _task_text(t):
    return f"{t['id']} {t['title']} {t['description']} {' '.join(t['tags'])}"


def test_l1_search_escapes_like_wildcards(client):
    assert client.post(
        "/api/tasks", json={"title": "100% coverage drive", "dueDate": "2026-12-05"}
    ).status_code == 201
    assert client.post(
        "/api/tasks", json={"title": "under_score task", "dueDate": "2026-12-05"}
    ).status_code == 201
    assert client.post(
        "/api/tasks", json={"title": "back\\slash path", "dueDate": "2026-12-05"}
    ).status_code == 201
    everything = client.get("/api/tasks").json()
    for needle in ("%", "_", "\\"):
        got = client.get("/api/tasks", params={"search": needle}).json()
        expected = {t["id"] for t in everything if needle in _task_text(t)}
        assert {t["id"] for t in got} == expected, needle
        assert got, f"nothing matched literal {needle!r}"
        assert len(got) < len(everything)  # pre-fix: unescaped % matched all


@pytest.mark.parametrize("blank", ["   ", "\t\n "])
def test_l2_whitespace_title_400_on_create_and_update(client, blank):
    base = {"title": blank, "dueDate": "2026-12-05"}
    resp = client.post("/api/tasks", json=base)
    assert resp.status_code == 400, resp.text
    assert "blank" in resp.text
    created = client.post("/api/tasks", json={"title": "L2", "dueDate": "2026-12-05"}).json()
    resp = client.put(f"/api/tasks/{created['id']}", json=base)
    assert resp.status_code == 400, resp.text


def test_l2_sprint_stripped_and_blank_sprint_400(client):
    resp = client.post("/api/tasks", json={
        "title": "L2 sprint", "dueDate": "2026-12-05", "sprint": "  Sprint 14  ",
    })
    assert resp.status_code == 201, resp.text
    assert resp.json()["sprint"] == "Sprint 14"
    resp = client.post("/api/tasks", json={
        "title": "L2 blank sprint", "dueDate": "2026-12-05", "sprint": "   ",
    })
    assert resp.status_code == 400, resp.text


def test_l2_import_blank_title_sprint_400_and_stripped_on_success(client):
    before = _snapshot(client)
    resp = client.post("/api/import", json={
        "team": [], "tasks": [_import_task(id="WS-1", title="   ")]})
    assert resp.status_code == 400, resp.text
    assert "tasks[0].title" in resp.text
    resp = client.post("/api/import", json={
        "team": [], "tasks": [_import_task(id="WS-2", sprint="  ")]})
    assert resp.status_code == 400, resp.text
    assert "tasks[0].sprint" in resp.text
    _assert_intact(client, before)
    resp = client.post("/api/import", json={
        "team": [],
        "tasks": [_import_task(id="WS-3", title="  Padded  ", sprint="  Sprint 99  ")],
    })
    assert resp.status_code == 200, resp.text
    got = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert got["WS-3"]["title"] == "Padded"
    assert got["WS-3"]["sprint"] == "Sprint 99"


def test_l3_reassigned_count_excludes_deduped_tasks(client):
    leaver = client.post("/api/team", json={"name": "L3 Leaver"}).json()
    keeper = client.post("/api/team", json={"name": "L3 Keeper"}).json()
    solo = {"title": "solo", "dueDate": "2026-12-05",
            "assignees": [{"type": "member", "id": leaver["id"]}]}
    co_owned = {"title": "co", "dueDate": "2026-12-05", "assignees": [
        {"type": "member", "id": leaver["id"]},
        {"type": "member", "id": keeper["id"]},
    ]}
    assert client.post("/api/tasks", json=solo).status_code == 201
    assert client.post("/api/tasks", json=co_owned).status_code == 201
    resp = client.delete(f"/api/team/{leaver['id']}", params={"reassignTo": keeper["id"]})
    assert resp.status_code == 200, resp.text
    # Only the solo task actually moved; the co-owned one was deduped.
    assert resp.json() == {
        "deleted": leaver["id"], "reassignedTasks": 1, "fallback": keeper["id"],
    }


def test_l3_unassign_branch_still_reports_owned_count(client):
    leaver = client.post("/api/team", json={"name": "L3 Gone"}).json()
    for i in range(2):
        assert client.post("/api/tasks", json={
            "title": f"g{i}", "dueDate": "2026-12-05",
            "assignees": [{"type": "member", "id": leaver["id"]}],
        }).status_code == 201
    resp = client.delete(f"/api/team/{leaver['id']}")
    assert resp.json() == {
        "deleted": leaver["id"], "reassignedTasks": 2, "fallback": None,
    }


def test_l8_delete_tag_guarded_paths(client):
    tag = client.post("/api/tags", json={"name": "L8 Doomed"}).json()
    assert client.delete("/api/tags/no-such-tag").status_code == 404
    task = client.post("/api/tasks", json={
        "title": "L8 user", "dueDate": "2026-12-05", "tags": ["L8 Doomed"],
    }).json()
    resp = client.delete(f"/api/tags/{tag['id']}")
    assert resp.status_code == 409, resp.text
    assert resp.json() == {"tasks": 1}
    assert client.put(f"/api/tasks/{task['id']}", json={
        "title": "L8 user", "dueDate": "2026-12-05", "tags": ["Backend"],
    }).status_code == 200
    resp = client.delete(f"/api/tags/{tag['id']}")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": tag["id"]}


def test_l8_delete_blocked_when_usage_arrives_mid_delete(client, monkeypatch):
    """Deterministic TOCTOU simulation: a task is tagged after the usage
    check but before the DELETE lands — the guarded delete must block it
    (409) instead of orphaning the tag usage."""
    from contextlib import contextmanager

    tag = client.post("/api/tags", json={"name": "L8 Racy"}).json()
    real_get_conn = db_lib.get_conn

    class _DeleteSaboteur:
        def __init__(self, real):
            self._real = real

        def execute(self, sql, parameters=()):
            if isinstance(sql, str) and sql.strip().upper().startswith("DELETE FROM TAGS"):
                self._real.execute(
                    "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES ((SELECT id FROM tasks LIMIT 1), ?)",
                    (tag["id"],),
                )
            return self._real.execute(sql, parameters)

        def __getattr__(self, item):
            return getattr(self._real, item)

    @contextmanager
    def _sabotaging_conn(db_path=None):
        with real_get_conn(db_path) as real:
            yield _DeleteSaboteur(real)

    monkeypatch.setattr(db_lib, "get_conn", _sabotaging_conn)
    resp = client.delete(f"/api/tags/{tag['id']}")
    assert resp.status_code == 409, resp.text
    assert resp.json() == {"tasks": 1}
    assert tag["id"] in {t["id"] for t in client.get("/api/tags").json()}


class _NoRow:
    """Cursor stub whose fetchone() returns None (row vanished / SELECT miss)."""

    def fetchone(self):
        return None


def test_l9_ensure_tag_race_loser_reselects_winner(tmp_path):
    """Deterministic race-loser simulation: the first name-SELECT misses (the
    winner hasn't committed yet), the INSERT then hits UNIQUE, and the
    reselect-by-name returns the winner instead of raising 500."""
    p = str(tmp_path / "l9.db")
    db_lib.init_db(p)
    with db_lib.get_conn(p) as conn:
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES (?, ?, ?)",
            ("l9-racer", "L9 Racer", "bg-sky-600"),
        )

    class _RaceLoserConn:
        def __init__(self, real):
            self._real = real
            self._dropped = False

        def execute(self, sql, parameters=()):
            if (
                not self._dropped
                and isinstance(sql, str)
                and "SELECT id FROM tags WHERE name" in sql
            ):
                self._dropped = True
                return _NoRow()
            return self._real.execute(sql, parameters)

        def __getattr__(self, item):
            return getattr(self._real, item)

    with db_lib.get_conn(p) as real:
        tag_id, created = db_lib.ensure_tag(
            _RaceLoserConn(real),  # type: ignore[arg-type]  # deliberate proxy
            "L9 Racer",
            "#fff",
        )
    assert (tag_id, created) == ("l9-racer", False)
    with db_lib.get_conn(p) as conn:
        n = conn.execute(
            "SELECT COUNT(*) FROM tags WHERE name = ? COLLATE NOCASE", ("L9 Racer",)
        ).fetchone()[0]
    assert n == 1


def test_l9_ensure_tag_concurrent_same_name_single_row(tmp_path):
    import threading

    p = str(tmp_path / "l9c.db")
    db_lib.init_db(p)
    barrier = threading.Barrier(8)
    results, errors = [], []

    def _worker():
        try:
            with db_lib.get_conn(p) as conn:
                barrier.wait(timeout=15)
                results.append(db_lib.ensure_tag(conn, "L9 Stampede", "#fff"))
        except Exception as exc:  # noqa: BLE001 — collected, asserted below
            errors.append(exc)

    threads = [threading.Thread(target=_worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert not errors
    assert len(results) == 8
    assert {r[0] for r in results} == {"l9-stampede"}
    assert sum(1 for r in results if r[1]) == 1
    with db_lib.get_conn(p) as conn:
        n = conn.execute(
            "SELECT COUNT(*) FROM tags WHERE name = ? COLLATE NOCASE", ("L9 Stampede",)
        ).fetchone()[0]
    assert n == 1


def test_l10_case_variant_tag_create_409(client):
    assert client.post("/api/tags", json={"name": "L10 CaseTag"}).status_code == 201
    for variant in ("l10 casetag", "L10 CASETAG"):
        resp = client.post("/api/tags", json={"name": variant})
        assert resp.status_code == 409, (variant, resp.text)


def test_l10_nocase_index_blocks_direct_case_dupes(tmp_path):
    import sqlite3

    p = str(tmp_path / "l10.db")
    db_lib.init_db(p)
    with db_lib.get_conn(p) as conn:
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES (?, ?, ?)",
            ("l10-a", "L10 DupName", "bg-sky-600"),
        )
        idx = conn.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'uq_tags_name_nocase'"
        ).fetchone()
        assert idx is not None and "COLLATE NOCASE" in idx["sql"]
    with db_lib.get_conn(p) as conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO tags (id, name, color) VALUES (?, ?, ?)",
                ("l10-b", "l10 dupname", "bg-sky-600"),
            )


def test_l10_startup_folds_legacy_case_dupes(tmp_path):
    p = str(tmp_path / "l10mig.db")
    db_lib.init_db(p)
    with db_lib.get_conn(p) as conn:
        conn.execute("DROP INDEX uq_tags_name_nocase")
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES (?, ?, ?)",
            ("l10-winner", "L10 FoldMe", "bg-sky-600"),
        )
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES (?, ?, ?)",
            ("l10-loser", "l10 foldme", "bg-rose-600"),
        )
        conn.execute(
            """INSERT INTO tasks
                   (id, title, description, due_date, status, priority, sprint, points)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            ("L10-T", "fold task", "", "2026-12-05", "todo", "medium",
             "Sprint 14", 3),
        )
        conn.execute(
            "INSERT INTO task_tags (task_id, tag_id) VALUES ('L10-T', 'l10-loser')"
        )
    db_lib.init_db(p)  # migration folds the dupe pair
    with db_lib.get_conn(p) as conn:
        rows = conn.execute(
            "SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE", ("L10 FoldMe",)
        ).fetchall()
        assert [(r["id"], r["name"]) for r in rows] == [("l10-winner", "L10 FoldMe")]
        links = conn.execute(
            "SELECT tag_id FROM task_tags WHERE task_id = 'L10-T'"
        ).fetchall()
        assert [r["tag_id"] for r in links] == ["l10-winner"]
        assert db_lib.tags_for_task(conn, "L10-T") == ["L10 FoldMe"]
        idx = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE name = 'uq_tags_name_nocase'"
        ).fetchone()
        assert idx is not None


def test_l11_usage_counted_by_canonical_name_only(client):
    # Craft a cross name/id collision: task tag "L11 Shared" matches tag A's
    # name AND tag B's id — it must count for A only.
    with db_lib.get_conn() as conn:
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES (?, ?, ?)",
            ("l11-a", "L11 Shared", "bg-sky-600"),
        )
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES (?, ?, ?)",
            ("l11 shared", "L11 Unrelated", "bg-sky-600"),
        )
    assert client.post("/api/tasks", json={
        "title": "L11 user", "dueDate": "2026-12-05", "tags": ["L11 Shared"],
    }).status_code == 201
    by_name = {t["name"]: t for t in client.get("/api/tags").json()}
    assert by_name["L11 Shared"]["taskCount"] == 1
    assert by_name["L11 Unrelated"]["taskCount"] == 0


def test_l11_slug_id_input_stored_as_canonical_name(client):
    created = client.post("/api/tasks", json={
        "title": "L11 canon", "dueDate": "2026-12-05", "tags": ["frontend"],
    })
    assert created.status_code == 201, created.text
    assert created.json()["tags"] == ["Frontend"]
    updated = client.put(f"/api/tasks/{created.json()['id']}", json={
        "title": "L11 canon", "dueDate": "2026-12-05", "tags": ["backend"],
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["tags"] == ["Backend"]


def test_l12_task_vanished_mid_update_404_not_500(client, monkeypatch):
    created = client.post("/api/tasks", json={
        "title": "L12 ghost", "dueDate": "2026-12-05",
        "assignees": [{"type": "member", "id": "m1"}],
    }).json()
    real_validate = db_lib.validate_assignees

    def _vanishing(conn, assignees):
        out = real_validate(conn, assignees)
        # A concurrent deleter lands between our existence check and UPDATE.
        conn.execute("DELETE FROM tasks WHERE id = ?", (created["id"],))
        return out

    monkeypatch.setattr(db_lib, "validate_assignees", _vanishing)
    resp = client.put(f"/api/tasks/{created['id']}", json={
        "title": "L12 ghost v2", "dueDate": "2026-12-06",
        "assignees": [{"type": "member", "id": "m1"}],
    })
    assert resp.status_code == 404, resp.text  # pre-fix: 500 via FK insert


def test_l13_sprint_vanished_mid_update_returns_none(tmp_path, monkeypatch):
    from contextlib import contextmanager

    p = str(tmp_path / "l13.db")
    db_lib.init_db(p)
    real_get_conn = db_lib.get_conn

    class _VanishingSprintConn:
        def __init__(self, real):
            self._real = real

        def execute(self, sql, parameters=()):
            if isinstance(sql, str) and sql.strip().upper().startswith("SELECT * FROM SPRINTS"):
                return _NoRow()  # reset raced us: row gone at reselect
            return self._real.execute(sql, parameters)

        def __getattr__(self, item):
            return getattr(self._real, item)

    @contextmanager
    def _vanishing_conn(db_path=None):
        with real_get_conn(db_path) as real:
            yield _VanishingSprintConn(real)

    monkeypatch.setattr(db_lib, "get_conn", _vanishing_conn)
    # Pre-fix this raised TypeError (row_to_sprint(None)) -> 500.
    assert db_lib.update_sprint("Sprint 14", start_date="2026-11-30", db_path=p) is None


def test_l14_assignee_lookup_chunks_huge_id_lists(tmp_path):
    p = str(tmp_path / "l14.db")
    db_lib.init_db(p)
    ids = [f"l14-nope-{i}" for i in range(40_000)]  # over SQLite's 32766 var limit
    with db_lib.get_conn(p) as conn:
        out = db_lib.assignees_by_task(conn, ids)
        assert len(out) == 40_000
        assert all(v == [] for v in out.values())
        # Real rows still resolve across a chunk boundary.
        big = ["DEV-101"] * 600 + ["l14-nope-x"] * 600
        out2 = db_lib.assignees_by_task(conn, big)
        assert len(out2["DEV-101"]) == 1
        assert out2["DEV-101"][0]["type"] == "member"
        assert out2["l14-nope-x"] == []


@pytest.mark.parametrize("field", ["email", "name"])
def test_l15_user_create_blank_400(client, field):
    body = {
        "email": _fresh_user_email("l15"), "name": "L15",
        "password": "L15pass!!", "role": "member",
    }
    body[field] = "   "
    resp = client.post("/api/auth/users", json=body)
    assert resp.status_code == 400, resp.text
    assert "blank" in resp.text.lower()
    assert body["email"] not in {u["email"] for u in client.get("/api/auth/users").json()}


def test_l15_user_update_blank_400_and_valid_ok(client):
    email = _fresh_user_email("l15u")
    created = client.post("/api/auth/users", json={
        "email": email, "name": "L15 U", "password": "L15pass!!", "role": "member",
    })
    assert created.status_code == 201, created.text
    uid = created.json()["id"]
    for patch in ({"name": "  "}, {"email": "\t "}):
        resp = client.put(f"/api/auth/users/{uid}", json=patch)
        assert resp.status_code == 400, (patch, resp.text)
    resp = client.put(f"/api/auth/users/{uid}", json={"name": "  L15 Renamed  "})
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "L15 Renamed"


def test_reset_gated_without_env_flag(client, monkeypatch):
    # Production compose does NOT set SPRINTFLOW_ALLOW_RESET (conftest sets it
    # for the suite) — without the flag the wipe endpoint must refuse.
    monkeypatch.delenv("SPRINTFLOW_ALLOW_RESET", raising=False)
    resp = client.post("/api/reset")
    assert resp.status_code == 403, resp.text
    assert "disabled" in resp.text.lower()


def test_seed_samples_gated_without_env_flag(tmp_path, monkeypatch):
    # Production boot (flag unset) on a fresh DB: admin + default sprints +
    # standard tag defaults, zero sample tasks/members — an emptied board
    # stays empty while task creation keeps working ('Frontend' validates).
    monkeypatch.delenv("SPRINTFLOW_SEED_SAMPLES", raising=False)
    p = str(tmp_path / "seed-gate.db")
    db_lib.init_db(p)
    with db_lib.get_conn(p) as conn:
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM sprints").fetchone()[0] >= 1
        assert conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM team_members").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM tags").fetchone()[0] == 6


def test_seed_samples_present_with_env_flag(tmp_path, monkeypatch):
    # Dev/test boot (flag set): full sample dataset, as before.
    monkeypatch.setenv("SPRINTFLOW_SEED_SAMPLES", "1")
    p = str(tmp_path / "seed-on.db")
    db_lib.init_db(p)
    with db_lib.get_conn(p) as conn:
        assert conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == len(db_lib.DEFAULT_TASKS)
        assert conn.execute("SELECT COUNT(*) FROM team_members").fetchone()[0] == len(db_lib.DEFAULT_TEAM)
        assert conn.execute("SELECT COUNT(*) FROM tags").fetchone()[0] > 0
