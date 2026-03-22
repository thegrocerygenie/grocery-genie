import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.security import get_current_user
from app.models.database import User
from app.models.schemas import NotificationListResponse, NotificationResponse
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationListResponse:
    service = NotificationService(db)
    notifications, total = await service.list_notifications(
        user.id, page=page, per_page=per_page
    )
    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in notifications],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> NotificationResponse:
    service = NotificationService(db)
    try:
        notification = await service.mark_read(uuid.UUID(notification_id), user.id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Notification not found") from None
    if notification.type == "budget_threshold" and notification.data:
        data = json.loads(notification.data)
        analytics.emit(
            "budget_alert_opened",
            {
                "threshold_percent": data.get("threshold"),
                "notification_source": "in_app",
            },
            user.id,
        )
    return NotificationResponse.model_validate(notification)
