import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    analytics,
    budgets,
    categories,
    dashboard,
    health,
    notifications,
    receipts,
)
from app.api.routes import (
    auth as auth_routes,
)
from app.api.routes import (
    users as users_routes,
)
from app.core.config import get_settings
from app.core.dependencies import async_session_factory, engine
from app.core.rate_limit import RateLimitMiddleware
from app.core.seed import seed_default_categories
from app.events.wiring import register_handlers

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup — fail fast on insecure production config (C3).
    errors = settings.production_safety_errors()
    if errors:
        raise RuntimeError(
            "Refusing to start with insecure configuration:\n  - "
            + "\n  - ".join(errors)
        )

    # Register domain event handlers so the dispatcher is live (H5).
    register_handlers()

    # Seed the default categories so a fresh database can categorize
    # extracted line items on first boot (C2).
    async with async_session_factory() as session:
        await seed_default_categories(session)

    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="Grocery Genie API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — wildcard only in debug; production must enumerate origins (and a
# wildcard with credentials is rejected by browsers anyway).
_cors_origins = ["*"] if settings.debug else settings.cors_origins
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth_routes.router)
app.include_router(users_routes.router)
app.include_router(receipts.router)
app.include_router(budgets.router)
app.include_router(dashboard.router)
app.include_router(categories.router)
app.include_router(notifications.router)
app.include_router(analytics.router)
