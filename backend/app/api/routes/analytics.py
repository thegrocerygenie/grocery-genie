from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.models.database import User
from app.models.schemas import AnalyticsEventRequest
from app.services.analytics_events import CLIENT_EMITTABLE_EVENTS
from app.services.analytics_service import AnalyticsService, get_analytics_service

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.post("/events", status_code=204)
async def ingest_event(
    body: AnalyticsEventRequest,
    user: User = Depends(get_current_user),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> None:
    """Ingest a client-emitted analytics event.

    Only events in ``CLIENT_EMITTABLE_EVENTS`` are accepted; the ``user_id`` is
    taken from the authenticated JWT, never from the request body.
    """
    if body.event_name not in CLIENT_EMITTABLE_EVENTS:
        raise HTTPException(
            status_code=422,
            detail=f"Event not accepted: {body.event_name}",
        )
    analytics.emit(body.event_name, dict(body.properties), user.id)
