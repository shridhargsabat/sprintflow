"""SQLite database layer for SprintFlow."""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta
from typing import Any, Dict, Generator, List, Optional

DB_PATH = os.environ.get(
    "SPRINTFLOW_DB_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "sprintflow.db"),
)

DEFAULT_TEAM = [
    ("m1", "Lead Dev", "Architecture", "bg-indigo-600"),
    ("m2", "Frontend Eng", "UI & State", "bg-sky-600"),
    ("m3", "Backend Eng", "API & Data", "bg-emerald-600"),
    ("m4", "QA Engineer", "Automation", "bg-amber-600"),
    ("m5", "DevOps Eng", "Cloud & CI/CD", "bg-rose-600"),
    ("m6", "UI/UX Design", "Design System", "bg-violet-600"),
]

DEFAULT_TASKS = [
    ("DEV-101", "OAuth2 SSO & RBAC Middleware", "Enforce role-based access guards across all v2 REST endpoints and support token refresh rotation.", "m3", "2026-11-28", "in_progress", "critical", "Sprint 14", 8, "API"),
    ("DEV-102", "Real-Time Notification Drawer UI", "Build slide-over notification center with unread badge sync and mark-all-read action.", "m2", "2026-11-29", "in_progress", "high", "Sprint 14", 5, "Frontend"),
    ("DEV-103", "Blue-Green Zero-Downtime Pipeline", "Configure automated canary health checks and instant rollback workflow in staging and production.", "m5", "2026-11-30", "in_progress", "high", "Sprint 14", 5, "DevOps"),
    ("DEV-104", "API Rate Limiter & Audit Logging", "Add sliding-window rate limits per workspace key and structured JSON audit events.", "m1", "2026-11-27", "in_review", "critical", "Sprint 14", 5, "Backend"),
    ("DEV-105", "Checkout & Billing Regression Suite", "End-to-end Playwright test coverage for upgrade, downgrade, and invoice webhook flows.", "m4", "2026-11-28", "in_review", "medium", "Sprint 14", 3, "QA"),
    ("DEV-106", "Executive CSV & PDF Sprint Export", "Allow managers to download current sprint KPIs and task breakdown for weekly reviews.", "m2", "2026-12-02", "todo", "medium", "Sprint 14", 3, "Frontend"),
    ("DEV-107", "PostgreSQL Read Replica Failover Drill", "Simulate primary DB outage and validate automatic read-replica promotion under 45 seconds.", "m5", "2026-12-03", "todo", "high", "Sprint 14", 5, "DevOps"),
    ("DEV-108", "Mobile Responsive Table & Card Tokens", "Finalize spacing, typography, and tap targets for narrow tablet and mobile viewports.", "m6", "2026-12-04", "todo", "low", "Sprint 14", 2, "Design"),
    ("DEV-109", "SQLite Schema & REST API Persistence", "Apply normalized tables for sprint_tasks and team_members with indexed status lookups.", "m3", "2026-11-24", "done", "critical", "Sprint 14", 5, "Backend"),
    ("DEV-110", "Design System Dark Mode Palette", "Deliver WCAG AA contrast-checked surface, border, and semantic priority tokens.", "m6", "2026-11-25", "done", "medium", "Sprint 14", 3, "Design"),
    ("DEV-111", "Automated Staging Smoke Tests", "Run post-deploy API and login smoke checks on every pull request merge.", "m4", "2026-11-25", "done", "high", "Sprint 14", 3, "QA"),
    ("DEV-112", "Multi-Tenant Webhook Retry Queue", "Implement exponential backoff dead-letter queue for failed outbound customer webhooks.", "m3", "2026-12-11", "backlog", "high", "Sprint 15", 8, "Backend"),
    ("DEV-113", "Load Testing 10k Concurrent Sessions", "Benchmark API gateway latency and DB connection pool saturation at peak traffic.", "m4", "2026-12-10", "backlog", "critical", "Sprint 15", 5, "QA"),
    ("DEV-114", "Custom Dashboard Widget Layout Preferences", "Allow leads to toggle visibility and order of executive KPI cards.", "m2", "2026-12-15", "backlog", "medium", "Sprint 15", 5, "Frontend"),
    ("DEV-115", "Automated Compliance Evidence Collector", "Archive weekly access reviews and deployment logs into encrypted object storage.", "m1", "2026-12-18", "backlog", "low", "Backlog", 3, "DevOps"),
]


DEFAULT_SPRINTS = [
    ("Sprint 14", "Sprint 14", "2026-11-23", 14),
    ("Sprint 15", "Sprint 15", "2026-12-07", 14),
]


