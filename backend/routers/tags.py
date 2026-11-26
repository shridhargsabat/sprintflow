"""Tag-master (workstream) endpoints for SprintFlow API."""
from __future__ import annotations

import sqlite3
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

import auth
import db
from models import TagCreatePayload, TagUpdatePayload

router = APIRouter(prefix="/api")


def _tag_with_count(conn: sqlite3.Connection, tag_id: str) -> Dict[str, Any]:
    row = conn.execute(
        "SELECT id, name, color FROM tags WHERE id = ?", (tag_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {
        "id": row["id"],
        "name": row["name"],
        "color": row["color"],
        "taskCount": db.tag_usage_count(conn, row["name"]),
    }


@router.get("/tags")
def get_tags(
    _user: Dict[str, Any] = Depends(auth.get_current_user),
) -> List[Dict[str, Any]]:
    return db.list_tags()


@router.post("/tags", status_code=201)
def create_tag(
    payload: TagCreatePayload,
    _user: Dict[str, Any] = Depends(auth.require_permissions("team.manage")),
) -> Dict[str, Any]:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tag name must not be blank")
    tag_id = db.slugify_tag_id(name)
    if not tag_id:
        raise HTTPException(
            status_code=400, detail="Tag name must contain letters or digits"
        )
    color = (payload.color or "").strip() or db.DEFAULT_TAG_COLOR
    with db.get_conn() as conn:
        dup = conn.execute(
            "SELECT 1 FROM tags WHERE id = ? OR name = ? COLLATE NOCASE",
            (tag_id, name),
        ).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail=f"Tag already exists: {name}")
        try:
            conn.execute(
                "INSERT INTO tags (id, name, color) VALUES (?, ?, ?)",
                (tag_id, name, color),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail=f"Tag already exists: {name}")
        return _tag_with_count(conn, tag_id)


@router.put("/tags/{tag_id}")
def update_tag(
    tag_id: str,
    payload: TagUpdatePayload,
    _user: Dict[str, Any] = Depends(auth.require_permissions("team.manage")),
) -> Dict[str, Any]:
    with db.get_conn() as conn:
        existing = conn.execute(
            "SELECT id, name, color FROM tags WHERE id = ?", (tag_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Tag not found")
        new_name = existing["name"]
        new_color = existing["color"]
        if payload.name is not None:
            candidate = payload.name.strip()
            if not candidate:
                raise HTTPException(status_code=400, detail="Tag name must not be blank")
            clash = conn.execute(
                "SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id != ?",
                (candidate, tag_id),
            ).fetchone()
            if clash:
                raise HTTPException(
                    status_code=409, detail=f"Tag already exists: {candidate}"
                )
            new_name = candidate
        if payload.color is not None and payload.color.strip():
            new_color = payload.color.strip()
        try:
            conn.execute(
                "UPDATE tags SET name = ?, color = ? WHERE id = ?",
                (new_name, new_color, tag_id),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=409, detail=f"Tag already exists: {new_name}"
            )
        if new_name != existing["name"]:
            conn.execute(
                "UPDATE tasks SET tag = ? "
                "WHERE tag = ? COLLATE NOCASE OR tag = ? COLLATE NOCASE",
                (new_name, existing["name"], tag_id),
            )
        return _tag_with_count(conn, tag_id)


@router.delete("/tags/{tag_id}")
def delete_tag(
    tag_id: str,
    _user: Dict[str, Any] = Depends(auth.require_permissions("team.manage")),
) -> Dict[str, Any]:
    with db.get_conn() as conn:
        existing = conn.execute(
            "SELECT id, name FROM tags WHERE id = ?", (tag_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Tag not found")
        usage = db.tag_usage_count(conn, existing["name"])
        if usage > 0:
            return JSONResponse(status_code=409, content={"tasks": usage})  # type: ignore[return-value]
        # L8: the DELETE itself re-checks usage atomically — a task tagged
        # between the check above and this statement blocks the delete
        # instead of orphaning the tag. A 0-row delete means the tag either
        # vanished (404) or gained usage (409); recheck to report correctly.
        cur = conn.execute(
            "DELETE FROM tags WHERE id = ? "
            "AND NOT EXISTS (SELECT 1 FROM tasks WHERE tag = ? COLLATE NOCASE)",
            (tag_id, existing["name"]),
        )
        if cur.rowcount == 0:
            gone = conn.execute(
                "SELECT id, name FROM tags WHERE id = ?", (tag_id,)
            ).fetchone()
            if gone is None:
                raise HTTPException(status_code=404, detail="Tag not found")
            usage = db.tag_usage_count(conn, gone["name"])
            if usage > 0:
                return JSONResponse(status_code=409, content={"tasks": usage})  # type: ignore[return-value]
            raise HTTPException(status_code=404, detail="Tag not found")
        return {"deleted": tag_id}
