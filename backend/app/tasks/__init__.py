# `celery -A app.tasks worker|beat` looks up `app.tasks.celery`.
from app.tasks.celery_app import celery_app as celery

__all__ = ["celery"]
