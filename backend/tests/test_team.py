"""Black-box HTTP tests for /api/team (list, add, update, delete)."""
import pytest

MEMBER_KEYS = {"id", "name", "role", "color"}
MISSING_ID = "m-does-not-exist"


def _team(client):
    resp = client.get("/api/team")
    assert resp.status_code == 200
    return resp.json()


def _add(client, name="QA Bot", role="Tester", color=None):
    body = {"name": name, "role": role}
    if color is not None:
        body["color"] = color
    resp = client.post("/api/team", json=body)
    assert resp.status_code == 201
    return resp.json()


def test_list_team_with_shape(client):
    members = _team(client)
    assert isinstance(members, list) and members, "seed team must be non-empty"
    for member in members:
        assert MEMBER_KEYS <= set(member), f"member missing keys: {member}"


def test_add_member_returns_201_and_echo(client):
    member = _add(client, name="New Hire", role="Designer")
    assert MEMBER_KEYS <= set(member)
    assert member["name"] == "New Hire"
    assert member["role"] == "Designer"
    assert member["id"]
    assert member["color"], "server should assign a default avatar color"
    assert member["id"] in {m["id"] for m in _team(client)}


def test_add_member_preserves_explicit_color(client):
    member = _add(client, name="Colorful", color="bg-teal-600")
    assert member["color"] == "bg-teal-600"


@pytest.mark.parametrize("body", [
    {"name": "", "role": "Dev"},  # empty name
    {"role": "Dev"},  # missing name
])
def test_add_member_rejects_bad_payload_with_422(client, body):
    assert client.post("/api/team", json=body).status_code == 422


def test_update_member(client):
    member = _add(client)
    resp = client.put(f"/api/team/{member['id']}", json={"name": "Renamed", "role": "Lead"})
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["id"] == member["id"]
    assert updated["name"] == "Renamed"
    assert updated["role"] == "Lead"
    by_id = {m["id"]: m for m in _team(client)}
    assert by_id[member["id"]]["name"] == "Renamed"


def test_update_unknown_member_404(client):
    assert client.put(f"/api/team/{MISSING_ID}", json={"name": "Ghost"}).status_code == 404


def test_delete_member_unassigns_tasks_by_default(client):
    members = _team(client)
    assert len(members) >= 2
    victim = members[-1]
    created = client.post("/api/tasks", json={
        "title": "Task owned by leaver",
        "dueDate": "2026-12-07",
        "assigneeId": victim["id"],
    }).json()
    assert created["assigneeId"] == victim["id"]

    resp = client.delete(f"/api/team/{victim['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["deleted"] == victim["id"]
    assert body["reassignedTasks"] >= 1
    assert body["fallback"] is None

    remaining_ids = {m["id"] for m in _team(client)}
    assert victim["id"] not in remaining_ids
    tasks = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert tasks[created["id"]]["assigneeId"] is None


def test_delete_member_with_reassign_to_moves_tasks(client):
    members = _team(client)
    assert len(members) >= 2
    victim = members[-1]
    fallback = next(m for m in members if m["id"] != victim["id"])
    created = client.post("/api/tasks", json={
        "title": "Task to reassign",
        "dueDate": "2026-12-08",
        "assigneeId": victim["id"],
    }).json()

    resp = client.delete(f"/api/team/{victim['id']}", params={"reassignTo": fallback["id"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["deleted"] == victim["id"]
    assert body["reassignedTasks"] >= 1
    assert body["fallback"] == fallback["id"]

    tasks = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert tasks[created["id"]]["assigneeId"] == fallback["id"]

    bad = client.delete(f"/api/team/{fallback['id']}", params={"reassignTo": "mx-missing"})
    assert bad.status_code == 400


def test_delete_last_member_returns_400_and_keeps_member(client):
    members = _team(client)
    assert len(members) >= 2
    for member in members[1:]:
        assert client.delete(f"/api/team/{member['id']}").status_code == 200
    last = members[0]
    resp = client.delete(f"/api/team/{last['id']}")
    assert resp.status_code == 400
    assert last["id"] in {m["id"] for m in _team(client)}


def test_delete_unknown_member_404(client):
    assert len(_team(client)) > 1  # guard passes; 404 comes from missing id
    assert client.delete(f"/api/team/{MISSING_ID}").status_code == 404
