"""SQLite database layer for SprintFlow."""
from __future__ import annotations

import logging
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta
from typing import Any, Dict, Generator, List, Optional

from fastapi import HTTPException

logger = logging.getLogger("sprintflow.db")

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
    conn = sqlite3.connect(db_path or DB_PATH, timeout=30.0)
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
            """
            + TASKS_TABLE_DDL
            + """
            CREATE TABLE IF NOT EXISTS task_assignees (
                task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                member_id TEXT NULL REFERENCES team_members(id) ON DELETE CASCADE,
                user_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE,
                CHECK (
                    (member_id IS NOT NULL AND user_id IS NULL)
                    OR (member_id IS NULL AND user_id IS NOT NULL)
                ),
                UNIQUE (task_id, member_id, user_id)
            );

            CREATE UNIQUE INDEX IF NOT EXISTS uq_task_assignee_member
                ON task_assignees(task_id, member_id) WHERE member_id IS NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS uq_task_assignee_user
                ON task_assignees(task_id, user_id) WHERE user_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);

            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint);
            CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

            CREATE TABLE IF NOT EXISTS sprints (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                length_days INTEGER NOT NULL DEFAULT 14
            );

            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT 'bg-sky-600'
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
        # Tag master: additive + idempotent, safe for live DBs (new table).
        seed_tags(conn)
        # Additive auto-migration: link column for login-user <-> member.
        cols = [r[1] for r in conn.execute("PRAGMA table_info(team_members)").fetchall()]
        if "user_id" not in cols:
            conn.execute("ALTER TABLE team_members ADD COLUMN user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL")
        # Multi-assignee migration (idempotent, guarded by PRAGMA checks so
        # fresh + already-migrated DBs are no-ops): legacy tasks.assignee_id /
        # tasks.assignee_user_id columns are backfilled into task_assignees,
        # then dropped.
        _migrate_task_assignees(conn)
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
        # Seed the default admin ONLY on a fresh system (empty users table).
        # A deliberately deleted admin is never resurrected while other
        # users exist (M1); fresh-DB behavior is unchanged.
        seed_users(conn)


def _migrate_task_assignees(conn: sqlite3.Connection) -> None:
    """Backfill task_assignees from legacy tasks columns, then drop them.

    Idempotent: PRAGMA-guarded, so fresh DBs (no legacy columns) and
    already-migrated DBs are no-ops. Only rows referencing existing
    members/users are backfilled (dangling ids are dropped, never ghosted).

    Column removal prefers `ALTER TABLE ... DROP COLUMN`; when that fails
    (SQLite refuses to drop a column named in a table-level FOREIGN KEY
    constraint, which legacy `assignee_id` is), the tasks table is rebuilt
    without the legacy columns instead. Same end state either way.
    """
    task_cols = [r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()]
    if "assignee_id" in task_cols:
        conn.execute(
            """
            INSERT OR IGNORE INTO task_assignees (task_id, member_id, user_id)
            SELECT t.id, t.assignee_id, NULL FROM tasks t
            WHERE t.assignee_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM team_members m WHERE m.id = t.assignee_id)
            """
        )
    if "assignee_user_id" in task_cols:
        conn.execute(
            """
            INSERT OR IGNORE INTO task_assignees (task_id, member_id, user_id)
            SELECT t.id, NULL, t.assignee_user_id FROM tasks t
            WHERE t.assignee_user_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM users u WHERE u.id = t.assignee_user_id)
            """
        )
    for column in ("assignee_id", "assignee_user_id"):
        cols = [r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()]
        if column not in cols:
            continue
        try:
            conn.execute(f"ALTER TABLE tasks DROP COLUMN {column}")
        except sqlite3.OperationalError:
            _rebuild_tasks_without_legacy_columns(conn)


TASKS_TABLE_DDL = """
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'todo'
            CHECK(status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done')),
        priority TEXT NOT NULL DEFAULT 'medium'
            CHECK(priority IN ('critical', 'high', 'medium', 'low')),
        sprint TEXT NOT NULL DEFAULT 'Sprint 14',
        points INTEGER NOT NULL DEFAULT 3,
        tag TEXT NOT NULL DEFAULT 'Frontend',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
"""

TASKS_CORE_COLUMNS = [
    "id", "title", "description", "due_date", "status", "priority",
    "sprint", "points", "tag", "created_at", "updated_at",
]


