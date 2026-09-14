"""Dev script runner for Vizier AI.

Usage:
    uv run vizier-dev           # Start both backend and frontend
    uv run vizier-dev-backend    # Start backend only
    uv run vizier-dev-frontend   # Start frontend only
"""

import subprocess
import sys
import os
from pathlib import Path

FRONTEND_DIR = Path(__file__).parents[2] / "ui" / "frontend"
PROJECT_ROOT = Path(__file__).parents[2]


def backend():
    """Start the FastAPI backend with hot reload."""
    os.chdir(PROJECT_ROOT)
    subprocess.run([
        sys.executable, "-m", "uvicorn",
        "vizier_ai.ui.main:app",
        "--reload", "--port", "8000",
    ])


def frontend():
    """Start the Vite frontend dev server."""
    if not (FRONTEND_DIR / "node_modules").exists():
        print("Installing frontend dependencies...")
        subprocess.run(["npm", "install"], cwd=FRONTEND_DIR, check=True)
    subprocess.run(["npm", "run", "dev"], cwd=FRONTEND_DIR)


def dev():
    """Start both backend and frontend concurrently."""
    import signal
    import threading

    procs = []

    def start_backend():
        os.chdir(PROJECT_ROOT)
        p = subprocess.Popen([
            sys.executable, "-m", "uvicorn",
            "vizier_ai.ui.main:app",
            "--reload", "--port", "8000",
        ])
        procs.append(p)
        p.wait()

    def start_frontend():
        if not (FRONTEND_DIR / "node_modules").exists():
            print("Installing frontend dependencies...")
            subprocess.run(["npm", "install"], cwd=FRONTEND_DIR, check=True)
        p = subprocess.Popen(["npm", "run", "dev"], cwd=FRONTEND_DIR)
        procs.append(p)
        p.wait()

    bt = threading.Thread(target=start_backend, daemon=True)
    ft = threading.Thread(target=start_frontend, daemon=True)
    bt.start()
    ft.start()

    def kill_all(*_):
        for p in procs:
            p.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, kill_all)
    signal.signal(signal.SIGTERM, kill_all)

    print("Vizier AI dev mode: backend on http://localhost:8000, frontend on http://localhost:5173")
    print("Press Ctrl+C to stop both.\n")

    bt.join()
    ft.join()
