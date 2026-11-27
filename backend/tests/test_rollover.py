"""Black-box HTTP tests for POST /api/sprints/{id}/rollover (one-click rollover).

Moves ONLY unfinished (status != 'done') tasks currently in the source
sprint to a target sprint, preserving status/points/assignees/tags, without
changing either sprint's lifecycle status (unlike close).
"""
import pytest

MISSING_ID = "Sprint 999"

VIEWER = {
    "email": "rollover-viewer@sprintflow.local",
    "name": "Rollover Viewer",
    "password": "Viewer123!",
}

SOURCE = "Sprint 14"
TARGET = "Sprint 15"


def _sprint_tasks(client, sprint_id):
    resp = client.get("/api/tasks", params={"sprint": sprint_id})
    assert resp.status_code == 200
    return resp.json()


def _by_id(sprints):
    return {s["id"]: s for s in sprints}


def _all_sprints(client):
    resp = client.get("/api/sprints")
    assert resp.status_code == 200
    return resp.json()


def _viewer_headers(client, anon_client):
    client.post("/api/auth/users", json={**VIEWER, "role": "viewer"})
    resp = anon_client.post(
        "/api/auth/login",
        json={"email": VIEWER["email"], "password": VIEWER["password"]},
    )
    assert resp.status_code == 200, f"viewer login failed: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_rollover_moves_only_unfinished_and_returns_ids(client):
    before_source = _sprint_tasks(client, SOURCE)
    unfinished = [t for t in before_source if t["status"] != "done"]
    done = [t for t in before_source if t["status"] == "done"]
    assert unfinished and done, "seed must hold unfinished + done tasks in Sprint 14"
    before_target_ids = {t["id"] for t in _sprint_tasks(client, TARGET)}

    resp = client.post(f"/api/sprints/{SOURCE}/rollover", json={"target_sprint": TARGET})
    assert resp.status_code == 200
    body = resp.json()
    assert body["moved"] == len(unfinished)
    assert set(body["task_ids"]) == {t["id"] for t in unfinished}
    assert body["to"] == TARGET
    assert body["from"] == SOURCE

    after_target = _sprint_tasks(client, TARGET)
    assert {t["id"] for t in after_target} == before_target_ids | {t["id"] for t in unfinished}

    remaining = _sprint_tasks(client, SOURCE)
    assert {t["id"] for t in remaining} == {t["id"] for t in done}


def test_rollover_preserves_status_points_assignees_tags(client):
    before = {t["id"]: t for t in _sprint_tasks(client, SOURCE)}
    unfinished_ids = [tid for tid, t in before.items() if t["status"] != "done"]
    assert unfinished_ids

    resp = client.post(f"/api/sprints/{SOURCE}/rollover", json={"target_sprint": TARGET})
    assert resp.status_code == 200

    after = {t["id"]: t for t in _sprint_tasks(client, TARGET)}
    for tid in unfinished_ids:
        old, new = before[tid], after[tid]
        assert new["status"] == old["status"]
        assert new["points"] == old["points"]
        assert new["assignees"] == old["assignees"]
        assert new["tags"] == old["tags"]
        assert new["title"] == old["title"]
        assert new["priority"] == old["priority"]
        assert new["sprint"] == TARGET


def test_rollover_done_tasks_untouched(client):
    before_done = {t["id"]: t for t in _sprint_tasks(client, SOURCE) if t["status"] == "done"}
    assert before_done

    assert (
        client.post(f"/api/sprints/{SOURCE}/rollover", json={"target_sprint": TARGET}).status_code
        == 200
    )

    after = {t["id"]: t for t in _sprint_tasks(client, SOURCE)}
    assert set(after) == set(before_done)
    for tid, old in before_done.items():
        assert after[tid] == old


def test_rollover_other_sprints_untouched(client):
    before_target = {t["id"]: t for t in _sprint_tasks(client, TARGET)}
    before_backlog = {t["id"]: t for t in _sprint_tasks(client, "Backlog")}

    assert (
        client.post(f"/api/sprints/{SOURCE}/rollover", json={"target_sprint": TARGET}).status_code
        == 200
    )

    after_target = {t["id"]: t for t in _sprint_tasks(client, TARGET)}
    for tid, old in before_target.items():
        assert after_target[tid] == old
    after_backlog = {t["id"]: t for t in _sprint_tasks(client, "Backlog")}
    assert set(after_backlog) == set(before_backlog)
    for tid, old in before_backlog.items():
        assert after_backlog[tid] == old


