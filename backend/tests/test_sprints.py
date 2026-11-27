"""Black-box HTTP tests for /api/sprints (list, create, update, lifecycle).

Seed shape/order contract plus the sprint lifecycle: create -> activate ->
close (with and without rollover), single-active enforcement, closed-sprint
guards, sprints.manage RBAC, and the status data migration (black-box and
legacy-DB white-box).
"""
import sqlite3
from datetime import date, timedelta

import pytest

import db as db_lib

SPRINT_KEYS = {"id", "name", "startDate", "lengthDays", "endDate", "status"}
MISSING_ID = "Sprint 999"

SEED_SPRINTS = [
    ("Sprint 14", "2026-11-23", 14),
    ("Sprint 15", "2026-12-07", 14),
]

NEW_SPRINT = {"name": "Sprint 16", "startDate": "2026-12-21"}
NEW_SPRINT_ID = "sprint-16"  # slug of the name

VIEWER = {
    "email": "sprint-viewer@sprintflow.local",
    "name": "Sprint Viewer",
    "password": "Viewer123!",
}


def _expected_seed_statuses():
    """Mirror of the DB data-migration rule for the two seed sprints."""
    today = date.today().isoformat()
    container = None
    for sid, start, length in SEED_SPRINTS:
        end = (date.fromisoformat(start) + timedelta(days=length - 1)).isoformat()
        if start <= today <= end:
            container = sid
            break
    active = container or SEED_SPRINTS[0][0]
    return {sid: ("active" if sid == active else "planned") for sid, _, _ in SEED_SPRINTS}


def _all_sprints(client):
    resp = client.get("/api/sprints")
    assert resp.status_code == 200
    return resp.json()


def _by_id(sprints):
    return {s["id"]: s for s in sprints}


def _sprint_tasks(client, sprint_id):
    resp = client.get("/api/tasks", params={"sprint": sprint_id})
    assert resp.status_code == 200
    return resp.json()


def _viewer_headers(client, anon_client):
    # 201 on first creation, 400 once the user persists across tests: both fine.
    client.post("/api/auth/users", json={**VIEWER, "role": "viewer"})
    resp = anon_client.post(
        "/api/auth/login",
        json={"email": VIEWER["email"], "password": VIEWER["password"]},
    )
    assert resp.status_code == 200, f"viewer login failed: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_list_returns_seeded_sprints_with_shape_order_and_enddate(client):
    sprints = _all_sprints(client)
    assert isinstance(sprints, list) and len(sprints) >= 2
    for sprint in sprints:
        assert SPRINT_KEYS <= set(sprint), f"sprint missing keys: {sprint}"
        assert sprint["status"] in ("planned", "active", "closed")
    starts = [s["startDate"] for s in sprints]
    assert starts == sorted(starts), "sprints must be ordered by start_date"

    exp = _expected_seed_statuses()
    first, second = sprints[0], sprints[1]
    assert first == {
        "id": "Sprint 14",
        "name": "Sprint 14",
        "startDate": "2026-11-23",
        "lengthDays": 14,
        "endDate": "2026-12-10",
        "status": exp["Sprint 14"],
    }
    assert second == {
        "id": "Sprint 15",
        "name": "Sprint 15",
        "startDate": "2026-12-07",
        "lengthDays": 14,
        "endDate": "2026-12-24",
        "status": exp["Sprint 15"],
    }


