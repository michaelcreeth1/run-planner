from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(tags=["version"])


@router.get("/version")
def version() -> dict[str, str | bool]:
    return {
        "frontendMinVersion": settings.frontend_min_version,
        "backendVersion": settings.backend_version,
        "schemaVersion": settings.schema_version,
        "forceReload": settings.force_reload,
    }
