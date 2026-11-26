"""FastAPI backend for SprintFlow with SQLite persistence."""
from __future__ import annotations

import time
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import db

StatusType = Literal["backlog", "todo", "in_progress", "in_review", "done"]
PriorityType = Literal["critical", "high", "medium", "low"]

AVATAR_COLORS = [
    "bg-indigo-600",
    "bg-sky-600",
    "bg-emerald-600",
    "bg-amber-600",
    "bg-rose-600",
    "bg-violet-600",
    "bg-teal-600",
]

app = FastAPI(
    title="SprintFlow API",
    version="1.0.0",
    description="Sprint management backend with Dashboard KPIs, Kanban board, Backlog, and SQLite storage.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TaskPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    assigneeId: Optional[str] = None
    dueDate: str = Field(..., min_length=4, max_length=32)
    status: StatusType = "todo"
    priority: PriorityType = "medium"
    sprint: str = "Sprint 14"
    points: int = Field(default=3, ge=1, le=50)
    tag: str = "Frontend"


class StatusUpdatePayload(BaseModel):
    status: StatusType


class MemberPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    role: str = "Engineer"
    color: Optional[str] = None


class ImportPayload(BaseModel):
    team: List[Dict[str, Any]]
    tasks: List[Dict[str, Any]]


@app.on_event("startup")
def on_startup() -> None:
    db.init_db()


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "database": "sqlite"}


# ==================== TASKS ====================
@app.get("/api/tasks")
def get_tasks(
    sprint: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    priority: Optional[str] = Query(default=None),
    assigneeId: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
) -> List[Dict[str, Any]]:
    return db.list_tasks(
        sprint=sprint,
        status=status,
        priority=priority,
        assignee_id=assigneeId,
        search=search,
    )


@app.post("/api/tasks", status_code=201)
def create_task(payload: TaskPayload) -> Dict[str, Any]:
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


@app.put("/api/tasks/{task_id}")
def update_task(task_id: str, payload: TaskPayload) -> Dict[str, Any]:
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


@app.patch("/api/tasks/{task_id}/status")
def update_task_status(task_id: str, payload: StatusUpdatePayload) -> Dict[str, Any]:
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


@app.post("/api/tasks/{task_id}/promote")
def promote_task(task_id: str) -> Dict[str, Any]:
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


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str) -> Dict[str, str]:
    with db.get_conn() as conn:
        cur = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"deleted": task_id}


# ==================== TEAM ====================
@app.get("/api/team")
def get_team() -> List[Dict[str, Any]]:
    return db.list_team()


@app.post("/api/team", status_code=201)
def add_member(payload: MemberPayload) -> Dict[str, Any]:
    with db.get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM team_members").fetchone()[0]
        member_id = f"m{int(time.time() * 1000)}"
        color = payload.color or AVATAR_COLORS[count % len(AVATAR_COLORS)]
        conn.execute(
            "INSERT INTO team_members (id, name, role, color) VALUES (?, ?, ?, ?)",
            (member_id, payload.name.strip(), payload.role.strip() or "Engineer", color),
        )
        row = conn.execute("SELECT id, name, role, color FROM team_members WHERE id = ?", (member_id,)).fetchone()
        return dict(row)


@app.put("/api/team/{member_id}")
def update_member(member_id: str, payload: MemberPayload) -> Dict[str, Any]:
    with db.get_conn() as conn:
        existing = conn.execute("SELECT color FROM team_members WHERE id = ?", (member_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Member not found")
        conn.execute(
            "UPDATE team_members SET name = ?, role = ?, color = ? WHERE id = ?",
            (payload.name.strip(), payload.role.strip() or "Engineer", payload.color or existing["color"], member_id),
        )
        row = conn.execute("SELECT id, name, role, color FROM team_members WHERE id = ?", (member_id,)).fetchone()
        return dict(row)


@app.delete("/api/team/{member_id}")
def delete_member(member_id: str) -> Dict[str, str]:
    with db.get_conn() as conn:
        members = conn.execute("SELECT id FROM team_members ORDER BY rowid ASC").fetchall()
        if len(members) <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last team member")
        fallback = next((m["id"] for m in members if m["id"] != member_id), None)
        conn.execute("UPDATE tasks SET assignee_id = ? WHERE assignee_id = ?", (fallback, member_id))
        cur = conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Member not found")
        return {"deleted": member_id}


# ==================== DASHBOARD SUMMARY & DATA SYNC ====================
@app.get("/api/dashboard/summary")
def dashboard_summary(sprint: str = Query(default="Sprint 14")) -> Dict[str, Any]:
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


@app.post("/api/import")
def import_board(payload: ImportPayload) -> Dict[str, int]:
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


@app.post("/api/reset")
def reset_board() -> Dict[str, str]:
    db.reset_db()
    return {"status": "reset"}
