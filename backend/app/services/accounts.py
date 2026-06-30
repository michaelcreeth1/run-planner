import base64
import hashlib
import hmac
import os
from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.planning import AthleteAccount, UserAccount

PASSWORD_ITERATIONS = 210_000
PASSWORD_SCHEME = "pbkdf2_sha256"


def normalize_username(username: str) -> str:
    return username.strip().lower()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt,
        PASSWORD_ITERATIONS,
    )
    salt_value = base64.urlsafe_b64encode(salt).decode()
    digest_value = base64.urlsafe_b64encode(digest).decode()
    return f"{PASSWORD_SCHEME}${PASSWORD_ITERATIONS}${salt_value}${digest_value}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        scheme, iterations_raw, salt_value, digest_value = password_hash.split("$", 3)
        if scheme != PASSWORD_SCHEME:
            return False
        salt = base64.urlsafe_b64decode(salt_value.encode())
        expected = base64.urlsafe_b64decode(digest_value.encode())
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            salt,
            int(iterations_raw),
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def auth_configured(db: Session) -> bool:
    return db.scalar(select(func.count(UserAccount.id))) > 0 or bool(settings.app_password)


def ensure_bootstrap_admin(db: Session) -> UserAccount | None:
    existing = db.scalars(select(UserAccount).limit(1)).first()
    if existing:
        return existing
    if not settings.app_password:
        return None

    admin = UserAccount(
        username=normalize_username(settings.app_username),
        display_name=settings.app_username,
        password_hash=hash_password(settings.app_password),
        is_admin=1,
    )
    db.add(admin)
    db.flush()

    athletes = list(db.scalars(select(AthleteAccount)).all())
    if athletes:
        for athlete in athletes:
            athlete.owner_user_id = admin.id
    else:
        db.add(
            AthleteAccount(
                owner_user_id=admin.id,
                display_name=settings.app_username,
                timezone="America/Denver",
            )
        )
    db.commit()
    db.refresh(admin)
    return admin


def get_user_by_username(db: Session, username: str) -> UserAccount | None:
    return db.scalars(
        select(UserAccount).where(UserAccount.username == normalize_username(username))
    ).first()


def create_user(
    db: Session,
    *,
    username: str,
    display_name: str,
    password: str,
    is_admin: bool = False,
    initial_profile_name: str | None = None,
    timezone: str = "America/Denver",
) -> UserAccount:
    normalized = normalize_username(username)
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is required.")
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters.",
        )
    if get_user_by_username(db, normalized):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.")

    user = UserAccount(
        username=normalized,
        display_name=display_name.strip() or normalized,
        password_hash=hash_password(password),
        is_admin=1 if is_admin else 0,
    )
    db.add(user)
    db.flush()
    create_profile(
        db,
        user.id,
        display_name=initial_profile_name or user.display_name,
        timezone=timezone,
        commit=False,
    )
    db.commit()
    db.refresh(user)
    return user


def create_profile(
    db: Session,
    owner_user_id: str,
    *,
    display_name: str,
    timezone: str = "America/Denver",
    commit: bool = True,
) -> AthleteAccount:
    profile = AthleteAccount(
        owner_user_id=owner_user_id,
        display_name=display_name.strip() or "Runner",
        timezone=timezone.strip() or "America/Denver",
    )
    db.add(profile)
    if commit:
        db.commit()
        db.refresh(profile)
    return profile


def profiles_for_user(db: Session, user_id: str) -> list[AthleteAccount]:
    return list(
        db.scalars(
            select(AthleteAccount)
            .where(AthleteAccount.owner_user_id == user_id)
            .order_by(AthleteAccount.created_at, AthleteAccount.display_name)
        )
    )


def ensure_user_profile(db: Session, user: UserAccount) -> AthleteAccount:
    profile = profiles_for_user(db, user.id)[0] if profiles_for_user(db, user.id) else None
    if profile:
        return profile
    return create_profile(db, user.id, display_name=user.display_name)


def require_owned_profile(db: Session, user_id: str, athlete_account_id: str) -> AthleteAccount:
    profile = db.scalars(
        select(AthleteAccount).where(
            AthleteAccount.id == athlete_account_id,
            AthleteAccount.owner_user_id == user_id,
        )
    ).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    return profile


def connected_profiles(db: Session, athlete_ids: Iterable[str]) -> list[AthleteAccount]:
    ids = list(athlete_ids)
    if not ids:
        return []
    return list(db.scalars(select(AthleteAccount).where(AthleteAccount.id.in_(ids))).all())
