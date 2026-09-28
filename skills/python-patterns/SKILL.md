---
name: python-patterns
description: Team FastAPI/Python conventions for routers, services, Pydantic schemas, SQLAlchemy repositories, Alembic migrations and pytest. Use when creating or modifying Python backend code — new endpoints, services, dependencies, workers, or migrations.
---

# Python patterns — FastAPI

Stub — filled by wave 2 of `docs/specs/2026-09-28-python-stack-and-agent-design-design.md` (§A5). Until then apply the principles of the NestJS backend rule (`backend.md`) with FastAPI mechanisms: Pydantic schemas at the boundary, thin routers, services orchestrating repositories, Alembic for schema changes, pytest with `conftest.py` fixtures.
