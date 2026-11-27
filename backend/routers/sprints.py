"""Sprint configuration endpoints for SprintFlow API."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException

import auth
import db
from models import SprintUpdate

router = APIRouter(prefix="/api")


@router.get("/sprints")
def get_sprints(
    _user: Dict[str, Any] = Depends(auth.get_current_user),
) -> List[Dict[str, Any]]:
    return db.list_sprints()


@router.put("/sprints/{sprint_id}")
def update_sprint(
    sprint_id: str,
    payload: SprintUpdate,
    _user: Dict[str, Any] = Depends(auth.require_permissions("sprints.manage")),
) -> Dict[str, Any]:
    if payload.name is not None:
        # No UNIQUE constraint on sprints.name (see DDL), so guard here:
        # reject names colliding with another sprint's id or name (case-insensitive),
        # otherwise id-or-name lookups (board filter, burndown) go ambiguous.
        lowered = payload.name.lower()
        for other in db.list_sprints():
            if other["id"] == sprint_id:
                continue
            if other["id"].lower() == lowered or other["name"].lower() == lowered:
                raise HTTPException(status_code=409, detail=f"Sprint already exists: {payload.name}")
    updated = db.update_sprint(
        sprint_id,
        start_date=payload.startDate,
        length_days=payload.lengthDays,
        name=payload.name,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Sprint not found")
    return updated
