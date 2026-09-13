"""Backward-compatible entry point.

Imports the FastAPI app from vizier_ai.ui.app so deployment scripts
referencing 'vizier_ai.ui.main:app' continue to work.
"""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parents[2]))

from vizier_ai.ui.app import app

__all__ = ["app"]
