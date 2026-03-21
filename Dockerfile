# Stage 1: Build Next.js static output
FROM node:22-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend
FROM python:3.12-slim
WORKDIR /app

# Install uv
RUN pip install uv --no-cache-dir

# Copy and install backend dependencies
COPY backend/pyproject.toml ./backend/
RUN cd backend && uv sync --no-dev

# Copy backend source
COPY backend/ ./backend/

# Copy static Next.js output
COPY --from=frontend-builder /frontend/out ./static

EXPOSE 8000

CMD ["uv", "run", "--project", "backend", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
