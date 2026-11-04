from app.core.config import INSECURE_JWT_SECRET_DEFAULT, Settings


def _settings(**overrides) -> Settings:
    base = {
        "debug": False,
        "jwt_secret": "a" * 40,
        "database_echo": False,
        "resend_api_key": "re_test_key",
    }
    base.update(overrides)
    return Settings(**base)


def test_debug_mode_skips_all_safety_checks():
    s = _settings(
        debug=True,
        jwt_secret=INSECURE_JWT_SECRET_DEFAULT,
        database_echo=True,
        resend_api_key="",
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


def test_missing_resend_key_blocks_production_startup():
    # Without a provider, the email body (with a live verify or reset link)
    # could only go to the log, so production must not start without one.
    errors = _settings(resend_api_key="").production_safety_errors()
    assert any("GG_RESEND_API_KEY" in e for e in errors)


def test_email_delivery_off_lets_production_start_without_a_key():
    # An explicit opt-out (the verify harness's live-LLM mode). With no key,
    # the non-debug email client neither sends nor logs the body.
    errors = _settings(
        resend_api_key="", email_delivery="off"
    ).production_safety_errors()
    assert errors == []


def test_premium_launch_needs_the_waitlist_hash_salt():
    # V11-P5: the salt keys the one-way hash of redeemed waitlist emails.
    errors = _settings(
        premium_launched_at="2027-01-01T00:00:00Z"
    ).production_safety_errors()
    assert any("GG_WAITLIST_EMAIL_HASH_SALT" in e for e in errors)
    assert (
        _settings(
            premium_launched_at="2027-01-01T00:00:00Z",
            waitlist_email_hash_salt="s" * 32,
        ).production_safety_errors()
        == []
    )


def test_waitlist_cutoff_accepts_a_date(monkeypatch):
    # The cut-off is the day the site switched to the App Store.
    monkeypatch.setenv("GG_WAITLIST_CUTOFF", "2026-12-15")
    assert Settings().waitlist_cutoff.isoformat().startswith("2026-12-15T00:00")
