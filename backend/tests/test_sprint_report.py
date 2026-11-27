"""Black-box HTTP tests for GET /api/sprints/{id}/report (read-only summary).

Report shape: header (live sprint row) + totals (current tasks/points) +
completed (currently-done in this sprint) + movedOut/movedIn (from the
task_activity sprint trail, deduped to the latest move per task per list) +
remainingUnfinished (currently in this sprint, status != done).
"""
from typing import Any, Dict

MISSING_ID = "Sprint 999"

# Seed Sprint 14: 11 tasks / 47 pts; done = DEV-109 (5) + DEV-110 (3) + DEV-111 (3).
SEED_DONE_IDS = {"DEV-109", "DEV-110", "DEV-111"}
SEED_DONE_POINTS = 11


def _report(client, sprint_id: str):
    return client.get(f"/api/sprints/{sprint_id}/report")


def _tasks_by_id(client) -> Dict[str, Dict[str, Any]]:
    resp = client.get("/api/tasks")
    assert resp.status_code == 200
    return {t["id"]: t for t in resp.json()}


def _move_task(client, task_id: str, sprint: str):
    """Full-payload PUT that re-points one task at another sprint (logs trail)."""
    task = _tasks_by_id(client)[task_id]
    payload = {
        "title": task["title"],
        "description": task.get("description", ""),
        "assignees": [{"type": a["type"], "id": a["id"]} for a in task.get("assignees", [])],
        "dueDate": task["dueDate"],
        "status": task["status"],
        "priority": task["priority"],
        "sprint": sprint,
        "points": task["points"],
        "tags": task.get("tags", []),
    }
    resp = client.put(f"/api/tasks/{task_id}", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_report_seed_completed_math_and_shape(client):
    resp = _report(client, "Sprint 14")
    assert resp.status_code == 200
    report = resp.json()

    assert report["sprint"]["id"] == "Sprint 14"
    assert report["sprint"]["name"] == "Sprint 14"
    assert report["sprint"]["status"] in ("planned", "active", "closed")

    assert report["totals"] == {"tasks": 11, "points": 47}

    completed = report["completed"]
    assert completed["count"] == 3
    assert completed["points"] == SEED_DONE_POINTS
    assert {t["id"] for t in completed["tasks"]} == SEED_DONE_IDS
    assert all(t["status"] == "done" for t in completed["tasks"])

    # Fresh seed: no sprint moves logged yet.
    assert report["movedOut"] == {"count": 0, "points": 0, "tasks": []}
    assert report["movedIn"] == {"count": 0, "points": 0, "tasks": []}

    remaining = report["remainingUnfinished"]
    assert remaining["count"] == 8
    assert remaining["points"] == 47 - SEED_DONE_POINTS
    assert all(t["status"] != "done" for t in remaining["tasks"])


def test_report_moved_out_and_in_via_task_update(client):
    moved = _move_task(client, "DEV-106", "Sprint 15")
    assert moved["sprint"] == "Sprint 15"

    out = _report(client, "Sprint 14").json()
    assert out["movedOut"]["count"] == 1
    row = out["movedOut"]["tasks"][0]
    assert row["id"] == "DEV-106"
    assert row["title"] == moved["title"]
    assert row["sprint"] == "Sprint 15"  # live current sprint
    assert row["from"] == "Sprint 14"
    assert row["to"] == "Sprint 15"
    assert out["movedIn"]["count"] == 0
    assert out["totals"] == {"tasks": 10, "points": 47 - moved["points"]}

    into = _report(client, "Sprint 15").json()
    assert into["movedIn"]["count"] == 1
    assert into["movedIn"]["tasks"][0]["id"] == "DEV-106"
    assert into["movedOut"]["count"] == 0


def test_report_moved_via_rollover_endpoint(client):
    before = {t["id"]: t for t in client.get("/api/tasks", params={"sprint": "Sprint 14"}).json()}
    unfinished = [t for t in before.values() if t["status"] != "done"]
    assert len(unfinished) == 8

    resp = client.post("/api/sprints/Sprint 14/rollover", json={"target_sprint": "Sprint 15"})
    assert resp.status_code == 200

    out = _report(client, "Sprint 14").json()
    assert out["movedOut"]["count"] == 8
    assert {t["id"] for t in out["movedOut"]["tasks"]} == {t["id"] for t in unfinished}
    assert all(t["to"] == "Sprint 15" for t in out["movedOut"]["tasks"])
    assert out["completed"]["count"] == 3  # done tasks stay put
    assert out["remainingUnfinished"]["count"] == 0

    into = _report(client, "Sprint 15").json()
    assert into["movedIn"]["count"] == 8


def test_report_moved_via_close_with_rollover_closed_sprint(client):
    assert client.post("/api/sprints/Sprint 14/close", json={"rolloverTo": "Sprint 15"}).status_code == 200

    report = _report(client, "Sprint 14").json()
    assert report["sprint"]["status"] == "closed"
    assert report["movedOut"]["count"] == 8
    assert report["completed"]["count"] == 3
    assert report["remainingUnfinished"]["count"] == 0


def test_report_close_without_rollover_keeps_tasks_as_remaining(client):
    assert client.post("/api/sprints/Sprint 14/close", json={}).status_code == 200

    report = _report(client, "Sprint 14").json()
    assert report["sprint"]["status"] == "closed"
    # No sprint trail entries: nothing moved out, unfinished drop to backlog status.
    assert report["movedOut"]["count"] == 0
    assert report["remainingUnfinished"]["count"] == 8
    assert all(t["status"] == "backlog" for t in report["remainingUnfinished"]["tasks"])


def test_report_dedupe_move_out_then_back_in_both_lists(client):
    # Sprint 14 -> Sprint 15 -> Sprint 14 -> Sprint 15: two out-moves and one
    # in-move for Sprint 14, but each list dedupes to ONE row (latest wins).
    _move_task(client, "DEV-106", "Sprint 15")
    _move_task(client, "DEV-106", "Sprint 14")
    _move_task(client, "DEV-106", "Sprint 15")

    report = _report(client, "Sprint 14").json()
    assert report["movedOut"]["count"] == 1
    assert report["movedOut"]["tasks"][0]["id"] == "DEV-106"
    assert report["movedOut"]["tasks"][0]["to"] == "Sprint 15"  # latest out-move wins
    # Honest double-count: genuinely left AND genuinely arrived back once.
    assert report["movedIn"]["count"] == 1
    assert report["movedIn"]["tasks"][0]["id"] == "DEV-106"
    assert report["movedIn"]["tasks"][0]["from"] == "Sprint 15"

    mirror = _report(client, "Sprint 15").json()
    assert mirror["movedIn"]["count"] == 1
    assert mirror["movedOut"]["count"] == 1


def test_report_empty_sprint_zeros(client):
    created = client.post(
        "/api/sprints", json={"name": "Sprint 16", "startDate": "2026-12-21"}
    )
    assert created.status_code == 201

    report = _report(client, created.json()["id"]).json()
    assert report["totals"] == {"tasks": 0, "points": 0}
    for section in ("completed", "movedOut", "movedIn", "remainingUnfinished"):
        assert report[section] == {"count": 0, "points": 0, "tasks": []}, section


def test_report_unknown_sprint_404_never_500(client):
    resp = _report(client, MISSING_ID)
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_report_header_uses_live_name_after_rename(client):
    assert client.put("/api/sprints/Sprint 14", json={"name": "Sprint One"}).status_code == 200
    report = _report(client, "Sprint 14").json()
    assert report["sprint"]["id"] == "Sprint 14"
    assert report["sprint"]["name"] == "Sprint One"
    # Task rows keep the stable sprint id (frontend resolves the live name).
    assert all(t["sprint"] == "Sprint 14" for t in report["completed"]["tasks"])


def test_report_is_read_only(client):
    before_tasks = client.get("/api/tasks").json()
    before_sprints = client.get("/api/sprints").json()
    assert _report(client, "Sprint 14").status_code == 200
    assert _report(client, MISSING_ID).status_code == 404
    assert client.get("/api/tasks").json() == before_tasks
    assert client.get("/api/sprints").json() == before_sprints
