FROM python:3.12-slim AS builder

WORKDIR /build
COPY pyproject.toml ./
COPY src ./src

RUN pip install --no-cache-dir --upgrade pip \
 && pip wheel --no-cache-dir --no-deps --wheel-dir /wheels .

FROM python:3.12-slim AS runtime

RUN groupadd --system app && useradd --system --gid app --home /app app

WORKDIR /app

COPY --from=builder /wheels /wheels
COPY pyproject.toml ./

RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir --no-index --find-links /wheels rag-proxy \
 && pip install --no-cache-dir fastapi uvicorn[standard] httpx pydantic pydantic-settings python-dotenv \
 && rm -rf /wheels

USER app

EXPOSE 8000

CMD ["python", "-m", "rag_proxy"]
