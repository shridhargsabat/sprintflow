"""Board settings endpoints for SprintFlow API (story-points scale)."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status

import auth
import db
from models import PointsScalePayload

router = APIRouter(prefix="/api")


def _require_admin(user: Dict[str, Any] = Depends(auth.get_current_user)) -> Dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can change board settings",
        )
    return user


@router.get("/settings/points-scale")
def get_points_scale(
    _user: Dict[str, Any] = Depends(auth.get_current_user),
) -> Dict[str, List[int]]:
    with db.get_conn() as conn:
        return {"scale": db.get_points_scale(conn)}


@router.put("/settings/points-scale")
def update_points_scale(
    payload: PointsScalePayload,
    _user: Dict[str, Any] = Depends(_require_admin),
) -> Dict[str, List[int]]:
    with db.get_conn() as conn:
        return {"scale": db.set_points_scale(conn, payload.scale)}
