from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery("grocery_genie", broker=settings.redis_url)
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
        "schedule": crontab(hour=9, minute=0, day_of_week=0),  # Sunday 9 AM UTC
    },
}
