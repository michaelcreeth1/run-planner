.PHONY: check coverage test test-postgres

check:
	./scripts/check.sh

coverage:
	./scripts/coverage.sh

test:
	cd backend && .venv/bin/python -m pytest -q
	npm --prefix frontend test

test-postgres:
	@test -n "$(TEST_DATABASE_URL)" || (echo "Set TEST_DATABASE_URL to a disposable PostgreSQL database." >&2; exit 1)
	cd backend && TEST_DATABASE_URL="$(TEST_DATABASE_URL)" RUN_PLANNER_ALLOW_DESTRUCTIVE_TESTS=1 .venv/bin/python -m pytest -q
