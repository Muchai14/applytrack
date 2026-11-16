"""Add accounts, opaque sessions and application ownership. Preserve legacy rows."""
from alembic import op
import sqlalchemy as sa
revision = "0002"
down_revision = "0001"

def upgrade():
    op.create_table("users", sa.Column("id",sa.String(64),primary_key=True), sa.Column("username",sa.String(24),nullable=False), sa.Column("username_key",sa.String(24),unique=True,nullable=False), sa.Column("password_hash",sa.String(300),nullable=False), sa.Column("created_at",sa.String(40),nullable=False))
    op.create_table("login_sessions", sa.Column("token_hash",sa.String(64),primary_key=True), sa.Column("user_id",sa.String(64),sa.ForeignKey("users.id"),nullable=False), sa.Column("expires_at",sa.String(40),nullable=False))
    op.create_index("ix_login_sessions_user_id","login_sessions",["user_id"])
    op.create_index("ix_login_sessions_expires_at","login_sessions",["expires_at"])
    op.create_table("auth_throttle",sa.Column("key",sa.String(64),primary_key=True),sa.Column("started_at",sa.String(40),nullable=False),sa.Column("attempts",sa.Integer(),nullable=False))
    op.add_column("applications",sa.Column("owner_id",sa.String(64),nullable=True))
    op.create_foreign_key("fk_applications_owner","applications","users",["owner_id"],["id"])
    op.create_index("ix_applications_owner_id","applications",["owner_id"])
    op.drop_constraint("applications_source_id_key","applications",type_="unique")
    op.create_unique_constraint("uq_applications_owner_source","applications",["owner_id","source_id"])

def downgrade():
    raise RuntimeError("Do not roll back to pre-account images: they cannot enforce ownership.")
