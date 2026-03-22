# Open Questions & Decisions

## All Resolved

All blocking and non-blocking decisions have been resolved. This document serves as a decision log.

## Decision Log

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | **Cloud vs. local vision model for MVP?** | **Cloud-hosted** via LiteLLM provider abstraction. | Broader device compatibility, faster prompt iteration. Local processing is a potential privacy premium feature for V1.1+. |
| 2 | **Recipe database sourcing for V2.0?** | **Partner with 1-2 food content creators.** Supplement with public domain recipes. | Avoids licensing complexity. Content creators bring quality and marketing co-promotion. Public domain fills volume. Revisit before V2.0 development begins. |
| 3 | **Free tier price history access?** | **Limited history on free tier** (last 3 data points per item). Full history + alerts + cross-store comparison behind Premium. | Showing some data creates desire for more. Hard gate kills discovery. 3 data points prove value without giving away the full feature. |
| 4 | **Item match confidence threshold?** | **Start at 0.85.** Instrument confirmation rates. Adjust down if >40% of matches require manual confirmation. | Conservative start protects price history quality. Data-driven adjustment once real receipts flow through. |
| 5 | **Household budgets: replace or supplement individual?** | **Supplement, not replace.** Individual budgets within household context + household-level shared target. | Users joining a household shouldn't lose their personal budget tracking. Shared budget is additive. |
| 6 | **Store loyalty discounts on receipts?** | **Record price actually paid** (post-discount). Store discount as separate field on LineItem if detectable. | Price intelligence should reflect real costs. Discount field enables future "you saved $X" features without polluting price baselines. |
| 7 | **Native iOS+Android vs. cross-platform?** | **React Native (Expo), iOS-only at launch.** | Tighter Claude Code feedback loop. expo-camera mature for receipt scanning. iOS-only preserves revenue advantage. Android available later from same codebase. |
| 8 | **Monetization timing vs. MVP launch?** | **MVP launches fully free.** Premium tier introduced with V1.1. | Maximizes early adoption and receipt data accumulation. Price intelligence is the upgrade driver. |
| 9 | **Backend stack?** | **Python 3.12+ with FastAPI.** Pydantic v2, Celery + Redis, Pillow + OpenCV. | Python dominates the LLM/AI ecosystem. Pydantic validates LLM outputs natively. FastAPI async handles I/O-bound LLM calls. rapidfuzz + sentence-transformers + FAISS for V1.1 item matching are native Python strengths. |
| 10 | **Database technology?** | **PostgreSQL with pgvector extension.** SQLAlchemy 2.0+ as async ORM (via asyncpg driver). Alembic for migrations. | Handles relational MVP queries, budget aggregations, and vector similarity for V1.1 item matching in a single engine. No need for a separate vector database. pgvector avoids operational overhead of a second data store. |
| 11 | **LLM provider for MVP launch?** | **Start with Anthropic Claude (Sonnet) via LiteLLM.** Evaluate against a receipt test set of 20-30 real receipts during development. Switch if another provider wins on extraction accuracy. | Claude handles vision natively, supports structured output, and is the ecosystem we're building in. LiteLLM abstraction makes switching a config change. Provider choice is not permanent — measure and adjust. |
