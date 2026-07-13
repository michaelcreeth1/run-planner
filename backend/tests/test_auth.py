import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core import session as session_tokens
from app.core.session import COOKIE_NAME
from app.db.session import SessionLocal
from app.main import app
from app.models.planning import AthleteAccount, UserAccount


def login(client: TestClient, username: str = "michael", password: str = "test-password") -> dict:
    response = client.post(
        "/api/auth/session/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()


def create_user(client: TestClient, username: str = "bob", *, is_admin: bool = False) -> dict:
    response = client.post(
        "/api/auth/users",
        json={
            "username": username,
            "displayName": username.title(),
            "password": "runner-password",
            "isAdmin": is_admin,
            "initialProfileName": f"{username.title()} runner",
            "timezone": "America/Denver",
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.parametrize(
    ("username", "password"),
    [("michael", "wrong-password"), ("missing-user", "test-password")],
)
def test_login_rejects_invalid_credentials_without_account_disclosure(
    username: str,
    password: str,
) -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/auth/session/login",
            json={"username": username, "password": password},
        )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials."}


def test_login_cookie_and_logout_lifecycle() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/auth/session/login",
            json={"username": "michael", "password": "test-password"},
        )
        set_cookie = response.headers["set-cookie"]

        assert response.status_code == 200
        assert f"{COOKIE_NAME}=" in set_cookie
        assert "HttpOnly" in set_cookie
        assert "SameSite=lax" in set_cookie
        assert "Max-Age=" in set_cookie
        assert client.get("/api/auth/session/status").json()["authenticated"] is True

        logout = client.post("/api/auth/session/logout")

        assert logout.status_code == 200
        assert logout.json()["authenticated"] is False
        assert f"{COOKIE_NAME}=\"\"" in logout.headers["set-cookie"]
        assert client.get("/api/weeks/current").status_code == 401


def test_session_tokens_reject_tampering_and_expiration(monkeypatch: pytest.MonkeyPatch) -> None:
    now = 1_000_000
    monkeypatch.setattr(session_tokens.time, "time", lambda: now)
    token = session_tokens.create_session_token("user-1", "profile-1")

    assert session_tokens.verify_session_token(token) is not None
    replacement = "A" if token[-1] != "A" else "B"
    assert session_tokens.verify_session_token(f"{token[:-1]}{replacement}") is None

    monkeypatch.setattr(
        session_tokens.time,
        "time",
        lambda: now + session_tokens.settings.session_ttl_seconds + 1,
    )
    assert session_tokens.verify_session_token(token) is None


def test_non_admin_cannot_create_users() -> None:
    with TestClient(app) as client:
        login(client)
        create_user(client)
        client.post("/api/auth/session/logout")
        login(client, "bob", "runner-password")

        response = client.post(
            "/api/auth/users",
            json={
                "username": "charlie",
                "displayName": "Charlie",
                "password": "another-password",
            },
        )

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin access required."}


def test_admin_user_creation_normalizes_and_rejects_duplicates() -> None:
    with TestClient(app) as client:
        login(client)
        created = create_user(client, "  BOB  ")
        duplicate = client.post(
            "/api/auth/users",
            json={
                "username": "bob",
                "displayName": "Another Bob",
                "password": "another-password",
            },
        )

    assert created["username"] == "bob"
    assert duplicate.status_code == 409
    assert duplicate.json() == {"detail": "Username already exists."}


def test_profile_switch_requires_ownership_and_preserves_active_profile_on_failure() -> None:
    with TestClient(app) as client:
        admin = login(client)
        extra_profile = client.post(
            "/api/auth/profiles",
            json={"displayName": "Second profile", "timezone": "America/New_York"},
        )
        assert extra_profile.status_code == 201
        create_user(client)

        client.post("/api/auth/session/logout")
        bob = login(client, "bob", "runner-password")
        bob_profile_id = bob["activeAthleteAccountId"]

        denied = client.post(
            "/api/auth/session/profile",
            json={"athleteAccountId": extra_profile.json()["id"]},
        )
        status = client.get("/api/auth/session/status").json()

    assert admin["activeAthleteAccountId"] != bob_profile_id
    assert denied.status_code == 404
    assert status["authenticated"] is True
    assert status["activeAthleteAccountId"] == bob_profile_id


def test_disabled_user_loses_existing_session() -> None:
    with TestClient(app) as client:
        login(client)
        create_user(client)
        client.post("/api/auth/session/logout")
        login(client, "bob", "runner-password")

        with SessionLocal() as db:
            bob = db.scalars(select(UserAccount).where(UserAccount.username == "bob")).one()
            bob.is_disabled = 1
            db.commit()

        status = client.get("/api/auth/session/status")
        protected = client.get("/api/weeks/current")

    assert status.status_code == 200
    assert status.json()["authenticated"] is False
    assert protected.status_code == 401


def test_session_bound_to_foreign_profile_is_rejected() -> None:
    with TestClient(app) as client:
        admin = login(client)
        admin_user_id = admin["user"]["id"]
        create_user(client)

        with SessionLocal() as db:
            bob = db.scalars(select(UserAccount).where(UserAccount.username == "bob")).one()
            bob_profile = db.scalars(
                select(AthleteAccount).where(AthleteAccount.owner_user_id == bob.id)
            ).one()

        forged = session_tokens.create_session_token(admin_user_id, bob_profile.id)
        client.cookies.clear()
        client.cookies.set(COOKIE_NAME, forged)
        status = client.get("/api/auth/session/status")
        protected = client.get("/api/weeks/current")

    assert status.status_code == 200
    assert status.json()["authenticated"] is False
    assert protected.status_code == 404


@pytest.mark.parametrize(
    "path",
    [
        "/api/activities",
        "/api/analytics/planning",
        "/api/default-goals",
        "/api/goal-races",
        "/api/plans",
        "/api/sync/jobs",
        "/api/training-timeline",
        "/api/auth/strava/status",
    ],
)
def test_protected_read_endpoints_require_authentication(path: str) -> None:
    with TestClient(app) as client:
        response = client.get(path)

    assert response.status_code == 401
