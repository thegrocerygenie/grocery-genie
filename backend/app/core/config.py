from datetime import datetime
from functools import lru_cache
from typing import Literal

from pydantic import Field
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
    # Claude Sonnet 5.5 has no dated snapshot ID: "claude-sonnet-5-5" is its
    # full ID. Each receipt records the model that read it (extraction_model).
    llm_model: str = "claude-sonnet-5-5"
    # Priority OCR (PREM-03): the extraction model for Premium users' scans, as
    # a LiteLLM model name. "provider/model" is sent as is; a bare name gets
    # llm_provider, like llm_model. It shares the key, base URL, timeout and
    # max_tokens above, and is sent no temperature. Empty: Premium scans use
    # llm_model. The proposed value and its cost are in docs/DEPLOYMENT.md.
    llm_premium_extraction_model: str = ""
    # Sent only when set. Claude Sonnet 5.5 rejects any non-default value, so
    # leave it unset for that model; set it for a model that accepts it.
    llm_temperature: float | None = None
    # The model thinks before it answers, and thinking counts against this.
    llm_max_tokens: int = 16000
    llm_api_key: str = ""
    # Base URL for a LiteLLM proxy or other OpenAI-compatible gateway, e.g.
    # http://litellm:4000 with llm_provider "litellm_proxy". Empty calls the
    # provider's own API.
    llm_api_base: str = ""
    # Per-call ceiling. LiteLLM's own default is 6000 s, which holds a scan open
    # long after the phone gave up. A starting value: tune it once extraction
    # latency is measured on the receipt test set.
    llm_timeout_seconds: float = 60.0
    # LiteLLM retries a timeout, rate limit, or 5xx this many times.
    llm_num_retries: int = 1

    # Storage
    storage_path: str = "./uploads"
    thumbnail_width: int = 200

    # Limits
    # Per user (NFR 7). The hourly cap counts only receipt submissions (scan
    # and manual entry); every other request, writes included, counts toward
    # the per-minute cap.
    max_receipt_submissions_per_hour: int = 50
    max_reads_per_minute: int = 300
    # Per user (V11-P0). Each Premium refresh is a call to RevenueCat's REST
    # API, so it has a count of its own: the app calls it only after a
    # purchase or a restore.
    max_premium_refreshes_per_minute: int = 10
    # "Claim your waitlist offer" (V11-P5) sends an email to an address the
    # user types: per user an hour (429 past it), and per account and target
    # email a day (past it the same 202, and nothing sent).
    max_waitlist_claims_per_hour: int = 5
    max_waitlist_claims_per_email_per_day: int = 3
    # Data export (PREM-04): each export is built whole in the request, receipt
    # images included, so a user gets this many an hour (429 past it), and
    # one at a time (export_service.export_slot).
    max_exports_per_hour: int = 10

    # Per-IP cap on unauthenticated /api/auth/* POSTs (sign-up, sign-in, social,
    # forgot/reset password, verify, refresh). 30/min/IP is generous enough for
    # legitimate retries and tight enough to deter brute-force/JWKS-fetch abuse.
    auth_ip_rate_limit_per_minute: int = 30

    # Where the rate limit counts live. "redis" (at redis_url) shares them
    # across API workers; "memory" keeps them per process, so each worker
    # allows the full limit. Tests use "memory".
    rate_limit_storage: Literal["redis", "memory"] = "redis"

    # Free-tier quota (overview: 20 receipts/month). Set to 0 to disable.
    free_tier_receipts_per_month: int = 20

    # Item matching (PI-02). The embedding model runs in this process
    # (sentence-transformers), so item names go to no third party. Off:
    # matching uses exact aliases and fuzzy similarity only.
    embeddings_enabled: bool = True
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    # Fuzzy (Jaro-Winkler + Levenshtein) at or above this links on its own.
    item_match_fuzzy_threshold: float = Field(default=0.85, ge=0, le=1)
    # Cosine similarity of name embeddings at or above this links on its own.
    item_match_semantic_threshold: float = Field(default=0.80, ge=0, le=1)
    # Below the thresholds above but at least this: ask the user to confirm.
    item_match_suggest_threshold: float = Field(default=0.60, ge=0, le=1)

    # Price change alerts (PI-03). A price at least this far, in percent,
    # from the item's 30-day average alerts; each user can set their own.
    price_alert_threshold_percent: int = Field(default=10, ge=1, le=100)
    # An item alerts at most once in this many days.
    price_alert_cooldown_days: int = Field(default=7, ge=0)
    # Earlier prices in the 30-day window needed before there is an average.
    price_alert_min_observations: int = Field(default=2, ge=1)

    # Premium through RevenueCat (V11-P0, decision D1). The webhook secret is
    # the Authorization header value set on the RevenueCat webhook; empty
    # refuses every delivery. The API key is RevenueCat's secret (sk_) REST
    # key, used to read a subscriber after a purchase or restore; empty turns
    # that read off. The entitlement id is the one Premium unlocks.
    revenuecat_webhook_secret: str = ""
    revenuecat_api_key: str = ""
    revenuecat_api_base: str = "https://api.revenuecat.com"
    revenuecat_entitlement_id: str = "premium"

    # The waitlist's free year of Premium (V11-P5, decisions #9-#13). The
    # waitlist is the marketing site's Resend audience (its RESEND_AUDIENCE_ID);
    # a daily task copies it into waitlist_entries while the claim window is
    # open (needs GG_RESEND_API_KEY too). Contacts created before the cut-off
    # (the day the site switched to the App Store; unset: everyone so far)
    # qualify. The claim window runs waitlist_claim_window_days from
    # premium_launched_at; unset, it is closed and nothing is granted. A match
    # grants waitlist_free_months of the Premium entitlement through
    # RevenueCat. The salt keys the one-way hash of each redeemed waitlist
    # email (decision #13); set it once and never change it.
    # The audience key reads the audience's contacts and, once the window has
    # closed, deletes them (plan: retention, decision #11). It must be a
    # full-access Resend key; empty uses GG_RESEND_API_KEY.
    # A grant inside sign-in, verify-email, email change or the claim link
    # waits at most waitlist_inline_grant_timeout_seconds for RevenueCat,
    # then stays pending for the beat retry. The retry backs off (15 min,
    # doubling, at most 6 h apart) and gives up (failed) only
    # waitlist_grant_retry_days after the match: a member matched in time is
    # owed the year (decision #9), even after the window closes.
    resend_waitlist_audience_id: str = ""
    resend_audience_api_key: str = ""
    waitlist_inline_grant_timeout_seconds: float = Field(default=3.0, gt=0)
    waitlist_grant_retry_days: int = Field(default=14, ge=1)
    resend_api_base: str = "https://api.resend.com"
    waitlist_cutoff: datetime | None = None
    premium_launched_at: datetime | None = None
    waitlist_claim_window_days: int = Field(default=90, ge=1)
    waitlist_free_months: int = Field(default=12, ge=1)
    waitlist_email_hash_salt: str = ""

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

    # Auth — sign-in activity (auth_events: IP, user agent) older than this
    # is erased by a daily beat task. The privacy policy states the period.
    auth_event_retention_days: int = Field(default=365, ge=1)

    # Analytics — product events (analytics_events) older than this are erased
    # by a daily beat task: 13 months, stated in the privacy policy.
    analytics_event_retention_days: int = Field(default=396, ge=1)
    # Where analytics events go: "database" (analytics_events) or "log" (the
    # analytics logger only). Tests use "log".
    analytics_storage: Literal["database", "log"] = "database"

    # Email — Resend
    resend_api_key: str = ""
    resend_from: str = "Grocery Genie <noreply@onresend.dev>"
    resend_domain: str = ""
    # "off" sends no email at all, outside debug also logs none: for a
    # non-debug test run (the verify harness's live-LLM mode). Production
    # leaves it at "resend", and then startup needs GG_RESEND_API_KEY.
    email_delivery: Literal["resend", "off"] = "resend"

    # Push — Expo push service. The access token is optional; set it when
    # "Enhanced push security" is on for the Expo project.
    expo_push_access_token: str = ""
    # Pending pushes older than this are marked expired instead of sent late.
    push_max_age_minutes: int = 60

    # Deep links — each path is an Expo Router route (mobile/app/<path>.tsx).
    # Signed-out users can open only onboarding/* routes.
    app_scheme: str = "grocerygenie"
    verify_email_path: str = "onboarding/verify-email"
    reset_password_path: str = "onboarding/reset-password"
    email_change_path: str = "onboarding/confirm-email-change"
    waitlist_claim_path: str = "onboarding/confirm-waitlist-claim"

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
        if self.email_delivery == "resend" and not self.resend_api_key:
            errors.append(
                "GG_RESEND_API_KEY must be set in production; without it, "
                "verification and password-reset emails are never sent. "
                "(GG_EMAIL_DELIVERY=off turns email off on purpose.)"
            )
        if self.premium_launched_at is not None and not self.waitlist_email_hash_salt:
            errors.append(
                "GG_WAITLIST_EMAIL_HASH_SALT must be set once "
                "GG_PREMIUM_LAUNCHED_AT is; it keys the one-way hash that keeps "
                "each waitlist email to one free year."
            )
        return errors


@lru_cache
def get_settings() -> Settings:
    return Settings()
