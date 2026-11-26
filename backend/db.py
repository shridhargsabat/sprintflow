"""SQLite database layer for SprintFlow."""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta
from typing import Any, Dict, Generator, List, Optional

from fastapi import HTTPException

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
                color TEXT NOT NULL DEFAULT 'bg-indigo-600',
                user_id INTEGER NULL UNIQUE REFERENCES users(id) ON DELETE SET NULL
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
                assignee_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
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
        # Additive auto-migration: link column for login-user <-> member.
        cols = [r[1] for r in conn.execute("PRAGMA table_info(team_members)").fetchall()]
        if "user_id" not in cols:
            conn.execute("ALTER TABLE team_members ADD COLUMN user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL")
        # Additive auto-migration: optional login-user assignee on tasks.
        task_cols = [r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()]
        if "assignee_user_id" not in task_cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN assignee_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL")
        # Link-integrity migrations (idempotent, run on every startup):
        # 1) Backfill: dangling user_id (no matching users row) -> NULL so no
        #    ghost linkedUser is ever surfaced.
        conn.execute(
            """
            UPDATE team_members SET user_id = NULL
            WHERE user_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM users WHERE users.id = team_members.user_id)
            """
        )
        # 2) Dedupe: keep the lowest-rowid member per user_id, unlink the rest,
        #    so the partial unique index below can be created safely.
        conn.execute(
            """
            UPDATE team_members SET user_id = NULL
            WHERE user_id IS NOT NULL AND rowid NOT IN (
                SELECT MIN(rowid) FROM team_members
                WHERE user_id IS NOT NULL GROUP BY user_id
            )
            """
        )
        # 3) Enforce one-to-one links (fresh + migrated DBs alike). Created here
        #    — after backfill/dedupe — rather than in the CREATE TABLE script
        #    above, so pre-existing dupes can never break startup.
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_team_members_user_id "
            "ON team_members(user_id) WHERE user_id IS NOT NULL"
        )
        # Always ensure the seeded admin login exists (idempotent).
        seed_users(conn)
        # Backfill (idempotent, NULLs only — never overwrites explicit values):
        # tasks whose assignee member is linked to a login user inherit that
        # user as their direct assignee.
        conn.execute(
            """
            UPDATE tasks
            SET assignee_user_id = (
                SELECT m.user_id FROM team_members m WHERE m.id = tasks.assignee_id
            )
            WHERE assignee_user_id IS NULL
              AND assignee_id IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM team_members m
                  WHERE m.id = tasks.assignee_id AND m.user_id IS NOT NULL
              )
            """
        )


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


TASK_WITH_USER_SQL = """
    SELECT t.*, u.name AS assigned_name, u.email AS assigned_email
    FROM tasks t LEFT JOIN users u ON u.id = t.assignee_user_id
    WHERE t.id = ?
"""


def row_to_task(row: sqlite3.Row) -> Dict[str, Any]:
    keys = set(row.keys())
    assignee_user_id = row["assignee_user_id"] if "assignee_user_id" in keys else None
    assigned_name = row["assigned_name"] if "assigned_name" in keys else None
    assigned_email = row["assigned_email"] if "assigned_email" in keys else None
    # Ghost-free like list_team: a dangling assignee_user_id (no matching
    # users row) surfaces assignedUser None rather than {None, None}.
    assigned_user = (
        {"name": assigned_name, "email": assigned_email}
        if assigned_name is not None
        else None
    )
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "assigneeId": row["assignee_id"],
        "assigneeUserId": assignee_user_id,
        "assignedUser": assigned_user,
        "dueDate": row["due_date"],
        "status": row["status"],
        "priority": row["priority"],
        "sprint": row["sprint"],
        "points": row["points"],
        "tag": row["tag"],
    }


def fetch_task(conn: sqlite3.Connection, task_id: str) -> Dict[str, Any]:
    """Single task row with its assigned login user joined in."""
    row = conn.execute(TASK_WITH_USER_SQL, (task_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return row_to_task(row)


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
        rows = conn.execute(
            """SELECT m.id, m.name, m.role, m.color, m.user_id AS userId,
                      u.name AS linkName, u.email AS linkEmail
               FROM team_members m LEFT JOIN users u ON u.id = m.user_id
               ORDER BY m.rowid ASC"""
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            link_name = d.pop("linkName", None)
            link_email = d.pop("linkEmail", None)
            # Only surface linkedUser when the JOIN actually found a user row
            # (dangling user_id must render as a ghost-free null, not {None}).
            d["linkedUser"] = (
                {"name": link_name, "email": link_email}
                if link_name is not None
                else None
            )
            out.append(d)
        return out


def list_tasks(
    sprint: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[str] = None,
    assignee_user_id: Optional[int] = None,
    search: Optional[str] = None,
    db_path: Optional[str] = None,
) -> List[Dict[str, Any]]:
    clauses: List[str] = []
    params: List[Any] = []
    if sprint and sprint != "all":
        if sprint == "Backlog":
            clauses.append("(t.sprint = 'Backlog' OR t.status = 'backlog')")
        else:
            clauses.append("t.sprint = ?")
            params.append(sprint)
    if status and status != "all":
        clauses.append("t.status = ?")
        params.append(status)
    if priority and priority != "all":
        clauses.append("t.priority = ?")
        params.append(priority)
    if assignee_id and assignee_id != "all":
        clauses.append("t.assignee_id = ?")
        params.append(assignee_id)
    if assignee_user_id is not None:
        clauses.append("t.assignee_user_id = ?")
        params.append(assignee_user_id)
    if search and search.strip():
        like = f"%{search.strip()}%"
        clauses.append("(t.id LIKE ? OR t.title LIKE ? OR t.description LIKE ? OR t.tag LIKE ?)")
        params.extend([like, like, like, like])

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"""SELECT t.*, u.name AS assigned_name, u.email AS assigned_email
              FROM tasks t LEFT JOIN users u ON u.id = t.assignee_user_id
              {where} ORDER BY t.updated_at DESC, t.rowid DESC"""
    with get_conn(db_path) as conn:
        rows = conn.execute(sql, params).fetchall()
        return [row_to_task(r) for r in rows]


def list_user_directory(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Login-user directory for task assignment: [{id, name, email}], by name."""
    with get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT id, name, email FROM users ORDER BY name COLLATE NOCASE ASC"
        ).fetchall()
        return [dict(r) for r in rows]


def validate_assignee_id(conn: sqlite3.Connection, assignee_id: Optional[str]) -> None:
    """Reject an unknown task assignee with HTTP 400. None clears/unset: OK.

    NOTE FOR PARENT (routers/tasks.py is read-only for this agent): apply this
    validator with one line inside the `with db.get_conn() as conn:` block of
    BOTH handlers, before the INSERT/UPDATE executes:

        create_task:  db.validate_assignee_id(conn, payload.assigneeId)
        update_task:  db.validate_assignee_id(conn, payload.assigneeId)
    """
    if assignee_id is None:
        return
    row = conn.execute(
        "SELECT 1 FROM team_members WHERE id = ?", (assignee_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(
            status_code=400, detail=f"Unknown assigneeId: {assignee_id}"
        )


def validate_assignee_user_id(conn: sqlite3.Connection, assignee_user_id: Optional[int]) -> None:
    """Reject an unknown login-user task assignee with HTTP 400. None OK."""
    if assignee_user_id is None:
        return
    row = conn.execute(
        "SELECT 1 FROM users WHERE id = ?", (assignee_user_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(
            status_code=400, detail=f"Unknown assigneeUserId: {assignee_user_id}"
        )
