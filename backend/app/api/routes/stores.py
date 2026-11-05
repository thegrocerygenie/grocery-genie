"""The user's stores: list, merge and unmerge (EC Price Intelligence 1,
decision D3), and price alert mutes (V1.1: PI-03 AC 4; muting is Premium,
D8, PREM-02).

Stores are shared across users, so a user can act only on a store they have
a receipt from; any other store answers 404. A merge is the user's own: it
groups their prices and never renames or joins the shared rows.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.entitlements import FEATURE_PRICE_ALERT_MUTE, require_premium
from app.core.security import get_current_user
from app.models.database import User
from app.models.schemas import (
    MuteRequest,
    StoreListResponse,
    StoreMergeRequest,
    StoreRef,
    StoreSummaryResponse,
)
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.price_alert_service import PriceAlertService, mute_event
from app.services.store_service import (
    StoreAlreadyMergedError,
    StoreNotFoundError,
    StoreService,
)

router = APIRouter(prefix="/api/stores", tags=["stores"])

STORE_NOT_FOUND = "Store not found"
ALREADY_MERGED = "These stores are already one store"


async def _list(service: StoreService, user_id: uuid.UUID) -> StoreListResponse:
    return StoreListResponse(
        stores=[
            StoreSummaryResponse(
                id=s.group.id,
                name=s.group.name,
                receipt_count=s.receipt_count,
                merged_stores=[StoreRef(id=m.id, name=m.name) for m in s.merged],
            )
            for s in await service.list_stores(user_id)
        ]
    )


@router.get("", response_model=StoreListResponse)
async def list_stores(
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> StoreListResponse:
    """The user's stores as their prices group them, by name."""
    return await _list(StoreService(db), user.id)


@router.post("/{store_id}/merge", response_model=StoreListResponse)
async def merge_store(
    store_id: uuid.UUID,
    body: StoreMergeRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> StoreListResponse:
    """Group this store's prices under ``into_store_id`` for this user only.
    Answers the store list as it now groups."""
    service = StoreService(db)
    try:
        await service.merge(user.id, store_id, body.into_store_id)
    except StoreNotFoundError:
        raise HTTPException(status_code=404, detail=STORE_NOT_FOUND) from None
    except StoreAlreadyMergedError:
        raise HTTPException(status_code=409, detail=ALREADY_MERGED) from None
    analytics.emit("store_merged", {}, user.id)
    return await _list(service, user.id)


@router.delete("/{store_id}/merge", status_code=204)
async def unmerge_store(
    store_id: uuid.UUID,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> Response:
    """Undo the user's merge of this store. Idempotent, and never 404: it
    removes only the user's own merge, which can outlive their receipts."""
    await StoreService(db).unmerge(user.id, store_id)
    analytics.emit("store_unmerged", {}, user.id)
    return Response(status_code=204)


@router.post("/{store_id}/mute", status_code=204)
async def mute_store(
    store_id: uuid.UUID,
    body: MuteRequest | None = None,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(require_premium(FEATURE_PRICE_ALERT_MUTE)),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> Response:
    """No price change alerts for prices paid at this store, or at any store
    the user merged with it, until ``until`` or forever (PI-03 AC 11). Muting
    again replaces the time. Premium (D8, PREM-02 AC 2); unmuting below is
    open to everyone."""
    until = body.until if body else None
    try:
        await PriceAlertService(db).mute_store(user.id, store_id, until)
    except StoreNotFoundError:
        raise HTTPException(status_code=404, detail=STORE_NOT_FOUND) from None
    analytics.emit("price_alert_muted", mute_event("store", until), user.id)
    return Response(status_code=204)


@router.delete("/{store_id}/mute", status_code=204)
async def unmute_store(
    store_id: uuid.UUID,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> Response:
    """Price change alerts for this store, and every store merged with it,
    again. Idempotent, and never 404: it removes only the user's own mutes,
    which can outlive their receipts."""
    await PriceAlertService(db).unmute_store(user.id, store_id)
    return Response(status_code=204)
