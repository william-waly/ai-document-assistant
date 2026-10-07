import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api import ask, auth, conversations, documents, health, search, users
from app.config import settings
from app.rate_limit import limiter
from app.services.retention import retention_loop


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Background sweep that enforces the retention policy. Not started in
    # tests (TestClient only runs the lifespan when used as a context manager).
    task = asyncio.create_task(retention_loop()) if settings.retention_sweep_minutes > 0 else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="AI Document Assistant", version="0.3.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Explicit origin allow-list from config, never "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(documents.router)
app.include_router(search.router)
app.include_router(ask.router)
app.include_router(conversations.router)
