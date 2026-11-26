# SprintFlow — Sprints Without the Bloat

[![CI](https://github.com/shridhargsabat/sprintflow/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/shridhargsabat/sprintflow/actions/workflows/ci-cd.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/shridhargsabat/sprintflow/blob/main/LICENSE)
[![Python](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://github.com/shridhargsabat/sprintflow/tree/main/backend)
[![Node](https://img.shields.io/badge/node-22-green.svg)](https://github.com/shridhargsabat/sprintflow/tree/main/frontend)
[![Docker](https://img.shields.io/badge/docker-compose-blue.svg)](https://github.com/shridhargsabat/sprintflow/blob/main/docker-compose.yml)

**Plan the sprint, drag the board, ship the release — a lightweight sprint manager in FastAPI + SQLite + React.**

🌐 **Live demo:** [sprintflow.ai-automation-hub.tech](https://sprintflow.ai-automation-hub.tech) (seeded sample data)

> TODO: capture after deploy goes live — hero GIF of Kanban drag-and-drop (`docs/demo/hero-board.gif`, 800px wide, linked to live demo).

## ✨ Features

- 📊 **Dashboard** — per-sprint KPIs: velocity, WIP, completion, burndown-ready summary
- 🗂️ **Drag-and-drop Kanban** — To Do → In Progress → Review → Done with one PATCH
- 📋 **Backlog & team schedule** — groom backlog, promote tasks into the active sprint
- 👥 **Team management** — full CRUD on members, assignments, capacity view
- 🔐 **Auth + RBAC** — JWT login with admin / lead / member / viewer roles
- 🔄 **Import / reset** — JSON import and one-click sample-data reset for demos
- 📖 **Auto API docs** — Swagger UI served by FastAPI at `/docs`

> TODO: screenshots after deploy — `docs/demo/dashboard.png`, `docs/demo/kanban.png`, `docs/demo/backlog.png` (light table, 3-col).

## 🚀 5-Minute Quickstart

### 1. Backend — FastAPI + SQLite (port 8000)

```bash
cd backend
uv sync                              # runtime only — creates .venv in place
# uv sync --group dev                # with test tooling (pytest + httpx)
.venv/bin/uvicorn app:app --reload --port 8000
```

> No `uv`? Fallback: `python3 -m venv .venv && .venv/bin/pip install fastapi==0.115.6 "uvicorn[standard]==0.34.0" pydantic==2.10.4 "pyjwt>=2.15.1" "bcrypt>=5.0.0"`

- SQLite `backend/sprintflow.db` is created and seeded automatically on first launch.
- Swagger UI: `http://127.0.0.1:8000/docs`

### 2. Frontend — React + Vite (port 5173)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. All `/api/*` requests proxy to the backend on port `8000`.

### 3. Docker (optional)

```bash
docker compose up -d --build
```

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.11+ · FastAPI 0.115 · Uvicorn · Pydantic 2 · PyJWT + bcrypt |
| Database | SQLite (auto-created + seeded, zero config) |
| Frontend | React 18 · TypeScript · Vite 6 · Tailwind CSS 3 |
| API client | Typed fetch wrapper in `frontend/src/api.ts`, `/api` proxy |
| DevOps | `uv` for Python · npm for JS · Docker Compose · GitHub Actions CI → GHCR |

## 📁 Project Structure

```text
sprintflow/
├── backend/
│   ├── app.py              # FastAPI app + CORS + /api/health
│   ├── auth.py             # JWT + RBAC (SPRINTFLOW_JWT_SECRET)
│   ├── db.py               # SQLite schema, auto-seeding, CRUD (SPRINTFLOW_DB_PATH)
│   ├── models.py           # Pydantic payloads
│   ├── routers/            # auth, tasks, team, users, board, sprints, tags
│   ├── tests/              # pytest suite (httpx)
│   └── pyproject.toml      # uv-managed deps + uv.lock
├── frontend/
│   ├── index.html
│   ├── package.json        # build = tsc + vite build
│   ├── vite.config.ts      # Proxies /api -> http://127.0.0.1:8000
│   ├── nginx.conf          # Prod: /api proxy + SPA fallback (port 8080)
│   └── src/
│       ├── api.ts          # Typed fetch client for FastAPI endpoints
│       ├── App.tsx         # Dashboard, Kanban Board, Backlog Table
│       ├── views/          # Route views
│       ├── components/     # UI components
│       └── auth/           # Auth provider + guards
├── docker-compose.yml      # backend + frontend + traefik labels
└── scripts/build-deploy.sh # CI deploy: ghcr build+push, compose up, smoke
```

## 🔌 Key REST Endpoints

- `POST /api/auth/login` · `GET /api/auth/me` — JWT session
- `GET /api/tasks` · `POST /api/tasks` · `PUT /api/tasks/{id}` · `DELETE /api/tasks/{id}`
- `PATCH /api/tasks/{id}/status` — move Kanban column
- `POST /api/tasks/{id}/promote` — pull backlog task into active sprint
- `GET /api/team` · `POST /api/team` · `PUT /api/team/{id}` · `DELETE /api/team/{id}`
- `GET /api/dashboard/summary?sprint=Sprint%2014` — sprint KPI summary
- `POST /api/import` · `POST /api/reset` — JSON import & sample-data reset

## 🗺️ Roadmap

- [x] Dashboard, Kanban, backlog, team CRUD, auth + RBAC, import/reset
- [ ] Sprint burndown chart + velocity trends
- [ ] Filters, search, labels on tasks
- [ ] Dark mode

## 🤝 Contributing

Issues and PRs welcome at [shridhargsabat/sprintflow](https://github.com/shridhargsabat/sprintflow). See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and style.

## 📄 License

MIT — see [LICENSE](https://github.com/shridhargsabat/sprintflow/blob/main/LICENSE).
