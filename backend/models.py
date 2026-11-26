"""Pydantic models for SprintFlow API."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

StatusType = Literal["backlog", "todo", "in_progress", "in_review", "done"]
PriorityType = Literal["critical", "high", "medium", "low"]


class TaskPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    assigneeId: Optional[str] = None
    dueDate: str = Field(..., min_length=4, max_length=32)
    status: StatusType = "todo"
    priority: PriorityType = "medium"
    sprint: str = "Sprint 14"
    points: int = Field(default=3, ge=1, le=50)
    tag: str = "Frontend"


class StatusUpdatePayload(BaseModel):
    status: StatusType


class MemberPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    role: str = "Engineer"
    color: Optional[str] = None


class ImportPayload(BaseModel):
    team: List[Dict[str, Any]]
    tasks: List[Dict[str, Any]]
