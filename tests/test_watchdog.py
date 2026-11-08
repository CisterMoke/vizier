"""Tests for systemd watchdog integration (vizier_ai.ui.watchdog)."""

import asyncio
import os
import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai.ui import watchdog

_WATCHDOG_ENV = ("WATCHDOG_INTERVAL_SECONDS", "WATCHDOG_USEC", "WATCHDOG_PID")


def _clear_watchdog_env(monkeypatch):
    for var in _WATCHDOG_ENV:
        monkeypatch.delenv(var, raising=False)


class TestResolveInterval:
    def test_disabled_by_default(self, monkeypatch):
        _clear_watchdog_env(monkeypatch)

        assert watchdog.resolve_interval() is None

    def test_explicit_interval(self, monkeypatch):
        _clear_watchdog_env(monkeypatch)
        monkeypatch.setenv("WATCHDOG_INTERVAL_SECONDS", "5")

        assert watchdog.resolve_interval() == 5.0

    def test_explicit_zero_disables(self, monkeypatch):
        _clear_watchdog_env(monkeypatch)
        monkeypatch.setenv("WATCHDOG_INTERVAL_SECONDS", "0")

        assert watchdog.resolve_interval() is None

    def test_invalid_interval_disables(self, monkeypatch):
        _clear_watchdog_env(monkeypatch)
        monkeypatch.setenv("WATCHDOG_INTERVAL_SECONDS", "soon")

        assert watchdog.resolve_interval() is None

    def test_explicit_interval_beats_watchdog_usec(self, monkeypatch):
        _clear_watchdog_env(monkeypatch)
        monkeypatch.setenv("WATCHDOG_INTERVAL_SECONDS", "7")
        monkeypatch.setenv("WATCHDOG_USEC", "30000000")
        monkeypatch.setenv("WATCHDOG_PID", str(os.getpid()))

        assert watchdog.resolve_interval() == 7.0

    def test_derives_half_of_watchdog_usec(self, monkeypatch):
        _clear_watchdog_env(monkeypatch)
        monkeypatch.setenv("WATCHDOG_USEC", "30000000")
        monkeypatch.setenv("WATCHDOG_PID", str(os.getpid()))

        assert watchdog.resolve_interval() == 15.0

    def test_watchdog_pid_mismatch_disables(self, monkeypatch):
        _clear_watchdog_env(monkeypatch)
        monkeypatch.setenv("WATCHDOG_USEC", "30000000")
        monkeypatch.setenv("WATCHDOG_PID", str(os.getpid() + 1))

        assert watchdog.resolve_interval() is None

    def test_watchdog_usec_without_pid_disables(self, monkeypatch):
        _clear_watchdog_env(monkeypatch)
        monkeypatch.setenv("WATCHDOG_USEC", "30000000")

        assert watchdog.resolve_interval() is None


class TestNotifyLoop:
    def test_pings_periodically_until_cancelled(self, monkeypatch):
        calls = []
        monkeypatch.setattr(
            watchdog.daemon, "notify", lambda *args, **kwargs: calls.append(args) or True
        )

        async def run():
            task = asyncio.create_task(watchdog.notify_loop(0.01))
            await asyncio.sleep(0.05)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        asyncio.run(run())

        assert len(calls) >= 2
        assert all(call[0] is watchdog.daemon.Notification.WATCHDOG for call in calls)

    def test_notify_failure_does_not_kill_loop(self, monkeypatch):
        calls = []

        def flaky(*args, **kwargs):
            calls.append(args)
            return RuntimeError("Data could not be sent")

        monkeypatch.setattr(watchdog.daemon, "notify", flaky)

        async def run():
            task = asyncio.create_task(watchdog.notify_loop(0.01))
            await asyncio.sleep(0.05)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        asyncio.run(run())

        assert len(calls) >= 2


class TestLifespan:
    def test_lifespan_pings_when_enabled(self, monkeypatch):
        _clear_watchdog_env(monkeypatch)
        monkeypatch.setenv("WATCHDOG_INTERVAL_SECONDS", "0.01")
        calls = []
        monkeypatch.setattr(
            watchdog.daemon, "notify", lambda *args, **kwargs: calls.append(args) or True
        )

        from vizier_ai.ui import app as app_module

        with TestClient(app_module.app) as client:
            client.get("/api/health")
            time.sleep(0.05)

        assert len(calls) >= 1
        assert calls[0][0] is watchdog.daemon.Notification.WATCHDOG

    def test_lifespan_silent_when_disabled(self, monkeypatch):
        _clear_watchdog_env(monkeypatch)
        calls = []
        monkeypatch.setattr(
            watchdog.daemon, "notify", lambda *args, **kwargs: calls.append(args) or True
        )

        from vizier_ai.ui import app as app_module

        with TestClient(app_module.app) as client:
            client.get("/api/health")
            time.sleep(0.05)

        assert calls == []
