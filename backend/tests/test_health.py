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
