"""Auth endpoints: login + current-user. Public (no auth required)."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import auth

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginPayload(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(payload: LoginPayload) -> Dict[str, Any]:
    user = auth.get_user_by_email(payload.email)
    if user is None or not auth.verify_password(payload.password, user["password_hash"]):
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