def test_put_start_and_length_update_recomputes_enddate(client):
    exp = _expected_seed_statuses()
    resp = client.put(
        "/api/sprints/Sprint 14",
        json={"startDate": "2026-11-30", "lengthDays": 7},
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated == {
        "id": "Sprint 14",
        "name": "Sprint 14",
        "startDate": "2026-11-30",
        "lengthDays": 7,
        "endDate": "2026-12-08",
        "status": exp["Sprint 14"],
    }
    # Persisted: visible on subsequent GET.
    assert _all_sprints(client)[0] == updated


def test_put_partial_length_only_keeps_startdate(client):
    exp = _expected_seed_statuses()
    resp = client.put("/api/sprints/Sprint 14", json={"lengthDays": 21})
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["startDate"] == "2026-11-23"
    assert updated["lengthDays"] == 21
    assert updated["endDate"] == "2026-12-21"
    assert updated["status"] == exp["Sprint 14"]


def test_put_partial_start_only_keeps_length(client):
    exp = _expected_seed_statuses()
    resp = client.put("/api/sprints/Sprint 15", json={"startDate": "2026-12-01"})
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["startDate"] == "2026-12-01"
    assert updated["lengthDays"] == 14
    assert updated["endDate"] == "2026-12-18"
    assert updated["status"] == exp["Sprint 15"]


def test_put_unknown_sprint_404(client):
    resp = client.put(f"/api/sprints/{MISSING_ID}", json={"lengthDays": 7})
    assert resp.status_code == 404


@pytest.mark.parametrize("body", [
    {"lengthDays": 0},
    {"lengthDays": 61},
    {"lengthDays": -1},
    {"startDate": "bad-date"},
    {"startDate": "2026-13-45"},
    {"startDate": "11/23/2026"},
])
def test_put_rejects_bad_date_or_length_with_422(client, body):
    resp = client.put("/api/sprints/Sprint 14", json=body)
    assert resp.status_code == 422


# ---------- create ----------

def test_post_create_returns_201_planned_with_slug_id(client):
    resp = client.post("/api/sprints", json=NEW_SPRINT)
    assert resp.status_code == 201
    created = resp.json()
    assert created == {
        "id": NEW_SPRINT_ID,
        "name": "Sprint 16",
        "startDate": "2026-12-21",
        "lengthDays": 14,
        "endDate": "2027-01-07",
        "status": "planned",
    }
    assert NEW_SPRINT_ID in _by_id(_all_sprints(client))


def test_post_create_honors_explicit_length(client):
    resp = client.post(
        "/api/sprints",
        json={"name": "Hotfix Week", "startDate": "2026-12-21", "lengthDays": 7},
    )
    assert resp.status_code == 201
    created = resp.json()
    assert created["id"] == "hotfix-week"
    assert created["lengthDays"] == 7
    assert created["endDate"] == "2026-12-29"
    assert created["status"] == "planned"


def test_post_create_duplicate_id_conflicts_409(client):
    assert client.post("/api/sprints", json=NEW_SPRINT).status_code == 201
    dup = client.post("/api/sprints", json=NEW_SPRINT)
    assert dup.status_code == 409
    # Different name, same slug -> same id -> still 409.
    dup_slug = client.post(
        "/api/sprints", json={"name": "sprint 16", "startDate": "2026-12-21"}
    )
    assert dup_slug.status_code == 409


@pytest.mark.parametrize("body", [
    {"startDate": "2026-12-21"},  # missing name
    {"name": "X"},  # missing startDate
    {"name": "X", "startDate": "bad-date"},
    {"name": "X", "startDate": "2026-13-45"},
    {"name": "X", "startDate": "2026-12-21", "lengthDays": 0},
    {"name": "X", "startDate": "2026-12-21", "lengthDays": 61},
])
def test_post_create_rejects_bad_payload_with_422(client, body):
    resp = client.post("/api/sprints", json=body)
    assert resp.status_code == 422


def test_post_create_blank_name_400(client):
    resp = client.post(
        "/api/sprints", json={"name": "   ", "startDate": "2026-12-21"}
    )
    assert resp.status_code == 400


@pytest.mark.parametrize("name", ["Sprint 14", "sprint 14", "SPRINT 15", "sprint-16"])
def test_post_create_name_colliding_with_existing_id_or_name_409(client, name):
    # Slug ids ('sprint-16') never equal legacy ids ('Sprint 14'), so without
    # the name guard POSTing a seed name would succeed with a confusing twin.
    if name == "sprint-16":
        assert client.post("/api/sprints", json=NEW_SPRINT).status_code == 201
    resp = client.post("/api/sprints", json={"name": name, "startDate": "2026-12-21"})
    assert resp.status_code == 409
    # Loser leaves the sprint list untouched.
    assert len(_all_sprints(client)) == (3 if name == "sprint-16" else 2)


# ---------- lifecycle: create -> activate -> close ----------

def test_lifecycle_create_activate_close_with_rollover(client):
    target = client.post("/api/sprints", json=NEW_SPRINT).json()
    assert target["status"] == "planned"

    before = _sprint_tasks(client, "Sprint 14")
    unfinished = [t for t in before if t["status"] != "done"]
    done = [t for t in before if t["status"] == "done"]
    assert unfinished and done, "seed must hold unfinished + done tasks in Sprint 14"

    act = client.post(f"/api/sprints/{target['id']}/activate")
    assert act.status_code == 200
    assert act.json()["status"] == "active"
    assert act.json()["id"] == target["id"]
    actives = [s for s in _all_sprints(client) if s["status"] == "active"]
    assert [s["id"] for s in actives] == [target["id"]]

    closed = client.post(
        "/api/sprints/Sprint 14/close", json={"rolloverTo": target["id"]}
    )
    assert closed.status_code == 200
    assert closed.json() == {
        "closed": "Sprint 14",
        "moved": len(unfinished),
        "to": target["id"],
    }

    moved = _sprint_tasks(client, target["id"])
    assert {t["id"] for t in moved} == {t["id"] for t in unfinished}
    for t in moved:  # rollover keeps each task's status
        orig = next(o for o in unfinished if o["id"] == t["id"])
        assert t["status"] == orig["status"]

    remaining = _sprint_tasks(client, "Sprint 14")
    assert {t["id"] for t in remaining} == {t["id"] for t in done}

    by_id = _by_id(_all_sprints(client))
    assert by_id["Sprint 14"]["status"] == "closed"
    assert by_id[target["id"]]["status"] == "active"


def test_lifecycle_close_without_rollover_moves_unfinished_to_backlog(client):
    before = _sprint_tasks(client, "Sprint 14")
    unfinished = [t for t in before if t["status"] != "done"]
    done = [t for t in before if t["status"] == "done"]
    assert unfinished and done

    resp = client.post("/api/sprints/Sprint 14/close", json={})
    assert resp.status_code == 200
    assert resp.json() == {"closed": "Sprint 14", "moved": len(unfinished), "to": None}

    after = {t["id"]: t for t in _sprint_tasks(client, "Sprint 14")}
    for t in unfinished:
        assert after[t["id"]]["status"] == "backlog"
    for t in done:
        assert after[t["id"]]["status"] == "done"
    assert _by_id(_all_sprints(client))["Sprint 14"]["status"] == "closed"


def test_close_accepts_missing_and_null_body(client):
    resp = client.post("/api/sprints/Sprint 15/close")
    assert resp.status_code == 200
    assert resp.json()["closed"] == "Sprint 15"
    assert resp.json()["to"] is None

    client.post("/api/reset")
    resp = client.post("/api/sprints/Sprint 15/close", json={"rolloverTo": None})
    assert resp.status_code == 200
    assert resp.json() == {
        "closed": "Sprint 15",
        "moved": resp.json()["moved"],
        "to": None,
    }


def test_activate_enforces_single_active(client):
    assert client.post("/api/sprints/Sprint 15/activate").status_code == 200
    actives = [s for s in _all_sprints(client) if s["status"] == "active"]
    assert [s["id"] for s in actives] == ["Sprint 15"]

    # Activating another sprint demotes the previous active (never two actives).
    assert client.post("/api/sprints/Sprint 14/activate").status_code == 200
    actives = [s for s in _all_sprints(client) if s["status"] == "active"]
    assert [s["id"] for s in actives] == ["Sprint 14"]

    # Re-activating the already-active sprint is a 200 no-op.
    assert client.post("/api/sprints/Sprint 14/activate").status_code == 200
    actives = [s for s in _all_sprints(client) if s["status"] == "active"]
    assert [s["id"] for s in actives] == ["Sprint 14"]


def test_activate_closed_sprint_400(client):
    assert client.post("/api/sprints/Sprint 15/close", json={}).status_code == 200
    resp = client.post("/api/sprints/Sprint 15/activate")
    assert resp.status_code == 400


def test_activate_close_unknown_sprint_404(client):
    assert client.post(f"/api/sprints/{MISSING_ID}/activate").status_code == 404
    assert client.post(f"/api/sprints/{MISSING_ID}/close", json={}).status_code == 404


def test_close_rollover_to_unknown_sprint_400(client):
    resp = client.post(
        "/api/sprints/Sprint 14/close", json={"rolloverTo": MISSING_ID}
    )
    assert resp.status_code == 400
    # Failed close leaves the sprint and its tasks untouched.
    assert _by_id(_all_sprints(client))["Sprint 14"]["status"] != "closed"


def test_close_rollover_to_closed_or_self_400(client):
    assert client.post("/api/sprints/Sprint 15/close", json={}).status_code == 200
    resp = client.post(
        "/api/sprints/Sprint 14/close", json={"rolloverTo": "Sprint 15"}
    )
    assert resp.status_code == 400
    resp = client.post(
        "/api/sprints/Sprint 14/close", json={"rolloverTo": "Sprint 14"}
    )
    assert resp.status_code == 400


# ---------- RBAC ----------

def test_mutations_require_manage_viewer_403_but_read_200(client, anon_client):
    headers = _viewer_headers(client, anon_client)
    assert (
        anon_client.post("/api/sprints", json=NEW_SPRINT, headers=headers).status_code
        == 403
    )
    assert (
        anon_client.put(
            "/api/sprints/Sprint 14", json={"lengthDays": 7}, headers=headers
        ).status_code
        == 403
    )
    assert (
        anon_client.post(
            "/api/sprints/Sprint 14/activate", headers=headers
        ).status_code
        == 403
    )
    assert (
        anon_client.post(
            "/api/sprints/Sprint 14/close", json={}, headers=headers
        ).status_code
        == 403
    )
    assert anon_client.get("/api/sprints", headers=headers).status_code == 200


# ---------- migration ----------

def test_migration_marks_exactly_one_active(client):
    sprints = _all_sprints(client)
    actives = [s for s in sprints if s["status"] == "active"]
    assert len(actives) == 1
    exp = _expected_seed_statuses()
    expected_id = next(sid for sid, st in exp.items() if st == "active")
    assert actives[0]["id"] == expected_id


def _write_legacy_db(path):
    """Pre-status DB: sprints table without the status column."""
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE team_members ("
        "id TEXT PRIMARY KEY, name TEXT NOT NULL, "
        "role TEXT NOT NULL DEFAULT 'Engineer', color TEXT NOT NULL DEFAULT 'bg-indigo-600')"
    )
    conn.execute("INSERT INTO team_members (id, name) VALUES ('m1', 'Legacy Member')")
    conn.execute(
        "CREATE TABLE sprints ("
        "id TEXT PRIMARY KEY, name TEXT NOT NULL, "
        "start_date TEXT NOT NULL, length_days INTEGER NOT NULL DEFAULT 14)"
    )
    conn.execute(
        "INSERT INTO sprints (id, name, start_date, length_days) VALUES "
        "('Ancient', 'Ancient', '2001-01-01', 14)"
    )
    today = date.today()
    conn.execute(
        "INSERT INTO sprints (id, name, start_date, length_days) VALUES (?, ?, ?, 14)",
        ("Current", "Current", (today - timedelta(days=1)).isoformat()),
    )
    conn.commit()
    conn.close()


def _sprint_rows(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        return [
            dict(r)
            for r in conn.execute(
                "SELECT id, start_date, length_days, status FROM sprints "
                "ORDER BY start_date ASC"
            ).fetchall()
        ]
    finally:
        conn.close()


def test_legacy_db_migration_adds_status_and_marks_container_active(tmp_path):
    legacy = str(tmp_path / "legacy.db")
    _write_legacy_db(legacy)

    db_lib.init_db(legacy)
    db_lib.init_db(legacy)  # idempotent: second run is a no-op

    conn = sqlite3.connect(legacy)
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(sprints)").fetchall()]
        assert "status" in cols
        idx = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'index' "
            "AND name = 'uq_sprints_single_active'"
        ).fetchone()
        assert idx is not None
    finally:
        conn.close()

    rows = _sprint_rows(legacy)
    assert rows and all(r["status"] in ("planned", "active", "closed") for r in rows)
    actives = [r for r in rows if r["status"] == "active"]
    assert len(actives) == 1

    # Rule: container-of-today wins over first-by-start_date ('Ancient').
    today = date.today().isoformat()
    containers = [
        r
        for r in rows
        if r["start_date"]
        <= today
        <= (
            date.fromisoformat(r["start_date"]) + timedelta(days=int(r["length_days"]) - 1)
        ).isoformat()
    ]
    assert containers, "the crafted 'Current' sprint must contain today"
    assert actives[0]["id"] == containers[0]["id"]

    # The partial unique index enforces single-active at the DB level.
    conn = sqlite3.connect(legacy)
    try:
        other = next(r["id"] for r in rows if r["id"] != actives[0]["id"])
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "UPDATE sprints SET status = 'active' WHERE id = ?", (other,)
            )
        conn.rollback()
    finally:
        conn.close()

    # Restarting with every sprint closed never resurrects an active.
    conn = sqlite3.connect(legacy)
    conn.execute("UPDATE sprints SET status = 'closed'")
    conn.commit()
    conn.close()
    db_lib.init_db(legacy)
    assert [r for r in _sprint_rows(legacy) if r["status"] == "active"] == []


