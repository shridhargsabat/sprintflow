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


class SprintUpdate(BaseModel):
    startDate: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    lengthDays: Optional[int] = Field(default=None, ge=1, le=60)

    @field_validator("startDate")
    @classmethod
    def _validate_calendar_date(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        date.fromisoformat(value)  # raises ValueError -> 422 on impossible dates
        return value