def _rebuild_tasks_without_legacy_columns(conn: sqlite3.Connection) -> None:
    """Rebuild tasks without legacy assignee columns (DROP fallback).

    Runs with FK enforcement off and legacy_alter_table on (committed out of
    the caller's transaction first, since both PRAGMAs are no-ops inside one)
    so the RENAME neither enforces nor rewrites task_assignees' FK — it keeps
    pointing at `tasks`, which is recreated under the same name. The new
    table keeps every core column and row; indexes are recreated.
    """
    cols = [r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()]
    if not ({"assignee_id", "assignee_user_id"} & set(cols)):
        return
    keep = [c for c in TASKS_CORE_COLUMNS if c in cols]
    conn.commit()
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute("PRAGMA legacy_alter_table = ON")
    try:
        conn.execute("DROP TABLE IF EXISTS _tasks_legacy_assignees")
        conn.execute("DROP INDEX IF EXISTS idx_tasks_status")
        conn.execute("DROP INDEX IF EXISTS idx_tasks_sprint")
        conn.execute("DROP INDEX IF EXISTS idx_tasks_priority")
        conn.execute("ALTER TABLE tasks RENAME TO _tasks_legacy_assignees")
        conn.execute(TASKS_TABLE_DDL)
        collist = ", ".join(keep)
        conn.execute(
            f"INSERT INTO tasks ({collist}) "
            f"SELECT {collist} FROM _tasks_legacy_assignees"
        )
        conn.execute("DROP TABLE _tasks_legacy_assignees")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)")
        conn.commit()
    finally:
        conn.execute("PRAGMA legacy_alter_table = OFF")
        conn.execute("PRAGMA foreign_keys = ON")


