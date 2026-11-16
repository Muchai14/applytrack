from alembic import context
import os
from sqlalchemy import text
from app.config import Settings
from app.db import Base, connect

def run():
    engine, _ = connect(Settings())
    with engine.connect() as connection:
        schema = os.getenv("DB_SCHEMA", "")
        if schema:
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS "+schema))
            connection.commit()
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()
run()
