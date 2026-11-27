"""Task links: subtask (parent/child) + related peer links (db + HTTP).

Step 1 covers the task_links table + db helpers; step 2 the payload
embedding; step 3 the link/unlink/create-child endpoints; step 4 delete +
import/export handling.
"""
import pytest
from fastapi import HTTPException

import db as db_lib


def _payload(title="Link test task", **overrides):
    data = {
        "title": title,
        "description": "created by test_task_links",
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


def _ids(client, *titles):
    return [_create(client, title=t)["id"] for t in titles]


# ---------- step 1: table + helpers ----------

def test_link_tables_exist(client):
    with db_lib.get_conn() as conn:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE name = 'task_links'"
        ).fetchone()
    assert row is not None


def test_add_subtask_link_and_read_back(client):
    parent, child = _ids(client, "Link parent", "Link child")
    with db_lib.get_conn() as conn:
        db_lib.add_task_link(conn, parent, child, "subtask")
    with db_lib.get_conn() as conn:
        assert db_lib.links_for_task(conn, parent)["subtasks"] == [child]
        assert db_lib.links_for_task(conn, child)["parent"] == parent
        assert db_lib.links_for_task(conn, child)["subtasks"] == []
        assert db_lib.links_for_task(conn, parent)["parent"] is None


def test_related_is_bidirectional(client):
    a, b = _ids(client, "Related A", "Related B")
    with db_lib.get_conn() as conn:
        db_lib.add_task_link(conn, a, b, "related")
    with db_lib.get_conn() as conn:
        assert db_lib.links_for_task(conn, a)["related"] == [b]
        assert db_lib.links_for_task(conn, b)["related"] == [a]
        # One canonical row per pair.
        count = conn.execute(
            "SELECT COUNT(*) FROM task_links WHERE kind = 'related'"
        ).fetchone()[0]
    assert count == 1


def test_self_link_422(client):
    task_id = _create(client)["id"]
    with db_lib.get_conn() as conn:
        with pytest.raises(HTTPException) as exc:
            db_lib.add_task_link(conn, task_id, task_id, "subtask")
        assert exc.value.status_code == 422
        with pytest.raises(HTTPException) as exc:
            db_lib.add_task_link(conn, task_id, task_id, "related")
        assert exc.value.status_code == 422


def test_unknown_task_404(client):
    task_id = _create(client)["id"]
    with db_lib.get_conn() as conn:
        with pytest.raises(HTTPException) as exc:
            db_lib.add_task_link(conn, task_id, "DEV-999999", "subtask")
        assert exc.value.status_code == 404
        with pytest.raises(HTTPException) as exc:
            db_lib.add_task_link(conn, "DEV-999999", task_id, "related")
        assert exc.value.status_code == 404


def test_bad_kind_422(client):
    a, b = _ids(client, "Kind A", "Kind B")
    with db_lib.get_conn() as conn:
        with pytest.raises(HTTPException) as exc:
            db_lib.add_task_link(conn, a, b, "blocks")
        assert exc.value.status_code == 422


def test_subtask_cycle_422(client):
    parent, child = _ids(client, "Cycle parent", "Cycle child")
    with db_lib.get_conn() as conn:
        db_lib.add_task_link(conn, parent, child, "subtask")
        with pytest.raises(HTTPException) as exc:
            db_lib.add_task_link(conn, child, parent, "subtask")
        assert exc.value.status_code == 422
    # 3-node cycle: A -> B -> C, then C -> A must 422.
    a, b, c = _ids(client, "Cycle A", "Cycle B", "Cycle C")
    with db_lib.get_conn() as conn:
        db_lib.add_task_link(conn, a, b, "subtask")
        db_lib.add_task_link(conn, b, c, "subtask")
        with pytest.raises(HTTPException) as exc:
            db_lib.add_task_link(conn, c, a, "subtask")
        assert exc.value.status_code == 422
    # Related links never cycle-check.
    with db_lib.get_conn() as conn:
        db_lib.add_task_link(conn, c, a, "related")
        assert a in db_lib.links_for_task(conn, c)["related"]


def test_duplicate_link_idempotent(client):
    parent, child = _ids(client, "Dupe parent", "Dupe child")
    with db_lib.get_conn() as conn:
        first = db_lib.add_task_link(conn, parent, child, "subtask")
        second = db_lib.add_task_link(conn, parent, child, "subtask")
        assert first == second
        count = conn.execute(
            "SELECT COUNT(*) FROM task_links WHERE task_id = ? AND linked_task_id = ?",
            (parent, child),
        ).fetchone()[0]
    assert count == 1


def test_remove_task_link(client):
    parent, child = _ids(client, "Unlink parent", "Unlink child")
    with db_lib.get_conn() as conn:
        db_lib.add_task_link(conn, parent, child, "subtask")
        assert db_lib.remove_task_link(conn, parent, child, "subtask") is True
        assert db_lib.remove_task_link(conn, parent, child, "subtask") is False
        assert db_lib.links_for_task(conn, parent)["subtasks"] == []
        assert db_lib.links_for_task(conn, child)["parent"] is None