def seed_data(conn: sqlite3.Connection) -> None:
    conn.executemany(
        "INSERT OR IGNORE INTO team_members (id, name, role, color) VALUES (?, ?, ?, ?)",
        DEFAULT_TEAM,
    )
    conn.executemany(
        """
        INSERT OR IGNORE INTO tasks
            (id, title, description, due_date, status, priority, sprint, points, tag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [(t[0], t[1], t[2], t[4], t[5], t[6], t[7], t[8], t[9]) for t in DEFAULT_TASKS],
    )
    # Seed assignees into the join table (DEFAULT_TASKS[3] is the member id).
    for task in DEFAULT_TASKS:
        if task[3]:
            conn.execute(
                "INSERT OR IGNORE INTO task_assignees (task_id, member_id, user_id) VALUES (?, ?, NULL)",
                (task[0], task[3]),
            )
    seed_sprints(conn)
    seed_tags(conn)


DEFAULT_TAG_COLOR = "bg-sky-600"

# Display colors for the collected seed tags; unknown tags fall back to DEFAULT_TAG_COLOR.
TAG_SEED_COLORS = {
    "API": "bg-indigo-600",
    "Backend": "bg-emerald-600",
    "Design": "bg-violet-600",
    "DevOps": "bg-amber-600",
    "Frontend": "bg-sky-600",
    "QA": "bg-rose-600",
}


def slugify_tag_id(name: str) -> str:
    """Slugify a tag name into a URL-safe tag id (lowercase, hyphen-joined)."""
    return re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")


def seed_tags(conn: sqlite3.Connection) -> None:
    """Idempotently seed the tag master from distinct seed-task tags."""
    seen: List[str] = []
    for task in DEFAULT_TASKS:
        tag = (task[9] or "").strip() or "Frontend"
        if tag not in seen:
            seen.append(tag)
    for tag in seen:
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, ?, ?)",
            (slugify_tag_id(tag), tag, TAG_SEED_COLORS.get(tag, DEFAULT_TAG_COLOR)),
        )


def list_tags(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """All tags sorted by name, each with its live task usage count."""
    with get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT id, name, color FROM tags ORDER BY name COLLATE NOCASE ASC"
        ).fetchall()
        out = []
        for r in rows:
            count = conn.execute(
                "SELECT COUNT(*) FROM tasks "
                "WHERE tag = ? COLLATE NOCASE OR tag = ? COLLATE NOCASE",
                (r["name"], r["id"]),
            ).fetchone()[0]
            out.append(
                {"id": r["id"], "name": r["name"], "color": r["color"], "taskCount": count}
            )
        return out


def validate_tag(conn: sqlite3.Connection, tag: Optional[str]) -> None:
    """Reject a task tag unknown to the master with HTTP 400. None clears: OK."""
    if tag is None:
        return
    row = conn.execute(
        "SELECT 1 FROM tags WHERE name = ? COLLATE NOCASE OR id = ? COLLATE NOCASE",
        (tag, tag),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=400, detail=f"Unknown tag: {tag}")


def ensure_tag(conn: sqlite3.Connection, name: Optional[str], color: Optional[str] = None) -> tuple:
    """Get-or-create a tag by name. Returns (id, created)."""
    clean = (name or "").strip() or "Frontend"
    row = conn.execute(
        "SELECT id FROM tags WHERE name = ? COLLATE NOCASE", (clean,)
    ).fetchone()
    if row:
        return row["id"], False
    base = slugify_tag_id(clean) or "tag"
    candidate = base
    suffix = 2
    while conn.execute("SELECT 1 FROM tags WHERE id = ?", (candidate,)).fetchone():
        candidate = f"{base}-{suffix}"
        suffix += 1
    conn.execute(
        "INSERT INTO tags (id, name, color) VALUES (?, ?, ?)",
        (candidate, clean, (color or "").strip() or DEFAULT_TAG_COLOR),
    )
    return candidate, True


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
    """Seed the default admin login, but ONLY on a fresh system.

    The seed admin is created only when the users table is EMPTY. Once any
    user exists, seeding is skipped — so deleting the seed admin (e.g. after
    rotating to a real admin account) is permanent and a restart can never
    resurrect the public-password login. Board reset/import never touch the
    users table, so logins survive data resets.
    """
    user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if user_count > 0:
        return
    import bcrypt

    password_hash = bcrypt.hashpw(
        SEED_ADMIN_PASSWORD.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")
    cur = conn.execute(
        "INSERT OR IGNORE INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')",
        (SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, password_hash),
    )
    if cur.rowcount:
        logger.warning(
            "SECURITY: seeded default admin login %s with the public dev "
            "password — rotate it immediately via the Users admin UI",
            SEED_ADMIN_EMAIL,
        )


def reset_db(db_path: Optional[str] = None) -> None:
    with get_conn(db_path) as conn:
        conn.execute("DELETE FROM task_assignees")
        conn.execute("DELETE FROM tasks")
        conn.execute("DELETE FROM team_members")
        conn.execute("DELETE FROM sprints")
        conn.execute("DELETE FROM tags")
        seed_data(conn)


MAX_ASSIGNEES = 10

TASK_ASSIGNEES_SQL = """
    SELECT ta.task_id, ta.member_id, ta.user_id,
           m.name AS member_name, m.role AS member_role, m.color AS member_color,
           u.name AS user_name, u.email AS user_email, u.role AS user_role
    FROM task_assignees ta
    LEFT JOIN team_members m ON m.id = ta.member_id
    LEFT JOIN users u ON u.id = ta.user_id
"""


def _assignee_entry(row: sqlite3.Row) -> Optional[Dict[str, Any]]:
    """One enriched assignee dict, or None for a dangling (ghost) row."""
    if row["member_id"] is not None:
        if row["member_name"] is None:  # dangling member: ghost-free skip
            return None
        return {
            "type": "member",
            "id": row["member_id"],
            "name": row["member_name"],
            "role": row["member_role"],
            "color": row["member_color"],
        }
    if row["user_name"] is None:  # dangling user: ghost-free skip
        return None
    return {
        "type": "user",
        "id": row["user_id"],
        "name": row["user_name"],
        "email": row["user_email"],
        "role": row["user_role"],
    }


def assignees_by_task(
    conn: sqlite3.Connection, task_ids: List[str]
) -> Dict[str, List[Dict[str, Any]]]:
    """Batch-fetch enriched assignees for many tasks (single JOIN query)."""
    out: Dict[str, List[Dict[str, Any]]] = {tid: [] for tid in task_ids}
    if not task_ids:
        return out
    placeholders = ",".join("?" for _ in task_ids)
    rows = conn.execute(
        TASK_ASSIGNEES_SQL + f" WHERE ta.task_id IN ({placeholders}) ORDER BY ta.rowid ASC",
        task_ids,
    ).fetchall()
    for r in rows:
        entry = _assignee_entry(r)
        if entry is not None:
            out.setdefault(r["task_id"], []).append(entry)
    return out


def assignees_for_task(
    conn: sqlite3.Connection, task_id: str
) -> List[Dict[str, Any]]:
    """Enriched assignees for a single task (JOIN-enriched, [] when none)."""
    return assignees_by_task(conn, [task_id]).get(task_id, [])


def row_to_task(row: sqlite3.Row, assignees: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "assignees": list(assignees) if assignees else [],
        "dueDate": row["due_date"],
        "status": row["status"],
        "priority": row["priority"],
        "sprint": row["sprint"],
        "points": row["points"],
        "tag": row["tag"],
    }


def fetch_task(conn: sqlite3.Connection, task_id: str) -> Dict[str, Any]:
    """Single task row with its JOIN-enriched assignees attached."""
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return row_to_task(row, assignees_for_task(conn, task_id))


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
        clauses.append(
            "EXISTS (SELECT 1 FROM task_assignees ta "
            "WHERE ta.task_id = t.id AND ta.member_id = ?)"
        )
        params.append(assignee_id)
    if assignee_user_id is not None:
        clauses.append(
            "EXISTS (SELECT 1 FROM task_assignees ta "
            "WHERE ta.task_id = t.id AND ta.user_id = ?)"
        )
        params.append(assignee_user_id)
    if search and search.strip():
        like = f"%{search.strip()}%"
        clauses.append("(t.id LIKE ? OR t.title LIKE ? OR t.description LIKE ? OR t.tag LIKE ?)")
        params.extend([like, like, like, like])

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"""SELECT t.* FROM tasks t
              {where} ORDER BY t.updated_at DESC, t.rowid DESC"""
    with get_conn(db_path) as conn:
        rows = conn.execute(sql, params).fetchall()
        assignee_map = assignees_by_task(conn, [r["id"] for r in rows])
        return [row_to_task(r, assignee_map.get(r["id"], [])) for r in rows]


def list_user_directory(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Login-user directory for task assignment: [{id, name, email}], by name."""
    with get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT id, name, email FROM users ORDER BY name COLLATE NOCASE ASC"
        ).fetchall()
        return [dict(r) for r in rows]


