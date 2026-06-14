from app.core.config import INSECURE_JWT_SECRET_DEFAULT, Settings


def _settings(**overrides) -> Settings:
    base = {
        "debug": False,
        "jwt_secret": "a" * 40,
        "database_echo": False,
    }
    base.update(overrides)
    return Settings(**base)


def test_debug_mode_skips_all_safety_checks():
    s = _settings(
        debug=True, jwt_secret=INSECURE_JWT_SECRET_DEFAULT, database_echo=True
    )
    assert s.production_safety_errors() == []


def test_safe_production_config_has_no_errors():
    assert _settings().production_safety_errors() == []


def test_default_jwt_secret_blocks_production_startup():
    s = _settings(jwt_secret=INSECURE_JWT_SECRET_DEFAULT)
    assert any("GG_JWT_SECRET" in e for e in s.production_safety_errors())


def test_short_jwt_secret_blocks_production_startup():
    errors = _settings(jwt_secret="too-short").production_safety_errors()
    assert any("at least" in e for e in errors)


def test_database_echo_blocks_production_startup():
    errors = _settings(database_echo=True).production_safety_errors()
    assert any("GG_DATABASE_ECHO" in e for e in errors)
