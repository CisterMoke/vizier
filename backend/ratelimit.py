"""In-memory rate limiters using a sliding window approach.

Provides two limiter types:
- RateLimiter: per-client (e.g. per-IP) rate limiting
- GlobalRateLimiter: total requests across all clients, protects against
  botted/abuse scenarios where many IPs each stay under the per-IP limit
"""

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


class GlobalRateLimiter:
    """Sliding window rate limiter that counts ALL requests regardless of source.

    Use alongside RateLimiter for per-IP limits. The global limiter caps the
    total throughput to protect the LLM API from abuse via many IPs.
    """

    def __init__(self, config: RateLimitConfig) -> None:
        self.config = config
        self._timestamps: list[float] = []

    def check(self) -> tuple[bool, int]:
        """Check if a request is allowed. Returns (allowed, remaining_requests)."""
        now = time.monotonic()
        window_start = now - self.config.window_seconds

        self._timestamps = [ts for ts in self._timestamps if ts > window_start]

        if len(self._timestamps) >= self.config.max_requests:
            return False, 0

        self._timestamps.append(now)
        remaining = self.config.max_requests - len(self._timestamps)
        return True, remaining
