"""Pydantic models for SprintFlow API."""
from __future__ import annotations

from datetime import date
from typing import Annotated, Any, Dict, List, Literal, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator

StatusType = Literal["backlog", "todo", "in_progress", "in_review", "done"]
PriorityType = Literal["critical", "high", "medium", "low"]


class AssigneeInput(BaseModel):
    type: Literal["member", "user"]
    id: Any


class TaskPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    assignees: Optional[List[AssigneeInput]] = None
    dueDate: str = Field(..., min_length=4, max_length=32)
    status: StatusType = "todo"
    priority: PriorityType = "medium"
    sprint: str = Field(default="Sprint 14", max_length=100)
    points: int = Field(default=3, ge=1, le=50)
    # Multi-tag: None (omitted) means the ["Frontend"] default; [] is a
    # deliberately untagged task. Every entry must exist in the tag master
    # (validated by db.validate_tags -> HTTP 400 when unknown).
    tags: Optional[List[Annotated[str, Field(max_length=60)]]] = None

    @field_validator("title", "sprint")
    @classmethod
    def _strip_title_sprint(cls, value: str) -> str:
        # L2: strip only; blank-after-strip is rejected with HTTP 400 by the
        # tasks router / import validation (a ValueError here would surface
        # as 422 instead). Runs after min_length, so "   " arrives intact.
        return value.strip()


class StatusUpdatePayload(BaseModel):
    status: StatusType


class TaskLinkPayload(BaseModel):
    linked_task_id: str
    kind: str  # validated by db.add_task_link -> HTTP 422 when unknown


class TagCreatePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    color: Optional[str] = Field(default=None, max_length=40)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        # Strip only; blank-after-strip is rejected with HTTP 400 by the
        # tags router (a ValueError here would surface as 422 instead).
        return value.strip()


class TagUpdatePayload(BaseModel):
    name: Optional[str] = Field(default=None, max_length=60)
    color: Optional[str] = Field(default=None, max_length=40)


class MemberPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    role: str = Field(default="Engineer", max_length=100)
    color: Optional[str] = Field(default=None, max_length=40)
    userId: Optional[int] = None

    @field_validator("userId", mode="before")
    @classmethod
    def _reject_bool_user_id(cls, value: Any) -> Any:
        # M5: JSON true/false must never coerce to user id 1/0 (id 1 is the
        # admin). Reject with the same HTTP 400 the routers use for bad ids
        # (raising HTTPException here propagates through FastAPI untouched —
        # only ValueError/AssertionError become 422). Numeric strings like
        # "3" still flow through to normal int coercion.
        if isinstance(value, bool):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid userId: {value!r} (boolean is not a user id)",
            )
        return value

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        # Strip only; blank-after-strip is rejected with HTTP 400 by the
        # team router (a ValueError here would surface as 422 instead).
        return value.strip()


class ImportPayload(BaseModel):
    # List[Any]: rows are validated individually by the import endpoint so
    # every malformed row (including non-object rows) yields a 400 with
    # per-row errors instead of a bare 422/500.
    team: List[Any]
    tasks: List[Any]
    # Optional link section (export shape {from, to, kind}); malformed or
    # dangling link rows are skipped with warnings, never fatal.
    links: List[Any] = []


class SprintUpdate(BaseModel):
    """Sprint config update. lengthDays counts WORKING days (Mon-Fri)."""

    startDate: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    lengthDays: Optional[int] = Field(
        default=None, ge=1, le=60, description="Sprint length in working days (Mon-Fri)"
    )
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)

    @field_validator("startDate")
    @classmethod
    def _validate_calendar_date(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        date.fromisoformat(value)  # raises ValueError -> 422 on impossible dates
        return value

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("Sprint name must not be blank")
        return stripped


SprintStatusType = Literal["planned", "active", "closed"]


class SprintCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    startDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    lengthDays: int = Field(default=14, ge=1, le=60)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        # Strip only; blank-after-strip is rejected with HTTP 400 by the
        # sprints router (a ValueError here would surface as 422 instead).
        return value.strip()

    @field_validator("startDate")
    @classmethod
    def _validate_calendar_date(cls, value: str) -> str:
        date.fromisoformat(value)  # raises ValueError -> 422 on impossible dates
        return value


class SprintClosePayload(BaseModel):
    rolloverTo: Optional[str] = None


class SprintRolloverPayload(BaseModel):
    """One-click rollover: move unfinished tasks to another sprint.

    Accepts snake_case `target_sprint` (canonical) or camelCase
    `targetSprint` (frontend convention); both populate the same field.
    """

    model_config = {"populate_by_name": True}

    target_sprint: Optional[str] = Field(default=None, alias="targetSprint", max_length=100)


class PointsScalePayload(BaseModel):
    """Admin-managed story-points scale. Every violation is a 422."""

    scale: List[Any] = Field(..., min_length=1, max_length=30)

    @field_validator("scale")
    @classmethod
    def _validate_scale(cls, value: List[Any]) -> List[int]:
        # List[Any]: each entry is checked by hand so bools, floats,
        # numeric strings and out-of-range values all 422 with one shape
        # (pydantic int coercion would silently accept True/"3"/2.0).
        cleaned: List[int] = []
        for entry in value:
            if isinstance(entry, bool) or not isinstance(entry, int):
                raise ValueError(f"Scale entries must be integers, got {entry!r}")
            if entry < 1 or entry > 50:
                raise ValueError(f"Scale entries must be 1-50, got {entry!r}")
            cleaned.append(entry)
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("Scale entries must be unique")
        return cleaned
