from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Well-known insecure default. If this value ever signs tokens in production,
# anyone who reads the source can forge a token for any user.
INSECURE_JWT_SECRET_DEFAULT = "dev-secret-change-me-32+bytes-of-random-data"
MIN_JWT_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="GG_")

    # App
    app_name: str = "Grocery Genie"
    debug: bool = False

    # CORS — explicit allowed origins for non-debug deployments. In debug mode
    # the app falls back to "*" for local development convenience.
    cors_origins: list[str] = []

    # Database
    database_url: str = "postgresql+asyncpg://localhost:5432/grocery_genie"
    database_echo: bool = False

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # LLM
    llm_provider: str = "anthropic"
    llm_model: str = "claude-sonnet-4-20250514"
    llm_temperature: float = 0.0
    llm_api_key: str = ""

    # Extraction
    extraction_confidence_threshold: float = 0.7
    category_confidence_threshold: float = 0.7

    # Storage
    storage_path: str = "./uploads"
    thumbnail_width: int = 200

    # Limits
    max_receipt_submissions_per_hour: int = 50
    max_reads_per_minute: int = 300

    # Per-IP cap on unauthenticated /api/auth/* POSTs (sign-up, sign-in, social,
    # forgot/reset password, verify, refresh). 30/min/IP is generous enough for
    # legitimate retries and tight enough to deter brute-force/JWKS-fetch abuse.
    auth_ip_rate_limit_per_minute: int = 30

    # Free-tier quota (overview: 20 receipts/month). Set to 0 to disable.
    free_tier_receipts_per_month: int = 20

    # Budget alert thresholds (BC-03: configurable at 50%, 80%, 100%).
    budget_alert_thresholds: list[int] = [50, 80, 100]

    # Auth — JWT
    jwt_secret: str = INSECURE_JWT_SECRET_DEFAULT
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_seconds: int = 3600  # 1h
    jwt_refresh_ttl_seconds: int = 60 * 60 * 24 * 30  # 30d
    jwt_issuer: str = "grocery-genie"
    jwt_audience: str = "grocery-genie-api"

    # Auth — password policy
    password_min_length: int = 12
    password_max_length: int = 72  # bcrypt input cap
    bcrypt_rounds: int = 12

    # Auth — lockout
    signin_lockout_threshold: int = 10  # cumulative fails in window
    signin_lockout_window_seconds: int = 3600
    signin_lockout_duration_seconds: int = 3600

    # Soft-delete retention
    soft_delete_retention_days: int = 30

    # Email — Resend
    resend_api_key: str = ""
    resend_from: str = "Grocery Genie <noreply@onresend.dev>"
    resend_domain: str = ""

    # Deep links
    app_scheme: str = "grocerygenie"
    verify_email_path: str = "verify"
    reset_password_path: str = "reset"
    email_change_path: str = "email-change"

    # Apple Sign In
    apple_team_id: str = ""
    apple_key_id: str = ""
    apple_client_id: str = ""  # iOS bundle id
    apple_private_key: str = ""  # PEM contents

    # Google Sign In
    google_client_id: str = ""

    def production_safety_errors(self) -> list[str]:
        """Return config problems that must block startup in non-debug mode.

        Returns an empty list when the configuration is safe. Only enforced
        when ``debug`` is False so local development keeps its convenient
        defaults.
        """
        if self.debug:
            return []

        errors: list[str] = []
        if self.jwt_secret == INSECURE_JWT_SECRET_DEFAULT:
            errors.append(
                "GG_JWT_SECRET is set to the well-known development default; "
                "set it to a unique random value (32+ bytes)."
            )
        elif len(self.jwt_secret) < MIN_JWT_SECRET_LENGTH:
            errors.append(
                f"GG_JWT_SECRET must be at least {MIN_JWT_SECRET_LENGTH} "
                f"characters (got {len(self.jwt_secret)})."
            )
        if self.database_echo:
            errors.append(
                "GG_DATABASE_ECHO must be False in production; it logs raw "
                "SQL parameters including auth tokens."
            )
        return errors


@lru_cache
def get_settings() -> Settings:
    return Settings()
