"""
One-shot company universe seeder.

Downloads the full SEC company_tickers.json (~10 000 US-listed companies)
and upserts every entry into the MongoDB `companies` collection with
ticker, name, and CIK.

Usage (from the project root):
    python -m tools.seed_companies

Or with an explicit Mongo URI:
    MONGO_URI="mongodb://..." python -m tools.seed_companies

The ingestor also runs this automatically on startup when the collection
has fewer than 1 000 entries.  Use this script to trigger a manual re-seed
on an already-running deployment, or after wiping the companies collection.
"""

import logging
import os
import sys

import requests
from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger(__name__)

_EDGAR_URL    = "https://www.sec.gov/files/company_tickers.json"
_USER_AGENT   = os.getenv("EDGAR_USER_AGENT", "EarningsSentimentResearch contact@example.com")
_MONGO_URI    = os.getenv(
    "MONGO_URI",
    "mongodb://admin:password@localhost:27017/earnings_sentiment?authSource=admin",
)


def download_companies() -> dict:
    logger.info("Downloading company_tickers.json from SEC EDGAR …")
    resp = requests.get(
        _EDGAR_URL,
        headers={"User-Agent": _USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    logger.info("Downloaded %d company entries", len(data))
    return data


def seed(data: dict) -> None:
    client = MongoClient(_MONGO_URI)
    try:
        db = client.get_default_database()

        ops = []
        for v in data.values():
            ticker     = v["ticker"].upper()
            cik_padded = str(v["cik_str"]).zfill(10)
            name       = v["title"]
            ops.append(
                UpdateOne(
                    {"ticker": ticker},
                    {
                        "$set":      {"ticker": ticker, "cik": cik_padded},
                        "$setOnInsert": {"name": name},
                    },
                    upsert=True,
                )
            )

        if not ops:
            logger.warning("No companies to upsert")
            return

        # Split into batches of 1 000 to avoid oversized bulk-write requests
        batch_size = 1_000
        total_upserted = 0
        total_modified = 0
        for i in range(0, len(ops), batch_size):
            batch  = ops[i : i + batch_size]
            result = db.companies.bulk_write(batch, ordered=False)
            total_upserted += result.upserted_count
            total_modified += result.modified_count
            logger.info(
                "Batch %d/%d — upserted=%d modified=%d",
                i // batch_size + 1,
                (len(ops) + batch_size - 1) // batch_size,
                result.upserted_count,
                result.modified_count,
            )

        total_in_db = db.companies.count_documents({})
        logger.info(
            "Seed complete — inserted=%d  modified=%d  total in collection=%d",
            total_upserted,
            total_modified,
            total_in_db,
        )
    finally:
        client.close()


def main() -> None:
    try:
        data = download_companies()
        seed(data)
    except Exception as exc:
        logger.error("Seed failed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
