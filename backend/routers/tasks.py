"""Task endpoints for SprintFlow API."""
from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

import auth
import db
from models import StatusUpdatePayload, TaskPayload

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


@router.post("/tasks", status_code=201)
def create_task(
    payload: TaskPayload,
    _user: Dict[str, Any] = Depends(auth.require_permissions("tasks.create")),
) -> Dict[str, Any]:
    with db.get_conn() as conn:
        assignees = db.validate_assignees(conn, payload.assignees)
        db.validate_tag(conn, payload.tag)
        # H1: next_task_id is SELECT-max+1, so concurrent creators can collide
        # on the same DEV-* id. Retry with a recomputed id; never leak a 500.
        for _ in range(CREATE_ID_MAX_ATTEMPTS):
            task_id = db.next_task_id(conn)
            try:
                conn.execute(
                    """
                    INSERT INTO tasks
                        (id, title, description, due_date, status, priority, sprint, points, tag)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        task_id,
                        payload.title.strip(),
                        payload.description.strip(),
                        payload.dueDate,
                        payload.status,
                        payload.priority,
                        payload.sprint,
                        payload.points,
                        payload.tag,
                    ),
                )
            except sqlite3.IntegrityError:
                continue
            db.set_task_assignees(conn, task_id, assignees)
            return db.fetch_task(conn, task_id)
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not allocate a unique task id after "
                f"{CREATE_ID_MAX_ATTEMPTS} attempts; please retry."
            ),
        )


@router.put("/tasks/{task_id}")
def update_task(
    task_id: str,
    payload: TaskPayload,
    _user: Dict[str, Any] = Depends(auth.require_permissions("tasks.edit")),
) -> Dict[str, Any]:
    with db.get_conn() as conn:
        existing = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Task not found")
        assignees = db.validate_assignees(conn, payload.assignees)
        db.validate_tag(conn, payload.tag)
        conn.execute(
            """
            UPDATE tasks
            SET title = ?, description = ?, due_date = ?,
                status = ?, priority = ?, sprint = ?, points = ?, tag = ?,
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
                payload.tag,
                task_id,
            ),
        )
        db.set_task_assignees(conn, task_id, assignees)
        return db.fetch_task(conn, task_id)


@router.patch("/tasks/{task_id}/status")
def update_task_status(
    task_id: str,
    payload: StatusUpdatePayload,
    _user: Dict[str, Any] = Depends(auth.require_permissions("tasks.edit")),
) -> Dict[str, Any]:
    with db.get_conn() as conn:
        existing = conn.execute("SELECT sprint FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Task not found")
        if payload.status != "backlog" and existing["sprint"] == "Backlog":
            next_sprint = _latest_sprint(conn)
        else:
            next_sprint = existing["sprint"]
        conn.execute(
            "UPDATE tasks SET status = ?, sprint = ?, updated_at = datetime('now') WHERE id = ?",
            (payload.status, next_sprint, task_id),
        )
        return db.fetch_task(conn, task_id)


@router.post("/tasks/{task_id}/promote")
def promote_task(
    task_id: str,
    _user: Dict[str, Any] = Depends(auth.require_permissions("tasks.edit")),
) -> Dict[str, Any]:
    with db.get_conn() as conn:
        existing = conn.execute("SELECT id, status FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Task not found")
        if existing["status"] != "backlog":
            raise HTTPException(
                status_code=400, detail="Only backlog tasks can be promoted"
            )
        conn.execute(
            "UPDATE tasks SET status = 'todo', sprint = ?, updated_at = datetime('now') WHERE id = ?",
            (_latest_sprint(conn), task_id),
        )
        return db.fetch_task(conn, task_id)


@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: str,
    _user: Dict[str, Any] = Depends(auth.require_permissions("tasks.delete")),
) -> Dict[str, str]:
    with db.get_conn() as conn:
        cur = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"deleted": task_id}
