from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="GG_")

    # App
    app_name: str = "Grocery Genie"
    debug: bool = False

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
