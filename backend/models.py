"""Pydantic models for SprintFlow API."""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

StatusType = Literal["backlog", "todo", "in_progress", "in_review", "done"]
PriorityType = Literal["critical", "high", "medium", "low"]


class AssigneeInput(BaseModel):
    type: Literal["member", "user"]
    id: Any


class TaskPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    assignees: Optional[List[AssigneeInput]] = None
    dueDate: str = Field(..., min_length=4, max_length=32)
    status: StatusType = "todo"
    priority: PriorityType = "medium"
    sprint: str = "Sprint 14"
    points: int = Field(default=3, ge=1, le=50)
    tag: str = "Frontend"


class StatusUpdatePayload(BaseModel):
    status: StatusType


class TagCreatePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    color: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        # Strip only; blank-after-strip is rejected with HTTP 400 by the
        # tags router (a ValueError here would surface as 422 instead).
        return value.strip()


class TagUpdatePayload(BaseModel):
    name: Optional[str] = Field(default=None, max_length=60)
    color: Optional[str] = None


class MemberPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    role: str = "Engineer"
    color: Optional[str] = None
    userId: Optional[int] = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        # Strip only; blank-after-strip is rejected with HTTP 400 by the
        # team router (a ValueError here would surface as 422 instead).
        return value.strip()


class ImportPayload(BaseModel):
    team: List[Dict[str, Any]]
    tasks: List[Dict[str, Any]]


class SprintUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    startDate: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    lengthDays: Optional[int] = Field(default=None, ge=1, le=60)

    @field_validator("startDate")
    @classmethod
    def _validate_calendar_date(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        date.fromisoformat(value)  # raises ValueError -> 422 on impossible dates
        return value


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
