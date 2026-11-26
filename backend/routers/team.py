"""Team endpoints for SprintFlow API."""
from __future__ import annotations

import time
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException

import auth
import db
from models import MemberPayload

router = APIRouter(prefix="/api")


def _resolve_user_id(user_id: int | None) -> int | None:
    """Validate a linked login user; None clears the link."""
    if user_id is None:
        return None
    if auth.get_user_by_id(user_id) is None:
        raise HTTPException(status_code=400, detail="Linked user not found")
    return user_id


def _member_with_link(member: Dict[str, Any]) -> Dict[str, Any]:
    uid = member.get("userId")
    if uid is None:
        return {**member, "linkedUser": None}
    u = auth.get_user_by_id(uid)
    return {
        **member,
        "linkedUser": {"name": u["name"], "email": u["email"]} if u else None,
    }

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
    _user: Dict[str, Any] = Depends(auth.get_current_user),
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
        user_id = _resolve_user_id(payload.userId)
        conn.execute(
            "INSERT INTO team_members (id, name, role, color, user_id) VALUES (?, ?, ?, ?, ?)",
            (member_id, payload.name.strip(), payload.role.strip() or "Engineer", color, user_id),
        )
        row = conn.execute("SELECT id, name, role, color, user_id AS userId FROM team_members WHERE id = ?", (member_id,)).fetchone()
        return _member_with_link(dict(row))


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
        # Preserve the link when the client omits userId; explicit null unlinks.
        if "userId" in payload.model_fields_set:
            user_id = _resolve_user_id(payload.userId)
        else:
            user_id = existing["user_id"]
        conn.execute(
            "UPDATE team_members SET name = ?, role = ?, color = ?, user_id = ? WHERE id = ?",
            (payload.name.strip(), payload.role.strip() or "Engineer", payload.color or existing["color"], user_id, member_id),
        )
        row = conn.execute("SELECT id, name, role, color, user_id AS userId FROM team_members WHERE id = ?", (member_id,)).fetchone()
        return _member_with_link(dict(row))


@router.delete("/team/{member_id}")
def delete_member(
    member_id: str,
    _user: Dict[str, Any] = Depends(auth.require_permissions("team.manage")),
) -> Dict[str, str]:
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
