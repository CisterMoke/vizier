"""Backward-compatible entry point.

Imports the FastAPI app from vizier_ai.app so deployment scripts
referencing 'main:app' continue to work.
"""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parents[1]))

from vizier_ai.app import app

__all__ = ["app"]
