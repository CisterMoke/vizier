"""Dev script runner for Vizier AI.

Usage:
    uv run vizier-dev           # Start both backend and frontend
    uv run vizier-dev-backend    # Start backend only
    uv run vizier-dev-frontend   # Start frontend only
"""

import subprocess
import sys
import threading
import signal
from pathlib import Path

FRONTEND_DIR = Path(__file__).parent / "frontend"
PROJECT_ROOT = Path(__file__).parents[2]


def backend():
    subprocess.run(
        [
            "uvicorn",
            "--port",
            "8000",
            "--reload",
            "--reload-dir",
            Path(__file__).parent.relative_to(PROJECT_ROOT).as_posix(),
            "vizier_ai.ui.main:app"
        ],
        cwd=PROJECT_ROOT,
        check=True,
    )


def frontend():
    """Start the Vite frontend dev server."""
    if not (FRONTEND_DIR / "node_modules").exists():
        print("Installing frontend dependencies...")
        subprocess.run(
            ["npm", "install"],
            cwd=FRONTEND_DIR,
            check=True
        )
    subprocess.run(
        ["npm", "run", "dev"],
        cwd=FRONTEND_DIR,
        check=True,
    )


def dev():
    """Start both backend and frontend concurrently."""

    print("Vizier AI dev mode: backend on http://localhost:8000, frontend on http://localhost:5173")
    print("Press Ctrl+C to stop both.\n")

    bt = threading.Thread(target=backend, daemon=True)
    ft = threading.Thread(target=frontend, daemon=True)
    bt.start()
    ft.start()

    def kill_all(*_):
        sys.exit(0)

    signal.signal(signal.SIGINT, kill_all)
    signal.signal(signal.SIGTERM, kill_all)

    bt.join()
    ft.join()
