"""Black-box HTTP tests for the tag master: /api/tags CRUD, 409s, task
validation, import auto-create, and RBAC (writes need team.manage, reads
open to all authed roles)."""

TAG_KEYS = {"id", "name", "color", "taskCount"}

MEMBER_EMAIL = "tagsmember@sprintflow.local"
MEMBER_PASSWORD = "Tagsmember123!"
VIEWER_EMAIL = "tagsviewer@sprintflow.local"
VIEWER_PASSWORD = "Tagsviewer123!"


def _ensure_user(client, email, name, password, role):
    resp = client.post(
        "/api/auth/users",
        json={"email": email, "name": name, "password": password, "role": role},
    )
    assert resp.status_code in (201, 400), resp.text


def _headers_for(client, email, password):
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _member_headers(client):
    _ensure_user(client, MEMBER_EMAIL, "Tags Member", MEMBER_PASSWORD, "member")
    return _headers_for(client, MEMBER_EMAIL, MEMBER_PASSWORD)


def _viewer_headers(client):
    _ensure_user(client, VIEWER_EMAIL, "Tags Viewer", VIEWER_PASSWORD, "viewer")
    return _headers_for(client, VIEWER_EMAIL, VIEWER_PASSWORD)


def _all_tags(client, headers=None):
    resp = client.get("/api/tags", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _task_payload(**overrides):
    data = {
        "title": "Tagged probe",
        "description": "",
        "assigneeId": None,
        "dueDate": "2026-12-05",
        "status": "todo",
        "priority": "medium",
        "sprint": "Sprint 14",
        "points": 3,
        "tag": "QA",
    }
    data.update(overrides)
    return data


# ---------- list ----------

def test_list_tags_seeded_sorted_with_counts(client):
    tags = _all_tags(client)
    assert tags, "seed tags must be non-empty"
    for tag in tags:
        assert TAG_KEYS <= set(tag), f"tag missing keys: {tag}"
        assert isinstance(tag["taskCount"], int)
    names = [t["name"] for t in tags]
    assert names == sorted(names, key=str.lower)
    assert {"API", "Backend", "Design", "DevOps", "Frontend", "QA"} <= set(names)
    # Counts reconcile against the task list.
    tasks = client.get("/api/tasks").json()
    for tag in tags:
        expected = sum(
            1
            for t in tasks
            if str(t["tag"]).lower() in (tag["name"].lower(), tag["id"].lower())
        )
        assert tag["taskCount"] == expected, f"count mismatch for {tag['name']}"


# ---------- create ----------

def test_create_tag_slugifies_id_and_defaults_color(client):
    resp = client.post("/api/tags", json={"name": "Data Science"})
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert TAG_KEYS <= set(created)
    assert created["id"] == "data-science"
    assert created["name"] == "Data Science"
    assert created["color"] == "bg-sky-600"
    assert created["taskCount"] == 0
    assert "data-science" in {t["id"] for t in _all_tags(client)}


def test_create_tag_custom_color(client):
    resp = client.post("/api/tags", json={"name": "Mobile", "color": "bg-teal-600"})
    assert resp.status_code == 201, resp.text
    assert resp.json()["color"] == "bg-teal-600"


def test_create_tag_duplicate_409(client):
    first = client.post("/api/tags", json={"name": "Observability"})
    assert first.status_code == 201
    again = client.post("/api/tags", json={"name": "Observability"})
    assert again.status_code == 409
    # Case-insensitive name duplicate also conflicts.
    assert client.post("/api/tags", json={"name": "observability"}).status_code == 409
    # Seed-tag duplicate conflicts too.
    assert client.post("/api/tags", json={"name": "Frontend"}).status_code == 409


def test_create_tag_blank_name_400(client):
    assert client.post("/api/tags", json={"name": "   "}).status_code == 400


# ---------- update ----------

def test_update_tag_name_and_color(client):
    created = client.post("/api/tags", json={"name": "Docs"}).json()
    resp = client.put(
        f"/api/tags/{created['id']}", json={"name": "Documentation", "color": "bg-amber-600"}
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    assert updated["id"] == created["id"]
    assert updated["name"] == "Documentation"
    assert updated["color"] == "bg-amber-600"


def test_update_tag_partial_color_only(client):
    resp = client.put("/api/tags/frontend", json={"color": "bg-rose-600"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Frontend"
    assert resp.json()["color"] == "bg-rose-600"


def test_update_tag_rename_repoints_tasks(client):
    created = client.post("/api/tags", json={"name": "Mobile"}).json()
    task = client.post("/api/tasks", json=_task_payload(tag="Mobile")).json()
    resp = client.put(f"/api/tags/{created['id']}", json={"name": "Mobile Apps"})
    assert resp.status_code == 200
    assert resp.json()["taskCount"] == 1
    got = next(t for t in client.get("/api/tasks").json() if t["id"] == task["id"])
    assert got["tag"] == "Mobile Apps"


def test_update_tag_duplicate_name_409(client):
    client.post("/api/tags", json={"name": "Alpha Tag"})
    beta = client.post("/api/tags", json={"name": "Beta Tag"}).json()
    resp = client.put(f"/api/tags/{beta['id']}", json={"name": "Alpha Tag"})
    assert resp.status_code == 409


def test_update_unknown_tag_404(client):
    assert client.put("/api/tags/no-such-tag", json={"color": "bg-rose-600"}).status_code == 404


# ---------- delete ----------

def test_delete_unused_tag(client):
    created = client.post("/api/tags", json={"name": "Temporary"}).json()
    resp = client.delete(f"/api/tags/{created['id']}")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": created["id"]}
    assert created["id"] not in {t["id"] for t in _all_tags(client)}


def test_delete_used_tag_409_with_task_count(client):
    before = {t["name"]: t for t in _all_tags(client)}
    assert before["Frontend"]["taskCount"] > 0
    resp = client.delete("/api/tags/frontend")
    assert resp.status_code == 409, resp.text
    assert resp.json() == {"tasks": before["Frontend"]["taskCount"]}
    # Blocked delete leaves the tag intact.
    assert "frontend" in {t["id"] for t in _all_tags(client)}


def test_delete_unknown_tag_404(client):
    assert client.delete("/api/tags/no-such-tag").status_code == 404


# ---------- task tag validation ----------

def test_create_task_unknown_tag_400(client):
    resp = client.post("/api/tasks", json=_task_payload(tag="No Such Tag"))
    assert resp.status_code == 400


def test_update_task_unknown_tag_400(client):
    created = client.post("/api/tasks", json=_task_payload()).json()
    resp = client.put(f"/api/tasks/{created['id']}", json=_task_payload(tag="No Such Tag"))
    assert resp.status_code == 400


def test_create_task_known_tag_ok(client):
    for tag in ("QA", "Frontend", "API"):
        resp = client.post("/api/tasks", json=_task_payload(tag=tag))
        assert resp.status_code == 201, f"tag {tag}: {resp.text}"


# ---------- import auto-create ----------

def test_import_autocreates_missing_tags_with_warnings(client):
    payload = {
        "team": [],
        "tasks": [
            {
                "id": "IMP-T1", "title": "New stream work", "description": "",
                "assigneeId": None, "dueDate": "2026-12-20", "status": "todo",
                "priority": "medium", "sprint": "Sprint 99", "points": 3,
                "tag": "Observability",
            },
            {
                "id": "IMP-T2", "title": "Seed stream work", "description": "",
                "assigneeId": None, "dueDate": "2026-12-21", "status": "todo",
                "priority": "low", "sprint": "Sprint 99", "points": 2, "tag": "QA",
            },
        ],
    }
    resp = client.post("/api/import", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert any("Observability" in w for w in body["warnings"]), body["warnings"]
    tags = {t["name"]: t for t in _all_tags(client)}
    assert "Observability" in tags
    assert tags["Observability"]["taskCount"] == 1
    assert tags["QA"]["taskCount"] == 1


def test_import_known_tags_produce_no_tag_warnings(client):
    payload = {
        "team": [],
        "tasks": [
            {
                "id": "IMP-K1", "title": "Seed work", "description": "",
                "assigneeId": None, "dueDate": "2026-12-20", "status": "todo",
                "priority": "medium", "sprint": "Sprint 99", "points": 3, "tag": "Backend",
            }
        ],
    }
    resp = client.post("/api/import", json=payload)
    assert resp.status_code == 200
    assert resp.json()["warnings"] == []


# ---------- RBAC ----------

def test_tag_writes_forbidden_for_member_and_viewer(client, anon_client):
    member = _member_headers(client)
    viewer = _viewer_headers(client)
    for headers in (member, viewer):
        assert anon_client.post("/api/tags", json={"name": "Nope"}, headers=headers).status_code == 403
        assert anon_client.put("/api/tags/frontend", json={"color": "bg-rose-600"}, headers=headers).status_code == 403
        assert anon_client.delete("/api/tags/frontend", headers=headers).status_code == 403


def test_tag_reads_open_to_viewer_but_closed_anon(client, anon_client):
    viewer = _viewer_headers(client)
    resp = anon_client.get("/api/tags", headers=viewer)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list) and resp.json()
    member = _member_headers(client)
    assert anon_client.get("/api/tags", headers=member).status_code == 200
    assert anon_client.get("/api/tags").status_code == 401
