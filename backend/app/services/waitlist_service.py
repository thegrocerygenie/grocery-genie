"""The waitlist's free year of Premium (V11-P5).

The marketing site promised waitlist sign-ups "a free year of Premium" when
it launches (decision #2). The rules (decisions #7, #9-#13, plan D5):

- **Who:** an account whose verified email, trimmed and lowercased, equals a
  waitlist contact's (``waitlist_entries``, copied from the Resend audience),
  for a contact created before ``settings.waitlist_cutoff``. Unsubscribed
  contacts count (#10).
- **When:** only inside the claim window, ``waitlist_claim_window_days`` from
  ``settings.premium_launched_at`` (#9). Matching runs on an Apple or Google
  sign-in, on ``verify-email``, on a confirmed email change, once over every
  account at launch (``match_all``), and through the Settings claim step for
  an account whose email is not the waitlist one (Hide My Email).
- **What:** a RevenueCat promotional grant of the Premium entitlement for
  ``waitlist_free_months`` from the match (#9, #12). RevenueCat stays the
  only source of Premium (D1): the grant goes to RevenueCat's REST API, then
  ``PremiumService.refresh`` reads it back.
- **Once:** one free year per waitlist email, ever, and one per account. A
  ``waitlist_redemptions`` row holds a salted hash of the waitlist email (its
  unique key) and the account; it is written, and committed, before the
  grant, so a RevenueCat failure leaves it pending for ``retry_pending``.
  Account deletion keeps the hash unlinked until the window closes (#13).
"""

from __future__ import annotations

import calendar
import hashlib
import hmac
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.config import get_settings
from app.core.security import generate_email_token, hash_email_token
from app.models.database import User, WaitlistEntry, WaitlistRedemption
from app.services import email as email_service
from app.services.premium_service import PremiumService
from app.services.revenuecat_client import RevenueCatClient, RevenueCatUnavailableError

logger = logging.getLogger(__name__)

PENDING = "pending"
GRANTED = "granted"

SOURCE_SOCIAL_SIGN_IN = "social_sign_in"
SOURCE_VERIFY_EMAIL = "verify_email"
SOURCE_EMAIL_CHANGE = "email_change"
SOURCE_BACKFILL = "backfill"
SOURCE_CLAIM = "claim"

# A claim link is sent to the waitlist inbox, which the user may not have on
# the phone: a day to tap it.
CLAIM_TOKEN_TTL = timedelta(hours=24)
# A pending grant is retried once its last attempt is this old, so the beat
# retry does not race the request that just tried.
RETRY_AFTER = timedelta(minutes=5)


class Analytics(Protocol):
    def emit(self, event_name: str, properties: dict, user_id: uuid.UUID) -> None: ...


# -- pure helpers --------------------------------------------------------------


def normalize_email(email: str) -> str:
    """Trimmed and lowercased, as the site stores waitlist emails."""
    return email.strip().lower()


def hash_waitlist_email(email: str, salt: str | None = None) -> str:
    """A salted, one-way hash of a waitlist email (decision #13): HMAC-SHA256
    keyed with ``settings.waitlist_email_hash_salt``."""
    key = get_settings().waitlist_email_hash_salt if salt is None else salt
    return hmac.new(
        key.encode(), normalize_email(email).encode(), hashlib.sha256
    ).hexdigest()


def add_months(value: datetime, months: int) -> datetime:
    """``value`` plus ``months`` calendar months; a day the target month lacks
    (29 February next year) becomes its last day."""
    index = value.month - 1 + months
    year, month = value.year + index // 12, index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


@dataclass(frozen=True)
class ClaimWindow:
    opens_at: datetime
    closes_at: datetime

    def is_open(self, now: datetime) -> bool:
        return self.opens_at <= now < self.closes_at


def claim_window() -> ClaimWindow | None:
    """The claim window, or None while Premium has no launch date set."""
    settings = get_settings()
    launched = _utc(settings.premium_launched_at)
    if launched is None:
        return None
    return ClaimWindow(
        launched, launched + timedelta(days=settings.waitlist_claim_window_days)
    )


