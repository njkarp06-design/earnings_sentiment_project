from dataclasses import dataclass
import os


@dataclass
class Config:
    kafka_bootstrap_servers: str
    mongo_uri: str
    price_fetch_days: int

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            kafka_bootstrap_servers=os.environ["KAFKA_BOOTSTRAP_SERVERS"],
            mongo_uri=os.environ["MONGO_URI"],
            price_fetch_days=int(os.getenv("PRICE_FETCH_DAYS", "12")),
        )
