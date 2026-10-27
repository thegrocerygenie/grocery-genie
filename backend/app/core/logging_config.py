"""Logging setup for the API process.

Python's default handler shows WARNING and above only, so the app's INFO logs
(such as the dev email links) would never reach the uvicorn console.
"""

import logging


def configure_logging() -> None:
    """Send WARNING+ from every logger, and INFO+ from `app.*`, to stderr."""
    logging.basicConfig(
        level=logging.WARNING,
        format="%(levelname)s:     %(name)s - %(message)s",
    )
    logging.getLogger("app").setLevel(logging.INFO)