@contextmanager
def get_conn(db_path: Optional[str] = None) -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(db_path or DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_path: Optional[str] = None) -> None:
    with get_conn(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS team_members (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'Engineer',
                color TEXT NOT NULL DEFAULT 'bg-indigo-600'
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                assignee_id TEXT,
                due_date TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'todo'
                    CHECK(status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done')),
                priority TEXT NOT NULL DEFAULT 'medium'
                    CHECK(priority IN ('critical', 'high', 'medium', 'low')),
                sprint TEXT NOT NULL DEFAULT 'Sprint 14',
                points INTEGER NOT NULL DEFAULT 3,
                tag TEXT NOT NULL DEFAULT 'Frontend',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (assignee_id) REFERENCES team_members(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint);
            CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

            CREATE TABLE IF NOT EXISTS sprints (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                length_days INTEGER NOT NULL DEFAULT 14
            );

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'member'
                    CHECK(role IN ('admin', 'lead', 'member', 'viewer')),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )

        member_count = conn.execute("SELECT COUNT(*) FROM team_members").fetchone()[0]
        if member_count == 0:
            seed_data(conn)
        # Additive auto-migration for live DBs that predate the sprints table.
        seed_sprints(conn)
        # Always ensure the seeded admin login exists (idempotent).
        seed_users(conn)


def seed_data(conn: sqlite3.Connection) -> None:
    conn.executemany(
        "INSERT OR IGNORE INTO team_members (id, name, role, color) VALUES (?, ?, ?, ?)",
        DEFAULT_TEAM,
    )
    conn.executemany(
        """
        INSERT OR IGNORE INTO tasks
            (id, title, description, assignee_id, due_date, status, priority, sprint, points, tag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        DEFAULT_TASKS,
    )
    seed_sprints(conn)


def seed_sprints(conn: sqlite3.Connection) -> None:
    conn.executemany(
        "INSERT OR IGNORE INTO sprints (id, name, start_date, length_days) VALUES (?, ?, ?, ?)",
        DEFAULT_SPRINTS,
    )


# Seeded admin login (dev): admin@sprintflow.local / Admin123!
SEED_ADMIN_EMAIL = "admin@sprintflow.local"
SEED_ADMIN_NAME = "Admin"
SEED_ADMIN_PASSWORD = "Admin123!"


def seed_users(conn: sqlite3.Connection) -> None:
    """Idempotently ensure the seeded admin user exists. Board reset/import
    never touch the users table, so logins survive data resets."""
    existing = conn.execute(
        "SELECT id FROM users WHERE email = ?", (SEED_ADMIN_EMAIL,)
    ).fetchone()
    if existing:
        return
    import bcrypt

    password_hash = bcrypt.hashpw(
        SEED_ADMIN_PASSWORD.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")
    conn.execute(
        "INSERT OR IGNORE INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')",
        (SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, password_hash),
    )


def reset_db(db_path: Optional[str] = None) -> None:
    with get_conn(db_path) as conn:
        conn.execute("DELETE FROM tasks")
        conn.execute("DELETE FROM team_members")
        conn.execute("DELETE FROM sprints")
        seed_data(conn)


def row_to_task(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "assigneeId": row["assignee_id"],
        "dueDate": row["due_date"],
        "status": row["status"],
        "priority": row["priority"],
        "sprint": row["sprint"],
        "points": row["points"],
        "tag": row["tag"],
    }


def next_task_id(conn: sqlite3.Connection) -> str:
    rows = conn.execute("SELECT id FROM tasks WHERE id LIKE 'DEV-%'").fetchall()
    max_num = 100
    for r in rows:
        try:
            num = int(str(r["id"]).split("-")[1])
            if num > max_num:
                max_num = num
        except (IndexError, ValueError):
            continue
    return f"DEV-{max_num + 1}"


def sprint_end_date(start_date: str, length_days: int) -> str:
    return (date.fromisoformat(start_date) + timedelta(days=length_days - 1)).isoformat()


def row_to_sprint(row: sqlite3.Row) -> Dict[str, Any]:
    length_days = int(row["length_days"])
    return {
        "id": row["id"],
        "name": row["name"],
        "startDate": row["start_date"],
        "lengthDays": length_days,
        "endDate": sprint_end_date(row["start_date"], length_days),
    }


def list_sprints(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_conn(db_path) as conn:
        rows = conn.execute("SELECT * FROM sprints ORDER BY start_date ASC").fetchall()
        return [row_to_sprint(r) for r in rows]


def update_sprint(
    sprint_id: str,
    start_date: Optional[str] = None,
    length_days: Optional[int] = None,
    db_path: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    with get_conn(db_path) as conn:
        existing = conn.execute("SELECT id FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
        if not existing:
            return None
        if start_date is not None:
            conn.execute("UPDATE sprints SET start_date = ? WHERE id = ?", (start_date, sprint_id))
        if length_days is not None:
            conn.execute("UPDATE sprints SET length_days = ? WHERE id = ?", (length_days, sprint_id))
        row = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
        return row_to_sprint(row)


def list_team(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_conn(db_path) as conn:
        rows = conn.execute("SELECT id, name, role, color FROM team_members ORDER BY rowid ASC").fetchall()
        return [dict(r) for r in rows]


def list_tasks(
    sprint: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[str] = None,
    search: Optional[str] = None,
    db_path: Optional[str] = None,
) -> List[Dict[str, Any]]:
    clauses: List[str] = []
    params: List[Any] = []
    if sprint and sprint != "all":
        if sprint == "Backlog":
            clauses.append("(sprint = 'Backlog' OR status = 'backlog')")
        else:
            clauses.append("sprint = ?")
            params.append(sprint)
    if status and status != "all":
        clauses.append("status = ?")
        params.append(status)
    if priority and priority != "all":
        clauses.append("priority = ?")
        params.append(priority)
    if assignee_id and assignee_id != "all":
        clauses.append("assignee_id = ?")
        params.append(assignee_id)
    if search and search.strip():
        like = f"%{search.strip()}%"
        clauses.append("(id LIKE ? OR title LIKE ? OR description LIKE ? OR tag LIKE ?)")
        params.extend([like, like, like, like])

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"SELECT * FROM tasks {where} ORDER BY updated_at DESC, rowid DESC"
    with get_conn(db_path) as conn:
        rows = conn.execute(sql, params).fetchall()
        return [row_to_task(r) for r in rows]
