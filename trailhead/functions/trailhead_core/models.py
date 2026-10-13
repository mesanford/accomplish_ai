"""Shapes shared by the rules engine, Cloud Functions and Firestore documents."""

from __future__ import annotations

from datetime import date
from enum import StrEnum

from pydantic import BaseModel, Field


class Severity(StrEnum):
    ERROR = "error"  # the plan cannot work as written
    WARNING = "warning"  # it can work, but something is risky or unknown


class PathStatus(StrEnum):
    OK = "ok"
    AT_RISK = "at_risk"
    INFEASIBLE = "infeasible"


class PathItem(BaseModel):
    award_id: str
    order: int = 0
    planned_start: date | None = None
    planned_end: date | None = None


class Path(BaseModel):
    scout_id: str
    goal_award_id: str  # a rank id such as "eagle"
    target_date: date | None = None
    items: list[PathItem] = Field(default_factory=list)


class ScoutRecord(BaseModel):
    """What the engine needs to know about a Scout. Built from troop data."""

    scout_id: str
    birth_year: int
    birth_month: int = Field(ge=1, le=12)
    current_rank_id: str = "scout"
    rank_dates: dict[str, date] = Field(default_factory=dict)  # rank id -> date earned
    earned_badges: dict[str, date] = Field(default_factory=dict)  # badge id -> date earned


class Issue(BaseModel):
    code: str
    severity: Severity
    message: str
    award_id: str | None = None


class FeasibilityResult(BaseModel):
    status: PathStatus
    issues: list[Issue]
    earliest_goal_date: date | None = None
    next_steps: list[str] = Field(default_factory=list)
