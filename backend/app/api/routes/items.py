"""Canonical items, price history, comparison and alerts (V1.1: PI-01..04)."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.entitlements import (
    FEATURE_PRICE_ALERT_MUTE,
    FEATURE_PRICE_COMPARISON,
    require_premium,
)
from app.core.security import get_current_user
from app.models.database import (
    CanonicalItem,
    ItemMatchSuggestion,
    PriceObservation,
    User,
)
from app.models.schemas import (
    ItemAliasResponse,
    ItemDetailResponse,
    ItemListResponse,
    ItemMergeRequest,
    ItemRef,
    ItemRenameRequest,
    ItemSplitRequest,
    ItemSplitResponse,
    ItemSuggestionResponse,
    ItemSummaryResponse,
    LatestPrice,
    LinkCandidatesResponse,
    PriceAlertSettingsResponse,
    PriceAlertSettingsUpdate,
    PriceComparisonResponse,
    PriceHistoryResponse,
    PricePointResponse,
    StorePriceResponse,
    StoreRef,
    SuggestedItemStats,
    SuggestionReceiptLine,
)
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.item_matching_service import (
    ItemMatchConflictError,
    ItemMatchingService,
    ItemNotFoundError,
    SplitLineError,
    SplitPart,
)
from app.services.price_alert_service import PriceAlertService, PriceAlertSettings
from app.services.price_service import (
    MIN_COMPARISON_OBSERVATIONS,
    MIN_TIMELINE_POINTS,
    ItemSummary,
    PriceService,
)
from app.services.receipt_service import ReceiptService
from app.services.store_service import StoreGroup, StoreService

router = APIRouter(prefix="/api/items", tags=["items"])

ITEM_NOT_FOUND = "Item not found"
# PI-02 AC 15: items listed on the Link items sheet, at most.
LINK_CANDIDATES_MAX = 500


def _latest(
    observation: PriceObservation | None, stores: dict[uuid.UUID, StoreGroup]
) -> LatestPrice | None:
    if observation is None:
        return None
    store = stores.get(observation.store_id) if observation.store_id else None
    return LatestPrice(
        unit_price=float(observation.unit_price),
        unit_of_measure=observation.unit_of_measure,
        currency=observation.currency,
        date=observation.date,
        store_name=store.name if store else None,
    )


def _money(value) -> float | None:
    return float(value) if value is not None else None


def _summary(
    s: ItemSummary, stores: dict[uuid.UUID, StoreGroup]
) -> ItemSummaryResponse:
    return ItemSummaryResponse(
        id=s.item.id,
        canonical_name=s.item.canonical_name,
        unit_of_measure=s.item.unit_of_measure,
        observation_count=s.observation_count,
        store_count=s.store_count,
        latest_price=_latest(s.latest, stores),
        avg_unit_price=_money(s.average),
    )


async def _store_groups(
    db: AsyncSession,
    user_id: uuid.UUID,
    observations: list[PriceObservation | None],
) -> dict[uuid.UUID, StoreGroup]:
    """The stores of these prices as the user groups them (their merges)."""
    return await StoreService(db).groups(
        user_id, {o.store_id for o in observations if o is not None}
    )


async def _suggestion(
    db: AsyncSession, user_id: uuid.UUID, suggestion: ItemMatchSuggestion
) -> ItemSuggestionResponse:
    """A suggestion with what the "Same item?" prompt shows (PI-02 AC 5, 8),
    all of it the caller's own."""
    found = await ItemMatchingService(db).suggestion_line(user_id, suggestion.item_id)
    line = None
    if found is not None:
        line_item, receipt = found
        store = None
        if receipt.store_name is None and receipt.store_id is not None:
            store = (await StoreService(db).groups(user_id, {receipt.store_id})).get(
                receipt.store_id
            )
        line = SuggestionReceiptLine(
            receipt_id=receipt.id,
            name=line_item.raw_name,
            store_name=receipt.store_name or (store.name if store else None),
            date=receipt.date,
        )
    stats = await PriceService(db).purchase_stats(user_id, suggestion.suggested_item_id)
    return ItemSuggestionResponse(
        id=suggestion.id,
        item=ItemRef.model_validate(suggestion.item),
        suggested_item=ItemRef.model_validate(suggestion.suggested_item),
        confidence=suggestion.confidence,
        method=suggestion.method,
        receipt_line=line,
        suggested_item_stats=SuggestedItemStats(
            purchase_count=stats.purchase_count,
            store_count=stats.store_count,
            avg_unit_price=float(stats.average) if stats.average is not None else None,
            unit_of_measure=stats.unit_of_measure,
            currency=stats.currency,
        ),
    )


