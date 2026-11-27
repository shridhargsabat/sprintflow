"""Public demo endpoints for local GitHub evaluation (flag-gated).

Both routes 404 unless SPRINTFLOW_ENABLE_DEMO=1, so production (flag off)
does not even reveal they exist.
"""
from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

import db

router = APIRouter(prefix="/api", tags=["demo"])


def _demo_enabled() -> bool:
    return os.environ.get("SPRINTFLOW_ENABLE_DEMO") == "1"


def _require_demo() -> None:
    if not _demo_enabled():
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/demo/status")
def demo_status():
    _require_demo()
    with db.get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) AS c FROM tasks").fetchone()
    # "seeded" = at least one task row exists.
    return {"enabled": True, "seeded": row["c"] > 0}
