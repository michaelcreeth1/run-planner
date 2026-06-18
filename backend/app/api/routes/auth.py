import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.session import COOKIE_NAME, create_session_token, verify_session_token
from app.db.session import get_db
from app.schemas.session import LoginRequest, SessionStatus
from app.schemas.strava import StravaConnectionStatus
from app.services import strava

router = APIRouter(tags=["auth"])
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/session/status", response_model=SessionStatus)
def session_status(request: Request) -> SessionStatus:
    username = verify_session_token(request.cookies.get(COOKIE_NAME))
    return SessionStatus(
        authenticated=username is not None,
        configured=bool(settings.app_password),
        username=username,
    )


@router.post("/session/login", response_model=SessionStatus)
def session_login(payload: LoginRequest, response: Response) -> SessionStatus:
    if not settings.app_password:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local app password is not configured.",
        )

    username_ok = secrets.compare_digest(payload.username, settings.app_username)
    password_ok = secrets.compare_digest(payload.password, settings.app_password)
    if not (username_ok and password_ok):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    token = create_session_token(payload.username)
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        max_age=settings.session_ttl_seconds,
    )
    return SessionStatus(authenticated=True, configured=True, username=payload.username)


@router.post("/session/logout", response_model=SessionStatus)
def session_logout(response: Response) -> SessionStatus:
    response.delete_cookie(COOKIE_NAME)
    return SessionStatus(authenticated=False, configured=bool(settings.app_password), username=None)


@router.get("/strava/status", response_model=StravaConnectionStatus)
def strava_status(db: DbSession) -> dict:
    return strava.connection_status(db)


@router.get("/strava/start")
def strava_start() -> RedirectResponse:
    return RedirectResponse(strava.authorization_url())


@router.get("/strava/callback")
def strava_callback(
    db: DbSession,
    code: str | None = None,
    scope: str = "",
    error: str | None = None,
) -> RedirectResponse:
    if error:
        return RedirectResponse(f"{settings.app_base_url}/?strava=denied")
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Strava code.")
    strava.exchange_code(db, code, scope)
    return RedirectResponse(f"{settings.app_base_url}/?strava=connected")


@router.post("/strava/disconnect")
def strava_disconnect(db: DbSession) -> dict[str, str]:
    strava.disconnect(db)
    return {"status": "not_connected"}
