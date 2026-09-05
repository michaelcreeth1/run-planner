from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEPLOYMENT_MARKER = ".run-planner-deployment"


def _write_executable(path: Path, contents: str) -> None:
    path.write_text(contents)
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


@pytest.fixture
def fake_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    scripts = repo / "scripts"
    scripts.mkdir(parents=True)
    shutil.copy2(PROJECT_ROOT / "scripts" / "deploy.sh", scripts / "deploy.sh")
    shutil.copy2(PROJECT_ROOT / "scripts" / "deploy-remote.sh", scripts / "deploy-remote.sh")
    shutil.copy2(PROJECT_ROOT / DEPLOYMENT_MARKER, repo / DEPLOYMENT_MARKER)

    (repo / ".env").write_text(
        "\n".join(
            (
                "APP_ENV=production",
                "APP_BASE_URL=https://run.example.test",
                "API_BASE_URL=https://run.example.test/api",
                "DATABASE_URL=postgresql://runner:secret@postgres:5432/running_planner",
                "SESSION_SECRET=a-long-production-session-secret",
                "APP_USERNAME=runner",
                "APP_PASSWORD=a-long-production-password",
                "TOKEN_ENCRYPTION_KEY=a-long-production-encryption-key",
                "CORS_ORIGINS=https://run.example.test",
                "SESSION_COOKIE_SECURE=true",
                "",
            )
        )
    )
    (repo / "docker-compose.yml").write_text("services: {}\n")
    (repo / "release.txt").write_text("new release\n")
    return repo


@pytest.fixture
def fake_ssh_bin(tmp_path: Path) -> Path:
    bin_dir = tmp_path / "fake-ssh-bin"
    bin_dir.mkdir()
    _write_executable(
        bin_dir / "ssh",
        """#!/usr/bin/env python3
import os
import pathlib
import subprocess
import sys

command = " ".join(sys.argv[2:])
is_deploy = command.startswith("cd ") and "scripts/deploy.sh" in command

if is_deploy:
    state = pathlib.Path(os.environ["FAKE_DEPLOY_STATE"])
    deploy_count = int(state.read_text()) if state.exists() else 0
    state.write_text(str(deploy_count + 1))
    rollback = pathlib.Path(os.environ["FAKE_ROLLBACK_DIR"])
    if deploy_count == 0 and not rollback.is_dir():
        print("rollback was not retained through remote deploy", file=sys.stderr)
        raise SystemExit(91)
    if deploy_count == 0 and os.environ.get("FAKE_REMOTE_DEPLOY_FAIL") == "1":
        print("simulated remote deploy failure", file=sys.stderr)
        raise SystemExit(42)
    raise SystemExit(0)

raise SystemExit(subprocess.run(["/bin/bash", "-c", command], check=False).returncode)
""",
    )
    return bin_dir


@pytest.fixture
def fake_docker_bin(tmp_path: Path) -> tuple[Path, Path]:
    bin_dir = tmp_path / "fake-docker-bin"
    bin_dir.mkdir()
    log_path = tmp_path / "docker-calls.jsonl"
    _write_executable(
        bin_dir / "docker",
        """#!/usr/bin/env python3
import json
import os
import pathlib
import sys

args = sys.argv[1:]
with pathlib.Path(os.environ["FAKE_DOCKER_LOG"]).open("a") as log:
    log.write(json.dumps(args) + "\\n")

if args[:2] == ["compose", "version"]:
    print("Docker Compose version fake")
    raise SystemExit(0)

if args and args[0] == "inspect":
    service = args[-1].removesuffix("-container")
    status_name = f"FAKE_{service.upper()}_STATUS"
    print(os.environ.get(status_name, "healthy"))
    raise SystemExit(0)

if "ps" in args:
    ps_args = args[args.index("ps") + 1 :]
    if "-q" in ps_args:
        print(f"{ps_args[-1]}-container")

raise SystemExit(0)
""",
    )
    return bin_dir, log_path


def _managed_remote(remote: Path) -> None:
    remote.mkdir()
    (remote / DEPLOYMENT_MARKER).write_text("run-planner\n")
    (remote / ".env").write_text("OLD_CONFIG=preserved-on-rollback\n")
    (remote / "release.txt").write_text("old release\n")
    (remote / "obsolete.txt").write_text("only in old release\n")

    preserved_files = {
        "backend/data/runner.sqlite": b"backend database\x00",
        "backend/data/cache/shard.bin": b"cache shard\x00",
        "data/local.sqlite": b"local database\x00",
        "data/imports/activities.json": b"{\"activities\": []}\n",
        "backups/2026-07-17/database.sql": b"-- backup\n",
    }
    for relative_path, contents in preserved_files.items():
        path = remote / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(contents)


def _tree_contents(path: Path) -> dict[str, bytes | None]:
    return {
        str(child.relative_to(path)): None if child.is_dir() else child.read_bytes()
        for child in sorted(path.rglob("*"))
    }


def _persistent_contents(remote: Path) -> dict[str, dict[str, bytes | None]]:
    return {
        relative_path: _tree_contents(remote / relative_path)
        for relative_path in ("backend/data", "data", "backups")
    }


