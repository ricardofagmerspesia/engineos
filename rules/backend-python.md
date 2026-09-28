# Backend Rules — FastAPI / Python

Stub — filled by wave 2 of `docs/specs/2026-09-28-python-stack-and-agent-design-design.md` (§A4). Until then apply the principles of the NestJS backend rule (thin routers, validated boundary DTOs, data access behind repositories, idempotent handlers, paginated lists) with FastAPI mechanisms — Pydantic models at the edge, dependencies for wiring, SQLAlchemy sessions scoped per request, Alembic for schema changes.
