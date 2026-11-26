"""Health, dashboard summary, and board data-sync endpoints."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Query

import auth
import db
from models import ImportPayload

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "database": "sqlite"}


@router.get("/dashboard/summary")
def dashboard_summary(
    sprint: str = Query(default="Sprint 14"),
    _user: Dict[str, Any] = Depends(auth.get_current_user),
) -> Dict[str, Any]:
    tasks = db.list_tasks(sprint=sprint)
    all_backlog = db.list_tasks(status="backlog")
    total_pts = sum(int(t["points"]) for t in tasks)
    done_pts = sum(int(t["points"]) for t in tasks if t["status"] == "done")
    total_tasks = len(tasks)
    done_tasks = sum(1 for t in tasks if t["status"] == "done")
    completion_pct = round((done_pts / total_pts) * 100) if total_pts > 0 else (round((done_tasks / total_tasks) * 100) if total_tasks > 0 else 0)
    return {
        "sprint": sprint,
        "totalTasks": total_tasks,
        "doneTasks": done_tasks,
        "totalPoints": total_pts,
        "donePoints": done_pts,
        "completionPct": completion_pct,
        "ongoingCount": sum(1 for t in tasks if t["status"] == "in_progress"),
        "reviewCount": sum(1 for t in tasks if t["status"] == "in_review"),
        "backlogCount": len(all_backlog),
        "criticalOpenCount": sum(1 for t in tasks if t["priority"] == "critical" and t["status"] != "done"),
    }


@router.get("/export")
def export_board(
    _user: Dict[str, Any] = Depends(auth.require_permissions("data.export")),
) -> Dict[str, Any]:
    return {"team": db.list_team(), "tasks": db.list_tasks()}


@router.post("/import")
def import_board(
    payload: ImportPayload,
    _user: Dict[str, Any] = Depends(auth.require_permissions("data.import")),
) -> Dict[str, int]:
    with db.get_conn() as conn:
        conn.execute("DELETE FROM tasks")
        conn.execute("DELETE FROM team_members")
        for m in payload.team:
            conn.execute(
                "INSERT INTO team_members (id, name, role, color) VALUES (?, ?, ?, ?)",
                (m["id"], m["name"], m.get("role", "Engineer"), m.get("color", "bg-indigo-600")),
            )
        for t in payload.tasks:
            conn.execute(
                """
                INSERT INTO tasks
                    (id, title, description, assignee_id, due_date, status, priority, sprint, points, tag)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    t["id"],
                    t["title"],
                    t.get("description", ""),
                    t.get("assigneeId"),
                    t.get("dueDate", "2026-12-02"),
                    t.get("status", "todo"),
                    t.get("priority", "medium"),
                    t.get("sprint", "Sprint 14"),
                    int(t.get("points", 3)),
                    t.get("tag", "Frontend"),
                ),
            )
    return {"team": len(payload.team), "tasks": len(payload.tasks)}


@router.post("/reset")
def reset_board(
    _user: Dict[str, Any] = Depends(auth.require_permissions("data.reset")),
) -> Dict[str, str]:
    db.reset_db()
    return {"status": "reset"}
