"""Black-box HTTP tests for /api/health, /api/dashboard/summary, /api/import, /api/reset."""


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
             "assignees": [{"type": "member", "id": "mx1"}],
             "dueDate": "2026-12-20", "status": "todo",
             "priority": "high", "sprint": "Sprint 99", "points": 5, "tag": "Backend"},
            {"id": "IMP-2", "title": "Imported task two", "description": "",
             "assignees": [],
             "dueDate": "2026-12-21", "status": "done",
             "priority": "low", "sprint": "Sprint 99", "points": 2, "tag": "QA"},
        ],
    }
    resp = client.post("/api/import", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["team"] == 2 and body["tasks"] == 2
    assert body["warnings"] == []

    got_team = sorted(client.get("/api/team").json(), key=lambda m: m["id"])
    assert [
        {k: m[k] for k in ("id", "name", "role", "color")} for m in got_team
    ] == sorted(payload["team"], key=lambda m: m["id"])
    got_tasks = sorted(client.get("/api/tasks").json(), key=lambda t: t["id"])
    enriched_mx1 = {
        "type": "member", "id": "mx1", "name": "Imported One",
        "role": "Dev", "color": "bg-sky-600",
    }
    expected_tasks = []
    for task in sorted(payload["tasks"], key=lambda t: t["id"]):
        expected = {k: v for k, v in task.items() if k != "assignees"}
        expected["assignees"] = [enriched_mx1] if task["id"] == "IMP-1" else []
        expected_tasks.append(expected)
    assert got_tasks == expected_tasks

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


# ---------- import/export link integrity + import RBAC ----------

LEAD_EMAIL = "lead-import@sprintflow.local"
LEAD_PASSWORD = "Lead12345!"


def _lead_headers(client):
    """Auth headers for a lead user (has data.import, lacks team.manage)."""
    created = client.post("/api/auth/users", json={
        "email": LEAD_EMAIL, "name": "Import Lead",
        "password": LEAD_PASSWORD, "role": "lead",
    })
    assert created.status_code in (201, 400)  # 400 = already created earlier in session
    login = client.post("/api/auth/login", json={"email": LEAD_EMAIL, "password": LEAD_PASSWORD})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _link_member(client, member_id, user_id):
    member = next(m for m in client.get("/api/team").json() if m["id"] == member_id)
    resp = client.put(f"/api/team/{member_id}", json={
        "name": member["name"], "role": member["role"],
        "color": member["color"], "userId": user_id,
    })
    assert resp.status_code == 200
    return resp.json()


def test_export_includes_userId_and_linkedUser(client):
    me = client.get("/api/auth/me").json()
    members = client.get("/api/team").json()
    assert members
    target = members[0]
    _link_member(client, target["id"], me["id"])

    exported = client.get("/api/export")
    assert exported.status_code == 200
    assert set(exported.json().keys()) == {"team", "tasks"}
    got = next(m for m in exported.json()["team"] if m["id"] == target["id"])
    assert got["userId"] == me["id"]
    assert got["linkedUser"] == {"name": me["name"], "email": me["email"]}
    rest = [m for m in exported.json()["team"] if m["id"] != target["id"]]
    assert rest and all(m["userId"] is None and m["linkedUser"] is None for m in rest)


def test_import_round_trip_preserves_links(client):
    me = client.get("/api/auth/me").json()
    members = client.get("/api/team").json()
    target = members[0]
    _link_member(client, target["id"], me["id"])

    exported = client.get("/api/export").json()
    # Import back the exact export shape (entries carry userId + linkedUser).
    resp = client.post("/api/import", json={"team": exported["team"], "tasks": exported["tasks"]})
    assert resp.status_code == 200
    assert resp.json()["warnings"] == []
    got = {m["id"]: m for m in client.get("/api/team").json()}
    assert got[target["id"]]["userId"] == me["id"]
    assert got[target["id"]]["linkedUser"] == {"name": me["name"], "email": me["email"]}
    # Tasks still resolve against the re-imported members.
    assert {t["id"] for t in client.get("/api/tasks").json()} == {t["id"] for t in exported["tasks"]}


def test_import_unknown_userId_cleared_with_warning(client):
    payload = {
        "team": [
            {"id": "mx9", "name": "Ghost Link", "role": "Dev",
             "color": "bg-sky-600", "userId": 999999},
        ],
        "tasks": [],
    }
    resp = client.post("/api/import", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["team"] == 1 and body["tasks"] == 0
    assert len(body["warnings"]) == 1
    assert "mx9" in body["warnings"][0]

    got = client.get("/api/team").json()
    assert len(got) == 1
    assert got[0]["userId"] is None
    assert got[0]["linkedUser"] is None


def test_lead_blocked_from_team_import_but_allowed_tasks_only(client, anon_client):
    headers = _lead_headers(client)
    before_team = client.get("/api/team").json()
    assert before_team

    blocked = anon_client.post("/api/import", json={
        "team": [{"id": "mx1", "name": "Sneaky", "role": "Dev", "color": "bg-sky-600"}],
        "tasks": [],
    }, headers=headers)
    assert blocked.status_code == 403
    # Rejected import must not wipe anything.
    assert client.get("/api/team").json() == before_team

    allowed = anon_client.post("/api/import", json={
        "team": [],
        "tasks": [{"id": "LEAD-1", "title": "Lead task", "description": "",
                   "assignees": [], "dueDate": "2026-12-20", "status": "todo",
                   "priority": "high", "sprint": "Sprint 99", "points": 3, "tag": "Backend"}],
    }, headers=headers)
    assert allowed.status_code == 200
    assert allowed.json()["tasks"] == 1


# ---------- import/export assignee arrays ----------

def _refs(task):
    return {(a["type"], a["id"]) for a in task["assignees"]}


def test_export_import_round_trip_preserves_assignees(client):
    members = client.get("/api/team").json()
    me = client.get("/api/auth/me").json()
    created = client.post("/api/tasks", json={
        "title": "Multi-assignee probe", "dueDate": "2026-12-20",
        "assignees": [
            {"type": "member", "id": members[0]["id"]},
            {"type": "member", "id": members[1]["id"]},
            {"type": "user", "id": me["id"]},
        ],
    }).json()
    want = {
        ("member", members[0]["id"]),
        ("member", members[1]["id"]),
        ("user", me["id"]),
    }
    assert _refs(created) == want

    exported = client.get("/api/export").json()
    # Import back the exact export shape (tasks carry enriched assignees).
    resp = client.post(
        "/api/import",
        json={"team": exported["team"], "tasks": exported["tasks"]},
    )
    assert resp.status_code == 200
    assert resp.json()["warnings"] == []
    got = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert _refs(got[created["id"]]) == want
    assert {t["id"] for t in got.values()} == {t["id"] for t in exported["tasks"]}


def test_import_unknown_assignee_ids_skipped_with_warnings(client):
    me = client.get("/api/auth/me").json()
    payload = {
        "team": [
            {"id": "mxk", "name": "Known", "role": "Dev", "color": "bg-sky-600"},
        ],
        "tasks": [
            {"id": "IMP-U1", "title": "Mixed assignees", "description": "",
             "assignees": [
                 {"type": "member", "id": "mxk"},
                 {"type": "member", "id": "m-ghost"},
                 {"type": "user", "id": me["id"]},
                 {"type": "user", "id": 999999},
             ],
             "dueDate": "2026-12-20", "status": "todo",
             "priority": "medium", "sprint": "Sprint 99", "points": 3, "tag": "QA"},
        ],
    }
    resp = client.post("/api/import", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["tasks"] == 1
    assert len(body["warnings"]) == 2
    assert any("m-ghost" in w for w in body["warnings"])
    assert any("999999" in w for w in body["warnings"])

    got = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert _refs(got["IMP-U1"]) == {("member", "mxk"), ("user", me["id"])}