def test_rollover_does_not_change_sprint_statuses(client):
    before = {s["id"]: s["status"] for s in _all_sprints(client)}
    resp = client.post(f"/api/sprints/{SOURCE}/rollover", json={"target_sprint": TARGET})
    assert resp.status_code == 200
    after = {s["id"]: s["status"] for s in _all_sprints(client)}
    assert after == before
    assert after[SOURCE] != "closed"


def test_rollover_empty_source_returns_moved_zero(client):
    created = client.post(
        "/api/sprints", json={"name": "Empty Sprint", "startDate": "2026-12-21"}
    )
    assert created.status_code == 201
    empty_id = created.json()["id"]
    assert _sprint_tasks(client, empty_id) == []

    resp = client.post(f"/api/sprints/{empty_id}/rollover", json={"target_sprint": TARGET})
    assert resp.status_code == 200
    assert resp.json()["moved"] == 0
    assert resp.json()["task_ids"] == []


def test_rollover_all_done_source_returns_moved_zero(client):
    # Sprint 15 seed tasks are backlog; flip a scratch sprint to all-done.
    created = client.post(
        "/api/sprints", json={"name": "Done Sprint", "startDate": "2026-12-21"}
    )
    assert created.status_code == 201
    sid = created.json()["id"]
    task = client.post(
        "/api/tasks",
        json={"title": "Already done", "dueDate": "2026-12-06", "sprint": sid, "status": "done"},
    )
    assert task.status_code == 201

    resp = client.post(f"/api/sprints/{sid}/rollover", json={"target_sprint": TARGET})
    assert resp.status_code == 200
    assert resp.json() == {"moved": 0, "task_ids": [], "from": sid, "to": TARGET}
    assert [t["id"] for t in _sprint_tasks(client, sid)] == [task.json()["id"]]


@pytest.mark.parametrize(
    "body",
    [
        {"target_sprint": SOURCE},  # same as source
        {"target_sprint": "   "},  # blank
        {"target_sprint": ""},  # empty
        {},  # missing field
        {"target_sprint": "Backlog"},  # pseudo-sprint, not a real sprint
        {"target_sprint": "backlog"},
        {"target_sprint": 123},  # non-string
    ],
)
def test_rollover_invalid_target_422(client, body):
    resp = client.post(f"/api/sprints/{SOURCE}/rollover", json=body)
    assert resp.status_code == 422


def test_rollover_missing_body_422(client):
    resp = client.post(f"/api/sprints/{SOURCE}/rollover")
    assert resp.status_code == 422


def test_rollover_unknown_source_404(client):
    resp = client.post(f"/api/sprints/{MISSING_ID}/rollover", json={"target_sprint": TARGET})
    assert resp.status_code == 404


def test_rollover_unknown_target_404(client):
    before_source = _sprint_tasks(client, SOURCE)
    resp = client.post(
        f"/api/sprints/{SOURCE}/rollover", json={"target_sprint": MISSING_ID}
    )
    assert resp.status_code == 404
    # Failed rollover leaves tasks untouched.
    assert _sprint_tasks(client, SOURCE) == before_source


def test_rollover_accepts_camelcase_target(client):
    before = _sprint_tasks(client, SOURCE)
    unfinished = [t for t in before if t["status"] != "done"]
    resp = client.post(f"/api/sprints/{SOURCE}/rollover", json={"targetSprint": TARGET})
    assert resp.status_code == 200
    assert resp.json()["moved"] == len(unfinished)


def test_rollover_requires_manage_viewer_403(client, anon_client):
    headers = _viewer_headers(client, anon_client)
    resp = anon_client.post(
        f"/api/sprints/{SOURCE}/rollover", json={"target_sprint": TARGET}, headers=headers
    )
    assert resp.status_code == 403
    # Nothing moved.
    assert len(_sprint_tasks(client, SOURCE)) > 0


def test_rollover_unauthenticated_401(anon_client):
    resp = anon_client.post(
        f"/api/sprints/{SOURCE}/rollover", json={"target_sprint": TARGET}
    )
    assert resp.status_code == 401
