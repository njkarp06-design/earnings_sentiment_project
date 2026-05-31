import json
import logging
from typing import Dict

from kafka import KafkaProducer as _KafkaProducer
from kafka.errors import KafkaError

logger = logging.getLogger(__name__)

TOPIC_TRANSCRIPTS = "raw-transcripts"
TOPIC_PRICES = "raw-prices"


class KafkaProducer:
    def __init__(self, bootstrap_servers: str) -> None:
        self._producer = _KafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            acks="all",
            retries=3,
            retry_backoff_ms=300,
        )

    def publish_transcript(self, msg: Dict) -> None:
        self._send(TOPIC_TRANSCRIPTS, key=msg["ticker"], value=msg)
        logger.info("→ raw-transcripts  %s  %s", msg["ticker"], msg["call_date"])

    def publish_prices(self, msg: Dict) -> None:
        self._send(TOPIC_PRICES, key=msg["ticker"], value=msg)
        logger.info("→ raw-prices       %s  %s", msg["ticker"], msg["call_date"])

    def _send(self, topic: str, key: str, value: Dict) -> None:
        future = self._producer.send(topic, key=key, value=value)
        try:
            future.get(timeout=10)
        except KafkaError as exc:
            logger.error("Kafka publish failed [%s]: %s", topic, exc)
            raise

    def close(self) -> None:
        self._producer.flush()
        self._producer.close()
