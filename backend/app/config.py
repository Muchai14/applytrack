import os
from dataclasses import dataclass

@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "postgresql+psycopg://applytrack:applytrack@localhost:5432/applytrack")
    environment: str = os.getenv("APP_ENV", "dev")
    ops_token: str = os.getenv("OPS_TOKEN", "")
    fault_enabled: bool = os.getenv("ENABLE_FAULT_TRIGGER", "false").lower() == "true"
    release_id: str = os.getenv("RELEASE_ID", os.getenv("RENDER_GIT_COMMIT", "local"))
    frontend_dir: str = os.getenv("FRONTEND_DIR", "dist")
    public_origin: str = os.getenv("PUBLIC_ORIGIN", os.getenv("RENDER_EXTERNAL_URL", ""))
    seed_demo: bool = os.getenv("SEED_DEMO", "false").lower() == "true"

    def __post_init__(self):
        if self.environment not in {"dev", "test", "production"}:
            raise ValueError("APP_ENV must be dev, test or production")
        if self.fault_enabled and self.environment == "production":
            raise ValueError("Fault injection is prohibited in production")
        if self.fault_enabled and len(self.ops_token) < 24:
            raise ValueError("Fault injection requires an OPS_TOKEN of at least 24 characters")
