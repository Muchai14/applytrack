FROM node:22-alpine AS frontend-base
WORKDIR /code
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
FROM frontend-base AS frontend-tests
CMD ["pnpm", "test"]
FROM frontend-base AS frontend-build
ARG VITE_USE_MOCK_API=false
ARG VITE_API_BASE_URL=
ENV VITE_USE_MOCK_API=$VITE_USE_MOCK_API VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm build
FROM nginx:1.27-alpine AS web
COPY ops/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /code/dist /usr/share/nginx/html
FROM python:3.13-slim AS api
LABEL org.applytrack.auth-version="1"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FRONTEND_DIR=/app/frontend
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend .
COPY --from=frontend-build /code/dist /app/frontend
RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser
CMD ["sh", "-c", "alembic upgrade head && python -m app.seed && exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8000} --no-access-log"]
FROM mcr.microsoft.com/playwright:v1.51.1-noble AS e2e
WORKDIR /code
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY playwright.config.ts ./
COPY e2e ./e2e
CMD ["pnpm", "exec", "playwright", "test"]
# Render builds the final stage; keep the full-stack app as the default output.
FROM api AS production
