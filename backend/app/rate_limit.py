from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

# In-memory, per client IP. Fine for a single instance; use Redis storage
# (Limiter(storage_uri=...)) if the backend is scaled horizontally.
limiter = Limiter(key_func=get_remote_address, enabled=settings.rate_limit_enabled)
