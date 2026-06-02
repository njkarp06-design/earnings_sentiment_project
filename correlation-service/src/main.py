"""
Correlation service — Phase 3.

Two consumers run concurrently:

  1. scored-transcripts (main thread)
     For each scored transcript, fetches post-call prices from yfinance,
     computes 1d/3d/7d returns, and writes a full record to the
     price_reactions MongoDB collection.

  2. raw-prices (background daemon thread)
     Caches every OHLCV record published by the ingestor into a raw_prices
     MongoDB collection so the BFF (Phase 4) can serve price-chart data
     without hitting yfinance at request time.

Idempotency: both consumers check MongoDB before writing and skip
already-processed records.  Offsets are committed only on success.
"""

import json
import logging
import threading
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from kafka import KafkaConsumer
from pymongo import DESCENDING, MongoClient

from .backfill import backfill_pending_returns
from .config import Config
from .notify import notify_portfolio_users
from .prices import compute_post_call_returns
from .store import already_correlated, get_company_sector, upsert_price_reaction, upsert_raw_price

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

TOPIC_SCORED = "scored-transcripts"
TOPIC_PRICES = "raw-prices"


# ── Background: daily backfill of pending returns ────────────────────────────

def _backfill_loop(mongo_uri: str) -> None:
    mongo = MongoClient(mongo_uri)
    db = mongo.earnings_sentiment
    while True:
        try:
            backfill_pending_returns(db)
        except Exception as exc:
            logger.warning("Backfill run failed: %s", exc)
        time.sleep(24 * 3600)


# ── Background: raw-prices → MongoDB raw_prices ───────────────────────────────

def _raw_prices_loop(bootstrap_servers: str, mongo_uri: str) -> None:
    consumer = KafkaConsumer(
        TOPIC_PRICES,
        bootstrap_servers=bootstrap_servers,
        group_id="correlation-raw-prices",
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        value_deserializer=lambda b: json.loads(b.decode("utf-8")),
    )
    mongo = MongoClient(mongo_uri)
    db = mongo.earnings_sentiment

    try:
        for kafka_msg in consumer:
            try:
                upsert_raw_price(db, kafka_msg.value)
                consumer.commit()
            except Exception as exc:
                logger.warning("raw-prices cache write failed: %s", exc)
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        consumer.close()
        mongo.close()


# ── Main: scored-transcripts → price_reactions ────────────────────────────────

def main() -> None:
    cfg = Config.from_env()

    # Background: daily backfill of pending 1d/3d/7d returns
    threading.Thread(
        target=_backfill_loop,
        args=(cfg.mongo_uri,),
        daemon=True,
        name="returns-backfill",
    ).start()

    # Background raw-prices consumer (daemon — exits when main thread exits)
    threading.Thread(
        target=_raw_prices_loop,
        args=(cfg.kafka_bootstrap_servers, cfg.mongo_uri),
        daemon=True,
        name="raw-prices-cache",
    ).start()

    consumer = KafkaConsumer(
        TOPIC_SCORED,
        bootstrap_servers=cfg.kafka_bootstrap_servers,
        group_id="correlation-service",
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        value_deserializer=lambda b: json.loads(b.decode("utf-8")),
        key_deserializer=lambda b: b.decode("utf-8") if b else None,
        # Allow up to 10 min between polls — FMP/yfinance fetches can be slow
        # and the default 5 min causes Kafka to rebalance and crash the consumer.
        max_poll_interval_ms=600_000,
    )

    mongo = MongoClient(cfg.mongo_uri)
    db = mongo.earnings_sentiment

    logger.info(
        "Correlation service ready | %s (main) + %s (background cache)",
        TOPIC_SCORED, TOPIC_PRICES,
    )

    try:
        for kafka_msg in consumer:
            msg = kafka_msg.value
            filing_id = msg.get("filing_id", "")
            ticker = msg.get("ticker", "UNKNOWN")
            call_date = msg.get("call_date", "")

            logger.info("← %-25s  %s  %s", TOPIC_SCORED, ticker, call_date)

            # ── Idempotency ───────────────────────────────────────────────────
            if already_correlated(db, filing_id):
                logger.info("Already correlated %s — skipping", filing_id)
                consumer.commit()
                continue

            # ── Fetch prices + compute returns ────────────────────────────────
            returns = compute_post_call_returns(ticker, call_date, cfg.price_fetch_days)

            if not returns:
                # Hard failure (bad ticker, network error) — commit and move on
                # to avoid blocking the consumer forever.
                logger.warning("No price data for %s %s — writing null returns", ticker, call_date)
                returns = {"call_date_close": None, "return_1d": None, "return_3d": None, "return_7d": None, "price_series": None}

            correlated_at = datetime.now(timezone.utc).isoformat()

            # ── Sector (denormalized from companies collection) ────────────────
            sector = get_company_sector(db, ticker)

            # ── Trend (compare confidence vs. most recent previous call) ──────
            current_score = msg.get("confidence_score")
            prev = db.price_reactions.find_one(
                {"ticker": ticker, "call_date": {"$lt": call_date}},
                sort=[("call_date", DESCENDING)],
                projection={"confidence_score": 1},
            )
            if prev is not None and prev.get("confidence_score") is not None and current_score is not None:
                diff = current_score - prev["confidence_score"]
                trend = "up" if diff >= 5 else "down" if diff <= -5 else "neutral"
            else:
                trend = None

            doc = {
                "filing_id": filing_id,
                "ticker": ticker,
                "company_name": msg.get("company_name", ""),
                "sector": sector,
                "call_date": call_date,
                "confidence_score": current_score,
                "key_phrases": msg.get("key_phrases", []),
                "model_used": msg.get("model_used", ""),
                "scored_at": msg.get("scored_at", ""),
                "correlated_at": correlated_at,
                "trend": trend,
                **returns,
            }

            # ── Write to MongoDB + notify portfolio users ─────────────────────
            try:
                upsert_price_reaction(db, doc)
                notify_portfolio_users(db, doc)
                logger.info(
                    "✓ price_reactions  %-6s  score=%-3s  1d=%s%%  3d=%s%%  7d=%s%%",
                    ticker,
                    doc.get("confidence_score"),
                    doc.get("return_1d"),
                    doc.get("return_3d"),
                    doc.get("return_7d"),
                )
            except Exception as exc:
                logger.error("MongoDB write failed for %s: %s", filing_id, exc)
                # Don't commit — will retry on restart
                continue

            consumer.commit()

    except (KeyboardInterrupt, SystemExit):
        logger.info("Shutting down correlation service")
    finally:
        consumer.close()
        mongo.close()


if __name__ == "__main__":
    main()