def window_is_open(now: datetime | None = None) -> bool:
    window = claim_window()
    return window is not None and window.is_open(now or clock.now())


def window_has_closed(now: datetime | None = None) -> bool:
    window = claim_window()
    return window is not None and (now or clock.now()) >= window.closes_at


# -- errors --------------------------------------------------------------------


class WaitlistError(Exception):
    code = "waitlist_error"
    status = 400


class OfferClosedError(WaitlistError):
    code = "waitlist_offer_closed"
    status = 409


class AlreadyRedeemedError(WaitlistError):
    code = "waitlist_offer_redeemed"
    status = 409


class NotEligibleError(WaitlistError):
    code = "waitlist_not_eligible"
    status = 409


class InvalidClaimTokenError(WaitlistError):
    code = "invalid_token"
    status = 400


class InvalidEmailError(WaitlistError):
    code = "invalid_email"
    status = 422


@dataclass(frozen=True)
class OfferStatus:
    window_open: bool
    closes_at: datetime | None
    redemption: WaitlistRedemption | None

    @property
    def claim_available(self) -> bool:
        return self.window_open and self.redemption is None


# -- the service ---------------------------------------------------------------


class WaitlistService:
    def __init__(
        self,
        db: AsyncSession,
        analytics: Analytics | None = None,
        revenuecat: RevenueCatClient | None = None,
    ) -> None:
        self.db = db
        self.analytics = analytics
        self.revenuecat = revenuecat

    # -- lookups ---------------------------------------------------------------

    async def redemption_for(self, user_id: uuid.UUID) -> WaitlistRedemption | None:
        return (
            await self.db.execute(
                select(WaitlistRedemption).where(WaitlistRedemption.user_id == user_id)
            )
        ).scalar_one_or_none()

    async def has_redemption(self, user_id: uuid.UUID) -> bool:
        return await self.redemption_for(user_id) is not None

    def _qualifying(self):
        """Waitlist entries that qualify: created before the cut-off."""
        query = select(WaitlistEntry)
        cutoff = _utc(get_settings().waitlist_cutoff)
        if cutoff is not None:
            query = query.where(WaitlistEntry.contact_created_at < cutoff)
        return query

    async def _qualifying_entry(self, email: str) -> WaitlistEntry | None:
        return (
            await self.db.execute(
                self._qualifying().where(WaitlistEntry.email == normalize_email(email))
            )
        ).scalar_one_or_none()

    async def _email_redeemed(self, email_hash: str) -> bool:
        found = await self.db.execute(
            select(WaitlistRedemption.id).where(
                WaitlistRedemption.email_hash == email_hash
            )
        )
        return found.first() is not None

    async def status(self, user: User) -> OfferStatus:
        window = claim_window()
        return OfferStatus(
            window_open=window is not None and window.is_open(clock.now()),
            closes_at=window.closes_at if window else None,
            redemption=await self.redemption_for(user.id),
        )

    # -- matching ----------------------------------------------------------------

    async def match_account(
        self, user: User, *, source: str
    ) -> WaitlistRedemption | None:
        """Match ``user``'s own email, if verified; None when it does not
        qualify. Never raises for an account that does not match, so it can
        run inside sign-in, verify-email and email change."""
        if user.email_verified_at is None or not window_is_open():
            return None
        try:
            return await self.redeem(user, user.email, source=source)
        except WaitlistError:
            return None

    async def redeem(
        self, user: User, waitlist_email: str, *, source: str
    ) -> WaitlistRedemption:
        """Record ``user``'s free year for ``waitlist_email`` and grant it.

        The caller has proved ``user`` holds ``waitlist_email`` (a verified
        account email, or a tapped claim link). Commits the pending
        redemption before calling RevenueCat, so a failed grant is retried.
        """
        now = clock.now()
        if not window_is_open(now):
            raise OfferClosedError("the waitlist offer is closed")
        if await self.has_redemption(user.id):
            raise AlreadyRedeemedError("this account already has its free year")
        if await self._qualifying_entry(waitlist_email) is None:
            raise NotEligibleError("that email is not on the waitlist")
        email_hash = hash_waitlist_email(waitlist_email)
        if await self._email_redeemed(email_hash):
            raise AlreadyRedeemedError("that waitlist email already has its free year")

        insert = (
            pg_insert if self.db.bind.dialect.name == "postgresql" else (sqlite_insert)
        )
        redemption_id = (
            await self.db.execute(
                insert(WaitlistRedemption)
                .values(
                    id=uuid.uuid4(),
                    email_hash=email_hash,
                    user_id=user.id,
                    status=PENDING,
                    source=source,
                    matched_at=now,
                    grant_expires_at=add_months(
                        now, get_settings().waitlist_free_months
                    ),
                    attempts=0,
                )
                # Either unique key: the email or the account, redeemed by a
                # request running at the same time.
                .on_conflict_do_nothing()
                .returning(WaitlistRedemption.id)
            )
        ).scalar_one_or_none()
        if redemption_id is None:
            raise AlreadyRedeemedError("already redeemed")
        redemption = await self.db.get(WaitlistRedemption, redemption_id)
        assert redemption is not None
        self._emit("waitlist_offer_matched", {"source": source}, user.id)
        logger.info("waitlist offer matched user=%s source=%s", user.id, source)
        await self.db.commit()
        await self._grant(redemption)
        return redemption

    async def match_all(self) -> int:
        """Match every verified account on the waitlist that has no free year
        yet (the launch backfill; rerun daily as the waitlist copy updates).
        Each account commits on its own. Returns how many matched."""
        if not window_is_open():
            return 0
        qualifying = self._qualifying().with_only_columns(WaitlistEntry.email)
        redeemed = select(WaitlistRedemption.user_id).where(
            WaitlistRedemption.user_id.is_not(None)
        )
        user_ids = (
            (
                await self.db.execute(
                    select(User.id)
                    .where(
                        User.email_verified_at.is_not(None),
                        func.lower(func.trim(User.email)).in_(qualifying),
                        User.id.not_in(redeemed),
                    )
                    .order_by(User.created_at)
                )
            )
            .scalars()
            .all()
        )
        matched = 0
        for user_id in user_ids:
            user = await self.db.get(User, user_id)
            if user is None:
                continue
            try:
                if await self.match_account(user, source=SOURCE_BACKFILL):
                    matched += 1
            except Exception:
                await self.db.rollback()
                logger.exception("waitlist backfill failed for user %s", user_id)
        return matched

    # -- the grant -------------------------------------------------------------

    async def _grant(self, redemption: WaitlistRedemption) -> bool:
        """Ask RevenueCat for the promotional grant; True when it took."""
        now = clock.now()
        redemption.attempts = (redemption.attempts or 0) + 1
        redemption.last_attempt_at = now
        user_id = redemption.user_id
        expires = _utc(redemption.grant_expires_at)
        if user_id is None or expires is None:
            redemption.last_error = "account_deleted"
            await self.db.flush()
            return False
        if self.revenuecat is None:
            redemption.last_error = "revenuecat_not_configured"
            await self.db.flush()
            logger.warning("waitlist grant pending: RevenueCat API key not set")
            return False
        try:
            await self.revenuecat.grant_promotional(str(user_id), expires)
        except RevenueCatUnavailableError:
            redemption.last_error = "revenuecat_unavailable"
            await self.db.flush()
            logger.warning("waitlist grant pending for user %s", user_id)
            return False
        redemption.status = GRANTED
        redemption.granted_at = now
        redemption.last_error = None
        await self.db.flush()
        self._emit(
            "waitlist_offer_granted",
            {"source": redemption.source, "attempts": redemption.attempts},
            user_id,
        )
        user = await self.db.get(User, user_id)
        if user is not None:
            try:
                await PremiumService(self.db, self.analytics, self.revenuecat).refresh(
                    user
                )
            except RevenueCatUnavailableError:
                # Granted at RevenueCat; its webhook (or the app's refresh)
                # brings the entitlement here.
                logger.info("premium refresh after waitlist grant failed")
        return True

    async def retry_pending(self, older_than: timedelta = RETRY_AFTER) -> int:
        """Retry pending grants whose last attempt is at least ``older_than``
        old. Each row is locked (skipping one another worker holds) and
        committed on its own. Returns how many were granted."""
        cutoff = clock.now() - older_than
        ids = (
            (
                await self.db.execute(
                    select(WaitlistRedemption.id)
                    .where(
                        WaitlistRedemption.status == PENDING,
                        WaitlistRedemption.user_id.is_not(None),
                        (WaitlistRedemption.last_attempt_at.is_(None))
                        | (WaitlistRedemption.last_attempt_at <= cutoff),
                    )
                    .order_by(WaitlistRedemption.created_at)
                )
            )
            .scalars()
            .all()
        )
        granted = 0
        for redemption_id in ids:
            redemption = (
                await self.db.execute(
                    select(WaitlistRedemption)
                    .where(
                        WaitlistRedemption.id == redemption_id,
                        WaitlistRedemption.status == PENDING,
                    )
                    .with_for_update(skip_locked=True)
                    .execution_options(populate_existing=True)
                )
            ).scalar_one_or_none()
            if redemption is None:
                continue
            if await self._grant(redemption):
                granted += 1
            await self.db.commit()
        return granted

    # -- the claim step ----------------------------------------------------------

    async def request_claim(self, user: User, waitlist_email: str) -> None:
        """Send a confirmation link to ``waitlist_email`` (the email-change
        pattern). The answer is the same whether or not the email is on the
        waitlist, so the claim step cannot be used to look up who is on it;
        the link goes only to a qualifying, unredeemed waitlist email."""
        email = normalize_email(waitlist_email)
        if "@" not in email or len(email) > 255:
            raise InvalidEmailError("enter the email you joined the waitlist with")
        if not window_is_open():
            raise OfferClosedError("the waitlist offer is closed")
        if await self.has_redemption(user.id):
            raise AlreadyRedeemedError("this account already has its free year")
        self._emit("waitlist_claim_requested", {}, user.id)
        if await self._qualifying_entry(email) is None or await self._email_redeemed(
            hash_waitlist_email(email)
        ):
            logger.info("waitlist claim for an email that does not qualify")
            return
        raw_token = generate_email_token()
        user.waitlist_claim_email = email
        user.waitlist_claim_token_hash = hash_email_token(raw_token)
        user.waitlist_claim_expires_at = clock.now() + CLAIM_TOKEN_TTL
        await self.db.flush()
        await email_service.send_waitlist_claim_email(to=email, token=raw_token)

    async def confirm_claim(self, token: str) -> tuple[User, WaitlistRedemption]:
        """The user tapped the link sent to their waitlist email: redeem it."""
        user = (
            await self.db.execute(
                select(User).where(
                    User.waitlist_claim_token_hash == hash_email_token(token)
                )
            )
        ).scalar_one_or_none()
        if user is None or user.waitlist_claim_email is None:
            raise InvalidClaimTokenError("invalid or expired claim link")
        expires = _utc(user.waitlist_claim_expires_at)
        if expires is not None and expires < clock.now():
            raise InvalidClaimTokenError("claim link expired")
        email = user.waitlist_claim_email
        user.waitlist_claim_email = None
        user.waitlist_claim_token_hash = None
        user.waitlist_claim_expires_at = None
        redemption = await self.redeem(user, email, source=SOURCE_CLAIM)
        return user, redemption

    # -- shared ----------------------------------------------------------------

    def _emit(self, name: str, props: dict, user_id: uuid.UUID) -> None:
        if self.analytics is not None:
            self.analytics.emit(name, props, user_id)