# ---------- rename-by-id + working-day math ----------

def test_put_rename_updates_name_keeps_id_and_persists(client):
    resp = client.put("/api/sprints/Sprint 14", json={"name": "Sprint One"})
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["id"] == "Sprint 14"
    assert updated["name"] == "Sprint One"
    # Persisted: visible on subsequent GET.
    assert _all_sprints(client)[0]["name"] == "Sprint One"


def test_put_rename_trims_whitespace(client):
    resp = client.put("/api/sprints/Sprint 14", json={"name": "  Sprint Uno  "})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Sprint Uno"


@pytest.mark.parametrize("body", [
    {"name": ""},
    {"name": "   "},
    {"name": "x" * 61},
])
def test_put_rename_rejects_blank_or_too_long_with_422(client, body):
    resp = client.put("/api/sprints/Sprint 14", json=body)
    assert resp.status_code == 422


@pytest.mark.parametrize("name", ["Sprint 15", "sprint 15", "SPRINT 15"])
def test_put_rename_rejects_collision_with_other_sprint_409(client, name):
    resp = client.put("/api/sprints/Sprint 14", json={"name": name})
    assert resp.status_code == 409
    # Loser unchanged.
    assert _all_sprints(client)[0]["name"] == "Sprint 14"


def test_put_rename_keeps_tasks_linked_by_id(client):
    created = client.post(
        "/api/tasks",
        json={"title": "Rename link check", "dueDate": "2026-12-06", "sprint": "Sprint 14"},
    )
    assert created.status_code == 201
    resp = client.put("/api/sprints/Sprint 14", json={"name": "Sprint One"})
    assert resp.status_code == 200
    # Task still references the stable sprint id; sprint resolves by id or new name.
    tasks = client.get("/api/tasks").json()
    assert tasks[0]["sprint"] == "Sprint 14"
    names = {s["id"]: s["name"] for s in _all_sprints(client)}
    assert names["Sprint 14"] == "Sprint One"


