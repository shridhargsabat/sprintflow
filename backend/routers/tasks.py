"""Task endpoints for SprintFlow API."""
from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

import auth
import db
from models import StatusUpdatePayload, TaskLinkPayload, TaskPayload

router = APIRouter(prefix="/api")

# Bounded id-collision retries for concurrent task creation (H1).
CREATE_ID_MAX_ATTEMPTS = 3


def _latest_sprint(conn: sqlite3.Connection) -> str:
    """Name of the latest sprint (max start_date) from the sprints table."""
    row = conn.execute(
        "SELECT id FROM sprints ORDER BY start_date DESC LIMIT 1"
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=503, detail="No sprints configured")
    return str(row["id"])


@router.get("/tasks")
def get_tasks(
    sprint: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    priority: Optional[str] = Query(default=None),
    assigneeId: Optional[str] = Query(default=None),
    assigneeUserId: Optional[int] = Query(default=None),
    search: Optional[str] = Query(default=None),
    _user: Dict[str, Any] = Depends(auth.get_current_user),
) -> List[Dict[str, Any]]:
    return db.list_tasks(
        sprint=sprint,
        status=status,
        priority=priority,
        assignee_id=assigneeId,
        assignee_user_id=assigneeUserId,
        search=search,
    )


# L2: whitespace-only titles/sprints pass min_length but must never be stored.
def _require_nonblank_title_sprint(payload: TaskPayload) -> None:
    if not payload.title:
        raise HTTPException(status_code=400, detail="Task title must not be blank")
    if not payload.sprint:
        raise HTTPException(status_code=400, detail="Task sprint must not be blank")


def _require_points_in_scale(conn: sqlite3.Connection, points: int) -> None:
    """New/edited tasks must use the admin-configured points scale.

    Pre-existing tasks keep any value they already hold (no rewrite);
    only writes are gated, with a 400 (not 422 — the value is a valid
    int, just not an offered option).
    """
    scale = db.get_points_scale(conn)
    if points not in scale:
        raise HTTPException(
            status_code=400,
            detail=f"Points {points} is not in the configured scale {scale}",
        )


@router.post("/tasks", status_code=201)
def create_task(
    payload: TaskPayload,
    user: Dict[str, Any] = Depends(auth.require_permissions("tasks.create")),
) -> Dict[str, Any]:
    _require_nonblank_title_sprint(payload)
    with db.get_conn() as conn:
        assignees = db.validate_assignees(conn, payload.assignees)
        tags = db.validate_tags(conn, payload.tags)
        _require_points_in_scale(conn, payload.points)
        created = _insert_task(conn, payload, assignees, tags)
    # Trail entry only after the insert committed (guarded; never breaks create).
    db.log_activity(
        created["id"],
        actor=user,
        action=db.ACTIVITY_ACTION_CREATED,
        new_value=created["title"],
    )
    return created


def _insert_task(
    conn: sqlite3.Connection,
    payload: TaskPayload,
    assignees: List[Any],
    tags: List[str],
    sprint_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert one task row (+assignees/tags) with id-collision retries (H1).

    Shared by POST /tasks and POST /tasks/{id}/children; the child path
    overrides the sprint with the parent's. Raises 404/503, never leaks 500.
    """
    created: Optional[Dict[str, Any]] = None
    # H1: next_task_id is SELECT-max+1, so concurrent creators can collide
    # on the same DEV-* id. Retry with a recomputed id; never leak a 500.
    for _ in range(CREATE_ID_MAX_ATTEMPTS):
        task_id = db.next_task_id(conn)
        try:
            conn.execute(
                """
                INSERT INTO tasks
                    (id, title, description, due_date, status, priority, sprint, points)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task_id,
                    payload.title.strip(),
                    payload.description.strip(),
                    payload.dueDate,
                    payload.status,
                    payload.priority,
                    sprint_override if sprint_override is not None else payload.sprint,
                    payload.points,
                ),
            )
        except sqlite3.IntegrityError:
            continue
        db.set_task_assignees(conn, task_id, assignees)
        db.set_task_tags(conn, task_id, tags)
        created = db.fetch_task(conn, task_id)
        break
    if created is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not allocate a unique task id after "
                f"{CREATE_ID_MAX_ATTEMPTS} attempts; please retry."
            ),
        )
    return created


