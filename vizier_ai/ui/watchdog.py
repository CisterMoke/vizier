"""systemd watchdog integration.

Periodically sends ``WATCHDOG=1`` pings while the FastAPI app runs so
systemd (``WatchdogSec=`` in the unit) restarts a hung process. Pings
are sent via cysystemd — the python-systemd package's canonical
distribution (``pip install systemd`` is a deprecated shim that
re-exports it).

Interval resolution, in order:

1. ``WATCHDOG_INTERVAL_SECONDS`` — explicit interval; wins when set
   to a positive number. ``0`` or a non-number disables the watchdog.
2. Half of ``WATCHDOG_USEC`` — the interval systemd exports when the
   unit arms a watchdog (``WatchdogSec=``), and only when
   ``WATCHDOG_PID`` matches this process (pings from other processes
   are ignored by systemd, e.g. under multi-worker servers).
3. Otherwise ``None`` — the watchdog is disabled and no background
   task is started.
"""

import asyncio
import logging
import os

from cysystemd import daemon

logger = logging.getLogger(__name__)


def resolve_interval() -> float | None:
    """Return the watchdog ping interval in seconds, or None if disabled."""
    raw = os.getenv("WATCHDOG_INTERVAL_SECONDS", "").strip()
    if raw:
        try:
            interval = float(raw)
        except ValueError:
            logger.warning(
                "WATCHDOG_INTERVAL_SECONDS=%r is not a number; watchdog disabled",
                raw,
            )
            return None
        return interval if interval > 0 else None

    usec = os.getenv("WATCHDOG_USEC", "").strip()
    pid = os.getenv("WATCHDOG_PID", "").strip()
    if not usec or not pid or pid != str(os.getpid()):
        return None
    try:
        interval = float(usec) / 1e6 / 2
    except ValueError:
        return None
    return interval if interval > 0 else None


async def notify_loop(interval: float) -> None:
    """Ping WATCHDOG=1 every ``interval`` seconds until cancelled."""
    while True:
        # return_exceptions=True makes notify() return failures instead
        # of raising, so a missing/unreachable NOTIFY_SOCKET degrades
        # to a log line rather than killing the loop.
        result = daemon.notify(daemon.Notification.WATCHDOG, return_exceptions=True)
        if isinstance(result, BaseException):
            logger.warning("systemd watchdog notify failed: %s", result)
        await asyncio.sleep(interval)
