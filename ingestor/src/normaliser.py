from datetime import datetime, timezone
from typing import Dict


def normalise_transcript(
    ticker: str,
    company_name: str,
    call_date: str,   # YYYY-MM-DD
    filing_id: str,
    cik: str,
    raw_text: str,
    source: str = "sec_edgar",
) -> dict:
    """Produce the canonical raw-transcripts Kafka message."""
    return {
        "ticker": ticker.upper(),
        "company_name": company_name,
        "call_date": call_date,
        "filing_id": filing_id,
        "cik": cik,
        "raw_text": raw_text,
        "ingested_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
    }


def normalise_prices(
    ticker: str,
    call_date: str,   # YYYY-MM-DD
    price_rows: Dict[str, Dict],  # date-string → OHLCV dict
) -> dict:
    """Produce the canonical raw-prices Kafka message."""
    return {
        "ticker": ticker.upper(),
        "call_date": call_date,
        "prices": price_rows,
        "ingested_at": datetime.now(timezone.utc).isoformat(),
    }
