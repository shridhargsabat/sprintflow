"""Login-user directory for task assignment. Any authenticated user."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends

import auth
import db

router = APIRouter(prefix="/api")


@router.get("/users/directory")
def user_directory(
    _user: Dict[str, Any] = Depends(auth.get_current_user),
) -> List[Dict[str, Any]]:
    return db.list_user_directory()