@router.put("/tasks/{task_id}")
def update_task(
    task_id: str,
    payload: TaskPayload,
    user: Dict[str, Any] = Depends(auth.require_permissions("tasks.edit")),
) -> Dict[str, Any]:
    _require_nonblank_title_sprint(payload)
    with db.get_conn() as conn:
        # fetch_task raises the 404 itself when the id is unknown.
        before = db.fetch_task(conn, task_id)
        assignees = db.validate_assignees(conn, payload.assignees)
        tags = db.validate_tags(conn, payload.tags)
        _require_points_in_scale(conn, payload.points)
        cur = conn.execute(
            """
            UPDATE tasks
            SET title = ?, description = ?, due_date = ?,
                status = ?, priority = ?, sprint = ?, points = ?,
                updated_at = datetime('now')
            WHERE id = ?
            """,
            (
                payload.title.strip(),
                payload.description.strip(),
                payload.dueDate,
                payload.status,
                payload.priority,
                payload.sprint,
                payload.points,
                task_id,
            ),
        )
        # L12: the task may have vanished between the existence check and
        # the UPDATE — 0 rows means 404, not a 500 from the FK insert below.
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        db.set_task_assignees(conn, task_id, assignees)
        db.set_task_tags(conn, task_id, tags)
        after = db.fetch_task(conn, task_id)
        diffs = db.diff_tasks(before, after)
    # Diff-only trail entries after the update committed (guarded).
    db.log_activity_many(
        [
            {
                "task_id": task_id,
                "actor": user,
                "action": db.ACTIVITY_ACTION_UPDATED,
                "field": field,
                "old_value": old,
                "new_value": new,
            }
            for field, old, new in diffs
        ]
    )
    return after


@router.patch("/tasks/{task_id}/status")
def update_task_status(
    task_id: str,
    payload: StatusUpdatePayload,
    user: Dict[str, Any] = Depends(auth.require_permissions("tasks.edit")),
) -> Dict[str, Any]:
    with db.get_conn() as conn:
        existing = conn.execute("SELECT status, sprint FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Task not found")
        old_status, old_sprint = existing["status"], existing["sprint"]
        if payload.status != "backlog" and existing["sprint"] == "Backlog":
            next_sprint = _latest_sprint(conn)
        else:
            next_sprint = existing["sprint"]
        conn.execute(
            "UPDATE tasks SET status = ?, sprint = ?, updated_at = datetime('now') WHERE id = ?",
            (payload.status, next_sprint, task_id),
        )
        updated = db.fetch_task(conn, task_id)
    # Status + any implicit sprint move, after commit (guarded).
    entries: List[Dict[str, Any]] = []
    if old_status != payload.status:
        entries.append(
            {
                "task_id": task_id,
                "actor": user,
                "action": db.ACTIVITY_ACTION_UPDATED,
                "field": "status",
                "old_value": old_status,
                "new_value": payload.status,
            }
        )
    if old_sprint != next_sprint:
        entries.append(
            {
                "task_id": task_id,
                "actor": user,
                "action": db.ACTIVITY_ACTION_UPDATED,
                "field": "sprint",
                "old_value": old_sprint,
                "new_value": next_sprint,
            }
        )
    db.log_activity_many(entries)
    return updated


@router.post("/tasks/{task_id}/promote")
def promote_task(
    task_id: str,
    user: Dict[str, Any] = Depends(auth.require_permissions("tasks.edit")),
) -> Dict[str, Any]:
    with db.get_conn() as conn:
        existing = conn.execute("SELECT id, status, sprint FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Task not found")
        if existing["status"] != "backlog":
            raise HTTPException(
                status_code=400, detail="Only backlog tasks can be promoted"
            )
        old_sprint = existing["sprint"]
        next_sprint = _latest_sprint(conn)
        conn.execute(
            "UPDATE tasks SET status = 'todo', sprint = ?, updated_at = datetime('now') WHERE id = ?",
            (next_sprint, task_id),
        )
        updated = db.fetch_task(conn, task_id)
    # backlog->todo plus the sprint pull, after commit (guarded).
    db.log_activity_many(
        [
            {
                "task_id": task_id,
                "actor": user,
                "action": db.ACTIVITY_ACTION_UPDATED,
                "field": "status",
                "old_value": "backlog",
                "new_value": "todo",
            },
            {
                "task_id": task_id,
                "actor": user,
                "action": db.ACTIVITY_ACTION_UPDATED,
                "field": "sprint",
                "old_value": old_sprint,
                "new_value": next_sprint,
            },
        ]
    )
    return updated


