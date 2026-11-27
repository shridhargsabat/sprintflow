"""Health, dashboard summary, and board data-sync endpoints."""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import ValidationError

import auth
import db
from models import ImportPayload, MemberPayload, TaskPayload

router = APIRouter(prefix="/api")

# M4 import guards: bound the work a single import can do.
MAX_IMPORT_TEAM = 1000
MAX_IMPORT_TASKS = 10000
MAX_IMPORT_BODY_BYTES = 5 * 1024 * 1024


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
    request: Request,
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
    # M4: body-size + list-length caps, before any validation work.
    try:
        content_length = int(request.headers.get("content-length") or 0)
    except (TypeError, ValueError):
        content_length = 0
    if content_length > MAX_IMPORT_BODY_BYTES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Import body too large: {content_length} bytes "
                f"(max {MAX_IMPORT_BODY_BYTES})"
            ),
        )
    if len(payload.team) > MAX_IMPORT_TEAM:
        raise HTTPException(
            status_code=400,
            detail=f"Too many team members: {len(payload.team)} (max {MAX_IMPORT_TEAM})",
        )
    if len(payload.tasks) > MAX_IMPORT_TASKS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many tasks: {len(payload.tasks)} (max {MAX_IMPORT_TASKS})",
        )
    # M4: every row must satisfy the single-item endpoint rules. All errors
    # are collected and returned as one 400 BEFORE wiping anything, so a
    # rejected import always leaves existing data intact.
    row_errors = _validate_import_rows(payload)
    if row_errors:
        raise HTTPException(status_code=400, detail={"errors": row_errors})
    # Validate linked login users BEFORE wiping anything: unknown userIds
    # are cleared to NULL and reported in warnings[].
    warnings: List[str] = []
    resolved_user_ids: List[Optional[int]] = []
    for m in payload.team:
        uid = m.get("userId")
        if uid is None:
            resolved_user_ids.append(None)
            continue
        # M5: JSON true/false must never coerce to user id 1/0 (id 1 is the
        # admin). Hard 400 (row pre-validation flags this too; this guard
        # stands even if validation is ever bypassed).
        if isinstance(uid, bool):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Team member '{m.get('id', '?')}' has invalid boolean "
                    f"userId {uid!r}"
                ),
            )
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
        conn.execute("DELETE FROM task_tags")
        conn.execute("DELETE FROM task_assignees")
        conn.execute("DELETE FROM tasks")
        conn.execute("DELETE FROM team_members")
        # Tag master: auto-create any imported task tags missing from the
        # master (each creation is collected into warnings[]).
        seen_tags: List[str] = []
        for t in payload.tasks:
            for tag_name in _import_row_tags(t):
                if tag_name not in seen_tags:
                    seen_tags.append(tag_name)
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
            # L2: store stripped title/sprint (validation already rejected
            # blank-after-strip, so these are non-empty here).
            title = t["title"].strip() if isinstance(t["title"], str) else t["title"]
            sprint = t.get("sprint", "Sprint 14")
            sprint = sprint.strip() if isinstance(sprint, str) else sprint
            conn.execute(
                """
                INSERT INTO tasks
                    (id, title, description, due_date, status, priority, sprint, points)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    t["id"],
                    title,
                    t.get("description", ""),
                    t.get("dueDate", "2026-12-02"),
                    t.get("status", "todo"),
                    t.get("priority", "medium"),
                    sprint,
                    int(t.get("points", 3)),
                ),
            )
            # Link tags (ensure_tag above guarantees every row exists; the
            # SELECT resolves slug-id inputs to canonical names, L11).
            canonical_tags: List[str] = []
            for tag_value in _import_row_tags(t):
                canonical = conn.execute(
                    """
                    SELECT name FROM tags
                    WHERE name = ? COLLATE NOCASE OR id = ? COLLATE NOCASE
                    ORDER BY CASE WHEN name = ? COLLATE NOCASE THEN 0 ELSE 1 END
                    """,
                    (tag_value, tag_value, tag_value),
                ).fetchone()
                canonical_tags.append(canonical["name"] if canonical else tag_value)
            db.set_task_tags(conn, t["id"], canonical_tags)
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


def _format_validation_errors(prefix: str, exc: ValidationError) -> List[str]:
    return [
        f"{prefix}.{'.'.join(str(p) for p in err['loc'])}: {err['msg']}"
        for err in exc.errors()
    ]


def _validate_import_team_row(m: Any, index: int, seen_ids: set) -> List[str]:
    """One team row against the single-item member rules (MemberPayload)."""
    prefix = f"team[{index}]"
    if not isinstance(m, dict):
        return [f"{prefix}: must be an object, got {type(m).__name__}"]
    errs: List[str] = []
    mid = m.get("id")
    if not isinstance(mid, str) or not mid.strip():
        errs.append(f"{prefix}.id: missing or blank member id")
    elif mid in seen_ids:
        errs.append(f"{prefix}.id: duplicate member id {mid!r}")
    else:
        seen_ids.add(mid)
    try:
        member = MemberPayload(
            name=m.get("name"),  # type: ignore[arg-type]  # None -> ValidationError -> per-row 400
            role=m.get("role", "Engineer"),
            color=m.get("color"),
        )
    except ValidationError as exc:
        errs.extend(_format_validation_errors(prefix, exc))
    else:
        # Mirror POST /api/team: blank-after-strip names are 400, not stored.
        if not member.name:
            errs.append(f"{prefix}.name: must not be blank")
    # M5: boolean userIds are a hard 400 (every other unknown/garbage userId
    # keeps the long-standing lenient clear-to-NULL + warning behavior).
    if isinstance(m.get("userId"), bool):
        errs.append(f"{prefix}.userId: boolean is not a user id")
    return errs


def _validate_import_task_row(t: Any, index: int, seen_ids: set) -> List[str]:
    """One task row against the single-item task rules (TaskPayload)."""
    prefix = f"tasks[{index}]"
    if not isinstance(t, dict):
        return [f"{prefix}: must be an object, got {type(t).__name__}"]
    errs: List[str] = []
    tid = t.get("id")
    if not isinstance(tid, str) or not tid.strip():
        errs.append(f"{prefix}.id: missing or blank task id")
    elif tid in seen_ids:
        errs.append(f"{prefix}.id: duplicate task id {tid!r}")
    else:
        seen_ids.add(tid)
    # Omitted keys fall back to the import's documented defaults (as before);
    # every present value must satisfy TaskPayload (title/status/priority/
    # points ranges, length caps, assignee shapes). Legacy single-`tag` rows
    # map to a one-item `tags` list so old exports validate identically.
    tags_value = t.get("tags")
    if tags_value is None and t.get("tag") is not None:
        legacy = t.get("tag")
        tags_value = [legacy] if isinstance(legacy, str) else legacy
    try:
        task = TaskPayload(
            title=t.get("title"),  # type: ignore[arg-type]  # None -> ValidationError -> per-row 400
            description=t.get("description", ""),
            assignees=t.get("assignees"),
            dueDate=t.get("dueDate", "2026-12-02"),
            status=t.get("status", "todo"),
            priority=t.get("priority", "medium"),
            sprint=t.get("sprint", "Sprint 14"),
            points=t.get("points", 3),
            tags=tags_value,
        )
    except ValidationError as exc:
        errs.extend(_format_validation_errors(prefix, exc))
    else:
        # L2 (mirror POST /api/tasks): blank-after-strip titles/sprints are
        # 400, never stored.
        if not task.title:
            errs.append(f"{prefix}.title: must not be blank")
        if not task.sprint:
            errs.append(f"{prefix}.sprint: must not be blank")
    raw = t.get("assignees")
    if isinstance(raw, list):
        # Mirror POST /api/tasks: more than MAX_ASSIGNEES is a 400.
        if len(raw) > db.MAX_ASSIGNEES:
            errs.append(
                f"{prefix}.assignees: too many assignees: max {db.MAX_ASSIGNEES}"
            )
        for j, entry in enumerate(raw):
            if (
                isinstance(entry, dict)
                and entry.get("type") == "user"
                and isinstance(entry.get("id"), bool)
            ):
                errs.append(f"{prefix}.assignees[{j}].id: boolean is not a user id")
    legacy = t.get("assigneeUserId")
    if isinstance(legacy, bool):
        errs.append(f"{prefix}.assigneeUserId: boolean is not a user id")
    return errs


def _import_row_tags(t: Any) -> List[str]:
    """Normalized tag names for one import row (insert-time, lenient).

    New `tags` arrays win; legacy single-`tag` rows map to a one-item list
    (old exports keep importing cleanly); rows with neither default to
    ["Frontend"]. Blank entries fall back to "Frontend" (the historical
    single-tag behavior); an explicit [] stays untagged.
    """
    if not isinstance(t, dict):
        return []
    if t.get("tags") is not None:
        raw = t.get("tags")
        if not isinstance(raw, list):
            return []  # row validation already flagged this; insert never runs
        return [
            (v.strip() if isinstance(v, str) else "") or "Frontend" for v in raw
        ]
    legacy = t.get("tag")
    if legacy is None:
        return ["Frontend"]
    return [(legacy.strip() if isinstance(legacy, str) else "") or "Frontend"]


def _validate_import_rows(payload: ImportPayload) -> List[str]:
    """Validate every import row; flat per-row error list (empty = valid).

    Unknown member/user REFERENCES stay lenient (skipped with warnings at
    insert time) — the long-standing import contract the export round-trip
    relies on. Everything else follows the single-item endpoint rules.
    """
    errors: List[str] = []
    seen_team: set = set()
    for i, m in enumerate(payload.team):
        errors.extend(_validate_import_team_row(m, i, seen_team))
    seen_tasks: set = set()
    for i, t in enumerate(payload.tasks):
        errors.extend(_validate_import_task_row(t, i, seen_tasks))
    return errors


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
            # M5: JSON true/false must never coerce to user id 1/0 (id 1 is
            # the admin). Hard 400 (row pre-validation flags this too).
            if isinstance(ref, bool):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Task '{task_id}' has invalid boolean "
                        f"user assignee id {ref!r}"
                    ),
                )
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
    # Production guard: reset wipes board data back to samples. Enabled only
    # when explicitly allowed (tests set this in conftest); production
    # compose does NOT set it, so /api/reset 403s on live.
    if os.environ.get("SPRINTFLOW_ALLOW_RESET") != "1":
        raise HTTPException(status_code=403, detail="Board reset is disabled")
    db.reset_db()
    return {"status": "reset"}