async def _detail(
    db: AsyncSession, user_id: uuid.UUID, item: CanonicalItem
) -> ItemDetailResponse:
    await db.refresh(item, ["aliases"])
    prices = PriceService(db)
    count, stores, latest = await prices.item_stats(user_id, item.id)
    average = (await prices.averages(user_id, [item.id])).get(item.id)
    groups = await _store_groups(db, user_id, [latest])
    suggestions = await ItemMatchingService(db).list_suggestions(user_id, item.id)
    return ItemDetailResponse(
        id=item.id,
        canonical_name=item.canonical_name,
        unit_of_measure=item.unit_of_measure,
        observation_count=count,
        store_count=stores,
        latest_price=_latest(latest, groups),
        avg_unit_price=_money(average),
        aliases=[ItemAliasResponse.model_validate(a) for a in item.aliases],
        suggestions=[await _suggestion(db, user_id, s) for s in suggestions],
        alerts_muted=await PriceAlertService(db).is_item_muted(user_id, item.id),
    )


def _settings(settings: PriceAlertSettings) -> PriceAlertSettingsResponse:
    return PriceAlertSettingsResponse(
        enabled=settings.enabled,
        threshold_percent=settings.threshold_percent,
        default_threshold_percent=settings.default_threshold_percent,
        cooldown_days=settings.cooldown_days,
        default_cooldown_days=settings.default_cooldown_days,
        muted_items=[ItemRef.model_validate(i) for i in settings.muted_items],
        muted_stores=[StoreRef.model_validate(s) for s in settings.muted_stores],
    )


async def _get_item(
    service: ItemMatchingService, user_id: uuid.UUID, item_id: uuid.UUID
) -> CanonicalItem:
    try:
        return await service.get_item(user_id, item_id)
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail=ITEM_NOT_FOUND) from None


