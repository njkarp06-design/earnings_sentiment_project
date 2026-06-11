"""
Scoring service — Phase 2.

Consumes raw-transcripts, calls Claude to score CEO language confidence
(0-100) + extract top-3 key phrases, publishes to scored-transcripts,
and writes the score record to MongoDB.

Idempotency: before scoring, checks the scores collection for the filing_id.
If already present, commits the offset and moves on.
"""

import json
import logging
from datetime import datetime, timezone

from dotenv import load_dotenv
from kafka import KafkaConsumer, KafkaProducer
from kafka.errors import KafkaError
from pymongo import MongoClient

from .config import Config
from .scorer import Scorer

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

TOPIC_IN = "raw-transcripts"
TOPIC_OUT = "scored-transcripts"


# ── MongoDB helpers ───────────────────────────────────────────────────────────

def _already_scored(db, filing_id: str) -> bool:
    if not filing_id:
        return False  # No stable key — always process to avoid silently dropping messages
    doc = db.scores.find_one({"filing_id": filing_id})
    if doc is None:
        return False
    # Re-score if the record pre-dates the extended prompt (trade_brief absent)
    # or was mock-injected and is waiting for real Claude data.
    return "trade_brief" in doc and not doc.get("_mock")


def _save_score(db, filing_id: str, ticker: str, call_date: str,
                score: int, phrases: list, model: str, scored_at: str,
                guidance_flag, trade_brief, qa_defensiveness) -> None:
    query = {"filing_id": filing_id} if filing_id else {"ticker": ticker, "call_date": call_date}
    db.scores.update_one(
        query,
        {
            "$set": {
                "filing_id": filing_id,
                "ticker": ticker,
                "call_date": call_date,
                "confidence_score": score,
                "key_phrases": phrases,
                "guidance_flag": guidance_flag,
                "trade_brief": trade_brief,
                "qa_defensiveness": qa_defensiveness,
                "model_used": model,
                "scored_at": scored_at,
            },
            "$unset": {"_mock": ""},
        },
        upsert=True,
    )


# ── Main loop ─────────────────────────────────────────────────────────────────

def main() -> None:
    cfg = Config.from_env()

    if not cfg.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set — cannot start scoring service")

    scorer = Scorer(
        api_key=cfg.anthropic_api_key,
        model=cfg.model,
        max_chars=cfg.max_transcript_chars,
    )

    consumer = KafkaConsumer(
        TOPIC_IN,
        bootstrap_servers=cfg.kafka_bootstrap_servers,
        group_id="scoring-service",
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        value_deserializer=lambda b: json.loads(b.decode("utf-8")),
        key_deserializer=lambda b: b.decode("utf-8") if b else None,
    )

    producer = KafkaProducer(
        bootstrap_servers=cfg.kafka_bootstrap_servers,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda k: k.encode("utf-8") if k else None,
        acks="all",
        retries=3,
        retry_backoff_ms=300,
    )

    mongo = MongoClient(cfg.mongo_uri)
    db = mongo.get_default_database()

    logger.info(
        "Scoring service ready | model=%s | topic=%s → %s",
        cfg.model, TOPIC_IN, TOPIC_OUT,
    )

    try:
        for kafka_msg in consumer:
            msg = kafka_msg.value
            filing_id = msg.get("filing_id", "")
            ticker = msg.get("ticker", "UNKNOWN")
            call_date = msg.get("call_date", "")

            logger.info("← %-16s  %s  %s", TOPIC_IN, ticker, call_date)

            # ── Idempotency check ─────────────────────────────────────────────
            if _already_scored(db, filing_id):
                logger.info("Already scored %s — skipping", filing_id)
                consumer.commit()
                continue

            # ── Score via Claude ──────────────────────────────────────────────
            try:
                result = scorer.score(msg["raw_text"], ticker)
            except ValueError as exc:
                logger.error("Skipping unscoreable message %s [%s]: %s", ticker, filing_id, exc)
                consumer.commit()  # malformed model response — skip, don't retry forever
                continue
            except Exception as exc:
                err_str = str(exc)
                if "credit balance is too low" in err_str or "insufficient_quota" in err_str:
                    # Commit and skip — queue drains cleanly. Run rebackfill-all once
                    # credits are restored and everything will be re-scored.
                    logger.warning("Anthropic credits depleted — skipping %s, run rebackfill-all after topping up", filing_id)
                    consumer.commit()
                    continue
                logger.error("Scoring failed for %s [%s]: %s", ticker, filing_id, exc)
                # Don't commit — will retry on service restart
                continue

            scored_at = datetime.now(timezone.utc).isoformat()

            # ── Build scored-transcripts message (raw_text excluded to stay lean) ──
            scored_msg = {
                "ticker": ticker,
                "company_name": msg.get("company_name", ""),
                "call_date": call_date,
                "filing_id": filing_id,
                "cik": msg.get("cik", ""),
                "source": msg.get("source", ""),
                "ingested_at": msg.get("ingested_at", ""),
                "confidence_score": result["confidence_score"],
                "key_phrases": result["key_phrases"],
                "guidance_flag": result["guidance_flag"],
                "trade_brief": result["trade_brief"],
                "qa_defensiveness": result["qa_defensiveness"],
                "model_used": cfg.model,
                "scored_at": scored_at,
            }

            # ── Publish to scored-transcripts ─────────────────────────────────
            try:
                future = producer.send(TOPIC_OUT, key=ticker, value=scored_msg)
                future.get(timeout=10)
                logger.info(
                    "→ %-20s  %s  score=%d",
                    TOPIC_OUT, ticker, result["confidence_score"],
                )
            except KafkaError as exc:
                logger.error("Kafka publish failed for %s: %s", filing_id, exc)
                # Don't commit — retry on restart
                continue

            # ── Persist to MongoDB ────────────────────────────────────────────
            try:
                _save_score(
                    db, filing_id, ticker, call_date,
                    result["confidence_score"], result["key_phrases"],
                    cfg.model, scored_at,
                    result["guidance_flag"], result["trade_brief"], result["qa_defensiveness"],
                )
            except Exception as exc:
                logger.error("MongoDB write failed for %s: %s", filing_id, exc)
                # Score is safely in Kafka — commit anyway, log the write failure

            consumer.commit()

    except (KeyboardInterrupt, SystemExit):
        logger.info("Shutting down scoring service")
    finally:
        consumer.close()
        producer.flush()
        producer.close()
        mongo.close()


if __name__ == "__main__":
    main()