def _remote_deploy(
    repo: Path,
    remote: Path,
    fake_ssh_bin: Path,
    *,
    fail_deploy: bool = False,
) -> subprocess.CompletedProcess[str]:
    rollback = remote.parent / f".{remote.name}.rollback"
    deploy_state = repo.parent / "fake-deploy-state"
    deploy_state.unlink(missing_ok=True)
    env = os.environ.copy()
    env["PATH"] = os.pathsep.join((str(fake_ssh_bin), env["PATH"]))
    env["FAKE_ROLLBACK_DIR"] = str(rollback)
    env["FAKE_DEPLOY_STATE"] = str(deploy_state)
    if fail_deploy:
        env["FAKE_REMOTE_DEPLOY_FAIL"] = "1"

    return subprocess.run(
        [
            str(repo / "scripts" / "deploy-remote.sh"),
            "--host",
            "fake-host",
            "--remote-dir",
            str(remote),
            "--skip-checks",
        ],
        cwd=repo,
        env=env,
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )


def test_remote_deploy_repeatedly_preserves_local_data_and_prunes_rollback(
    fake_repo: Path,
    fake_ssh_bin: Path,
    tmp_path: Path,
) -> None:
    remote = tmp_path / "remote-app"
    rollback = remote.parent / f".{remote.name}.rollback"
    _managed_remote(remote)
    expected_persistent = _persistent_contents(remote)

    for _ in range(2):
        result = _remote_deploy(fake_repo, remote, fake_ssh_bin)
        assert result.returncode == 0, result.stdout + result.stderr
        assert _persistent_contents(remote) == expected_persistent
        assert stat.S_IMODE((remote / ".env").stat().st_mode) == 0o600
        assert not rollback.exists()

    assert (remote / "release.txt").read_text() == "new release\n"
    assert not (remote / "obsolete.txt").exists()
    assert not (remote / "backend" / "data" / "data").exists()
    assert not (remote / "data" / "data").exists()
    assert not (remote / "backups" / "backups").exists()


def test_remote_deploy_rejects_an_unrelated_existing_target(
    fake_repo: Path,
    fake_ssh_bin: Path,
    tmp_path: Path,
) -> None:
    remote = tmp_path / "unrelated-app"
    remote.mkdir()
    (remote / "do-not-touch.txt").write_text("unrelated deployment\n")
    before = _tree_contents(remote)

    result = _remote_deploy(fake_repo, remote, fake_ssh_bin)

    assert result.returncode != 0
    assert _tree_contents(remote) == before
    assert not (remote.parent / f".{remote.name}.rollback").exists()


def test_failed_remote_deploy_restores_the_prior_source(
    fake_repo: Path,
    fake_ssh_bin: Path,
    tmp_path: Path,
) -> None:
    remote = tmp_path / "remote-app"
    rollback = remote.parent / f".{remote.name}.rollback"
    _managed_remote(remote)
    before = _tree_contents(remote)

    result = _remote_deploy(fake_repo, remote, fake_ssh_bin, fail_deploy=True)

    assert result.returncode != 0
    assert "simulated remote deploy failure" in result.stderr
    assert _tree_contents(remote) == before
    assert not rollback.exists()


def _local_deploy(
    repo: Path,
    fake_docker_bin: tuple[Path, Path],
    *,
    worker_status: str = "healthy",
) -> tuple[subprocess.CompletedProcess[str], list[list[str]]]:
    bin_dir, log_path = fake_docker_bin
    env = os.environ.copy()
    env["PATH"] = os.pathsep.join((str(bin_dir), env["PATH"]))
    env["FAKE_DOCKER_LOG"] = str(log_path)
    env["FAKE_WORKER_STATUS"] = worker_status

    result = subprocess.run(
        [str(repo / "scripts" / "deploy.sh"), "--skip-build"],
        cwd=repo,
        env=env,
        text=True,
        capture_output=True,
        timeout=10,
        check=False,
    )
    calls = [json.loads(line) for line in log_path.read_text().splitlines()]
    return result, calls


def _queried_service(calls: list[list[str]], service: str) -> bool:
    return any("ps" in call and "-q" in call and call[-1] == service for call in calls)


def test_local_deploy_waits_for_every_required_service(
    fake_repo: Path,
    fake_docker_bin: tuple[Path, Path],
) -> None:
    result, calls = _local_deploy(fake_repo, fake_docker_bin)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Required services are healthy: api worker frontend" in result.stdout
    assert all(_queried_service(calls, service) for service in ("api", "worker", "frontend"))


def test_local_deploy_fails_when_the_worker_is_unhealthy(
    fake_repo: Path,
    fake_docker_bin: tuple[Path, Path],
) -> None:
    result, calls = _local_deploy(fake_repo, fake_docker_bin, worker_status="unhealthy")

    assert result.returncode != 0
    assert "Required service worker entered status: unhealthy" in result.stderr
    assert "Deployment failed. Recent logs:" in result.stderr
    assert _queried_service(calls, "api")
    assert _queried_service(calls, "worker")
    assert any("logs" in call and call[-3:] == ["api", "worker", "frontend"] for call in calls)
