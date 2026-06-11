"""
Periodic backfill job (runs every 4 hours): find price_reactions with null
returns and fill them in.

After a live earnings call is scored and written to MongoDB, its 1d/3d/7d
returns will be None because the trading windows haven't elapsed yet.  This
job re-fetches prices every 4 hours so the data fills in naturally over the
week following each call.
"""

import logging
from datetime import datetime, timedelta, timezone

from .prices import compute_post_call_returns
from .store import _yfinance_sector

logger = logging.getLogger(__name__)


def backfill_pending_returns(db) -> None:
    # Also catch records where all returns are filled but price_series is
    # still null — this happens when the initial yfinance call failed and a
    # later retry only succeeded for the return values (or for records
    # correlated before price_series was added to the schema).
    two_years_ago = (datetime.now(timezone.utc) - timedelta(days=730)).strftime("%Y-%m-%d")

    pending = list(
        db.price_reactions.find(
            # Scope all conditions to the last 2 years so ancient records with
            # missing data don't consume yfinance rate budget on every cycle.
            {"$and": [
                {"call_date": {"$gte": two_years_ago}},
                {"$or": [
                    {"return_1d": None},
                    {"return_3d": None},
                    {"return_7d": None},
                    # price_series absent/null despite returns being filled —
                    # happens when the initial yfinance call failed for price_series
                    # or for records correlated before price_series was added.
                    {"price_series": None},
                ]},
            ]},
            {"filing_id": 1, "ticker": 1, "call_date": 1},
        )
    )

    if not pending:
        logger.info("Backfill: nothing to fill")
        return

    logger.info("Backfill: %d docs with pending returns", len(pending))

    filled = 0
    for doc in pending:
        ticker = doc.get("ticker", "")
        call_date = doc.get("call_date", "")
        filing_id = doc.get("filing_id", "")

        if not ticker or not call_date:
            continue

        returns = compute_post_call_returns(ticker, call_date)
        if not returns:
            continue

        update = {
            k: returns[k]
            for k in ("return_1d", "return_3d", "return_7d", "call_date_close", "price_series")
            if returns.get(k) is not None
        }

        if not update:
            continue

        update["backfilled_at"] = datetime.now(timezone.utc).isoformat()
        query = (
            {"filing_id": filing_id}
            if filing_id
            else {"ticker": ticker, "call_date": call_date}
        )
        db.price_reactions.update_one(query, {"$set": update})
        logger.info(
            "Backfill ✓ %-6s  1d=%s  3d=%s  7d=%s",
            ticker,
            update.get("return_1d"),
            update.get("return_3d"),
            update.get("return_7d"),
        )
        filled += 1

    logger.info("Backfill complete: %d/%d docs updated", filled, len(pending))


def backfill_missing_sectors(db) -> None:
    """Populate sector on price_reactions where it is null/missing, using yfinance."""
    pipeline = [
        {"$match": {"sector": {"$in": [None, ""]}}},
        {"$group": {"_id": "$ticker"}},
    ]
    tickers = [row["_id"] for row in db.price_reactions.aggregate(pipeline) if row["_id"]]

    if not tickers:
        logger.info("Sector backfill: nothing to fill")
        return

    logger.info("Sector backfill: %d ticker(s) with missing sector", len(tickers))
    filled = 0

    for ticker in tickers:
        ticker = ticker.upper()
        # Use cached value in companies first, avoid redundant yfinance calls
        company_doc = db.companies.find_one({"ticker": ticker}, {"sector": 1})
        sector = (company_doc.get("sector") or None) if company_doc else None

        if not sector:
            sector = _yfinance_sector(ticker)
            if sector:
                db.companies.update_one(
                    {"ticker": ticker},
                    {"$set": {"sector": sector}},
                    upsert=True,
                )

        if not sector:
            logger.debug("Sector backfill: no sector found for %s", ticker)
            continue

        result = db.price_reactions.update_many(
            {"ticker": ticker, "sector": {"$in": [None, ""]}},
            {"$set": {"sector": sector}},
        )
        logger.info(
            "Sector backfill ✓ %-6s → %-30s (%d doc(s))",
            ticker, sector, result.modified_count,
        )
        filled += 1

    logger.info("Sector backfill complete: %d/%d ticker(s) resolved", filled, len(tickers))
