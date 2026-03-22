import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dependencies import get_db
from app.core.security import get_current_user
from app.image.preprocessor import assess_image_quality
from app.image.storage import (
    LocalFileStorage,
    create_thumbnail,
    generate_receipt_path,
    generate_thumbnail_path,
)
from app.llm.provider import (
    CategoryAssigner,
    ReceiptExtractor,
    get_category_assigner,
    get_receipt_extractor,
)
from app.models.database import Receipt as ReceiptModel
from app.models.database import User
from app.models.schemas import (
    LineItemResponse,
    ReceiptListResponse,
    ReceiptResponse,
    ReceiptScanResponse,
    ReceiptUpdateRequest,
)
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.receipt_service import ReceiptService

router = APIRouter(prefix="/api/receipts", tags=["receipts"])

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/heic",
    "application/pdf",
}

QUALITY_CHECKABLE_TYPES = {"image/jpeg", "image/png"}

_CONTENT_TYPE_EXTS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/heic": ".heic",
    "application/pdf": ".pdf",
}


def _content_type_to_ext(content_type: str) -> str:
    return _CONTENT_TYPE_EXTS.get(content_type, ".jpg")


def _receipt_to_response(receipt) -> ReceiptResponse:
    """Convert a Receipt ORM object to a ReceiptResponse schema."""
    return ReceiptResponse(
        id=receipt.id,
        user_id=receipt.user_id,
        store_name=receipt.store.name if receipt.store else None,
        date=receipt.date,
        subtotal=float(receipt.subtotal) if receipt.subtotal else None,
        tax=float(receipt.tax) if receipt.tax else None,
        total=float(receipt.total) if receipt.total else None,
        currency=receipt.currency,
        image_url=receipt.image_url,
        extraction_confidence=receipt.extraction_confidence,
        status=receipt.status,
        items=[LineItemResponse.model_validate(li) for li in receipt.line_items],
        created_at=receipt.created_at,
    )


@router.post("/scan", response_model=ReceiptScanResponse)
async def scan_receipt(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    extractor: ReceiptExtractor = Depends(get_receipt_extractor),
    category_assigner: CategoryAssigner = Depends(get_category_assigner),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> ReceiptScanResponse:
    analytics.emit("receipt_scan_started", {"source": "upload"}, user.id)
    # Validate content type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type: {file.content_type}. "
            f"Accepted: JPEG, PNG, HEIC, PDF.",
        )

    image_data = await file.read()

    # Validate file is not empty
    if not image_data:
        raise HTTPException(status_code=422, detail="Empty file uploaded.")

    # Image quality check (JPEG/PNG only — Pillow doesn't support HEIC)
    if file.content_type in QUALITY_CHECKABLE_TYPES:
        quality = await asyncio.to_thread(assess_image_quality, image_data)
        if not quality.is_acceptable:
            raise HTTPException(
                status_code=422,
                detail=f"Image quality insufficient: {'; '.join(quality.issues)}",
            )

    service = ReceiptService(
        db=db,
        extractor=extractor,
        category_assigner=category_assigner,
        analytics=analytics,
    )
    result = await service.process_receipt(
        user_id=user.id,
        image_data=image_data,
        content_type=file.content_type or "image/jpeg",
    )

    # Reject if extraction confidence is too low (likely not a receipt)
    if result.extraction.confidence < 0.3:
        raise HTTPException(
            status_code=422,
            detail="This doesn't appear to be a receipt.",
        )

    # Store receipt image and generate thumbnail
    settings = get_settings()
    storage = LocalFileStorage(settings.storage_path)

    ext = _content_type_to_ext(file.content_type or "image/jpeg")
    image_path = generate_receipt_path(result.receipt_id, ext)
    await storage.save(image_data, image_path)
    image_url = await storage.get_url(image_path)

    # Generate thumbnail for JPEG/PNG
    if file.content_type in QUALITY_CHECKABLE_TYPES:
        thumb_data = await asyncio.to_thread(
            create_thumbnail, image_data, settings.thumbnail_width
        )
        thumb_path = generate_thumbnail_path(result.receipt_id, ".jpg")
        await storage.save(thumb_data, thumb_path)
        thumbnail_url = await storage.get_url(thumb_path)
    else:
        thumbnail_url = image_url

    # Update receipt with image URLs
    receipt_result = await db.execute(
        sa_select(ReceiptModel).where(ReceiptModel.id == result.receipt_id)
    )
    receipt_record = receipt_result.scalar_one()
    receipt_record.image_url = image_url
    receipt_record.thumbnail_url = thumbnail_url

    return result


@router.get("/{receipt_id}", response_model=ReceiptResponse)
async def get_receipt(
    receipt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReceiptResponse:
    service = ReceiptService(db=db)
    try:
        receipt = await service.get_receipt(uuid.UUID(receipt_id), user.id)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail="Receipt not found") from None
        raise HTTPException(status_code=400, detail=str(e)) from e
    return _receipt_to_response(receipt)


@router.patch("/{receipt_id}", response_model=ReceiptResponse)
async def update_receipt(
    receipt_id: str,
    updates: ReceiptUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    analytics: AnalyticsService = Depends(get_analytics_service),
) -> ReceiptResponse:
    service = ReceiptService(db=db, analytics=analytics)
    try:
        receipt = await service.update_receipt(uuid.UUID(receipt_id), user.id, updates)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail="Receipt not found") from None
        raise HTTPException(status_code=400, detail=str(e)) from e
    return _receipt_to_response(receipt)


@router.get("", response_model=ReceiptListResponse)
async def list_receipts(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    store: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReceiptListResponse:
    service = ReceiptService(db=db)
    receipts, total = await service.list_receipts(
        user_id=user.id,
        page=page,
        per_page=per_page,
        store=store,
        from_date=from_date,
        to_date=to_date,
    )
    return ReceiptListResponse(
        items=[_receipt_to_response(r) for r in receipts],
        total=total,
        page=page,
        per_page=per_page,
    )
