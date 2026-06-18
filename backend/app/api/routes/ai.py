from fastapi import APIRouter

from app.schemas.ai import AISuggestionResponse

router = APIRouter(tags=["ai"])


@router.post("/weekly-draft", response_model=AISuggestionResponse)
def weekly_draft() -> AISuggestionResponse:
    return AISuggestionResponse.stub("Weekly draft suggestions are stubbed for Phase 0.")


@router.post("/adjust-week", response_model=AISuggestionResponse)
def adjust_week() -> AISuggestionResponse:
    return AISuggestionResponse.stub("Adjust-week suggestions are stubbed for Phase 0.")


@router.post("/explain-risk", response_model=AISuggestionResponse)
def explain_risk() -> AISuggestionResponse:
    return AISuggestionResponse.stub("Risk explanations are stubbed for Phase 0.")


@router.post("/summarize-week", response_model=AISuggestionResponse)
def summarize_week() -> AISuggestionResponse:
    return AISuggestionResponse.stub("Week summaries are stubbed for Phase 0.")
