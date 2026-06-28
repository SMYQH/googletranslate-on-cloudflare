"""Pytest configuration for the client test suite.

Ensures the ``client`` package directory is importable so tests can simply do
``from translate import ...`` regardless of the working directory.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
