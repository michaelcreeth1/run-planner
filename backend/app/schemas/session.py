from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class SessionStatus(BaseModel):
    authenticated: bool
    configured: bool
    username: str | None
