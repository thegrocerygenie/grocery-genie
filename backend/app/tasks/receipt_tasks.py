from app.tasks.celery_app import celery_app


@celery_app.task
def process_receipt_async(receipt_id: str, image_url: str) -> None:
    """Async receipt processing task.

    Used when sync processing exceeds timeout (202 Accepted path).
    Implementation will call the same ReceiptService.process_receipt logic.
    """
