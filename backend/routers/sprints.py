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
    updated = db.update_sprint(
        sprint_id,
        start_date=payload.startDate,
        length_days=payload.lengthDays,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Sprint not found")
    return updated
