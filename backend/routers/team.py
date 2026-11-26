"""Team endpoints for SprintFlow API."""
from __future__ import annotations

import sqlite3
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

import auth
import db
from models import MemberPayload

router = APIRouter(prefix="/api")


def _resolve_user_id(
    user_id: int | None,
    current_member_id: str | None = None,
    conn: sqlite3.Connection | None = None,
) -> int | None:
    """Validate a linked login user; None clears the link.

    Enforces one-to-one links: 409 when user_id is already linked to ANOTHER
    member. Re-linking the same member to its own user (re-PUT) is fine.
    """
    if user_id is None:
        return None
    if auth.get_user_by_id(user_id) is None:
        raise HTTPException(status_code=400, detail="Linked user not found")
    if conn is not None:
        row = conn.execute(
            "SELECT id FROM team_members WHERE user_id = ?", (user_id,)
        ).fetchone()
        if row is not None and row["id"] != current_member_id:
            raise HTTPException(
                status_code=409, detail="User already linked to another member"
            )
    return user_id


def _member_with_link(member: Dict[str, Any]) -> Dict[str, Any]:
    """Attach linkedUser only when the user row actually exists (no ghosts)."""
    uid = member.get("userId")
    if uid is None:
        return {**member, "linkedUser": None}
    u = auth.get_user_by_id(uid)
    if not u:
        return {**member, "linkedUser": None}
    return {
        **member,
        "linkedUser": {"name": u.get("name"), "email": u.get("email")},
    }


def _require_nonblank_name(name: str) -> str:
    stripped = name.strip()
    if not stripped:
        raise HTTPException(status_code=400, detail="Member name must not be blank")
    return stripped


AVATAR_COLORS = [
    "bg-indigo-600",
    "bg-sky-600",
    "bg-emerald-600",
    "bg-amber-600",
    "bg-rose-600",
    "bg-violet-600",
    "bg-teal-600",
]


@router.get("/team")
def get_team(
    _user: Dict[str, Any] = Depends(auth.require_permissions("team.view")),
) -> List[Dict[str, Any]]:
    return db.list_team()


@router.post("/team", status_code=201)
def add_member(
    payload: MemberPayload,
    _user: Dict[str, Any] = Depends(auth.require_permissions("team.manage")),
) -> Dict[str, Any]:
    with db.get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM team_members").fetchone()[0]
        member_id = f"m{int(time.time() * 1000)}"
        color = payload.color or AVATAR_COLORS[count % len(AVATAR_COLORS)]
        name = _require_nonblank_name(payload.name)
        user_id = _resolve_user_id(payload.userId, conn=conn)
        try:
            conn.execute(
                "INSERT INTO team_members (id, name, role, color, user_id) VALUES (?, ?, ?, ?, ?)",
                (member_id, name, payload.role.strip() or "Engineer", color, user_id),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=409, detail="User already linked to another member"
            )
        row = conn.execute("SELECT id, name, role, color, user_id AS userId FROM team_members WHERE id = ?", (member_id,)).fetchone()
        return _member_with_link(dict(row))


# NOTE (PUT-as-PATCH semantics, intentional — do NOT "fix" into strict PUT):
# PUT /team/{id} behaves like a PATCH: fields the client omits keep their
# stored values instead of resetting to defaults. Concretely, an omitted
# userId preserves the existing link (only an explicit null unlinks), and a
# falsy color preserves the stored avatar color. Callers may send partial
# bodies; required-for-create fields are NOT re-required here.
@router.put("/team/{member_id}")
def update_member(
    member_id: str,
    payload: MemberPayload,
    _user: Dict[str, Any] = Depends(auth.require_permissions("team.manage")),
) -> Dict[str, Any]:
    with db.get_conn() as conn:
        existing = conn.execute("SELECT color, user_id FROM team_members WHERE id = ?", (member_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Member not found")
        name = _require_nonblank_name(payload.name)
        # Preserve the link when the client omits userId; explicit null unlinks.
        if "userId" in payload.model_fields_set:
            user_id = _resolve_user_id(
                payload.userId, current_member_id=member_id, conn=conn
            )
        else:
            user_id = existing["user_id"]
        try:
            conn.execute(
                "UPDATE team_members SET name = ?, role = ?, color = ?, user_id = ? WHERE id = ?",
                (name, payload.role.strip() or "Engineer", payload.color or existing["color"], user_id, member_id),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=409, detail="User already linked to another member"
            )
        row = conn.execute("SELECT id, name, role, color, user_id AS userId FROM team_members WHERE id = ?", (member_id,)).fetchone()
        return _member_with_link(dict(row))


@router.delete("/team/{member_id}")
def delete_member(
    member_id: str,
    reassignTo: Optional[str] = Query(default=None),
    _user: Dict[str, Any] = Depends(auth.require_permissions("team.manage")),
) -> Dict[str, Any]:
    """Delete a member. Default: their assignee rows are deleted (unassigned).

    Optional ?reassignTo=<memberId> moves their task assignments to that
    member instead (tasks already assigned to the target are deduped).
    """
    with db.get_conn() as conn:
        # Validate the reassign target BEFORE the last-member guard so a bad
        # target is reported as its own 400 even in single-member edge cases.
        if reassignTo is not None:
            if reassignTo == member_id:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot reassign tasks to the member being deleted",
                )
            target = conn.execute(
                "SELECT id FROM team_members WHERE id = ?", (reassignTo,)
            ).fetchone()
            if target is None:
                raise HTTPException(
                    status_code=400, detail="Reassign target member not found"
                )
        members = conn.execute("SELECT id FROM team_members ORDER BY rowid ASC").fetchall()
        if len(members) <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last team member")
        owned = conn.execute(
            "SELECT DISTINCT task_id FROM task_assignees WHERE member_id = ?",
            (member_id,),
        ).fetchall()
        reassigned_tasks = len(owned)
        if reassignTo is not None:
            # Drop rows that would collide with the target's existing
            # assignment on the same task, then move the rest over.
            conn.execute(
                """
                DELETE FROM task_assignees
                WHERE member_id = ?
                  AND task_id IN (
                      SELECT task_id FROM task_assignees WHERE member_id = ?
                  )
                """,
                (member_id, reassignTo),
            )
            moved = conn.execute(
                "UPDATE task_assignees SET member_id = ? WHERE member_id = ?",
                (reassignTo, member_id),
            )
            # L3: report tasks actually moved, not the pre-dedupe owned
            # count (co-owned tasks are deduped above, never moved).
            reassigned_tasks = moved.rowcount
            fallback: Optional[str] = reassignTo
        else:
            conn.execute(
                "DELETE FROM task_assignees WHERE member_id = ?", (member_id,)
            )
            fallback = None
        cur = conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Member not found")
        return {
            "deleted": member_id,
            "reassignedTasks": reassigned_tasks,
            "fallback": fallback,
        }
