"""Black-box HTTP tests for /api/health, /api/dashboard/summary, /api/import, /api/reset."""
import pytest


def _expected_summary(sprint, sprint_tasks, backlog_count):
    total_pts = sum(t["points"] for t in sprint_tasks)
    done_pts = sum(t["points"] for t in sprint_tasks if t["status"] == "done")
    total_tasks = len(sprint_tasks)
    done_tasks = sum(1 for t in sprint_tasks if t["status"] == "done")
    if total_pts > 0:
        completion = round((done_pts / total_pts) * 100)
    elif total_tasks > 0:
        completion = round((done_tasks / total_tasks) * 100)
    else:
        completion = 0
    return {
        "sprint": sprint,
        "totalTasks": total_tasks,
        "doneTasks": done_tasks,
        "totalPoints": total_pts,
        "donePoints": done_pts,
        "completionPct": completion,
        "ongoingCount": sum(1 for t in sprint_tasks if t["status"] == "in_progress"),
        "reviewCount": sum(1 for t in sprint_tasks if t["status"] == "in_review"),
        "backlogCount": backlog_count,
        "criticalOpenCount": sum(
            1 for t in sprint_tasks if t["priority"] == "critical" and t["status"] != "done"
        ),
    }


def _summary_for(client, sprint):
    sprint_tasks = client.get("/api/tasks", params={"sprint": sprint}).json()
    backlog_tasks = client.get("/api/tasks", params={"status": "backlog"}).json()
    resp = client.get("/api/dashboard/summary", params={"sprint": sprint})
    assert resp.status_code == 200
    return resp.json(), _expected_summary(sprint, sprint_tasks, len(backlog_tasks))


def test_health_shape(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "database": "sqlite"}


def test_dashboard_summary_math_on_seed_data_for_sprint14(client):
    got, expected = _summary_for(client, "Sprint 14")
    assert got == expected
    # Seed sanity: Sprint 14 board is populated with mixed states.
    assert got["totalTasks"] > 0
    assert got["totalPoints"] >= got["donePoints"]
    assert got["totalTasks"] >= got["doneTasks"]


def test_dashboard_summary_math_for_another_sprint(client):
    tasks = client.get("/api/tasks").json()
    other = next((t["sprint"] for t in tasks if t["sprint"] != "Sprint 14"), None)
    if other is None:  # seeds without a second sprint: create our own signal
        other = "Sprint 99"
        client.post("/api/tasks", json={
            "title": "Other sprint probe", "dueDate": "2026-12-08",
            "sprint": other, "status": "done", "points": 4,
        })
    got, expected = _summary_for(client, other)
    assert got == expected


def test_dashboard_summary_reflects_new_done_task(client):
    before = client.get("/api/dashboard/summary", params={"sprint": "Sprint 14"}).json()
    created = client.post("/api/tasks", json={
        "title": "Extra done work", "dueDate": "2026-12-08",
        "sprint": "Sprint 14", "status": "done", "points": 4,
    }).json()
    after = client.get("/api/dashboard/summary", params={"sprint": "Sprint 14"}).json()
    assert after["totalTasks"] == before["totalTasks"] + 1
    assert after["doneTasks"] == before["doneTasks"] + 1
    assert after["totalPoints"] == before["totalPoints"] + created["points"]
    assert after["donePoints"] == before["donePoints"] + created["points"]
    _, expected = _summary_for(client, "Sprint 14")
    assert after == expected


def test_import_round_trip_and_reset_restores_seeds(client):
    before_team = sorted(client.get("/api/team").json(), key=lambda m: m["id"])
    before_tasks = sorted(client.get("/api/tasks").json(), key=lambda t: t["id"])
    assert before_team and before_tasks

    payload = {
        "team": [
            {"id": "mx1", "name": "Imported One", "role": "Dev", "color": "bg-sky-600"},
            {"id": "mx2", "name": "Imported Two", "role": "QA", "color": "bg-rose-600"},
        ],
        "tasks": [
            {"id": "IMP-1", "title": "Imported task one", "description": "first",
             "assigneeId": "mx1", "dueDate": "2026-12-20", "status": "todo",
             "priority": "high", "sprint": "Sprint 99", "points": 5, "tag": "Backend"},
            {"id": "IMP-2", "title": "Imported task two", "description": "",
             "assigneeId": None, "dueDate": "2026-12-21", "status": "done",
             "priority": "low", "sprint": "Sprint 99", "points": 2, "tag": "QA"},
        ],
    }
    resp = client.post("/api/import", json=payload)
    assert resp.status_code == 200
    assert resp.json() == {"team": 2, "tasks": 2}

    got_team = sorted(client.get("/api/team").json(), key=lambda m: m["id"])
    assert got_team == sorted(payload["team"], key=lambda m: m["id"])
    got_tasks = sorted(client.get("/api/tasks").json(), key=lambda t: t["id"])
    assert got_tasks == sorted(payload["tasks"], key=lambda t: t["id"])

    summary = client.get("/api/dashboard/summary", params={"sprint": "Sprint 99"}).json()
    assert summary["totalTasks"] == 2
    assert summary["doneTasks"] == 1
    assert summary["totalPoints"] == 7
    assert summary["donePoints"] == 2

    reset = client.post("/api/reset")
    assert reset.status_code == 200
    assert reset.json() == {"status": "reset"}
    assert sorted(client.get("/api/team").json(), key=lambda m: m["id"]) == before_team
    assert sorted(client.get("/api/tasks").json(), key=lambda t: t["id"]) == before_tasks


def test_reset_restores_seeds_after_wipe(client):
    before_team = sorted(client.get("/api/team").json(), key=lambda m: m["id"])
    before_tasks = sorted(client.get("/api/tasks").json(), key=lambda t: t["id"])
    wipe = client.post("/api/import", json={"team": [], "tasks": []})
    assert wipe.status_code == 200
    assert client.get("/api/tasks").json() == []
    assert client.get("/api/team").json() == []
    assert client.post("/api/reset").status_code == 200
    assert sorted(client.get("/api/team").json(), key=lambda m: m["id"]) == before_team
    assert sorted(client.get("/api/tasks").json(), key=lambda t: t["id"]) == before_tasks
