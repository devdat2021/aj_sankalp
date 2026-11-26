from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    demo_mode: bool = True
    mongodb_uri: str = ''
    mongodb_db: str = 'coastwatch'
    supabase_url: str = ''
    supabase_jwt_audience: str = 'authenticated'
    cors_origins: str = 'http://localhost:5174'
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
settings = Settings()
