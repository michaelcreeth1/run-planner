from fastapi import APIRouter

from app.core.config import settings
from app.db.migrations import applied_schema_version

router = APIRouter(tags=["version"])


@router.get("/version")
def version() -> dict[str, str | bool]:
    return {
        "frontendMinVersion": settings.frontend_min_version,
        "backendVersion": settings.backend_version,
        "schemaVersion": applied_schema_version(),
        "forceReload": settings.force_reload,
    }
