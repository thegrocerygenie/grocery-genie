.PHONY: help \
	install install-backend install-mobile \
	backend-dev backend-test backend-lint backend-format backend-typecheck \
	backend-migrate backend-migration backend-worker kill-port \
	db-up db-down db-reset \
	mobile-start mobile-ios mobile-test mobile-lint mobile-format mobile-typecheck \
	test lint format typecheck validate validate-backend validate-mobile \
	clean

# Overridable variables
# Default to 8001 — this dev box already has another service on :8000.
PORT ?= 8001
HOST ?= 0.0.0.0

# Default target
help:
	@echo "Grocery Genie — repo-level commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install              Install backend + mobile dependencies"
	@echo "  make install-backend      Install backend Python deps (editable + dev extras)"
	@echo "  make install-mobile       Install mobile npm deps"
	@echo ""
	@echo "Backend (FastAPI):"
	@echo "  make backend-dev          Run uvicorn dev server with reload (frees PORT first; override: PORT=, HOST=)"
	@echo "  make kill-port            Kill any process listening on PORT (default $(PORT))"
	@echo "  make backend-test         Run pytest"
	@echo "  make backend-lint         ruff check + ruff format --check"
	@echo "  make backend-format       ruff format"
	@echo "  make backend-migrate      alembic upgrade head"
	@echo "  make backend-migration M=\"msg\"  Generate alembic revision"
	@echo "  make backend-worker       Run Celery worker"
	@echo ""
	@echo "Mobile (Expo):"
	@echo "  make mobile-start         expo start"
	@echo "  make mobile-ios           expo start --ios"
	@echo "  make mobile-test          jest"
	@echo "  make mobile-lint          eslint"
	@echo "  make mobile-format        prettier --check"
	@echo "  make mobile-typecheck     tsc --noEmit"
	@echo ""
	@echo "Combined:"
	@echo "  make test                 Run backend + mobile tests"
	@echo "  make lint                 Run backend + mobile lint"
	@echo "  make typecheck            Run mobile typecheck (Python is checked via ruff)"
	@echo "  make validate             Full validation gate (backend + mobile)"

# ---------- Setup ----------

install: install-backend install-mobile

install-backend:
	cd backend && pip install -e ".[dev]"

install-mobile:
	cd mobile && npm install

# ---------- Backend ----------

kill-port:
	@PIDS=$$(lsof -ti tcp:$(PORT) 2>/dev/null || fuser -n tcp $(PORT) 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$$' || true); \
	if [ -n "$$PIDS" ]; then \
		echo "Killing process(es) on :$(PORT) -> $$PIDS"; \
		kill $$PIDS 2>/dev/null || true; \
		sleep 1; \
		LEFT=$$(lsof -ti tcp:$(PORT) 2>/dev/null || true); \
		if [ -n "$$LEFT" ]; then echo "Force-killing $$LEFT"; kill -9 $$LEFT 2>/dev/null || true; fi; \
	else \
		echo "Port $(PORT) is free."; \
	fi

backend-dev: kill-port
	cd backend && uvicorn main:app --reload --host $(HOST) --port $(PORT)

backend-test:
	cd backend && pytest

backend-lint:
	cd backend && ruff check . && ruff format --check .

backend-format:
	cd backend && ruff format . && ruff check --fix .

backend-migrate:
	cd backend && alembic upgrade head

# Usage: make backend-migration M="add receipts table"
backend-migration:
	@if [ -z "$(M)" ]; then echo "Usage: make backend-migration M=\"message\""; exit 1; fi
	cd backend && alembic revision --autogenerate -m "$(M)"

backend-worker:
	cd backend && celery -A app.tasks worker --loglevel=info

# ---------- Data tier (Postgres + Redis via docker compose) ----------

db-up:
	cd backend && docker compose up -d
	@echo "Waiting for Postgres healthcheck..."
	@for i in $$(seq 1 30); do \
		HEALTH=$$(docker compose -f backend/docker-compose.yml ps db --format '{{.Health}}' 2>/dev/null); \
		if [ "$$HEALTH" = "healthy" ]; then echo "Postgres healthy."; exit 0; fi; \
		sleep 1; \
	done; \
	echo "Postgres did not become healthy in 30s"; exit 1

db-down:
	cd backend && docker compose down

db-reset:
	cd backend && docker compose down -v
	$(MAKE) db-up
	$(MAKE) backend-migrate

# ---------- Mobile ----------

mobile-start:
	cd mobile && npx expo start

mobile-ios:
	cd mobile && npx expo start --ios

mobile-test:
	cd mobile && npm test -- --watchAll=false

mobile-lint:
	cd mobile && npx eslint .

mobile-format:
	cd mobile && npx prettier --check .

mobile-typecheck:
	cd mobile && npx tsc --noEmit

# ---------- Combined ----------

test: backend-test mobile-test

lint: backend-lint mobile-lint

typecheck: mobile-typecheck

validate: validate-backend validate-mobile

validate-backend: backend-lint backend-test

validate-mobile: mobile-typecheck mobile-lint mobile-test

clean:
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -type d -name .pytest_cache -prune -exec rm -rf {} +
	find . -type d -name .ruff_cache -prune -exec rm -rf {} +