@pytest.mark.parametrize("weekend_start", ["2026-11-28", "2026-11-29"])
def test_put_weekend_start_rolls_to_monday_and_counts_working_days(client, weekend_start):
    # Sat/Sun start rolls to Mon 2026-11-30 as day 1; 5 working days -> Fri 2026-12-04.
    resp = client.put(
        "/api/sprints/Sprint 14",
        json={"startDate": weekend_start, "lengthDays": 5},
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["startDate"] == weekend_start
    assert updated["lengthDays"] == 5
    assert updated["endDate"] == "2026-12-04"


def test_put_five_day_week_spans_mon_to_fri(client):
    # Mon 2026-11-23 + 5 working days -> Fri 2026-11-27 (skips the weekend).
    resp = client.put(
        "/api/sprints/Sprint 14",
        json={"startDate": "2026-11-23", "lengthDays": 5},
    )
    assert resp.status_code == 200
    assert resp.json()["endDate"] == "2026-11-27"


def test_put_rename_keeps_working_day_enddate(client):
    # Rename is orthogonal to date math: endDate stays the working-day value.
    resp = client.put("/api/sprints/Sprint 14", json={"name": "Sprint One"})
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["endDate"] == "2026-12-10"
    assert updated["startDate"] == "2026-11-23"
    assert updated["lengthDays"] == 14


def test_put_single_day_sprint_ends_on_start_when_weekday(client):
    resp = client.put(
        "/api/sprints/Sprint 14",
        json={"startDate": "2026-11-25", "lengthDays": 1},
    )
    assert resp.status_code == 200
    assert resp.json()["endDate"] == "2026-11-25"
