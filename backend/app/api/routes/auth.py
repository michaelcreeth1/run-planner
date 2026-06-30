from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.auth import AuthContext, require_admin_user, require_current_context
from app.core.config import settings
from app.core.session import (
    COOKIE_NAME,
    create_oauth_state,
    create_session_token,
    verify_oauth_state,
    verify_session_token,
)
from app.db.session import get_db
from app.models.planning import AthleteAccount, UserAccount
from app.schemas.session import (
    AthleteProfile,
    LoginRequest,
    ProfileCreate,
    ProfileSwitchRequest,
    SessionStatus,
    SessionUser,
    UserCreate,
)
from app.schemas.strava import StravaConnectionStatus
from app.services import accounts, strava

router = APIRouter(tags=["auth"])
DbSession = Annotated[Session, Depends(get_db)]


def set_session_cookie(response: Response, user_id: str, athlete_account_id: str) -> None:
    token = create_session_token(user_id, athlete_account_id)
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        max_age=settings.session_ttl_seconds,
    )


def user_to_read(user: UserAccount) -> SessionUser:
    return SessionUser(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        is_admin=bool(user.is_admin),
    )


def profile_to_read(profile: AthleteAccount) -> AthleteProfile:
    return AthleteProfile(
        id=profile.id,
        display_name=profile.display_name,
        timezone=profile.timezone,
        strava_athlete_id=profile.strava_athlete_id,
    )


def session_status_for(
    db: Session,
    user: UserAccount | None = None,
    active_athlete_account_id: str | None = None,
) -> SessionStatus:
    profiles = accounts.profiles_for_user(db, user.id) if user else []
    return SessionStatus(
        authenticated=user is not None,
        configured=accounts.auth_configured(db),
        username=user.username if user else None,
        user=user_to_read(user) if user else None,
        active_athlete_account_id=active_athlete_account_id,
        profiles=[profile_to_read(profile) for profile in profiles],
    )


@router.get("/session/status", response_model=SessionStatus)
def session_status(request: Request, db: DbSession) -> SessionStatus:
    identity = verify_session_token(request.cookies.get(COOKIE_NAME))
    if not identity:
        return session_status_for(db)

    user = db.get(UserAccount, identity.user_id)
    if not user or user.is_disabled:
        return session_status_for(db)
    try:
        accounts.require_owned_profile(db, user.id, identity.athlete_account_id)
    except HTTPException:
        return session_status_for(db)
    return session_status_for(db, user, identity.athlete_account_id)


@router.post("/session/login", response_model=SessionStatus)
def session_login(payload: LoginRequest, response: Response, db: DbSession) -> SessionStatus:
    accounts.ensure_bootstrap_admin(db)
    if not accounts.auth_configured(db):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local app users are not configured.",
        )

    user = accounts.get_user_by_username(db, payload.username)
    if not user or user.is_disabled:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")
    if not accounts.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    profile = accounts.ensure_user_profile(db, user)
    set_session_cookie(response, user.id, profile.id)
    return session_status_for(db, user, profile.id)


@router.post("/session/logout", response_model=SessionStatus)
def session_logout(response: Response, db: DbSession) -> SessionStatus:
    response.delete_cookie(COOKIE_NAME)
    return session_status_for(db)


@router.post("/session/profile", response_model=SessionStatus)
def session_profile(
    payload: ProfileSwitchRequest,
    response: Response,
    context: Annotated[AuthContext, Depends(require_current_context)],
    db: DbSession,
) -> SessionStatus:
    profile = accounts.require_owned_profile(db, context.user.id, payload.athlete_account_id)
    set_session_cookie(response, context.user.id, profile.id)
    return session_status_for(db, context.user, profile.id)


@router.post("/users", response_model=SessionUser, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    _admin: Annotated[UserAccount, Depends(require_admin_user)],
    db: DbSession,
) -> SessionUser:
    user = accounts.create_user(
        db,
        username=payload.username,
        display_name=payload.display_name,
        password=payload.password,
        is_admin=payload.is_admin,
        initial_profile_name=payload.initial_profile_name,
        timezone=payload.timezone,
    )
    return user_to_read(user)


@router.post("/profiles", response_model=AthleteProfile, status_code=status.HTTP_201_CREATED)
def create_profile(
    payload: ProfileCreate,
    context: Annotated[AuthContext, Depends(require_current_context)],
    db: DbSession,
) -> AthleteProfile:
    profile = accounts.create_profile(
        db,
        context.user.id,
        display_name=payload.display_name,
        timezone=payload.timezone,
    )
    return profile_to_read(profile)


@router.get("/strava/status", response_model=StravaConnectionStatus)
def strava_status(
    context: Annotated[AuthContext, Depends(require_current_context)],
    db: DbSession,
) -> dict:
    return strava.connection_status(db, context.athlete.id)


@router.get("/strava/start")
def strava_start(
    context: Annotated[AuthContext, Depends(require_current_context)],
) -> RedirectResponse:
    state = create_oauth_state(context.user.id, context.athlete.id)
    return RedirectResponse(strava.authorization_url(state))


@router.get("/strava/callback")
def strava_callback(
    db: DbSession,
    code: str | None = None,
    scope: str = "",
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    if error:
        return RedirectResponse(f"{settings.app_base_url}/?strava=denied")
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Strava code.")
    verified_state = verify_oauth_state(state)
    if not verified_state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Strava state.")
    user_id, athlete_account_id = verified_state
    accounts.require_owned_profile(db, user_id, athlete_account_id)
    strava.exchange_code(db, athlete_account_id, code, scope)
    return RedirectResponse(f"{settings.app_base_url}/?strava=connected")


@router.post("/strava/disconnect")
def strava_disconnect(
    context: Annotated[AuthContext, Depends(require_current_context)],
    db: DbSession,
) -> dict[str, str]:
    strava.disconnect(db, context.athlete.id)
    return {"status": "not_connected"}
