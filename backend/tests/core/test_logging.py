"""The app's INFO logs must reach stderr under uvicorn.

Python's default handler shows WARNING and above only, so without a logging
config the dev email links from LogOnlyEmailClient never appear.
"""

import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]


def test_configure_logging_sends_app_info_logs_to_stderr():
    code = (
        "import logging\n"
        "from app.core.logging_config import configure_logging\n"
        "configure_logging()\n"
        "logging.getLogger('app.services.email').info('hello-from-app')\n"
        "logging.getLogger('some.library').info('library-noise')\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        check=True,
    )

    assert "hello-from-app" in result.stderr
    assert "library-noise" not in result.stderr


def test_main_configures_logging():
    code = (
        "import logging\n"
        "import main\n"
        "assert logging.getLogger('app').getEffectiveLevel() == logging.INFO\n"
    )
    subprocess.run(
        [sys.executable, "-c", code], cwd=BACKEND_DIR, check=True, capture_output=True
    )
