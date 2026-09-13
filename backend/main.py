"""Backward-compatible entry point.

Imports the FastAPI app from backend.app so deployment scripts
referencing 'main:app' continue to work.
"""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parents[1]))

from backend.app import app

__all__ = ["app"]
