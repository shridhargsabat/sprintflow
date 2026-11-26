"""FastAPI backend for SprintFlow with SQLite persistence."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import db
from routers import auth as auth_router
from routers import board, sprints, tasks, team, users


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db.init_db()
    yield


app = FastAPI(
    title="SprintFlow API",
    version="1.0.0",
    description="Sprint management backend with Dashboard KPIs, Kanban board, Backlog, and SQLite storage.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(tasks.router)
app.include_router(team.router)
app.include_router(users.router)
app.include_router(board.router)
app.include_router(sprints.router)
