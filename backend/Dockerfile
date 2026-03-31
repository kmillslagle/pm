# Stage 1: Build frontend static export
FROM node:22-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN NEXT_TELEMETRY_DISABLED=1 npm run build

# Stage 2: Backend
FROM python:3.12-slim AS backend

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY backend/ .
COPY --from=frontend-build /app/frontend/out /app/static

RUN uv sync

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
