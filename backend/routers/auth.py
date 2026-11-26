"""Auth endpoints: login + current-user. Public (no auth required)."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

import auth
import ratelimit

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginPayload(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(payload: LoginPayload, request: Request) -> Dict[str, Any]:
    # H2: throttle BEFORE bcrypt so guessing cannot burn CPU unauthenticated.
    client_ip = request.client.host if request.client else "unknown"
    bucket_key = ratelimit.key_for(client_ip, payload.email)
    allowed, retry_after = ratelimit.is_allowed(bucket_key)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts, try again later",
            headers={"Retry-After": ratelimit.retry_after_header(retry_after)},
        )
    user = auth.get_user_by_email(payload.email)
    # M2: on unknown email still run a full bcrypt verify against the dummy
    # hash so the 401 latency matches known-email wrong-password (no oracle).
    # Computed BEFORE the branch: `user is None or ...` would short-circuit.
    password_hash = user["password_hash"] if user else auth.DUMMY_PASSWORD_HASH
    password_ok = auth.verify_password(payload.password, password_hash)
    if user is None or not password_ok:
        ratelimit.record_failure(bucket_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    return {
        "access_token": auth.create_access_token(user["id"], user["role"]),
        "token_type": "bearer",
        "user": auth.public_user(user),
    }


@router.get("/me")
def me(user: Dict[str, Any] = Depends(auth.get_current_user)) -> Dict[str, Any]:
    return {**auth.public_user(user), "permissions": auth.permissions_for(user["role"])}


class CreateUserPayload(BaseModel):
    email: str
    name: str
    password: str
    role: str


class UpdateUserPayload(BaseModel):
    email: str | None = None
    name: str | None = None
    password: str | None = None
    role: str | None = None


def _admin() -> Any:
    # User administration rides on team.manage, which only the admin role holds.
    return Depends(auth.require_permissions("team.manage"))


@router.get("/users")
def list_users(_: Dict[str, Any] = _admin()) -> Any:
    return auth.list_users()


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user_route(
    payload: CreateUserPayload, _: Dict[str, Any] = _admin()
) -> Dict[str, Any]:
    if len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters",
        )
    try:
        user = auth.create_user(
            payload.email, payload.name, payload.password, payload.role
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        )
    return auth.public_user(user)


@router.delete("/users/{user_id}")
def delete_user_route(
    user_id: int, me: Dict[str, Any] = Depends(auth.require_permissions("team.manage"))
) -> Dict[str, Any]:
    if me["id"] == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )
    if not auth.delete_user(user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return {"deleted": user_id}


@router.put("/users/{user_id}")
def update_user_route(
    user_id: int,
    payload: UpdateUserPayload,
    me: Dict[str, Any] = Depends(auth.require_permissions("team.manage")),
) -> Dict[str, Any]:
    if payload.password is not None and len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters",
        )
    if me["id"] == user_id and payload.role is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role",
        )
    try:
        updated = auth.update_user(
            user_id,
            name=payload.name,
            email=payload.email,
            password=payload.password,
            role=payload.role,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        )
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return auth.public_user(updated)
