import os
from pathlib import Path

test_database_path = Path(__file__).resolve().parents[1] / "data" / "test_running_planner.db"
test_database_path.unlink(missing_ok=True)

os.environ["DATABASE_URL"] = f"sqlite:///{test_database_path}"
os.environ["APP_USERNAME"] = "michael"
os.environ["APP_PASSWORD"] = "test-password"
