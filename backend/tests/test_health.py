from fastapi.testclient import TestClient

from app.main import app


def test_healthz() -> None:
    with TestClient(app) as client:
        response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_version() -> None:
    with TestClient(app) as client:
        response = client.get("/api/version")
    assert response.status_code == 200
    body = response.json()
    assert body["backendVersion"]
    assert body["schemaVersion"]


def test_session_status() -> None:
    with TestClient(app) as client:
        response = client.get("/api/auth/session/status")
    assert response.status_code == 200
    assert response.json()["authenticated"] is False


def test_login_sets_session() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/auth/session/login",
            json={"username": "michael", "password": "test-password"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is True
    assert body["user"]["isAdmin"] is True
    assert body["activeAthleteAccountId"]


def test_protected_routes_require_login() -> None:
    with TestClient(app) as client:
        response = client.get("/api/weeks/current")
    assert response.status_code == 401
