from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class LoginRequest(ApiModel):
    username: str
    password: str


class SessionUser(ApiModel):
    id: str
    username: str
    display_name: str
    is_admin: bool


class AthleteProfile(ApiModel):
    id: str
    display_name: str
    timezone: str
    strava_athlete_id: str | None = None


class SessionStatus(ApiModel):
    authenticated: bool
    configured: bool
    username: str | None = None
    user: SessionUser | None = None
    active_athlete_account_id: str | None = None
    profiles: list[AthleteProfile] = []


class ProfileSwitchRequest(ApiModel):
    athlete_account_id: str


class UserCreate(ApiModel):
    username: str = Field(min_length=1, max_length=80)
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=256)
    is_admin: bool = False
    initial_profile_name: str | None = Field(default=None, max_length=120)
    timezone: str = Field(default="America/Denver", max_length=80)


class ProfileCreate(ApiModel):
    display_name: str = Field(min_length=1, max_length=120)
    timezone: str = Field(default="America/Denver", max_length=80)
