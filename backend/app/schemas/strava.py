from datetime import datetime

from pydantic import BaseModel, ConfigDict


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class StravaConnectionStatus(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    connected: bool
    configured: bool
    athlete_name: str | None
    granted_scopes: list[str]
    expires_at: datetime | None
    message: str
