from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
from typing import Optional
class Settings(BaseSettings):
    demo_mode: bool = True
    mongodb_uri: str = ''
    mongodb_db: str = 'coastwatch'
    supabase_url: str = ''
    supabase_publishable_key: str = ''
    supabase_secret_key: str = ''
    supabase_jwt_audience: str = 'authenticated'
    cors_origins: str = 'http://localhost:5173,http://127.0.0.1:5173'
    # LLM Configuration
    llm_provider: str = "none"  # "openai", "watsonx", "none"
    llm_api_key: Optional[str] = None
    llm_model: str = "gpt-4o-mini"

    # IBM watsonx.ai (optional)
    watsonx_api_key: Optional[str] = None
    watsonx_project_id: Optional[str] = None
    watsonx_url: str = "https://us-south.ml.cloud.ibm.com"

    # ML Models
    ml_models_dir: str = "ml_models"

    # Operational integrations. Secrets are never returned by the health API.
    intelligence_enabled: bool = False
    optimization_enabled: bool = False
    gemini_api_key: str = ''
    gemini_model: str = 'gemini-3.1-flash-lite'
    gemini_retired_model_fallback: str = 'gemini-3.7-flash'
    gemini_availability_fallback: str = 'gemini-3.1-flash-lite'
    gemini_primary_timeout_seconds: int = 20
    google_cloud_project: str = ''
    google_application_credentials: str = ''
    intelligence_cache_seconds: int = 900
    intelligence_timeout_seconds: int = 45
    gemini_timeout_seconds: int = 90

    # Simulation defaults
    default_delay_multiplier_low: float = 1.2
    default_delay_multiplier_medium: float = 1.5
    default_delay_multiplier_high: float = 2.0

    # Risk score weights
    weight_delay: float = 0.25
    weight_cargo_value: float = 0.20
    weight_cold_chain: float = 0.20
    weight_route_risk: float = 0.15
    weight_priority: float = 0.15
    weight_fleet_avail: float = 0.05

    crisis_database_url: str = "sqlite:///" + str(Path(__file__).resolve().parents[2] / "data" / "crisis.db")
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / '.env', extra='ignore')
settings = Settings()
