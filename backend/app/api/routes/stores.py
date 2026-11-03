"""Stores the user shops at: price alert mutes (V1.1: PI-03 AC 4).

Stores are shared across users, so a user can act only on a store they have
a receipt from; any other store answers 404.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.security import get_current_user
from app.models.database import User
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.price_alert_service import PriceAlertService, StoreNotFoundError

router = APIRouter(prefix="/api/stores", tags=["stores"])

STORE_NOT_FOUND = "Store not found"


@router.post("/{store_id}/mute", status_code=204)
async def mute_store(
    store_id: uuid.UUID,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> Response:
    """No price change alerts for prices paid at this store. Idempotent."""
    try:
        await PriceAlertService(db).mute_store(user.id, store_id)
    except StoreNotFoundError:
        raise HTTPException(status_code=404, detail=STORE_NOT_FOUND) from None
    analytics.emit("price_alert_muted", {"scope": "store"}, user.id)
    return Response(status_code=204)


@router.delete("/{store_id}/mute", status_code=204)
async def unmute_store(
    store_id: uuid.UUID,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> Response:
    """Price change alerts for this store again. Idempotent, and never 404:
    it removes only the user's own mute, which can outlive their receipts."""
    await PriceAlertService(db).unmute_store(user.id, store_id)
    return Response(status_code=204)
