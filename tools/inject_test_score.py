#!/usr/bin/env python3
"""
Inject a synthetic scored-transcript message into the scored-transcripts topic.
Use this to test the correlation service without needing the full scoring pipeline.

Usage:
    python tools/inject_test_score.py
    python tools/inject_test_score.py --ticker MSFT --date 2024-01-25 --score 85
    python tools/inject_test_score.py --ticker AAPL --date 2024-02-01 --filing-id my-test-id
"""

import argparse
import json
from datetime import datetime, timezone

from kafka import KafkaProducer

BOOTSTRAP = "localhost:9092"
TOPIC = "scored-transcripts"

_DEFAULTS = {
    "ticker": "AAPL",
    "company_name": "Apple Inc.",
    "call_date": "2024-01-25",
    "confidence_score": 72,
    "key_phrases": [
        "services revenue hit an all-time high",
        "strong momentum across emerging markets",
        "cautious on near-term consumer spend",
    ],
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Inject a test scored-transcript message")
    parser.add_argument("--ticker", default=_DEFAULTS["ticker"])
    parser.add_argument("--date", default=_DEFAULTS["call_date"], metavar="YYYY-MM-DD")
    parser.add_argument("--score", type=int, default=_DEFAULTS["confidence_score"])
    parser.add_argument("--filing-id", default=None)
    args = parser.parse_args()

    now = datetime.now(timezone.utc).isoformat()
    filing_id = args.filing_id or f"test-scored-{args.ticker.lower()}-{args.date.replace('-', '')}"

    msg = {
        "ticker": args.ticker,
        "company_name": _DEFAULTS["company_name"],
        "call_date": args.date,
        "filing_id": filing_id,
        "cik": "0000320193",
        "source": "test-injection",
        "ingested_at": now,
        "confidence_score": args.score,
        "key_phrases": _DEFAULTS["key_phrases"],
        "model_used": "claude-sonnet-4-6",
        "scored_at": now,
    }

    producer = KafkaProducer(
        bootstrap_servers=BOOTSTRAP,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda k: k.encode("utf-8"),
        acks="all",
    )

    future = producer.send(TOPIC, key=msg["ticker"], value=msg)
    record = future.get(timeout=10)
    producer.flush()
    producer.close()

    print(f"Injected → {TOPIC}")
    print(f"  ticker      : {msg['ticker']}")
    print(f"  call_date   : {msg['call_date']}")
    print(f"  score       : {msg['confidence_score']}")
    print(f"  filing_id   : {msg['filing_id']}")
    print(f"  partition   : {record.partition}  offset: {record.offset}")


if __name__ == "__main__":
    main()
