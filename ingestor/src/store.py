import logging
from typing import Optional, Set
from pymongo import MongoClient
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

    def upsert_company(self, ticker: str, name: str, sector: Optional[str] = None) -> None:
        """Keep the companies collection current with ticker / name / optional sector."""
        try:
            db = self._client.get_default_database()
            update: dict = {"ticker": ticker.upper(), "name": name}
            if sector:
                update["sector"] = sector
            db.companies.update_one(
                {"ticker": ticker.upper()},
                {"$set": update},
                upsert=True,
            )
        except Exception as exc:
            logger.warning("Failed to upsert company %s: %s", ticker, exc)

    def close(self) -> None:
        self._client.close()
