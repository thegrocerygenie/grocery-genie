from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "grocery_genie",
    broker=settings.redis_url,
    # Task modules the worker imports at startup so their tasks register.
    include=[
        "app.tasks.purge_tasks",
        "app.tasks.push_tasks",
        "app.tasks.receipt_tasks",
        "app.tasks.summary_tasks",
    ],
)
celery_app.config_from_object(
    {
        "task_serializer": "json",
        "result_serializer": "json",
        "accept_content": ["json"],
        "timezone": "UTC",
    }
)

celery_app.conf.beat_schedule = {
    "weekly-spending-summary": {
        "task": "app.tasks.summary_tasks.generate_weekly_summaries",
        "schedule": crontab(hour=9, minute=0),  # daily 9 AM UTC; users pick their day
    },
    # NFR: push delivered within 5 minutes of the trigger.
    "deliver-pending-pushes": {
        "task": "app.tasks.push_tasks.deliver_pending_pushes",
        "schedule": 60.0,
    },
    # Erase soft-deleted receipts and budgets past the 30-day restore window.
    "purge-expired-deletions": {
        "task": "app.tasks.purge_tasks.purge_expired_deletions",
        "schedule": crontab(hour=3, minute=30),
    },
}