@router.get("", response_model=ItemListResponse)
async def list_items(
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> ItemListResponse:
    """Items the user has bought, most recent first. ``q`` searches names."""
    summaries, total = await PriceService(db).list_items(
        user.id, query=q, page=page, per_page=per_page
    )
    groups = await _store_groups(db, user.id, [s.latest for s in summaries])
    pending = await ItemMatchingService(db).list_suggestions(user.id)
    return ItemListResponse(
        items=[_summary(s, groups) for s in summaries],
        total=total,
        page=page,
        per_page=per_page,
        pending_suggestions=len(pending),
    )


@router.get("/suggestions", response_model=list[ItemSuggestionResponse])
async def list_suggestions(
    receipt_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> list[ItemSuggestionResponse]:
    """Possible matches waiting for the user to confirm (PI-02 AC 2).

    ``receipt_id``: only those that receipt's lines raised, for the prompt
    after a confirm (PI-02 AC 7, 8). Another user's receipt is 404.
    """
    if receipt_id is not None:
        try:
            await ReceiptService(db=db).get_receipt(receipt_id, user.id)
        except ValueError:
            raise HTTPException(status_code=404, detail="Receipt not found") from None
    suggestions = await ItemMatchingService(db).list_suggestions(
        user.id, receipt_id=receipt_id
    )
    return [await _suggestion(db, user.id, s) for s in suggestions]


@router.post("/suggestions/{suggestion_id}/accept", response_model=ItemDetailResponse)
async def accept_suggestion(
    suggestion_id: uuid.UUID,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> ItemDetailResponse:
    """Same product: merge the two items. Returns the merged item."""
    service = ItemMatchingService(db)
    try:
        item, match = await service.accept_suggestion(user.id, suggestion_id)
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail="Suggestion not found") from None
    except ItemMatchConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    analytics.emit(
        "item_match_resolved",
        {
            "decision": "accepted",
            "method": match.method,
            "confidence": match.confidence,
        },
        user.id,
    )
    return await _detail(db, user.id, item)


@router.post("/suggestions/{suggestion_id}/reject", status_code=204)
async def reject_suggestion(
    suggestion_id: uuid.UUID,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> Response:
    """Different products: keep both items."""
    service = ItemMatchingService(db)
    try:
        suggestion = await service.reject_suggestion(user.id, suggestion_id)
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail="Suggestion not found") from None
    except ItemMatchConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    analytics.emit(
        "item_match_resolved",
        {
            "decision": "rejected",
            "method": suggestion.method,
            "confidence": suggestion.confidence,
        },
        user.id,
    )
    return Response(status_code=204)


@router.get("/price-alert-settings", response_model=PriceAlertSettingsResponse)
async def get_price_alert_settings(
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> PriceAlertSettingsResponse:
    """Price change alerts (PI-03): on or off, threshold, muted items and stores."""
    return _settings(await PriceAlertService(db).get_settings(user))


@router.put("/price-alert-settings", response_model=PriceAlertSettingsResponse)
async def update_price_alert_settings(
    body: PriceAlertSettingsUpdate,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> PriceAlertSettingsResponse:
    """Fields left out stay as they are; ``threshold_percent: null`` and
    ``cooldown_days: null`` reset them to the default."""
    changes = body.model_dump(exclude_unset=True)
    return _settings(await PriceAlertService(db).update_settings(user, changes))


@router.get("/{item_id}", response_model=ItemDetailResponse)
async def get_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> ItemDetailResponse:
    item = await _get_item(ItemMatchingService(db), user.id, item_id)
    return await _detail(db, user.id, item)


@router.get("/{item_id}/prices", response_model=PriceHistoryResponse)
async def get_price_history(
    item_id: uuid.UUID,
    store: uuid.UUID | None = Query(default=None, description="Store id"),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> PriceHistoryResponse:
    """Every price paid for the item, oldest first (PI-01)."""
    item = await _get_item(ItemMatchingService(db), user.id, item_id)
    prices = PriceService(db)
    history = await prices.history(
        user.id, item, store_id=store, from_date=from_date, to_date=to_date
    )
    names = await prices.line_names(
        [p.observation.line_item_id for p in history.points]
    )
    analytics.emit(
        "price_history_viewed",
        {"canonical_item_id": str(item.id), "store_count": history.store_count},
        user.id,
    )
    return PriceHistoryResponse(
        item=ItemRef.model_validate(item),
        unit_of_measure=history.unit_of_measure,
        currency=history.currency,
        has_timeline=history.has_timeline,
        min_points=MIN_TIMELINE_POINTS,
        store_count=history.store_count,
        observations=[
            PricePointResponse(
                receipt_id=p.observation.receipt_id,
                line_item_id=p.observation.line_item_id,
                line_name=names.get(p.observation.line_item_id, ""),
                date=p.observation.date,
                store_id=p.store_id,
                store_name=p.store_name,
                unit_price=float(p.observation.unit_price),
                quantity=float(p.observation.quantity),
                unit_of_measure=p.observation.unit_of_measure,
                currency=p.observation.currency,
                in_timeline=(
                    p.observation.unit_of_measure == history.unit_of_measure
                    and p.observation.currency == history.currency
                ),
            )
            for p in history.points
        ],
    )


@router.get("/{item_id}/compare", response_model=PriceComparisonResponse)
async def compare_prices(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(require_premium(FEATURE_PRICE_COMPARISON)),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> PriceComparisonResponse:
    """Latest and average price of the item at each store (PI-04). Premium
    (D8, PREM-02 AC 1): a free user gets ``403 premium_required``."""
    item = await _get_item(ItemMatchingService(db), user.id, item_id)
    comparison = await PriceService(db).compare(user.id, item)
    analytics.emit(
        "price_comparison_viewed",
        {"canonical_item_id": str(item.id), "store_count": len(comparison.stores)},
        user.id,
    )
    return PriceComparisonResponse(
        item=ItemRef.model_validate(item),
        unit_of_measure=comparison.unit_of_measure,
        currency=comparison.currency,
        min_observations=MIN_COMPARISON_OBSERVATIONS,
        stores=[
            StorePriceResponse(
                store_id=s.store_id,
                store_name=s.store_name,
                latest_price=float(s.latest.unit_price),
                latest_date=s.latest.date,
                avg_price=float(s.average),
                observation_count=s.observation_count,
            )
            for s in comparison.stores
        ],
        stores_below_minimum=comparison.stores_below_minimum,
    )


@router.patch("/{item_id}", response_model=ItemDetailResponse)
async def rename_item(
    item_id: uuid.UUID,
    body: ItemRenameRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> ItemDetailResponse:
    service = ItemMatchingService(db)
    try:
        item = await service.rename(user.id, item_id, body.canonical_name)
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail=ITEM_NOT_FOUND) from None
    return await _detail(db, user.id, item)


@router.post("/{item_id}/merge", response_model=ItemDetailResponse)
async def merge_item(
    item_id: uuid.UUID,
    body: ItemMergeRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> ItemDetailResponse:
    """Link two items (PI-02 AC 3): this one folds into ``into_item_id``."""
    service = ItemMatchingService(db)
    try:
        item = await service.merge(user.id, item_id, body.into_item_id)
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail=ITEM_NOT_FOUND) from None
    except ItemMatchConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return await _detail(db, user.id, item)


@router.post(
    "/{item_id}/aliases/{alias_id}/split",
    response_model=ItemDetailResponse,
    status_code=201,
)
async def split_alias(
    item_id: uuid.UUID,
    alias_id: uuid.UUID,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> ItemDetailResponse:
    """Unlink a name (PI-02 AC 3): it becomes its own item. Returns the new item."""
    service = ItemMatchingService(db)
    try:
        item = await service.split_alias(user.id, item_id, alias_id)
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail=ITEM_NOT_FOUND) from None
    except ItemMatchConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return await _detail(db, user.id, item)


@router.post("/{item_id}/split", response_model=ItemSplitResponse, status_code=201)
async def split_item(
    item_id: uuid.UUID,
    body: ItemSplitRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> ItemSplitResponse:
    """Split by line (PI-02 AC 10-14): each split's lines, with their prices,
    become a new item of that name. Returns the new items, in order."""
    service = ItemMatchingService(db)
    try:
        new_items = await service.split_lines(
            user.id,
            item_id,
            [SplitPart(p.name, p.line_item_ids) for p in body.splits],
        )
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail=ITEM_NOT_FOUND) from None
    except SplitLineError:
        raise HTTPException(
            status_code=422,
            detail="Each line must be one of the item's, in one split only",
        ) from None
    except ItemMatchConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return ItemSplitResponse(
        items=[await _detail(db, user.id, new_item) for new_item in new_items]
    )


@router.get("/{item_id}/link-candidates", response_model=LinkCandidatesResponse)
async def link_candidates(
    item_id: uuid.UUID,
    q: str | None = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> LinkCandidatesResponse:
    """The Link items sheet (PI-02 AC 15): "Suggested" (the item's pending
    suggestions, then the most similar names) and "All items" (the rest, most
    recently bought first). ``q`` narrows both; the item is never listed."""
    service = ItemMatchingService(db)
    item = await _get_item(service, user.id, item_id)
    summaries, _ = await PriceService(db).list_items(
        user.id, query=q, page=1, per_page=LINK_CANDIDATES_MAX
    )
    others = {s.item.id: s for s in summaries if s.item.id != item.id}
    suggested = await service.link_candidates(user.id, item, list(others))
    groups = await _store_groups(db, user.id, [s.latest for s in others.values()])
    return LinkCandidatesResponse(
        suggested=[_summary(others[i], groups) for i in suggested],
        items=[
            _summary(s, groups) for i, s in others.items() if i not in set(suggested)
        ],
    )


@router.post("/{item_id}/mute", status_code=204)
async def mute_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(require_premium(FEATURE_PRICE_ALERT_MUTE)),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> Response:
    """No price change alerts for this item (PI-03 AC 4). Idempotent. Premium
    (D8, PREM-02 AC 2); unmuting below is open to everyone."""
    item = await _get_item(ItemMatchingService(db), user.id, item_id)
    await PriceAlertService(db).mute_item(user.id, item.id)
    analytics.emit("price_alert_muted", {"scope": "item"}, user.id)
    return Response(status_code=204)


@router.delete("/{item_id}/mute", status_code=204)
async def unmute_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
) -> Response:
    """Price change alerts for this item again. Idempotent."""
    item = await _get_item(ItemMatchingService(db), user.id, item_id)
    await PriceAlertService(db).unmute_item(user.id, item.id)
    return Response(status_code=204)