def validate_assignees(
    conn: sqlite3.Connection, assignees: Optional[List[Any]]
) -> List[tuple]:
    """Validate a TaskPayload assignees list; 400 on unknown ids or >10.

    Returns normalized [(type, id), ...] deduped (order-preserving):
    member ids as str, user ids as int. None/[] clears: OK.
    """
    if not assignees:
        return []
    if len(assignees) > MAX_ASSIGNEES:
        raise HTTPException(
            status_code=400,
            detail=f"Too many assignees: max {MAX_ASSIGNEES}",
        )
    normalized: List[tuple] = []
    seen = set()
    for entry in assignees:
        if isinstance(entry, dict):
            kind, raw_id = entry.get("type"), entry.get("id")
        else:  # pydantic AssigneeInput (or any attr-style) model
            kind, raw_id = getattr(entry, "type", None), getattr(entry, "id", None)
        if kind == "member":
            member_id = str(raw_id).strip() if raw_id is not None else ""
            if not member_id or (
                conn.execute(
                    "SELECT 1 FROM team_members WHERE id = ?", (member_id,)
                ).fetchone()
                is None
            ):
                raise HTTPException(
                    status_code=400, detail=f"Unknown assignee member id: {raw_id!r}"
                )
            key = ("member", member_id)
        elif kind == "user":
            # M5: JSON true/false must never coerce to user id 1/0 via int()
            # (id 1 is the admin). Numeric strings like "3" still convert.
            if isinstance(raw_id, bool):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid assignee user id: {raw_id!r} (boolean is not a user id)",
                )
            try:
                user_id = int(raw_id)  # type: ignore[arg-type]
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400, detail=f"Unknown assignee user id: {raw_id!r}"
                )
            if (
                conn.execute(
                    "SELECT 1 FROM users WHERE id = ?", (user_id,)
                ).fetchone()
                is None
            ):
                raise HTTPException(
                    status_code=400, detail=f"Unknown assignee user id: {raw_id!r}"
                )
            key = ("user", user_id)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid assignee type: {kind!r} (expected 'member' or 'user')",
            )
        if key not in seen:
            seen.add(key)
            normalized.append(key)
    return normalized


def set_task_assignees(
    conn: sqlite3.Connection, task_id: str, normalized: List[tuple]
) -> None:
    """Replace a task's join-table assignee rows (full replacement)."""
    conn.execute("DELETE FROM task_assignees WHERE task_id = ?", (task_id,))
    for kind, ident in normalized:
        if kind == "member":
            conn.execute(
                "INSERT OR IGNORE INTO task_assignees (task_id, member_id, user_id) "
                "VALUES (?, ?, NULL)",
                (task_id, ident),
            )
        else:
            conn.execute(
                "INSERT OR IGNORE INTO task_assignees (task_id, member_id, user_id) "
                "VALUES (?, NULL, ?)",
                (task_id, ident),
            )
