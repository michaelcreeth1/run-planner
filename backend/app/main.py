from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import activities, ai, auth, health, planning, sync, version, webhooks
from app.core.config import settings
from app.db.migrations import run_migrations
from app.db.session import SessionLocal
from app.services import accounts


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    run_migrations()
    with SessionLocal() as db:
        accounts.ensure_bootstrap_admin(db)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Running Planner API",
        version=settings.backend_version,
        docs_url="/api/docs" if settings.app_env != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(version.router, prefix="/api")
    app.include_router(auth.router, prefix="/api/auth")
    app.include_router(sync.router, prefix="/api/sync")
    app.include_router(webhooks.router, prefix="/api/webhooks")
    app.include_router(ai.router, prefix="/api/ai")
    app.include_router(activities.router, prefix="/api")
    app.include_router(planning.router, prefix="/api")
    return app


app = create_app()
