from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.session import COOKIE_NAME, verify_session_token
from app.db.session import get_db
from app.models.planning import AthleteAccount, UserAccount
from app.services import accounts


@dataclass(frozen=True)
class AuthContext:
    user: UserAccount
    athlete: AthleteAccount


DbSession = Annotated[Session, Depends(get_db)]


def require_current_context(request: Request, db: DbSession) -> AuthContext:
    identity = verify_session_token(request.cookies.get(COOKIE_NAME))
    if not identity:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")

    user = db.get(UserAccount, identity.user_id)
    if not user or user.is_disabled:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")

    athlete = accounts.require_owned_profile(db, user.id, identity.athlete_account_id)
    return AuthContext(user=user, athlete=athlete)


def require_current_user(context: Annotated[AuthContext, Depends(require_current_context)]):
    return context.user


def require_current_profile(context: Annotated[AuthContext, Depends(require_current_context)]):
    return context.athlete


def require_admin_user(context: Annotated[AuthContext, Depends(require_current_context)]):
    if not context.user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return context.user
