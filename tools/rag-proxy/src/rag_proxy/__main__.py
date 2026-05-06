"""Entrypoint: `python -m rag_proxy` launches uvicorn with create_app()."""

from __future__ import annotations

import logging
import os

import uvicorn

from rag_proxy.main import create_app


def main() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    app = create_app()
    uvicorn.run(
        app,
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
    )


if __name__ == "__main__":
    main()
