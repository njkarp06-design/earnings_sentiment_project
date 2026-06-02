"""
Daily backfill job: find price_reactions with null returns and fill them in.

After a live earnings call is scored and written to MongoDB, its 1d/3d/7d
returns will be None because the trading windows haven't elapsed yet.  This
job runs once every 24 h and re-fetches prices for any pending docs so the
data fills in naturally over the week following each call.
"""

import logging
from datetime import datetime, timezone

from .prices import compute_post_call_returns

logger = logging.getLogger(__name__)


def backfill_pending_returns(db) -> None:
    pending = list(
        db.price_reactions.find(
            {"$or": [{"return_1d": None}, {"return_3d": None}, {"return_7d": None}]},
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
        db.price_reactions.update_one({"filing_id": filing_id}, {"$set": update})
        logger.info(
            "Backfill ✓ %-6s  1d=%s  3d=%s  7d=%s",
            ticker,
            update.get("return_1d"),
            update.get("return_3d"),
            update.get("return_7d"),
        )
        filled += 1

    logger.info("Backfill complete: %d/%d docs updated", filled, len(pending))
