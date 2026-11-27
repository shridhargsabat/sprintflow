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


# ---------- step 2: payload embedding ----------

def _link_db(task_id, linked_id, kind):
    # Step 2 runs before the HTTP link endpoints exist (step 3), so link
    # at the db layer; the payload assertions below stay black-box.
    with db_lib.get_conn() as conn:
        db_lib.add_task_link(conn, task_id, linked_id, kind)


def _tasks_by_id(client):
    return {t["id"]: t for t in client.get("/api/tasks").json()}


def test_task_payload_embeds_links(client):
    parent = _create(client, title="Embed parent")
    child = _create(client, title="Embed child", status="done", points=5)
    related = _create(client, title="Embed related")
    _link_db(parent["id"], child["id"], "subtask")
    _link_db(parent["id"], related["id"], "related")

    tasks = _tasks_by_id(client)
    got_parent = tasks[parent["id"]]
    assert got_parent["subtasks"] == [
        {"id": child["id"], "title": child["title"], "status": "done", "points": 5}
    ]
    assert got_parent["related"] == [
        {
            "id": related["id"],
            "title": related["title"],
            "status": related["status"],
            "points": related["points"],
        }
    ]
    assert got_parent["parent"] is None
    got_child = tasks[child["id"]]
    assert got_child["parent"] == {
        "id": parent["id"],
        "title": parent["title"],
        "status": parent["status"],
        "points": parent["points"],
    }
    assert got_child["subtasks"] == []
    got_related = tasks[related["id"]]
    assert got_related["parent"] is None
    assert [r["id"] for r in got_related["related"]] == [parent["id"]]


def test_task_payload_links_empty_by_default(client):
    task = _create(client, title="Link-free task")
    assert task["parent"] is None
    assert task["subtasks"] == []
    assert task["related"] == []


# ---------- step 3: link endpoints + create-child ----------

VIEWER = {"email": "links-viewer@sprintflow.local", "password": "Viewer123!"}


def _viewer_headers(client, anon_client):
    client.post(
        "/api/auth/users",
        json={"email": VIEWER["email"], "name": "Links Viewer",
              "password": VIEWER["password"], "role": "viewer"},
    )
    resp = anon_client.post("/api/auth/login", json=VIEWER)
    assert resp.status_code == 200, f"viewer login failed: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _link_http(client, task_id, linked_id, kind, headers=None):
    return client.post(
        f"/api/tasks/{task_id}/links",
        json={"linked_task_id": linked_id, "kind": kind},
        headers=headers,
    )


def test_post_link_subtask_201_and_child_shows_parent(client):
    parent, child = _ids(client, "HTTP parent", "HTTP child")
    resp = _link_http(client, parent, child, "subtask")
    assert resp.status_code == 201, resp.text
    assert resp.json() == {
        "task_id": parent, "linked_task_id": child, "kind": "subtask",
    }
    tasks = _tasks_by_id(client)
    assert [s["id"] for s in tasks[parent]["subtasks"]] == [child]
    assert tasks[child]["parent"]["id"] == parent


def test_post_link_related_both_sides(client):
    a, b = _ids(client, "HTTP rel A", "HTTP rel B")
    resp = _link_http(client, a, b, "related")
    assert resp.status_code == 201, resp.text
    tasks = _tasks_by_id(client)
    assert [r["id"] for r in tasks[a]["related"]] == [b]
    assert [r["id"] for r in tasks[b]["related"]] == [a]


def test_post_link_errors(client):
    task_id = _create(client)["id"]
    other = _create(client, title="Link error other")["id"]
    assert _link_http(client, task_id, task_id, "subtask").status_code == 422
    assert _link_http(client, task_id, "DEV-999999", "subtask").status_code == 404
    assert _link_http(client, "DEV-999999", task_id, "related").status_code == 404
    assert _link_http(client, task_id, other, "blocks").status_code == 422
    # Missing keys -> request validation 422.
    assert client.post(f"/api/tasks/{task_id}/links", json={}).status_code == 422


def test_post_link_cycle_422(client):
    parent, child = _ids(client, "HTTP cyc P", "HTTP cyc C")
    assert _link_http(client, parent, child, "subtask").status_code == 201
    assert _link_http(client, child, parent, "subtask").status_code == 422


def test_link_mutations_viewer_403(client, anon_client):
    parent, child = _ids(client, "RBAC parent", "RBAC child")
    headers = _viewer_headers(client, anon_client)
    assert _link_http(client, parent, child, "subtask", headers).status_code == 403
    assert _link_http(client, parent, child, "related", headers).status_code == 403
    assert anon_client.delete(
        f"/api/tasks/{parent}/links/{child}?kind=subtask", headers=headers
    ).status_code == 403
    assert anon_client.post(
        f"/api/tasks/{parent}/children",
        json=_payload(title="RBAC child"),
        headers=headers,
    ).status_code == 403
    # Nothing was linked by the rejected calls.
    assert _tasks_by_id(client)[parent]["subtasks"] == []


def test_delete_link_idempotent(client):
    parent, child = _ids(client, "Del-link P", "Del-link C")
    assert _link_http(client, parent, child, "subtask").status_code == 201
    resp = client.delete(f"/api/tasks/{parent}/links/{child}?kind=subtask")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"removed": True}
    again = client.delete(f"/api/tasks/{parent}/links/{child}?kind=subtask")
    assert again.status_code == 200
    assert again.json() == {"removed": False}
    assert _tasks_by_id(client)[parent]["subtasks"] == []
    assert _tasks_by_id(client)[child]["parent"] is None


def test_delete_link_bad_kind_422(client):
    parent, child = _ids(client, "Del-kind P", "Del-kind C")
    resp = client.delete(f"/api/tasks/{parent}/links/{child}?kind=blocks")
    assert resp.status_code == 422


def test_create_child_links_and_inherits_sprint(client):
    parent = _create(client, title="Child parent", sprint="Sprint 15")
    resp = client.post(
        f"/api/tasks/{parent['id']}/children",
        json=_payload(title="Born child", points=5),
    )
    assert resp.status_code == 201, resp.text
    child = resp.json()
    assert child["sprint"] == "Sprint 15"  # inherits parent's sprint
    assert child["status"] == "todo"
    assert child["points"] == 5
    tasks = _tasks_by_id(client)
    assert tasks[child["id"]]["parent"]["id"] == parent["id"]
    assert child["id"] in [s["id"] for s in tasks[parent["id"]]["subtasks"]]


def test_create_child_unknown_parent_404(client):
    resp = client.post(
        "/api/tasks/DEV-999999/children", json=_payload(title="Orphan")
    )
    assert resp.status_code == 404


def test_link_unlink_child_log_activity(client):
    parent, child = _ids(client, "Trail parent", "Trail child")
    assert _link_http(client, parent, child, "subtask").status_code == 201
    trail = client.get(f"/api/tasks/{parent}/activity").json()
    assert (trail[0]["action"], trail[0]["field"]) == ("link", "subtask")
    assert trail[0]["newValue"] == child
    assert client.delete(
        f"/api/tasks/{parent}/links/{child}?kind=subtask"
    ).status_code == 200
    trail = client.get(f"/api/tasks/{parent}/activity").json()
    assert (trail[0]["action"], trail[0]["field"]) == ("link", "subtask")
    assert (trail[0]["oldValue"], trail[0]["newValue"]) == (child, None)
