"""Small in-memory sliding-window rate limiter for auth endpoints.

Fits the single-instance deployment (one Render web service). If the API is
ever scaled to several instances, move this to a shared store such as Redis.
"""
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request

_hits: dict[str, deque] = defaultdict(deque)
_lock = Lock()


def client_ip(request: Request) -> str:
    # Behind one proxy (Render), the last X-Forwarded-For entry is the address
    # the proxy saw; earlier entries can be forged by the client.
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def check(key: str, limit: int, window_seconds: int) -> None:
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > window_seconds:
            q.popleft()
        if len(q) >= limit:
            retry = int(window_seconds - (now - q[0])) + 1
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Please wait and try again.",
                headers={"Retry-After": str(retry)},
            )
        q.append(now)
        if len(_hits) > 50_000:  # keep memory bounded
            for k in [k for k, v in _hits.items() if not v][:10_000]:
                _hits.pop(k, None)
