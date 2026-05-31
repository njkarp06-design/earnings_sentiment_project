#!/usr/bin/env python3
"""
Manually inject a test transcript into the raw-transcripts Kafka topic
to exercise the scoring-service pipeline without needing a real EDGAR filing.

Prerequisites (run from project root with Docker Compose up):
    pip install kafka-python

Usage:
    python tools/inject_test_transcript.py                  # default: AAPL, confident tone
    python tools/inject_test_transcript.py --tone cautious  # low-confidence transcript
    python tools/inject_test_transcript.py --ticker MSFT --tone confident
    python tools/inject_test_transcript.py --file my_transcript.txt  # from file
    python tools/inject_test_transcript.py --server localhost:9092   # custom broker

After running, watch the scoring-service logs:
    docker compose logs -f scoring-service
"""

import argparse
import json
import sys
from datetime import datetime, timezone, timedelta
import random

# ── Built-in test transcripts ─────────────────────────────────────────────────

_TRANSCRIPTS = {
    "confident": {
        "hint": "high score expected (~75-90)",
        "text": """\
Thank you for joining our Q1 fiscal 2025 earnings call. I'm delighted to
report exceptional results this quarter — revenue of $124.3 billion, up 9%
year over year, an all-time record.

Services revenue reached $26.3 billion, our sixth consecutive all-time high,
and we expect double-digit services growth to continue throughout the year.
iPhone revenue was $69.7 billion, up 6%, driven by strong demand for the Pro
lineup. Our active installed base has now surpassed 2.35 billion devices.

Looking ahead, our conviction has never been higher. We have a clear product
roadmap through 2026. AI integration across our ecosystem is proceeding ahead
of schedule, and early user engagement metrics are well above our internal
targets. We are expanding US manufacturing, adding 20,000 jobs over three
years — a commitment we are fully funded to deliver.

In emerging markets — particularly India and Southeast Asia — we are winning
new customers at a pace we haven't seen in years. The demographics are
compelling and our go-to-market execution is excellent.

We returned $30 billion to shareholders this quarter. Our balance sheet gives
us the flexibility to sustain that capital return program for years to come.
We entered this period from a position of real strength, and I am fully
confident we will exit it stronger still. The opportunity in front of us is
extraordinary and the team is executing at the highest level I have seen.
""",
    },
    "cautious": {
        "hint": "low score expected (~20-40)",
        "text": """\
Thank you for joining today's call. I'll be transparent — this has been a
challenging quarter and I want to make sure we set realistic expectations.

Revenue came in at $2.1 billion, which was below our guidance range. We had
expected some demand softness, but the deterioration in the back half of the
quarter was more pronounced than anticipated. We are working through several
issues simultaneously and I don't want to minimise the difficulty of the
current environment.

On forward guidance — we're not in a position to provide specific numbers at
this time. There are simply too many moving parts. We're evaluating our cost
structure. We're in discussions with a number of key customers about purchase
timing. We're assessing strategic alternatives at the board level. I expect
to have more clarity in the coming weeks, but I don't want to commit to a
number I can't stand behind.

We've retained external advisors to help us think through options. The team
is focused — I want to be clear about that. But I also want to be honest: we
don't know exactly how long this will take to work through. I think managing
expectations carefully here is the right approach. The path forward isn't
entirely clear right now and pretending otherwise wouldn't be fair to you.

Cash runway is approximately 14 months at the current burn rate. We are
actively exploring financing options. I am cautiously optimistic we can
stabilise the business, but cautious is the right word.
""",
    },
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_message(ticker: str, text: str, source_label: str) -> dict:
    # Use yesterday as the call date so it looks like a recent filing
    call_date = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    filing_id = f"test_{ticker.lower()}_{call_date}_{random.randint(1000, 9999)}"
    return {
        "ticker": ticker.upper(),
        "company_name": f"{ticker.upper()} Inc. (test)",
        "call_date": call_date,
        "filing_id": filing_id,
        "cik": "TEST",
        "raw_text": text.strip(),
        "ingested_at": datetime.now(timezone.utc).isoformat(),
        "source": f"manual_inject/{source_label}",
    }


def _publish(bootstrap_server: str, msg: dict) -> None:
    try:
        from kafka import KafkaProducer
        from kafka.errors import NoBrokersAvailable
    except ImportError:
        print("ERROR: kafka-python not installed. Run:  pip install kafka-python", file=sys.stderr)
        sys.exit(1)

    try:
        producer = KafkaProducer(
            bootstrap_servers=bootstrap_server,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8"),
            acks="all",
            request_timeout_ms=10_000,
        )
    except NoBrokersAvailable:
        print(
            f"ERROR: cannot reach Kafka at {bootstrap_server}\n"
            "Make sure Docker Compose is running:  docker compose up -d",
            file=sys.stderr,
        )
        sys.exit(1)

    topic = "raw-transcripts"
    future = producer.send(topic, key=msg["ticker"], value=msg)
    record_meta = future.get(timeout=10)
    producer.flush()
    producer.close()

    print(
        f"\n✓ Published to '{topic}'"
        f"\n  ticker     : {msg['ticker']}"
        f"\n  filing_id  : {msg['filing_id']}"
        f"\n  call_date  : {msg['call_date']}"
        f"\n  text length: {len(msg['raw_text'])} chars"
        f"\n  partition  : {record_meta.partition}  offset: {record_meta.offset}"
        f"\n\nWatch scoring-service logs:"
        f"\n  docker compose logs -f scoring-service\n"
    )


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inject a test transcript into the raw-transcripts Kafka topic."
    )
    parser.add_argument(
        "--ticker", default="AAPL",
        help="Ticker symbol (default: AAPL)"
    )
    parser.add_argument(
        "--tone", choices=list(_TRANSCRIPTS.keys()), default="confident",
        help="Which built-in transcript to use (default: confident)"
    )
    parser.add_argument(
        "--file", metavar="PATH",
        help="Path to a plain-text transcript file (overrides --tone)"
    )
    parser.add_argument(
        "--server", default="localhost:9092",
        help="Kafka bootstrap server (default: localhost:9092)"
    )
    args = parser.parse_args()

    if args.file:
        try:
            with open(args.file, encoding="utf-8") as fh:
                text = fh.read()
        except OSError as exc:
            print(f"ERROR reading {args.file}: {exc}", file=sys.stderr)
            sys.exit(1)
        source_label = "file"
        print(f"Using transcript from file: {args.file}  ({len(text)} chars)")
    else:
        chosen = _TRANSCRIPTS[args.tone]
        text = chosen["text"]
        source_label = args.tone
        print(f"Using built-in '{args.tone}' transcript  [{chosen['hint']}]")

    msg = _build_message(args.ticker, text, source_label)
    _publish(args.server, msg)


if __name__ == "__main__":
    main()
