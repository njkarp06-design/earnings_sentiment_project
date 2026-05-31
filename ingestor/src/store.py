import logging
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
        client = MongoClient(mongo_uri)
        db = client.get_default_database()
        self._col = db["_ingested_filings"]
        self._col.create_index("filing_id", unique=True)

    def is_processed(self, filing_id: str) -> bool:
        return self._col.find_one({"filing_id": filing_id}) is not None

    def mark_processed(self, filing_id: str) -> None:
        try:
            self._col.insert_one({"filing_id": filing_id})
        except DuplicateKeyError:
            pass  # already marked — harmless
