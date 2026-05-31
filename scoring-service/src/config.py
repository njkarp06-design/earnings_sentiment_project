import os
from dataclasses import dataclass


@dataclass
class Config:
    kafka_bootstrap_servers: str
    mongo_uri: str
    anthropic_api_key: str
    model: str
    max_transcript_chars: int  # hard cap before sending to Claude

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            kafka_bootstrap_servers=os.getenv(
                "KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"
            ),
            mongo_uri=os.getenv(
                "MONGO_URI",
                "mongodb://admin:password@localhost:27017/earnings_sentiment?authSource=admin",
            ),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            model=os.getenv("SCORING_MODEL", "claude-sonnet-4-6"),
            max_transcript_chars=int(os.getenv("MAX_TRANSCRIPT_CHARS", "150000")),
        )
