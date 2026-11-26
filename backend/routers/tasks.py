"""Task endpoints for SprintFlow API."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

import auth
import db
from models import StatusUpdatePayload, TaskPayload

router = APIRouter(prefix="/api")


@router.get("/tasks")
def get_tasks(
    sprint: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    priority: Optional[str] = Query(default=None),
    assigneeId: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    _user: Dict[str, Any] = Depends(auth.get_current_user),
) -> List[Dict[str, Any]]:
    return db.list_tasks(
        sprint=sprint,
        status=status,
        priority=priority,
        assignee_id=assigneeId,
        search=search,
    )


@router.post("/tasks", status_code=201)
def create_task(
    payload: TaskPayload,
    _user: Dict[str, Any] = Depends(auth.require_permissions("tasks.create")),
) -> Dict[str, Any]:
    with db.get_conn() as conn:
        task_id = db.next_task_id(conn)
        conn.execute(
            """
            INSERT INTO tasks
                (id, title, description, assignee_id, due_date, status, priority, sprint, points, tag)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                payload.title.strip(),
                payload.description.strip(),
                payload.assigneeId,
                payload.dueDate,
                payload.status,
                payload.priority,
                payload.sprint,
                payload.points,
                payload.tag,
            ),
        )
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return db.row_to_task(row)


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
        conn.execute(
            """
            UPDATE tasks
            SET title = ?, description = ?, assignee_id = ?, due_date = ?,
                status = ?, priority = ?, sprint = ?, points = ?, tag = ?,
                updated_at = datetime('now')
            WHERE id = ?
            """,
            (
                payload.title.strip(),
                payload.description.strip(),
                payload.assigneeId,
                payload.dueDate,
                payload.status,
                payload.priority,
                payload.sprint,
                payload.points,
                payload.tag,
                task_id,
            ),
        )
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return db.row_to_task(row)


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
        next_sprint = "Sprint 14" if (payload.status != "backlog" and existing["sprint"] == "Backlog") else existing["sprint"]
        conn.execute(
            "UPDATE tasks SET status = ?, sprint = ?, updated_at = datetime('now') WHERE id = ?",
            (payload.status, next_sprint, task_id),
        )
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return db.row_to_task(row)


@router.post("/tasks/{task_id}/promote")
def promote_task(
    task_id: str,
    _user: Dict[str, Any] = Depends(auth.require_permissions("tasks.edit")),
) -> Dict[str, Any]:
    with db.get_conn() as conn:
        existing = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Task not found")
        conn.execute(
            "UPDATE tasks SET status = 'todo', sprint = 'Sprint 14', updated_at = datetime('now') WHERE id = ?",
            (task_id,),
        )
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return db.row_to_task(row)


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