@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: str,
    user: Dict[str, Any] = Depends(auth.require_permissions("tasks.delete")),
) -> Dict[str, str]:
    with db.get_conn() as conn:
        cur = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found")
    # 'deleted' tombstone logged AFTER the row is gone (guarded). The
    # activity table has no FK to tasks, so the full trail — including this
    # entry — stays queryable via GET .../activity after deletion.
    db.log_activity(
        task_id,
        actor=user,
        action=db.ACTIVITY_ACTION_DELETED,
    )
    return {"deleted": task_id}


@router.get("/tasks/{task_id}/activity")
def get_task_activity(
    task_id: str,
    _user: Dict[str, Any] = Depends(auth.get_current_user),
) -> List[Dict[str, Any]]:
    # Never 404s: legacy tasks simply return [] (no fabricated backfill).
    return db.list_task_activity(task_id)


@router.post("/tasks/{task_id}/links", status_code=201)
def add_link(
    task_id: str,
    payload: TaskLinkPayload,
    user: Dict[str, Any] = Depends(auth.require_permissions("tasks.edit")),
) -> Dict[str, str]:
    with db.get_conn() as conn:
        link = db.add_task_link(conn, task_id, payload.linked_task_id, payload.kind)
    # Trail entry on the addressed task, after commit (guarded).
    db.log_activity(
        task_id,
        actor=user,
        action=db.ACTIVITY_ACTION_LINK,
        field=link["kind"],
        new_value=link["linked_task_id"],
    )
    return link


@router.delete("/tasks/{task_id}/links/{linked_id}")
def delete_link(
    task_id: str,
    linked_id: str,
    kind: str = Query(...),
    user: Dict[str, Any] = Depends(auth.require_permissions("tasks.edit")),
) -> Dict[str, bool]:
    with db.get_conn() as conn:
        removed = db.remove_task_link(conn, task_id, linked_id, kind)
    # Idempotent: missing links (or tasks) are not errors — the desired
    # end-state (no link) already holds. Log only actual removals.
    if removed:
        db.log_activity(
            task_id,
            actor=user,
            action=db.ACTIVITY_ACTION_LINK,
            field=kind,
            old_value=linked_id,
        )
    return {"removed": removed}


@router.post("/tasks/{task_id}/children", status_code=201)
def create_child(
    task_id: str,
    payload: TaskPayload,
    user: Dict[str, Any] = Depends(auth.require_permissions("tasks.edit")),
) -> Dict[str, Any]:
    _require_nonblank_title_sprint(payload)
    with db.get_conn() as conn:
        parent = conn.execute(
            "SELECT sprint FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if parent is None:
            raise HTTPException(status_code=404, detail="Task not found")
        assignees = db.validate_assignees(conn, payload.assignees)
        tags = db.validate_tags(conn, payload.tags)
        _require_points_in_scale(conn, payload.points)
        created = _insert_task(conn, payload, assignees, tags, sprint_override=parent["sprint"])
        db.add_task_link(conn, task_id, created["id"], db.TASK_LINK_SUBTASK)
    # Normal 'created' entry on the child PLUS a 'link' entry on the parent.
    db.log_activity_many(
        [
            {
                "task_id": created["id"],
                "actor": user,
                "action": db.ACTIVITY_ACTION_CREATED,
                "new_value": created["title"],
            },
            {
                "task_id": task_id,
                "actor": user,
                "action": db.ACTIVITY_ACTION_LINK,
                "field": db.TASK_LINK_SUBTASK,
                "new_value": created["id"],
            },
        ]
    )
    return created
