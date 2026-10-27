"""The documented env vars must be ones Settings reads.

Settings reads only GG_-prefixed vars, so a doc that says STORAGE_PATH sets
nothing: the app keeps its default and writes images off the shared volume.
"""

import json
import re
import subprocess
from pathlib import Path

import pytest
import yaml

from app.core.config import Settings

REPO_ROOT = Path(__file__).resolve().parents[3]
DEPLOYMENT_DOC = REPO_ROOT / "docs" / "DEPLOYMENT.md"
ENV_EXAMPLE = REPO_ROOT / "backend" / ".env.example"
COMPOSE_FILE = REPO_ROOT / "docker" / "docker-compose.yml"
PRODUCTION_ENV_EXAMPLE = REPO_ROOT / "docker" / ".env.production.example"

# A line that sets a var, commented out or not: "FOO=bar" or "# FOO=bar".
ASSIGNMENT = re.compile(r"^\s*#?\s*([A-Z][A-Z0-9_]*)=(.*)$")
GG_NAME = re.compile(r"\bGG_[A-Z0-9_]+\b")


def _production_env_block() -> str:
    doc = DEPLOYMENT_DOC.read_text()
    section = doc.split("Environment Variables (.env.production)", 1)[1]
    match = re.search(r"```bash\n(.*?)```", section, re.DOTALL)
    assert match, "no bash block under the .env.production heading"
    return match.group(1)


def _assignments(text: str) -> list[tuple[str, str, bool]]:
    """(name, value, commented_out) for each line that sets a var."""
    found = []
    for line in text.splitlines():
        if m := ASSIGNMENT.match(line):
            found.append((m.group(1), m.group(2), line.lstrip().startswith("#")))
    return found


def _setting_for(name: str) -> str:
    return name.removeprefix("GG_").lower()


@pytest.mark.parametrize(
    "source",
    [DEPLOYMENT_DOC, ENV_EXAMPLE, PRODUCTION_ENV_EXAMPLE],
    ids=lambda p: p.name,
)
def test_every_documented_gg_var_is_a_setting(source: Path):
    unknown = sorted(
        name
        for name in set(GG_NAME.findall(source.read_text()))
        if _setting_for(name) not in Settings.model_fields
    )
    assert unknown == [], f"{source.name} names vars Settings never reads"


@pytest.mark.parametrize(
    "source",
    [_production_env_block, ENV_EXAMPLE.read_text, PRODUCTION_ENV_EXAMPLE.read_text],
    ids=["DEPLOYMENT.md", ".env.example", ".env.production.example"],
)
def test_every_documented_assignment_has_the_gg_prefix(source):
    unprefixed = [
        name for name, _, _ in _assignments(source()) if not name.startswith("GG_")
    ]
    assert unprefixed == [], "Settings ignores these: they need the GG_ prefix"


def test_production_env_block_loads_into_settings(monkeypatch):
    for name, value, commented_out in _assignments(_production_env_block()):
        if not commented_out:
            monkeypatch.setenv(name, value)

    settings = Settings(_env_file=None)

    # The api and worker mount the receipt_images volume here; any other
    # path puts images on each container's own disk.
    assert settings.storage_path == "/app/storage"
    assert settings.redis_url == "redis://redis:6379/0"
    assert settings.cors_origins == ["https://grocerygenie.app"]
    assert settings.debug is False


# Settings whose defaults only suit local development: without them, email is
# only logged and Apple and Google sign-in fail.
REQUIRED_IN_PRODUCTION = [
    "GG_RESEND_API_KEY",
    "GG_RESEND_FROM",
    "GG_APPLE_TEAM_ID",
    "GG_APPLE_KEY_ID",
    "GG_APPLE_CLIENT_ID",
    "GG_APPLE_PRIVATE_KEY",
    "GG_GOOGLE_CLIENT_ID",
]


def test_production_env_block_sets_every_required_setting():
    assigned = {
        name
        for name, _, commented_out in _assignments(_production_env_block())
        if not commented_out
    }
    missing = [name for name in REQUIRED_IN_PRODUCTION if name not in assigned]
    assert missing == [], "production needs these set"


def test_apple_client_id_is_the_ios_bundle_id():
    values = {name: value for name, value, _ in _assignments(_production_env_block())}
    app_json = json.loads((REPO_ROOT / "mobile" / "app.json").read_text())
    assert values["GG_APPLE_CLIENT_ID"] == app_json["expo"]["ios"]["bundleIdentifier"]


def test_production_env_example_copies_the_doc_block():
    """The operator copies the example file, so it must say what the doc says."""
    assert _assignments(PRODUCTION_ENV_EXAMPLE.read_text()) == _assignments(
        _production_env_block()
    )


def _volume_targets(service: dict, volume: str) -> list[str]:
    targets = []
    for mount in service.get("volumes", []):
        source, _, rest = mount.partition(":")
        if source == volume:
            targets.append(rest.split(":")[0])
    return targets


@pytest.mark.parametrize("service", ["api", "worker"])
def test_storage_path_is_the_receipt_images_mount(service: str):
    """api writes the image and worker reads it: both need the shared volume."""
    services = yaml.safe_load(COMPOSE_FILE.read_text())["services"]
    values = {
        name: value
        for name, value, commented_out in _assignments(
            PRODUCTION_ENV_EXAMPLE.read_text()
        )
        if not commented_out
    }
    assert _volume_targets(services[service], "receipt_images") == [
        values["GG_STORAGE_PATH"]
    ]


def test_compose_services_read_the_production_env_file():
    services = yaml.safe_load(COMPOSE_FILE.read_text())["services"]
    for name in ("api", "worker", "beat"):
        assert services[name]["env_file"] == ".env.production", name


def test_production_env_file_is_gitignored():
    result = subprocess.run(
        ["git", "check-ignore", "-q", "docker/.env.production"],
        cwd=REPO_ROOT,
        check=False,
    )
    assert result.returncode == 0, "docker/.env.production would be committed"
