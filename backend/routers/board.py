"""Health, dashboard summary, and board data-sync endpoints."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

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
) -> Dict[str, Any]:
    # RBAC: a non-empty team section additionally requires team.manage, so
    # roles without member-admin rights (e.g. lead) may only import tasks.
    # Checked BEFORE wiping anything so rejected imports leave data intact.
    if payload.team:
        if "team.manage" not in auth.permissions_for(_user["role"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Missing permissions: team.manage",
            )
    # Validate linked login users BEFORE wiping anything: unknown userIds
    # are cleared to NULL and reported in warnings[].
    warnings: List[str] = []
    resolved_user_ids: List[Optional[int]] = []
    for m in payload.team:
        uid = m.get("userId")
        if uid is None:
            resolved_user_ids.append(None)
            continue
        try:
            uid_int: Optional[int] = int(uid)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            uid_int = None
        user = auth.get_user_by_id(uid_int) if uid_int is not None else None
        if user is None:
            linked = m.get("linkedUser")
            email = linked.get("email") if isinstance(linked, dict) else None
            email = email or m.get("email")
            hint = f" (email: {email})" if email else ""
            warnings.append(
                f"Team member '{m.get('id', '?')}' references unknown user_id {uid!r}{hint}; link cleared (set to NULL)"
            )
            resolved_user_ids.append(None)
        else:
            resolved_user_ids.append(user["id"])
    with db.get_conn() as conn:
        conn.execute("DELETE FROM task_assignees")
        conn.execute("DELETE FROM tasks")
        conn.execute("DELETE FROM team_members")
        # Tag master: auto-create any imported task tags missing from the
        # master (each creation is collected into warnings[]).
        seen_tags: List[str] = []
        for t in payload.tasks:
            raw_tag = t.get("tag") or "Frontend"
            raw_tag = raw_tag.strip() if isinstance(raw_tag, str) else "Frontend"
            if not raw_tag:
                raw_tag = "Frontend"
            if raw_tag not in seen_tags:
                seen_tags.append(raw_tag)
        for tag_name in seen_tags:
            _, created = db.ensure_tag(conn, tag_name)
            if created:
                warnings.append(f"Auto-created tag '{tag_name}' from import")
        for m, user_id in zip(payload.team, resolved_user_ids):
            conn.execute(
                "INSERT INTO team_members (id, name, role, color, user_id) VALUES (?, ?, ?, ?, ?)",
                (m["id"], m["name"], m.get("role", "Engineer"), m.get("color", "bg-indigo-600"), user_id),
            )
        for t in payload.tasks:
            tag_value = t.get("tag") or "Frontend"
            tag_value = tag_value.strip() if isinstance(tag_value, str) else "Frontend"
            if not tag_value:
                tag_value = "Frontend"
            conn.execute(
                """
                INSERT INTO tasks
                    (id, title, description, due_date, status, priority, sprint, points, tag)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    t["id"],
                    t["title"],
                    t.get("description", ""),
                    t.get("dueDate", "2026-12-02"),
                    t.get("status", "todo"),
                    t.get("priority", "medium"),
                    t.get("sprint", "Sprint 14"),
                    int(t.get("points", 3)),
                    tag_value,
                ),
            )
            for kind, ident in _resolve_import_assignees(t, warnings, conn):
                if kind == "member":
                    conn.execute(
                        "INSERT OR IGNORE INTO task_assignees (task_id, member_id, user_id) "
                        "VALUES (?, ?, NULL)",
                        (t["id"], ident),
                    )
                else:
                    conn.execute(
                        "INSERT OR IGNORE INTO task_assignees (task_id, member_id, user_id) "
                        "VALUES (?, NULL, ?)",
                        (t["id"], ident),
                    )
    return {"team": len(payload.team), "tasks": len(payload.tasks), "warnings": warnings}


def _resolve_import_assignees(
    task: Dict[str, Any], warnings: List[str], conn: Any
) -> List[tuple]:
    """Validate an imported task's assignees; unknown ids -> skip + warning.

    Accepts the new `assignees: [{type, id}]` array; tasks without it fall
    back to legacy `assigneeId` / `assigneeUserId` keys (same lenient
    semantics). Mirrors the user-link warning pattern.
    """
    task_id = task.get("id", "?")
    raw = task.get("assignees")
    if raw is None:
        # Legacy export shape: derive entries from the old scalar keys.
        raw = []
        if task.get("assigneeId") is not None:
            raw.append({"type": "member", "id": task.get("assigneeId")})
        if task.get("assigneeUserId") is not None:
            raw.append({"type": "user", "id": task.get("assigneeUserId")})
    if not isinstance(raw, list):
        warnings.append(
            f"Task '{task_id}' has invalid assignees {raw!r}; skipped"
        )
        return []
    normalized: List[tuple] = []
    seen = set()
    for entry in raw:
        if not isinstance(entry, dict):
            warnings.append(
                f"Task '{task_id}' has invalid assignee entry {entry!r}; skipped"
            )
            continue
        kind, ref = entry.get("type"), entry.get("id")
        if kind == "member":
            member_id = str(ref).strip() if ref is not None else ""
            if not member_id or (
                conn.execute(
                    "SELECT 1 FROM team_members WHERE id = ?", (member_id,)
                ).fetchone()
                is None
            ):
                warnings.append(
                    f"Task '{task_id}' references unknown member assignee {ref!r}; skipped"
                )
                continue
            key = ("member", member_id)
        elif kind == "user":
            try:
                user_id: Optional[int] = int(ref)  # type: ignore[arg-type]
            except (TypeError, ValueError):
                user_id = None
            if user_id is None or (
                conn.execute(
                    "SELECT 1 FROM users WHERE id = ?", (user_id,)
                ).fetchone()
                is None
            ):
                warnings.append(
                    f"Task '{task_id}' references unknown user assignee {ref!r}; skipped"
                )
                continue
            key = ("user", user_id)
        else:
            warnings.append(
                f"Task '{task_id}' has invalid assignee type {kind!r}; skipped"
            )
            continue
        if key not in seen:
            seen.add(key)
            normalized.append(key)
    return normalized


@router.post("/reset")
def reset_board(
    _user: Dict[str, Any] = Depends(auth.require_permissions("data.reset")),
) -> Dict[str, str]:
    db.reset_db()
    return {"status": "reset"}
