from fastapi import APIRouter

from app.db.session import check_database_ready

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
def readyz() -> dict[str, str]:
    check_database_ready()
    return {"status": "ready"}
