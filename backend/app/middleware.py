"""Security middleware. Plain ASGI so they work on streamed bodies and responses."""
from fastapi import HTTPException, status
from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse

from app.config import settings

# The interactive API docs load scripts from a CDN, so a strict CSP would break them.
_DOC_PATHS = {"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"}

# Multipart framing adds some bytes on top of the file itself.
MULTIPART_OVERHEAD = 64 * 1024


def security_headers(path: str) -> dict[str, str]:
    """The defensive headers for a response to `path`."""
    headers = {
        "X-Content-Type-Options": "nosniff",  # no MIME guessing
        "X-Frame-Options": "DENY",  # can't be framed (clickjacking)
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",  # responses hold personal data
    }
    if path not in _DOC_PATHS:
        # This is a JSON API: nothing it returns should ever load anything.
        headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if settings.hsts_enabled:  # only turn on when served over HTTPS
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return headers


class SecurityHeadersMiddleware:
    """Defensive headers on EVERY response, including errors and CORS preflights.

    Unhandled exceptions are answered by Starlette *outside* this middleware, so
    `main.py` also applies `security_headers()` in its 500 handler.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        extra = security_headers(scope["path"])

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in extra.items():
                    if name == "Cache-Control":
                        headers.setdefault(name, value)  # an endpoint may set its own
                    else:
                        headers[name] = value
            await send(message)

        await self.app(scope, receive, send_with_headers)


class BodySizeLimitMiddleware:
    """Rejects oversized request bodies BEFORE they are buffered in memory.

    Checks the Content-Length header first (cheap), and also counts the bytes as
    they stream in, because the header can be missing (chunked uploads) or lie.
    Uploads get the configured file limit; every other request is small JSON.
    """

    def __init__(self, app):
        self.app = app

    @staticmethod
    def _limit(scope) -> int:
        if scope["method"] == "POST" and scope["path"] == "/documents":
            return settings.max_upload_bytes + MULTIPART_OVERHEAD
        return settings.max_json_body_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = self._limit(scope)

        declared = dict(scope["headers"]).get(b"content-length")
        if declared and declared.isdigit() and int(declared) > limit:
            response = JSONResponse(
                {"detail": "Request body too large"}, status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            )
            await response(scope, receive, send)
            return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # An HTTPException passes through FastAPI's body parsing as-is
                    # and becomes a clean 413 response.
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Request body too large"
                    )
            return message

        await self.app(scope, limited_receive, send)
