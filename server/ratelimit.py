"""Simple in-memory rate limiter using a sliding window per client IP."""

import time
from collections import defaultdict
from dataclasses import dataclass, field


@dataclass
class RateLimitConfig:
    max_requests: int = 10  # max requests per window
    window_seconds: int = 60  # window duration


@dataclass
class _Entry:
    timestamps: list[float] = field(default_factory=list)


class RateLimiter:
    """Sliding window rate limiter keyed by client identifier (e.g. IP)."""

    def __init__(self, config: RateLimitConfig) -> None:
        self.config = config
        self._entries: dict[str, _Entry] = defaultdict(_Entry)

    def check(self, key: str) -> tuple[bool, int]:
        """Check if a request is allowed. Returns (allowed, remaining_requests)."""
        now = time.monotonic()
        window_start = now - self.config.window_seconds
        entry = self._entries[key]

        entry.timestamps = [ts for ts in entry.timestamps if ts > window_start]

        if len(entry.timestamps) >= self.config.max_requests:
            return False, 0

        entry.timestamps.append(now)
        remaining = self.config.max_requests - len(entry.timestamps)
        return True, remaining
