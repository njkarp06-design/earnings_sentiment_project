import logging
from typing import Dict, Optional, Set
from pymongo import MongoClient, UpdateOne
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)


class ProcessedStore:
    """
    Tracks EDGAR accession numbers that have already been ingested so the
    nightly job never re-publishes the same filing twice.
    Uses a dedicated _ingested_filings collection in MongoDB.
    """

    def __init__(self, mongo_uri: str) -> None:
        self._client = MongoClient(mongo_uri)
        db = self._client.get_default_database()
        self._col = db["_ingested_filings"]
        self._col.create_index("filing_id", unique=True)

    def is_processed(self, filing_id: str) -> bool:
        return self._col.find_one({"filing_id": filing_id}) is not None

    def mark_processed(self, filing_id: str) -> None:
        try:
            self._col.insert_one({"filing_id": filing_id})
        except DuplicateKeyError:
            pass  # already marked — harmless

    def get_watchlist_tickers(self) -> Set[str]:
        """Return all unique tickers across every user's watchlist."""
        try:
            db = self._client.get_default_database()
            result = list(db.users.aggregate([
                {"$unwind": "$watchlist"},
                {"$group": {"_id": None, "tickers": {"$addToSet": "$watchlist"}}},
            ]))
            return {t.upper() for t in result[0]["tickers"]} if result else set()
        except Exception as exc:
            logger.warning("Could not fetch watchlist tickers from MongoDB: %s", exc)
            return set()

    def upsert_company(
        self,
        ticker: str,
        name: str,
        sector: Optional[str] = None,
        prefer_existing_name: bool = False,
    ) -> None:
        """Keep the companies collection current with ticker / name / optional sector.

        prefer_existing_name=True uses $setOnInsert for name so that an
        authoritative name already in the collection (e.g. from EDGAR) is never
        overwritten by a fallback value such as the raw ticker symbol.  Set this
        when the caller cannot guarantee the name is authoritative (FMP, AV).
        """
        try:
            db = self._client.get_default_database()
            set_fields: dict = {"ticker": ticker.upper()}
            if sector:
                set_fields["sector"] = sector

            if prefer_existing_name:
                db.companies.update_one(
                    {"ticker": ticker.upper()},
                    {"$set": set_fields, "$setOnInsert": {"name": name}},
                    upsert=True,
                )
            else:
                set_fields["name"] = name
                db.companies.update_one(
                    {"ticker": ticker.upper()},
                    {"$set": set_fields},
                    upsert=True,
                )
        except Exception as exc:
            logger.warning("Failed to upsert company %s: %s", ticker, exc)

    def get_company_name(self, ticker: str) -> Optional[str]:
        """Return the stored authoritative name for ticker, or None.

        Used by FMP/AV scans to include a real company name in published
        transcripts when EDGAR has already populated the companies collection,
        rather than falling back to the raw ticker symbol.
        """
        try:
            db = self._client.get_default_database()
            doc = db.companies.find_one(
                {"ticker": ticker.upper()},
                {"name": 1},
            )
            stored = doc.get("name") if doc else None
            # Only return if it's an authoritative name, not just the ticker
            if stored and stored.upper() != ticker.upper():
                return stored
            return None
        except Exception:
            return None

    def needs_company_seed(self) -> bool:
        """True when the companies collection has fewer than 1 000 entries.

        Used to decide whether to run the full universe seed on startup —
        avoids re-downloading company_tickers.json on every ingestor boot.
        """
        try:
            db = self._client.get_default_database()
            return db.companies.count_documents({}) < 1_000
        except Exception:
            return True

    def seed_companies(self, companies: Dict[str, Dict]) -> int:
        """Bulk-upsert all companies from the EDGAR CIK map.

        Sets ticker, name, and cik.  Uses $setOnInsert for name so that
        the sector / exchange fields set by later ingest runs are never
        overwritten by the generic seed data.

        Returns the number of documents inserted or modified.
        """
        if not companies:
            return 0
        try:
            db = self._client.get_default_database()
            ops = [
                UpdateOne(
                    {"ticker": ticker},
                    {
                        "$set": {"ticker": ticker, "cik": info["cik"]},
                        "$setOnInsert": {"name": info["name"]},
                    },
                    upsert=True,
                )
                for ticker, info in companies.items()
            ]
            result = db.companies.bulk_write(ops, ordered=False)
            return result.upserted_count + result.modified_count
        except Exception as exc:
            logger.warning("Company universe seed failed: %s", exc)
            return 0

    def has_price_reaction_for_date(self, ticker: str, call_date: str) -> bool:
        """True if a price_reaction already exists for this ticker on this call date.

        Used by FMP scan to avoid creating duplicate records for quarters that
        EDGAR already published (EDGAR and FMP use different filing_id keys so
        the is_processed guard does not catch cross-source duplicates).
        """
        try:
            db = self._client.get_default_database()
            return db.price_reactions.find_one(
                {"ticker": ticker.upper(), "call_date": call_date}
            ) is not None
        except Exception as exc:
            logger.warning("has_price_reaction_for_date check failed for %s %s: %s", ticker, call_date, exc)
            return False

    def get_recent_reaction_tickers(self, lookback_days: int = 90) -> set:
        """Return tickers that have appeared in price_reactions within the last
        lookback_days days.

        Used by the periodic ingest job to ensure companies discovered via the
        RSS feed (which are not in cfg.tickers or any user watchlist) still get
        re-scanned on every scheduled cycle.  Without this, an RSS-triggered
        _backfill_ticker daemon thread that is interrupted by a container restart
        leaves those companies without historical data indefinitely.
        """
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
        db = self._client.get_default_database()
        try:
            return {
                doc["ticker"].upper()
                for doc in db.price_reactions.find(
                    {"call_date": {"$gte": cutoff}, "ticker": {"$exists": True, "$ne": None}},
                    {"ticker": 1, "_id": 0},
                )
                if doc.get("ticker")
            }
        except Exception as exc:
            logger.warning("Could not fetch recent reaction tickers: %s", exc)
            return set()

    def get_stale_price_records(self, min_age_days: int = 1) -> list:
        """
        Return PriceReaction records where any of return_1d/3d/7d is still null
        but the call is old enough that price data should now be available.
        min_age_days=1 catches everything from yesterday onward.
        """
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(days=min_age_days)).strftime("%Y-%m-%d")
        db = self._client.get_default_database()
        return list(db.price_reactions.find(
            {
                "$or": [
                    {"return_1d": None},
                    {"return_3d": None},
                    {"return_7d": None},
                ],
                "call_date": {"$lte": cutoff},
                "ticker":    {"$exists": True, "$ne": None},
            },
            {"ticker": 1, "call_date": 1, "filing_id": 1, "_id": 0},
        ))

    def clear_processed_for_ticker(
        self,
        ticker: str,
        accession_numbers: list = None,
    ) -> int:
        """Clear processed flags for a ticker so it can be fully re-ingested.

        Deletes FMP and Alpha Vantage filing IDs by name pattern (they embed
        the ticker directly).  Also deletes any EDGAR accession numbers passed
        via accession_numbers — the caller must supply these since EDGAR IDs
        do not embed the ticker symbol.

        Returns the total number of entries deleted.
        """
        ticker = ticker.upper()
        deleted = 0
        # FMP IDs: fmp_TICKER_YEAR_QN  |  AV IDs: av_TICKER_...
        for prefix in (f"fmp_{ticker}_", f"av_{ticker}_"):
            result = self._col.delete_many({"filing_id": {"$regex": f"^{prefix}"}})
            deleted += result.deleted_count
        if accession_numbers:
            result = self._col.delete_many({"filing_id": {"$in": list(accession_numbers)}})
            deleted += result.deleted_count
        logger.info("clear_processed_for_ticker: %s — deleted %d entries", ticker, deleted)
        return deleted

    def close(self) -> None:
        self._client.close()
