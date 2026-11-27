from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
class Settings(BaseSettings):
    demo_mode: bool = True
    mongodb_uri: str = ''
    mongodb_db: str = 'coastwatch'
    supabase_url: str = ''
    supabase_jwt_audience: str = 'authenticated'
    cors_origins: str = 'http://localhost:5173,http://127.0.0.1:5173'
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / '.env', extra='ignore')
settings = Settings()
