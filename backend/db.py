"""SQLite database layer for SprintFlow."""
from __future__ import annotations

import logging
import json
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

# Story-points scale: admin-configurable picker options. The default
# preserves the historical fixed picker ([1,2,3,5,8,13]) so existing
# boards behave identically until an admin changes the scale.
DEFAULT_POINTS_SCALE = [1, 2, 3, 5, 8, 13]
POINTS_SCALE_SETTING_KEY = "points_scale"


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

            CREATE TABLE IF NOT EXISTS task_tags (
                task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                UNIQUE (task_id, tag_id)
            );
            CREATE INDEX IF NOT EXISTS idx_task_tags_task ON task_tags(task_id);
            CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id);

            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint);
            CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

            CREATE TABLE IF NOT EXISTS sprints (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                length_days INTEGER NOT NULL DEFAULT 14,
                status TEXT NOT NULL DEFAULT 'planned'
                    CHECK(status IN ('planned', 'active', 'closed'))
            );
            -- NOTE: uq_sprints_single_active is created by
            -- _migrate_sprint_status (after the status ALTER), never here:
            -- CREATE INDEX in this script would fail on pre-status tables.

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

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )

        # Production guard: sample team/tasks seed ONLY when explicitly
        # allowed (dev/tests set SPRINTFLOW_SEED_SAMPLES=1; prod compose does
        # not). Without this, every backend boot resurrects demo data on an
        # intentionally emptied board (member_count == 0 after a wipe).
        if os.environ.get("SPRINTFLOW_SEED_SAMPLES") == "1":
            member_count = conn.execute("SELECT COUNT(*) FROM team_members").fetchone()[0]
            if member_count == 0:
                seed_data(conn)
        # Tag master stays unconditional: the 6 standard tags are functional
        # defaults (task creation defaults to 'Frontend', which must validate),
        # not demo content. Quirk: a deleted standard tag returns on reboot.
        seed_tags(conn)
        # Additive auto-migration for live DBs that predate the sprints table.
        # Unconditional: sprint-targeting flows (promote, pull-to-sprint) need
        # at least one sprint to exist on a fresh production board.
        seed_sprints(conn)
        # Sprint lifecycle migration: sprints.status + single-active index +
        # exactly-one-active data (idempotent, safe for live DBs). Runs after
        # seed_sprints so a fresh board converges on exactly one active.
        _migrate_sprint_status(conn)
        # Points scale: seed the default picker options once; an admin edit
        # afterwards is never overwritten (INSERT OR IGNORE).
        seed_points_scale(conn)
        # L10: case-insensitive tag-name uniqueness (dedupe legacy case-only
        # dupes first so the NOCASE index can never break startup).
        _enforce_tag_name_uniqueness(conn)
        # Additive auto-migration: link column for login-user <-> member.
        cols = [r[1] for r in conn.execute("PRAGMA table_info(team_members)").fetchall()]
        if "user_id" not in cols:
            conn.execute("ALTER TABLE team_members ADD COLUMN user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL")
        # Multi-tag migration (idempotent, PRAGMA-guarded): legacy tasks.tag
        # values are backfilled into task_tags, then the column is dropped.
        # Runs BEFORE the assignee migration: the assignee table-rebuild
        # fallback recreates tasks from TASKS_CORE_COLUMNS (which no longer
        # includes tag), so tag links must already be safe in task_tags.
        _migrate_task_tags(conn)
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
        # Per-task activity trail (idempotent; additive for live DBs).
        conn.executescript(TASK_ACTIVITY_DDL)


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


