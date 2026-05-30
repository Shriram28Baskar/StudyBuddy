import time
from collections import defaultdict
from fastapi import Request, HTTPException

# In-memory store: {ip: [timestamp, ...]}
_request_log: dict[str, list[float]] = defaultdict(list)

# Default limits
DEFAULT_REQUESTS = 30   # requests
DEFAULT_WINDOW   = 60   # seconds


def _clean_old(timestamps: list[float], window: int) -> list[float]:
    cutoff = time.time() - window
    return [t for t in timestamps if t > cutoff]


async def rate_limit_middleware(
    request: Request,
    max_requests: int = DEFAULT_REQUESTS,
    window_seconds: int = DEFAULT_WINDOW,
) -> None:
    """
    Dependency-injectable rate limiter based on client IP.

    Usage in a route:
        from fastapi import Depends
        from middleware.rate_limit import rate_limit_middleware

        @router.post("/chat")
        async def chat(req: ..., _=Depends(rate_limit_middleware)):
            ...
    """
    client_ip = request.client.host if request.client else "unknown"
    now       = time.time()

    _request_log[client_ip] = _clean_old(_request_log[client_ip], window_seconds)
    _request_log[client_ip].append(now)

    count = len(_request_log[client_ip])
    if count > max_requests:
        retry_after = int(window_seconds - (now - _request_log[client_ip][0]))
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {max_requests} requests per {window_seconds}s.",
            headers={"Retry-After": str(max(retry_after, 1))},
        )


# Stricter limiter for AI endpoints (more expensive calls)
async def ai_rate_limit(request: Request) -> None:
    await rate_limit_middleware(request, max_requests=20, window_seconds=60)