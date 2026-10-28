.PHONY: help \
	install install-backend install-mobile reinstall-backend reinstall-mobile hooks \
	backend-dev backend-test backend-lint backend-format backend-typecheck \
	backend-migrate backend-migration backend-worker kill-port \
	db-up db-down db-reset llm-up llm-down \
	mobile-start mobile-ios mobile-test mobile-lint mobile-format mobile-typecheck \
	test lint format typecheck validate validate-backend validate-mobile \
	clean

# Overridable variables
# Default to 8001 — this dev box already has another service on :8000.
PORT ?= 8001
HOST ?= 0.0.0.0

# Dependency stamps: targets below install first only when a dependency file
# is newer than the stamp.
VENV := backend/.venv
BIN := .venv/bin
BACKEND_DEPS := $(VENV)/.deps-stamp
MOBILE_DEPS := mobile/node_modules/.package-lock.json

# Default target
help:
	@echo "Grocery Genie — repo-level commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install              Install backend + mobile dependencies"
	@echo "  make install-backend      Install backend deps into backend/.venv (editable + dev extras)"
	@echo "  make install-mobile       Install mobile npm deps"
	@echo "  make reinstall-backend    Force a backend install (likewise reinstall-mobile)"
	@echo "  make hooks                Turn on .githooks: install after a pull or branch switch (make install runs it)"
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
	@echo "  make backend-beat         Run Celery beat (weekly summaries, push delivery)"
	@echo "  make llm-up               Start the LiteLLM proxy on :54442 (needs backend/llm-proxy/.env)"
	@echo "  make llm-down             Stop the LiteLLM proxy"
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

install: hooks install-backend install-mobile

# .githooks run `make install` after a pull or branch switch that changes a
# dependency file, so a native build never starts from a stale node_modules.
hooks:
	@git rev-parse --git-dir >/dev/null 2>&1 || exit 0; \
	if [ "$$(git config --get core.hooksPath)" != .githooks ]; then \
		git config core.hooksPath .githooks && echo "Git hooks on: core.hooksPath=.githooks"; \
	fi

install-backend: $(BACKEND_DEPS)

install-mobile: $(MOBILE_DEPS)

reinstall-backend:
	$(MAKE) -B install-backend

reinstall-mobile:
	$(MAKE) -B install-mobile

# backend/.venv is the backend environment (README, launch.json, the verify
# skills). uv makes venvs without pip, so install with uv when it is there.
# pyproject.toml needs Python 3.12+, and macOS python3 is 3.9, so a venv on
# an older Python is removed and made again: with uv (which downloads 3.12
# when needed), else with the first python3.1x found that is 3.12 or newer.
PY_OK := -c 'import sys; sys.exit(sys.version_info < (3, 12))'
$(BACKEND_DEPS): backend/pyproject.toml
	@if ! $(VENV)/bin/python $(PY_OK) 2>/dev/null; then \
		rm -rf $(VENV); \
		if command -v uv >/dev/null 2>&1; then \
			echo "uv venv --python 3.12 $(VENV)"; uv venv --python 3.12 $(VENV); \
		else \
			for py in python3.14 python3.13 python3.12 python3; do \
				if command -v $$py >/dev/null 2>&1 && $$py $(PY_OK); then \
					echo "$$py -m venv $(VENV)"; $$py -m venv $(VENV); break; \
				fi; \
			done; \
		fi; \
		$(VENV)/bin/python $(PY_OK) 2>/dev/null || { \
			echo "backend needs Python 3.12 or newer: install uv (https://docs.astral.sh/uv/) or python3.12, then run make install-backend" >&2; \
			rm -rf $(VENV); exit 1; }; \
	fi
	cd backend && if command -v uv >/dev/null 2>&1; \
		then uv pip install --python $(BIN)/python -e ".[dev]"; \
		else $(BIN)/python -m pip install -e ".[dev]"; fi
	touch $@

# npm leaves its own stamp alone on a no-op install, hence the touch.
$(MOBILE_DEPS): mobile/package.json mobile/package-lock.json $(wildcard mobile/patches/*.patch)
	cd mobile && npm install
	touch $@

backend-dev backend-test backend-lint backend-format backend-migrate backend-migration \
backend-worker backend-beat: $(BACKEND_DEPS)

mobile-start mobile-ios mobile-test mobile-lint mobile-format mobile-typecheck: $(MOBILE_DEPS)

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
	cd backend && $(BIN)/uvicorn main:app --reload --host $(HOST) --port $(PORT)

backend-test:
	cd backend && $(BIN)/pytest

backend-lint:
	cd backend && $(BIN)/ruff check . && $(BIN)/ruff format --check .

backend-format:
	cd backend && $(BIN)/ruff format . && $(BIN)/ruff check --fix .

backend-migrate:
	cd backend && $(BIN)/alembic upgrade head

# Usage: make backend-migration M="add receipts table"
backend-migration:
	@if [ -z "$(M)" ]; then echo "Usage: make backend-migration M=\"message\""; exit 1; fi
	cd backend && $(BIN)/alembic revision --autogenerate -m "$(M)"

backend-worker:
	cd backend && $(BIN)/celery -A app.tasks worker --loglevel=info

# Scheduler for weekly summaries and push delivery; run alongside the worker.
backend-beat:
	cd backend && $(BIN)/celery -A app.tasks beat --loglevel=info

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

# ---------- LLM proxy (LiteLLM via docker compose, profile "llm") ----------

llm-up:
	@test -f backend/llm-proxy/.env || { echo "Missing backend/llm-proxy/.env: copy backend/llm-proxy/.env.example and fill it in."; exit 1; }
	# Recreate so an edit to llm-proxy/config.yaml takes effect.
	cd backend && docker compose --profile llm up -d --force-recreate litellm
	@echo "Waiting for the LiteLLM proxy..."
	@for i in $$(seq 1 60); do \
		if curl -fsS http://localhost:54442/health/liveliness >/dev/null 2>&1; then echo "LiteLLM proxy up on http://localhost:54442"; exit 0; fi; \
		sleep 1; \
	done; \
	echo "LiteLLM proxy did not answer in 60s: docker logs grocery_genie_litellm"; exit 1

llm-down:
	cd backend && docker compose --profile llm stop litellm

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