def _migrate_task_tags(conn: sqlite3.Connection) -> None:
    """Backfill task_tags from the legacy tasks.tag column, then drop it.

    Idempotent: PRAGMA-guarded, so fresh DBs (no tag column) and
    already-migrated DBs are no-ops. Unknown legacy values are
    get-or-created first (ensure_tag) so no link is ever lost; NULL/blank
    legacy values fall back to 'Frontend' (the historical column default).
    """
    task_cols = [r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()]
    if "tag" not in task_cols:
        return
    distinct = [r[0] for r in conn.execute("SELECT DISTINCT tag FROM tasks").fetchall()]
    for raw in distinct:
        clean = (raw or "").strip() or "Frontend"
        ensure_tag(conn, clean)
    conn.execute(
        """
        INSERT OR IGNORE INTO task_tags (task_id, tag_id)
        SELECT t.id, g.id FROM tasks t
        JOIN tags g ON g.name = COALESCE(NULLIF(TRIM(t.tag), ''), 'Frontend') COLLATE NOCASE
        """
    )
    try:
        conn.execute("ALTER TABLE tasks DROP COLUMN tag")
    except sqlite3.OperationalError:
        # SQLite < 3.35 or a constrained schema: fall back to the shared
        # table rebuild, which recreates tasks without the tag column
        # (TASKS_CORE_COLUMNS no longer lists it).
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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
"""

TASKS_CORE_COLUMNS = [
    "id", "title", "description", "due_date", "status", "priority",
    "sprint", "points", "created_at", "updated_at",
]

TASK_ACTIVITY_DDL = """
    CREATE TABLE IF NOT EXISTS task_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        actor_id INTEGER NULL,
        actor_name TEXT NOT NULL DEFAULT '',
        actor_email TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL,
        field TEXT NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_task_activity_task
        ON task_activity(task_id, id DESC);
