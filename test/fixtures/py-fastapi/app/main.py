"""Composition root of the fixture service (design D6: one composition root in main.py)."""

from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="py-fastapi fixture")

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
