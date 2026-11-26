# SprintFlow — React + Python (FastAPI) + SQLite

A lightweight sprint management web app featuring a **Dashboard**, **Drag-and-Drop Kanban Board**, and **Backlog & Team Schedule Table** backed by a Python FastAPI REST API and SQLite database.

## Project Structure

```text
sprintflow-fullstack/
├── backend/
│   ├── app.py              # FastAPI REST endpoints + CORS
│   ├── db.py               # SQLite schema, auto-seeding, CRUD queries
│   ├── pyproject.toml       # uv-managed deps (fastapi, uvicorn, pydantic) + dev group
│   └── sprintflow.db       # Auto-created on first backend run
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js      # Proxies /api -> http://127.0.0.1:8000
    └── src/
        ├── api.js          # Fetch client for FastAPI endpoints
        ├── App.jsx         # Dashboard, Kanban Board, Backlog Table
        ├── index.css
        └── main.jsx
```

## Quick Start

### 1. Start the Python + SQLite Backend
```bash
cd backend
uv sync                              # runtime only — creates .venv in place
# uv sync --group dev                # with test tooling (pytest + httpx)
.venv/bin/uvicorn app:app --reload --port 8000
```
> No uv? Fallback: `python3 -m venv .venv && .venv/bin/pip install fastapi==0.115.6 "uvicorn[standard]==0.34.0" pydantic==2.10.4 pytest==9.2.0 httpx==0.28.1`
- SQLite database `backend/sprintflow.db` is created and seeded automatically on first launch.
- Interactive API docs (Swagger UI): `http://127.0.0.1:8000/docs`

### 2. Start the React Frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`. All `/api/*` requests are proxied to the FastAPI backend on port `8000`.

## Key REST Endpoints
- `GET /api/tasks` · `POST /api/tasks` · `PUT /api/tasks/{id}` · `DELETE /api/tasks/{id}`
- `PATCH /api/tasks/{id}/status` — Update Kanban column
- `POST /api/tasks/{id}/promote` — Pull backlog task into active sprint
- `GET /api/team` · `POST /api/team` · `PUT /api/team/{id}` · `DELETE /api/team/{id}`
- `GET /api/dashboard/summary?sprint=Sprint%2014` — Dashboard sprint KPI summary
- `POST /api/import` · `POST /api/reset` — JSON import & sample data reset
