from dataclasses import dataclass
import os


@dataclass
class Config:
    kafka_bootstrap_servers: str
    mongo_uri: str
    price_fetch_days: int

    @classmethod
    def from_env(cls) -> "Config":
        kafka = os.getenv("KAFKA_BOOTSTRAP_SERVERS")
        mongo = os.getenv("MONGO_URI")
        if not kafka:
            raise RuntimeError(
                "KAFKA_BOOTSTRAP_SERVERS is required but not set — "
                "add it to your .env or environment"
            )
        if not mongo:
            raise RuntimeError(
                "MONGO_URI is required but not set — "
                "add it to your .env or environment"
            )
        return cls(
            kafka_bootstrap_servers=kafka,
            mongo_uri=mongo,
            price_fetch_days=int(os.getenv("PRICE_FETCH_DAYS", "12")),
        )
