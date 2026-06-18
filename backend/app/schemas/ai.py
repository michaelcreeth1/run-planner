from pydantic import BaseModel


class AISuggestion(BaseModel):
    type: str
    reason: str


class AISuggestionResponse(BaseModel):
    summary: str
    riskLevel: str
    suggestions: list[AISuggestion]
    requiresApproval: bool

    @classmethod
    def stub(cls, summary: str) -> "AISuggestionResponse":
        return cls(summary=summary, riskLevel="unknown", suggestions=[], requiresApproval=True)
