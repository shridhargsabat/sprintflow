"""Team endpoints for SprintFlow API."""
from __future__ import annotations

import time
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

import db
from models import MemberPayload

router = APIRouter(prefix="/api")

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
def get_team() -> List[Dict[str, Any]]:
    return db.list_team()


@router.post("/team", status_code=201)
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


@router.put("/team/{member_id}")
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


@router.delete("/team/{member_id}")
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
