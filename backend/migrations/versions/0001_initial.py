"""Initial additive schema; compatible with the frontend-only release."""
from alembic import op
import sqlalchemy as sa
revision = "0001"
down_revision = None

def upgrade():
    op.create_table("applications",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("source_id", sa.String(160), unique=True, nullable=True),
        *[sa.Column(k, sa.String(160), nullable=False) for k in ("company", "role", "category", "channel")],
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("applied_at", sa.String(32), nullable=False),
        sa.Column("decision_at", sa.String(32), nullable=True),
        sa.Column("status_changed_at", sa.String(40), nullable=False),
        sa.Column("last_followed_up_at", sa.String(40), nullable=True),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False))
    op.create_table("system_state", sa.Column("key", sa.String(100), primary_key=True), sa.Column("value", sa.JSON(), nullable=False))
    op.create_table("incidents",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("active_key", sa.String(80), unique=True, nullable=True),
        sa.Column("environment", sa.String(20), nullable=False),
        sa.Column("route", sa.String(80), nullable=False),
        sa.Column("detected_at", sa.String(40), nullable=False),
        sa.Column("resolved_at", sa.String(40), nullable=True),
        sa.Column("status", sa.String(30), nullable=False),
        *[sa.Column(k, sa.Text(), nullable=False) for k in ("diagnosis", "action", "verification")],
        sa.Column("release_id", sa.String(100), nullable=False),
        sa.Column("trace_id", sa.String(64), nullable=False),
        sa.Column("attempted", sa.Boolean(), nullable=False))

def downgrade():
    raise RuntimeError("Destructive schema rollback is disabled; restore a verified backup explicitly.")
