"""Authentication + RBAC for the SprintFlow API.

Seeded admin (dev): admin@sprintflow.local / Admin123!  (see db.seed_users)
"""
from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import db

logger = logging.getLogger("sprintflow.auth")

JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 12
_DEV_SECRET = "sprintflow-dev-secret-change-me-in-prod-please"


def get_jwt_secret() -> str:
    secret = os.environ.get("SPRINTFLOW_JWT_SECRET")
    if not secret:
        logger.warning(
            "SPRINTFLOW_JWT_SECRET not set — using insecure dev default JWT secret"
        )
        return _DEV_SECRET
    return secret


ALL_PERMISSIONS = [
    "tasks.view",
    "tasks.create",
    "tasks.edit",
    "tasks.delete",
    "sprints.view",
    "sprints.manage",
    "team.view",
    "team.manage",
    "data.export",
    "data.import",
    "data.reset",
]

ROLE_PERMISSIONS: Dict[str, List[str]] = {
    "admin": list(ALL_PERMISSIONS),
    "lead": [p for p in ALL_PERMISSIONS if p not in ("data.reset", "team.manage")],
    "member": ["tasks.view", "tasks.create", "tasks.edit", "sprints.view", "data.export"],
    "viewer": ["tasks.view", "sprints.view"],
}

VALID_ROLES = tuple(ROLE_PERMISSIONS.keys())


# ---------- password hashing ----------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ---------- user store ----------

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT id, email, name, password_hash, role, created_at FROM users WHERE email = ?",
            (email.strip().lower(),),
        ).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT id, email, name, password_hash, role, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None


def create_user(email: str, name: str, password: str, role: str) -> Dict[str, Any]:
    if role not in ROLE_PERMISSIONS:
        raise ValueError(f"Invalid role: {role}")
    with db.get_conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)",
                (email.strip().lower(), name.strip(), hash_password(password), role),
            )
        except sqlite3.IntegrityError:
            raise ValueError("Email already registered")
        row = conn.execute(
            "SELECT id, email, name, password_hash, role, created_at FROM users WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
        return dict(row)


def list_users() -> List[Dict[str, Any]]:
    """Public-shaped user rows (no password hashes), oldest first."""
    with db.get_conn() as conn:
        rows = conn.execute(
            "SELECT id, email, name, role, created_at FROM users ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]


def delete_user(user_id: int) -> bool:
    with db.get_conn() as conn:
        cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        return cur.rowcount > 0


def update_user(
    user_id: int,
    name: Optional[str] = None,
    email: Optional[str] = None,
    password: Optional[str] = None,
    role: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Partial update; returns the updated row or None when missing."""
    if role is not None and role not in ROLE_PERMISSIONS:
        raise ValueError(f"Invalid role: {role}")
    sets: List[str] = []
    params: List[Any] = []
    if name is not None:
        sets.append("name = ?")
        params.append(name.strip())
    if email is not None:
        sets.append("email = ?")
        params.append(email.strip().lower())
    if password is not None:
        sets.append("password_hash = ?")
        params.append(hash_password(password))
    if role is not None:
        sets.append("role = ?")
        params.append(role)
    if not sets:
        return get_user_by_id(user_id)
    params.append(user_id)
    with db.get_conn() as conn:
        try:
            cur = conn.execute(
                f"UPDATE users SET {', '.join(sets)} WHERE id = ?", params
            )
        except sqlite3.IntegrityError:
            raise ValueError("Email already registered")
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT id, email, name, password_hash, role, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None


def permissions_for(role: str) -> List[str]:
    return list(ROLE_PERMISSIONS.get(role, []))


def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


# ---------- JWT ----------

def create_access_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_EXPIRY_HOURS)).timestamp()),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )


# ---------- FastAPI dependencies ----------

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Dict[str, Any]:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(credentials.credentials)
    try:
        user_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    return user


def require_permissions(*perms: str):
    def dependency(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        granted = set(permissions_for(user["role"]))
        missing = [p for p in perms if p not in granted]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permissions: {', '.join(missing)}",
            )
        return user

    return dependency
