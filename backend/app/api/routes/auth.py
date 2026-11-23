import uuid
from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func
from sqlalchemy.future import select

from app.api import deps
from app.core import security, rate_limit
from app.services import account_checks, mailer
from app.core.config import settings
from app.models import User
from app.schemas import UserCreate, UserResponse, Token, VerifyEmailRequest, ResendVerificationRequest

router = APIRouter()

@router.post("/register", response_model=UserResponse)
async def register(
    request: Request, user_in: UserCreate, db: AsyncSession = Depends(deps.get_db)
) -> Any:
    rate_limit.check(f"register:{rate_limit.client_ip(request)}", limit=10, window_seconds=3600)
    try:
        email = (await account_checks.check_email(user_in.email, check_dns=settings.CHECK_EMAIL_DNS)).lower()
        account_checks.check_password(user_in.password, email)
    except account_checks.AccountCheckError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    result = await db.execute(select(User).where(func.lower(User.email) == email))
    if result.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists. Try signing in instead.",
        )
    user = User(
        email=email,
        hashed_password=security.get_password_hash(user_in.password),
        email_verified=not settings.verification_required,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    if settings.verification_required:
        await mailer.send_verification_email(user.email, _verify_token(user))
    return user


def _verify_token(user: User) -> str:
    return security.create_purpose_token(str(user.id), "verify-email", timedelta(hours=24))


@router.post("/verify-email")
async def verify_email(body: VerifyEmailRequest, db: AsyncSession = Depends(deps.get_db)) -> Any:
    user_id = security.read_purpose_token(body.token, "verify-email")
    if not user_id:
        raise HTTPException(status_code=400, detail="This confirmation link is invalid or has expired. Request a new one.")
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="This confirmation link is invalid.")
    user = (await db.execute(select(User).where(User.id == uid))).scalars().first()
    if not user:
        raise HTTPException(status_code=400, detail="This confirmation link is invalid.")
    if not user.email_verified:
        user.email_verified = True
        await db.commit()
    return {"verified": True, "email": user.email}


@router.post("/resend-verification")
async def resend_verification(
    request: Request, body: ResendVerificationRequest, db: AsyncSession = Depends(deps.get_db)
) -> Any:
    email = body.email.strip().lower()
    rate_limit.check(f"resend-ip:{rate_limit.client_ip(request)}", limit=10, window_seconds=3600)
    rate_limit.check(f"resend-acct:{email}", limit=3, window_seconds=3600)
    user = (await db.execute(select(User).where(func.lower(User.email) == email))).scalars().first()
    if user and not user.email_verified and settings.verification_required:
        await mailer.send_verification_email(user.email, _verify_token(user))
    # same answer either way, so this can't be used to discover who has an account
    return {"sent": True}

@router.post("/login", response_model=Token)
async def login_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: AsyncSession = Depends(deps.get_db)
) -> Any:
    ip = rate_limit.client_ip(request)
    rate_limit.check(f"login-ip:{ip}", limit=30, window_seconds=300)
    rate_limit.check(f"login-acct:{form_data.username.lower()}", limit=10, window_seconds=300)
    result = await db.execute(select(User).where(func.lower(User.email) == form_data.username.strip().lower()))
    user = result.scalars().first()
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    elif settings.verification_required and not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail="Please confirm your email first. We sent a link to your inbox.",
            headers={"X-Error-Code": "email_not_verified"},
        )
        
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
    }

@router.get("/me", response_model=UserResponse)
async def read_users_me(
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    return current_user
