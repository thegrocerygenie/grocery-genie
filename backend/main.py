from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    auth as auth_routes,
)
from app.api.routes import (
    budgets,
    categories,
    dashboard,
    health,
    notifications,
    receipts,
)
from app.api.routes import (
    users as users_routes,
)
from app.core.dependencies import engine
from app.core.rate_limit import RateLimitMiddleware


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="Grocery Genie API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten for production
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
