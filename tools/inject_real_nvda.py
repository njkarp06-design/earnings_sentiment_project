#!/usr/bin/env python3
"""
Fetch the real NVIDIA Q1 FY2026 earnings call transcript from SEC EDGAR and
push it through the normal ingestor pipeline (raw-transcripts Kafka topic →
scoring-service → correlation-service → feed).

Bypasses the lookback-window and is_processed checks so you can inject on demand.

Usage (from project root, Docker Compose up):
    python tools/inject_real_nvda.py

Watch progress:
    docker compose logs -f scoring-service
    docker compose logs -f correlation-service
"""

import logging
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ingestor", "src"))

from edgar import EdgarClient
from normaliser import normalise_transcript, normalise_prices
from prices import fetch_price_window
from producer import KafkaProducer
from s3_archive import archive_transcript

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
EDGAR_USER_AGENT = os.getenv(
    "EDGAR_USER_AGENT", "EarningsSentimentResearch contact@example.com"
)

# Scan 8-K filings from May 2025 onward to capture Q1 FY2026 (reported 2025-05-28)
SINCE = datetime(2025, 5, 1)


def main() -> None:
    edgar = EdgarClient(user_agent=EDGAR_USER_AGENT)
    producer = KafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP)

    ticker = "NVDA"
    info = edgar.get_company_info(ticker)
    if not info:
        logger.error("Could not resolve CIK for %s — aborting", ticker)
        sys.exit(1)

    cik = info["cik"]
    company_name = info["name"]
    logger.info("Resolved %s → CIK %s (%s)", ticker, cik, company_name)

    filings = edgar.get_recent_8k_filings(cik, SINCE)
    logger.info("Found %d 8-K filing(s) since %s", len(filings), SINCE.date())

    injected = False
    for filing in filings:
        acc_no = filing["accession_number"]
        filing_date = filing["filing_date"]
        logger.info("Checking %s  filed %s …", acc_no, filing_date)

        result = edgar.fetch_transcript(cik, acc_no)
        if not result:
            logger.info("  → no transcript exhibit found, skipping")
            continue

        logger.info("  → transcript confirmed (%d chars), publishing …", len(result["text"]))

        t_msg = normalise_transcript(
            ticker=ticker,
            company_name=company_name,
            call_date=filing_date,
            filing_id=acc_no,
            cik=cik,
            raw_text=result["text"],
            source="sec_edgar",
        )
        archive_transcript(t_msg)
        producer.publish_transcript(t_msg)
        logger.info("Published to raw-transcripts  filing_id=%s  call_date=%s", acc_no, filing_date)

        price_rows = fetch_price_window(ticker, filing_date)
        if price_rows:
            p_msg = normalise_prices(ticker, filing_date, price_rows)
            producer.publish_prices(p_msg)
            logger.info("Published to raw-prices")
        else:
            logger.warning("No price data available for %s on %s", ticker, filing_date)

        injected = True
        break

    producer.close()

    if injected:
        logger.info(
            "\nDone. The transcript is now in the Kafka pipeline.\n"
            "Watch scoring-service:     docker compose logs -f scoring-service\n"
            "Watch correlation-service: docker compose logs -f correlation-service"
        )
    else:
        logger.warning(
            "No earnings-call transcript found for NVDA in 8-K filings since %s.\n"
            "EDGAR may not have published it yet, or it's in a filing type we don't detect.",
            SINCE.date(),
        )


if __name__ == "__main__":
    main()