"""
# NOTE: task_activity.task_id deliberately has NO foreign key to tasks.
# A 'deleted' entry is logged after the task row is removed, and the trail
# (including that entry) stays queryable afterwards — GET returns it instead
# of 404ing, so clients stay fail-soft.


def _rebuild_tasks_without_legacy_columns(conn: sqlite3.Connection) -> None:
    """Rebuild tasks without legacy assignee/tag columns (DROP fallback).

    Runs with FK enforcement off and legacy_alter_table on (committed out of
    the caller's transaction first, since both PRAGMAs are no-ops inside one)
    so the RENAME neither enforces nor rewrites task_assignees'/task_tags'
    FKs — they keep pointing at `tasks`, which is recreated under the same
    name. The new table keeps every core column and row; indexes are
    recreated.
    """
    cols = [r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()]
    if not ({"assignee_id", "assignee_user_id", "tag"} & set(cols)):
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
            (id, title, description, due_date, status, priority, sprint, points)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [(t[0], t[1], t[2], t[4], t[5], t[6], t[7], t[8]) for t in DEFAULT_TASKS],
    )
    # Seed assignees into the join table (DEFAULT_TASKS[3] is the member id)
    # and tags into task_tags (DEFAULT_TASKS[9] is the tag name).
    seed_sprints(conn)
    seed_tags(conn)
    for task in DEFAULT_TASKS:
        if task[3]:
            conn.execute(
                "INSERT OR IGNORE INTO task_assignees (task_id, member_id, user_id) VALUES (?, ?, NULL)",
                (task[0], task[3]),
            )
        tag_row = conn.execute(
            "SELECT id FROM tags WHERE name = ? COLLATE NOCASE", (task[9],)
        ).fetchone()
        if tag_row:
            conn.execute(
                "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
                (task[0], tag_row["id"]),
            )


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
            out.append(
                {
                    "id": r["id"],
                    "name": r["name"],
                    "color": r["color"],
                    "taskCount": tag_usage_count(conn, r["name"]),
                }
            )
        return out


def tag_usage_count(conn: sqlite3.Connection, name: str) -> int:
    """Live task usage for a tag, counted over the task_tags join table.

    Links key on the tag id, so a rename never orphans or double-counts:
    every distinct (task, tag) link counts exactly once for its tag.
    """
    return conn.execute(
        """
        SELECT COUNT(*) FROM task_tags tt
        JOIN tags g ON g.id = tt.tag_id
        WHERE g.name = ? COLLATE NOCASE
        """,
        (name,),
    ).fetchone()[0]


def _enforce_tag_name_uniqueness(conn: sqlite3.Connection) -> None:
    """Enforce case-insensitive tag-name uniqueness (L10).

    Idempotent startup migration: folds legacy case-only dupes ("Foo" vs
    "foo", which the old case-sensitive UNIQUE allowed) into the
    lowest-rowid winner — moving their task_tags links — then enforces a
    NOCASE unique index so concurrent Foo/foo creates can no longer both
    land.
    """
    rows = conn.execute("SELECT rowid, id, name FROM tags ORDER BY rowid ASC").fetchall()
    winners: Dict[str, sqlite3.Row] = {}
    for r in rows:
        key = (r["name"] or "").lower()
        if key not in winners:
            winners[key] = r
            continue
        winner = winners[key]
        # Move the loser's links to the winner (OR IGNORE: a task linked to
        # both keeps one link), then drop any colliding leftovers.
        conn.execute(
            "UPDATE OR IGNORE task_tags SET tag_id = ? WHERE tag_id = ?",
            (winner["id"], r["id"]),
        )
        conn.execute("DELETE FROM task_tags WHERE tag_id = ?", (r["id"],))
        conn.execute("DELETE FROM tags WHERE rowid = ?", (r["rowid"],))
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_name_nocase "
        "ON tags(name COLLATE NOCASE)"
    )


def validate_tags(
    conn: sqlite3.Connection, tags: Optional[List[Any]]
) -> List[str]:
    """Validate task tags against the master; 400 when any is unknown.

    None (omitted) means the ["Frontend"] default; [] is a deliberately
    untagged task. Returns canonical tag NAMEs, deduped (order-preserving);
    accepts slug ids as input for backwards compatibility.
    """
    if tags is None:
        tags = ["Frontend"]
    if not isinstance(tags, list):
        raise HTTPException(status_code=400, detail=f"Invalid tags: {tags!r} (expected a list)")
    canonical: List[str] = []
    seen = set()
    for tag in tags:
        if not isinstance(tag, str):
            raise HTTPException(status_code=400, detail=f"Unknown tag: {tag!r}")
        # L11: name matches win over id matches, so a cross name/id
        # collision ("L11 Shared" as A's name and B's id) resolves to A.
        row = conn.execute(
            """
            SELECT name FROM tags
            WHERE name = ? COLLATE NOCASE OR id = ? COLLATE NOCASE
            ORDER BY CASE WHEN name = ? COLLATE NOCASE THEN 0 ELSE 1 END
            """,
            (tag, tag, tag),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=400, detail=f"Unknown tag: {tag}")
        name = str(row["name"])
        if name.lower() not in seen:
            seen.add(name.lower())
            canonical.append(name)
    return canonical


def ensure_tag(conn: sqlite3.Connection, name: Optional[str], color: Optional[str] = None) -> tuple:
    """Get-or-create a tag by name. Returns (id, created)."""
    clean = (name or "").strip() or "Frontend"
    # L9: bounded get-or-create retries. A concurrent creator can slip
    # between the SELECT and the INSERT; on IntegrityError we reselect
    # by name (a hit means we lost cleanly — return the winner) or, for
    # an id-only collision (distinct names, same slug), rescan for a
    # fresh suffixed candidate and retry once.
    for _ in range(2):
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
        try:
            conn.execute(
                "INSERT INTO tags (id, name, color) VALUES (?, ?, ?)",
                (candidate, clean, (color or "").strip() or DEFAULT_TAG_COLOR),
            )
        except sqlite3.IntegrityError:
            continue
        return candidate, True
    winner = conn.execute(
        "SELECT id FROM tags WHERE name = ? COLLATE NOCASE", (clean,)
    ).fetchone()
    if winner:
        return winner["id"], False
    raise sqlite3.IntegrityError(f"ensure_tag could not create tag: {clean!r}")


def seed_sprints(conn: sqlite3.Connection) -> None:
    conn.executemany(
        "INSERT OR IGNORE INTO sprints (id, name, start_date, length_days) VALUES (?, ?, ?, ?)",
        DEFAULT_SPRINTS,
    )


def seed_points_scale(conn: sqlite3.Connection) -> None:
    """Seed the default points scale once (never overwrites an admin edit)."""
    conn.execute(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)",
        (POINTS_SCALE_SETTING_KEY, json.dumps(DEFAULT_POINTS_SCALE)),
    )


def get_points_scale(conn: sqlite3.Connection) -> List[int]:
    """Current points scale (ascending ints); default when unset/corrupt.

    Corrupt rows (bad JSON, empty, non-int entries) fall back to the
    default instead of ever raising — reads never 500.
    """
    row = conn.execute(
        "SELECT value FROM app_settings WHERE key = ?", (POINTS_SCALE_SETTING_KEY,)
    ).fetchone()
    if row is None:
        return list(DEFAULT_POINTS_SCALE)
    try:
        raw = json.loads(row["value"])
    except (ValueError, TypeError):
        return list(DEFAULT_POINTS_SCALE)
    if not isinstance(raw, list) or not raw:
        return list(DEFAULT_POINTS_SCALE)
    scale: List[int] = []
    for v in raw:
        if isinstance(v, bool) or not isinstance(v, int):
            return list(DEFAULT_POINTS_SCALE)
        scale.append(v)
    return scale


def set_points_scale(conn: sqlite3.Connection, scale: List[int]) -> List[int]:
    """Persist a validated scale (deduped + ascending); returns stored value."""
    stored = sorted(set(scale))
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (POINTS_SCALE_SETTING_KEY, json.dumps(stored)),
    )
    return stored


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
        conn.execute("DELETE FROM task_activity")
        conn.execute("DELETE FROM task_tags")
        conn.execute("DELETE FROM task_assignees")
        conn.execute("DELETE FROM tasks")
        conn.execute("DELETE FROM team_members")
        conn.execute("DELETE FROM sprints")
        conn.execute("DELETE FROM tags")
        seed_data(conn)
        _migrate_sprint_status(conn)
        # Reset restores the default scale (admin edits are board config).
        conn.execute("DELETE FROM app_settings WHERE key = ?", (POINTS_SCALE_SETTING_KEY,))
        seed_points_scale(conn)


MAX_ASSIGNEES = 10

# L14: max task ids per assignee-lookup query (well under SQLite's 32766
# default bind-variable limit).
_ASSIGNEE_LOOKUP_CHUNK = 500

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
    """Batch-fetch enriched assignees for many tasks (JOIN queries, chunked)."""
    out: Dict[str, List[Dict[str, Any]]] = {tid: [] for tid in task_ids}
    if not task_ids:
        return out
    # Dedupe (order-preserving): a single IN query never multiplies rows for
    # repeated ids, and chunking must preserve that.
    unique: List[str] = list(dict.fromkeys(task_ids))
    # L14: chunk so a huge id list can never breach SQLite's variable limit
    # (default 32766 bind params) with a 500; 500/batch keeps margin.
    for start in range(0, len(unique), _ASSIGNEE_LOOKUP_CHUNK):
        batch = unique[start:start + _ASSIGNEE_LOOKUP_CHUNK]
        placeholders = ",".join("?" for _ in batch)
        rows = conn.execute(
            TASK_ASSIGNEES_SQL + f" WHERE ta.task_id IN ({placeholders}) ORDER BY ta.rowid ASC",
            batch,
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


def row_to_task(
    row: sqlite3.Row,
    assignees: Optional[List[Dict[str, Any]]] = None,
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
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
        "tags": list(tags) if tags else [],
    }


def fetch_task(conn: sqlite3.Connection, task_id: str) -> Dict[str, Any]:
    """Single task row with its JOIN-enriched assignees and tags attached."""
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return row_to_task(
        row,
        assignees_for_task(conn, task_id),
        tags_for_task(conn, task_id),
    )


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
    """End date of a sprint: the Nth WORKING day (Mon-Fri).

    length_days counts working days only. The start date is day 1 when it
    falls on Mon-Fri; a weekend start rolls forward to the following Monday,
    which is then counted as day 1. Existing stored length_days values are
    reinterpreted as working days (no data migration).
    """
    current = date.fromisoformat(start_date)
    if current.weekday() == 5:  # Saturday -> Monday
        current += timedelta(days=2)
    elif current.weekday() == 6:  # Sunday -> Monday
        current += timedelta(days=1)
    remaining = length_days - 1
    while remaining > 0:
        current += timedelta(days=1)
        if current.weekday() < 5:
            remaining -= 1
    return current.isoformat()


def row_to_sprint(row: sqlite3.Row) -> Dict[str, Any]:
    length_days = int(row["length_days"])
    try:
        sprint_status = row["status"] or "planned"
    except (IndexError, KeyError):
        sprint_status = "planned"
    return {
        "id": row["id"],
        "name": row["name"],
        "startDate": row["start_date"],
        "lengthDays": length_days,
        "endDate": sprint_end_date(row["start_date"], length_days),
        "status": sprint_status,
    }


def list_sprints(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_conn(db_path) as conn:
        rows = conn.execute("SELECT * FROM sprints ORDER BY start_date ASC").fetchall()
        return [row_to_sprint(r) for r in rows]


def update_sprint(
    sprint_id: str,
    start_date: Optional[str] = None,
    length_days: Optional[int] = None,
    name: Optional[str] = None,
    db_path: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    with get_conn(db_path) as conn:
        existing = conn.execute("SELECT id FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
        if not existing:
            return None
        if name is not None and name.strip() != "":
            conn.execute("UPDATE sprints SET name = ? WHERE id = ?", (name.strip(), sprint_id))
        if start_date is not None:
            conn.execute("UPDATE sprints SET start_date = ? WHERE id = ?", (start_date, sprint_id))
        if length_days is not None:
            conn.execute("UPDATE sprints SET length_days = ? WHERE id = ?", (length_days, sprint_id))
        if name is not None:
            conn.execute("UPDATE sprints SET name = ? WHERE id = ?", (name, sprint_id))
        row = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
        # L13: the row can vanish mid-update (reset race) — None-safe so the
        # router maps it to 404 instead of TypeErroring into a 500.
        if row is None:
            return None
        return row_to_sprint(row)


SPRINT_STATUSES = ("planned", "active", "closed")

SINGLE_ACTIVE_INDEX_DDL = (
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_sprints_single_active "
    "ON sprints(status) WHERE status = 'active'"
)


def _pick_active_id(rows: List[sqlite3.Row]) -> str:
    """First sprint (in start_date order) whose range contains today, else first."""
    today = date.today().isoformat()
    for r in rows:
        try:
            end = sprint_end_date(r["start_date"], int(r["length_days"]))
        except (ValueError, TypeError):
            continue
        if r["start_date"] <= today <= end:
            return r["id"]
    return rows[0]["id"]


def _ensure_single_active(conn: sqlite3.Connection) -> None:
    """Data migration: converge on exactly one active sprint.

    - Several actives (legacy) -> keep the container-of-today (else first),
      demote the rest to 'planned'.
    - No active -> promote the container-of-today (else first by start_date).
    - Closed sprints are never resurrected; all-closed stays at zero actives.
    """
    rows = conn.execute(
        "SELECT id, start_date, length_days, status FROM sprints ORDER BY start_date ASC"
    ).fetchall()
    if not rows:
        return
    actives = [r for r in rows if r["status"] == "active"]
    if len(actives) > 1:
        keep = _pick_active_id(actives)
        conn.execute(
            "UPDATE sprints SET status = 'planned' WHERE status = 'active' AND id != ?",
            (keep,),
        )
        return
    if len(actives) == 1:
        return
    candidates = [r for r in rows if r["status"] != "closed"]
    if not candidates:
        return
    conn.execute(
        "UPDATE sprints SET status = 'active' WHERE id = ?",
        (_pick_active_id(candidates),),
    )


def _migrate_sprint_status(conn: sqlite3.Connection) -> None:
    """Schema + data migration for the sprint lifecycle (idempotent).

    Pre-status DBs get `sprints.status` via a PRAGMA-guarded ALTER; every DB
    gets the single-active partial unique index and exactly-one-active data.
    """
    cols = [r[1] for r in conn.execute("PRAGMA table_info(sprints)").fetchall()]
    if "status" not in cols:
        conn.execute(
            "ALTER TABLE sprints ADD COLUMN status TEXT NOT NULL DEFAULT 'planned' "
            "CHECK(status IN ('planned', 'active', 'closed'))"
        )
    _ensure_single_active(conn)
    conn.execute(SINGLE_ACTIVE_INDEX_DDL)


def slugify_sprint_id(name: str) -> str:
    """Slugify a sprint name into a URL-safe sprint id (same rules as tags)."""
    return re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-") or "sprint"


def get_sprint(sprint_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with get_conn(db_path) as conn:
        row = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
        return row_to_sprint(row) if row is not None else None


def create_sprint(
    name: str,
    start_date: str,
    length_days: int = 14,
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a planned sprint; id is the slug of the name (409 on duplicate)."""
    sprint_id = slugify_sprint_id(name)
    with get_conn(db_path) as conn:
        try:
            conn.execute(
                "INSERT INTO sprints (id, name, start_date, length_days, status) "
                "VALUES (?, ?, ?, ?, 'planned')",
                (sprint_id, name.strip(), start_date, length_days),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=409, detail=f"Sprint id already exists: {sprint_id}"
            )
        row = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
        return row_to_sprint(row)


def activate_sprint(
    sprint_id: str, db_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Activate a sprint, demoting any other active to 'planned'. 400 if closed."""
    with get_conn(db_path) as conn:
        row = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
        if row is None:
            return None
        if row["status"] == "closed":
            raise HTTPException(status_code=400, detail="Cannot activate a closed sprint")
        if row["status"] != "active":
            conn.execute(
                "UPDATE sprints SET status = 'planned' WHERE status = 'active' AND id != ?",
                (sprint_id,),
            )
            conn.execute("UPDATE sprints SET status = 'active' WHERE id = ?", (sprint_id,))
            row = conn.execute(
                "SELECT * FROM sprints WHERE id = ?", (sprint_id,)
            ).fetchone()
        return row_to_sprint(row)


def close_sprint(
    sprint_id: str,
    rollover_to: Optional[str] = None,
    db_path: Optional[str] = None,
    actor: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Close a sprint.

    Unfinished tasks (status != 'done') move to the `rollover_to` sprint
    (must exist and not be closed, 400 otherwise) keeping their status, or
    drop to status='backlog' when no target is given. Returns
    {closed, moved, to}.

    Activity: each moved task gets a post-commit 'rollover' entry (or a
    status entry when dropping to backlog). Logging is guarded and never
    breaks the close; actor is the JWT user dict (None -> 'System').
    """
    target = rollover_to.strip() if isinstance(rollover_to, str) else None
    if not target:
        target = None
    moved: List[tuple] = []
    with get_conn(db_path) as conn:
        row = conn.execute("SELECT id FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
        if row is None:
            return None
        if target is not None:
            dest = conn.execute(
                "SELECT status FROM sprints WHERE id = ?", (target,)
            ).fetchone()
            if dest is None:
                raise HTTPException(
                    status_code=400, detail=f"Unknown rollover sprint: {target}"
                )
            if target == sprint_id or dest["status"] == "closed":
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot roll over to closed sprint: {target}",
                )
        unfinished = conn.execute(
            "SELECT id, status FROM tasks WHERE sprint = ? AND status != 'done'", (sprint_id,)
        ).fetchall()
        if target is not None:
            conn.execute(
                "UPDATE tasks SET sprint = ? WHERE sprint = ? AND status != 'done'",
                (target, sprint_id),
            )
        else:
            conn.execute(
                "UPDATE tasks SET status = 'backlog' WHERE sprint = ? AND status != 'done'",
                (sprint_id,),
            )
        conn.execute("UPDATE sprints SET status = 'closed' WHERE id = ?", (sprint_id,))
        moved = [(r["id"], r["status"]) for r in unfinished]
        result = {"closed": sprint_id, "moved": len(unfinished), "to": target}
    # Post-commit trail entries (guarded inside log_activity_many).
    if target is not None:
        log_activity_many(
            [
                {
                    "task_id": task_id,
                    "actor": actor,
                    "action": ACTIVITY_ACTION_ROLLOVER,
                    "field": "sprint",
                    "old_value": sprint_id,
                    "new_value": target,
                }
                for task_id, _old_status in moved
            ],
            db_path=db_path,
        )
    else:
        log_activity_many(
            [
                {
                    "task_id": task_id,
                    "actor": actor,
                    "action": ACTIVITY_ACTION_UPDATED,
                    "field": "status",
                    "old_value": old_status,
                    "new_value": "backlog",
                }
                for task_id, old_status in moved
            ],
            db_path=db_path,
        )
    return result


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
        # L1: escape LIKE wildcards so a literal %/_ in the query matches
        # only itself (params were always bound — never injectable — but an
        # unescaped % over-matched, e.g. search "%" returned every task).
        escaped = (
            search.strip()
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        like = f"%{escaped}%"
        clauses.append(
            "(t.id LIKE ? ESCAPE '\\' OR t.title LIKE ? ESCAPE '\\' "
            "OR t.description LIKE ? ESCAPE '\\' "
            "OR EXISTS (SELECT 1 FROM task_tags tt JOIN tags g ON g.id = tt.tag_id "
            "WHERE tt.task_id = t.id AND g.name LIKE ? ESCAPE '\\'))"
        )
        params.extend([like, like, like, like])

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"""SELECT t.* FROM tasks t
              {where} ORDER BY t.updated_at DESC, t.rowid DESC"""
    with get_conn(db_path) as conn:
        rows = conn.execute(sql, params).fetchall()
        task_ids = [r["id"] for r in rows]
        assignee_map = assignees_by_task(conn, task_ids)
        tag_map = tags_by_task(conn, task_ids)
        return [
            row_to_task(r, assignee_map.get(r["id"], []), tag_map.get(r["id"], []))
            for r in rows
        ]


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


TASK_TAGS_SQL = """
    SELECT tt.task_id, g.name AS tag_name
    FROM task_tags tt
    JOIN tags g ON g.id = tt.tag_id
"""


def tags_by_task(
    conn: sqlite3.Connection, task_ids: List[str]
) -> Dict[str, List[str]]:
    """Batch-fetch canonical tag names for many tasks (JOIN query, chunked).

    Names sort NOCASE for a deterministic response order. Mirrors
    assignees_by_task (dangling links are impossible: both FKs CASCADE).
    """
    out: Dict[str, List[str]] = {tid: [] for tid in task_ids}
    if not task_ids:
        return out
    unique: List[str] = list(dict.fromkeys(task_ids))
    for start in range(0, len(unique), _ASSIGNEE_LOOKUP_CHUNK):
        batch = unique[start:start + _ASSIGNEE_LOOKUP_CHUNK]
        placeholders = ",".join("?" for _ in batch)
        rows = conn.execute(
            TASK_TAGS_SQL
            + f" WHERE tt.task_id IN ({placeholders})"
            + " ORDER BY g.name COLLATE NOCASE ASC",
            batch,
        ).fetchall()
        for r in rows:
            out.setdefault(r["task_id"], []).append(str(r["tag_name"]))
    return out


def tags_for_task(conn: sqlite3.Connection, task_id: str) -> List[str]:
    """Canonical tag names for a single task (sorted, [] when none)."""
    return tags_by_task(conn, [task_id]).get(task_id, [])


def set_task_tags(
    conn: sqlite3.Connection, task_id: str, canonical_names: List[str]
) -> None:
    """Replace a task's join-table tag rows (full replacement).

    Names must already be canonical (see validate_tags); the lookup resolves
    them to tag ids for storage.
    """
    conn.execute("DELETE FROM task_tags WHERE task_id = ?", (task_id,))
    for name in canonical_names:
        row = conn.execute(
            "SELECT id FROM tags WHERE name = ? COLLATE NOCASE", (name,)
        ).fetchone()
        if row is not None:
            conn.execute(
                "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
                (task_id, row["id"]),
            )


# ---------- per-task activity trail ----------

# Actions stored in task_activity.action. 'updated' always carries a field;
# 'rollover' carries field='sprint'; 'created'/'deleted' carry field=NULL.
ACTIVITY_ACTION_CREATED = "created"
ACTIVITY_ACTION_UPDATED = "updated"
ACTIVITY_ACTION_ROLLOVER = "rollover"
ACTIVITY_ACTION_DELETED = "deleted"

# Task-dict fields diffed for the trail (PUT /tasks/{id}). Only fields whose
# value actually changed produce rows — unchanged fields log nothing.
ACTIVITY_TRACKED_FIELDS = (
    "title", "description", "status", "priority", "sprint",
    "points", "dueDate", "assignees", "tags",
)


def _actor_triplet(actor: Optional[Dict[str, Any]]) -> tuple:
    """(actor_id, actor_name, actor_email) from a JWT user dict (or System)."""
    if not actor:
        return (None, "System", "")
    return (
        actor.get("id"),
        str(actor.get("name") or ""),
        str(actor.get("email") or ""),
    )


def _assignee_sort_key(entry: Dict[str, Any]) -> tuple:
    return (str(entry.get("type") or ""), str(entry.get("id") or ""))


def _assignee_names(assignees: Any) -> List[str]:
    """Deterministic display-name snapshot for an assignees array."""
    if not isinstance(assignees, list):
        return []
    names = [
        str(a.get("name") or a.get("id") or "?")
        for a in sorted(
            (a for a in assignees if isinstance(a, dict)),
            key=_assignee_sort_key,
        )
    ]
    return names


def _activity_store_value(field: str, value: Any) -> Optional[str]:
    """Stored old/new string for a tracked field (JSON for list fields)."""
    if field == "assignees":
        return json.dumps(_assignee_names(value))
    if field == "tags":
        items = sorted(str(v) for v in value) if isinstance(value, list) else []
        return json.dumps(items)
    if value is None:
        return None
    return str(value)


def _activity_compare_key(field: str, value: Any) -> Any:
    """Equality key for diffing (identity-based for assignees/tags)."""
    if field == "assignees" and isinstance(value, list):
        return sorted(
            (str(a.get("type") or ""), str(a.get("id") or ""))
            for a in value
            if isinstance(a, dict)
        )
    if field == "tags" and isinstance(value, list):
        return sorted(str(v) for v in value)
    if field == "points":
        try:
            return int(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return value
    if isinstance(value, str):
        return value.strip()
    return value


def diff_tasks(
    before: Dict[str, Any], after: Dict[str, Any]
) -> List[tuple]:
    """Field diffs between two task dicts: [(field, old, new), ...].

    Only ACTIVITY_TRACKED_FIELDS are compared and only changed fields are
    returned; old/new are the stored string forms (JSON for list fields).
    """
    diffs: List[tuple] = []
    for field in ACTIVITY_TRACKED_FIELDS:
        old_raw = before.get(field)
        new_raw = after.get(field)
        if _activity_compare_key(field, old_raw) != _activity_compare_key(field, new_raw):
            diffs.append(
                (
                    field,
                    _activity_store_value(field, old_raw),
                    _activity_store_value(field, new_raw),
                )
            )
    return diffs


def log_activity(
    task_id: str,
    *,
    actor: Optional[Dict[str, Any]] = None,
    action: str,
    field: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    db_path: Optional[str] = None,
) -> None:
    """Log one activity entry for a task. The single reusable helper.

    Opens its own connection and MUST be called only after the caller's
    mutation has committed — logging never participates in (and therefore
    can never roll back or break) the task mutation itself. Never raises:
    any failure is swallowed with a warning so a logging outage degrades
    to a missing trail entry, not a failed request. Actor comes from the
    JWT user dict (id/name/email); None renders as 'System'.
    """
    log_activity_many(
        [
            {
                "task_id": task_id,
                "actor": actor,
                "action": action,
                "field": field,
                "old_value": old_value,
                "new_value": new_value,
            }
        ],
        db_path=db_path,
    )


def log_activity_many(entries: List[Dict[str, Any]], db_path: Optional[str] = None) -> None:
    """Batch variant of log_activity (one connection, same never-raise guard)."""
    if not entries:
        return
    try:
        with get_conn(db_path) as conn:
            conn.executescript(TASK_ACTIVITY_DDL)
            for entry in entries:
                actor_id, actor_name, actor_email = _actor_triplet(entry.get("actor"))
                conn.execute(
                    """
                    INSERT INTO task_activity
                        (task_id, actor_id, actor_name, actor_email,
                         action, field, old_value, new_value)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        entry.get("task_id"),
                        actor_id,
                        actor_name,
                        actor_email,
                        entry.get("action"),
                        entry.get("field"),
                        entry.get("old_value"),
                        entry.get("new_value"),
                    ),
                )
    except Exception:
        logger.warning("task_activity logging failed; mutation result kept", exc_info=True)


def list_task_activity(
    task_id: str, db_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    """A task's activity trail, newest first. Never 404s: legacy tasks and
    unknown ids simply return [] (no fabricated backfill)."""
    with get_conn(db_path) as conn:
        conn.executescript(TASK_ACTIVITY_DDL)
        rows = conn.execute(
            """
            SELECT id, task_id, actor_id, actor_name, actor_email,
                   action, field, old_value, new_value, created_at
            FROM task_activity
            WHERE task_id = ?
            ORDER BY id DESC
            """,
            (task_id,),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "taskId": r["task_id"],
                "actorId": r["actor_id"],
                "actor": r["actor_name"],
                "actorEmail": r["actor_email"],
                "action": r["action"],
                "field": r["field"],
                "oldValue": r["old_value"],
                "newValue": r["new_value"],
                "createdAt": r["created_at"],
            }
            for r in rows
        ]
