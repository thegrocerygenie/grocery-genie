"""The worker and beat start with `celery -A app.tasks`; they must find the
app and every task module."""

import importlib


def test_app_tasks_exposes_celery_app():
    """`celery -A app.tasks` looks for an attribute named `celery`."""
    tasks_pkg = importlib.import_module("app.tasks")
    from app.tasks.celery_app import celery_app

    assert tasks_pkg.celery is celery_app


def test_worker_registers_all_tasks():
    from app.tasks.celery_app import celery_app

    celery_app.loader.import_default_modules()

    assert "app.tasks.summary_tasks.generate_weekly_summaries" in celery_app.tasks


def test_beat_purges_old_auth_events_daily():
    from app.tasks.celery_app import celery_app

    celery_app.loader.import_default_modules()
    tasks = {entry["task"] for entry in celery_app.conf.beat_schedule.values()}

    assert "app.tasks.auth_event_tasks.purge_old_auth_events" in tasks
    assert "app.tasks.auth_event_tasks.purge_old_auth_events" in celery_app.tasks
