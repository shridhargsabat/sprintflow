"""Black-box HTTP tests for /api/sprints (list, update, 404, 422)."""
import pytest

SPRINT_KEYS = {"id", "name", "startDate", "lengthDays", "endDate"}
MISSING_ID = "Sprint 999"


def _all_sprints(client):
    resp = client.get("/api/sprints")
    assert resp.status_code == 200
    return resp.json()


def test_list_returns_seeded_sprints_with_shape_order_and_enddate(client):
    sprints = _all_sprints(client)
    assert isinstance(sprints, list) and len(sprints) >= 2
    for sprint in sprints:
        assert SPRINT_KEYS <= set(sprint), f"sprint missing keys: {sprint}"
    starts = [s["startDate"] for s in sprints]
    assert starts == sorted(starts), "sprints must be ordered by start_date"

    first, second = sprints[0], sprints[1]
    assert first == {
        "id": "Sprint 14",
        "name": "Sprint 14",
        "startDate": "2026-11-23",
        "lengthDays": 14,
        "endDate": "2026-12-06",
    }
    assert second == {
        "id": "Sprint 15",
        "name": "Sprint 15",
        "startDate": "2026-12-07",
        "lengthDays": 14,
        "endDate": "2026-12-20",
    }


def test_put_start_and_length_update_recomputes_enddate(client):
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
        "endDate": "2026-12-06",
    }
    # Persisted: visible on subsequent GET.
    assert _all_sprints(client)[0] == updated


def test_put_partial_length_only_keeps_startdate(client):
    resp = client.put("/api/sprints/Sprint 14", json={"lengthDays": 21})
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["startDate"] == "2026-11-23"
    assert updated["lengthDays"] == 21
    assert updated["endDate"] == "2026-12-13"


def test_put_partial_start_only_keeps_length(client):
    resp = client.put("/api/sprints/Sprint 15", json={"startDate": "2026-12-01"})
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["startDate"] == "2026-12-01"
    assert updated["lengthDays"] == 14
    assert updated["endDate"] == "2026-12-14"


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
