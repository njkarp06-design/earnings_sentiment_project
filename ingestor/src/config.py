import os
from dataclasses import dataclass, field
from typing import List


@dataclass
class Config:
    kafka_bootstrap_servers: str
    mongo_uri: str
    # SEC requires a meaningful User-Agent: "Company contact@email.com"
    edgar_user_agent: str
    tickers: List[str]
    lookback_days: int   # how far back to scan for new 8-K filings on startup
    schedule_hour: int   # UTC hour for the daily cron
    # Empty string = FMP disabled; set to enable fallback for EDGAR misses
    fmp_api_key: str = ""

    @classmethod
    def from_env(cls) -> "Config":
        tickers_raw = os.getenv(
            "TICKERS",
            "AAPL,MSFT,GOOGL,AMZN,META,NVDA,TSLA,JPM,JNJ,XOM",
        )
        return cls(
            kafka_bootstrap_servers=os.getenv(
                "KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"
            ),
            mongo_uri=os.getenv(
                "MONGO_URI",
                "mongodb://admin:password@localhost:27017/earnings_sentiment?authSource=admin",
            ),
            edgar_user_agent=os.getenv(
                "EDGAR_USER_AGENT",
                "EarningsSentimentResearch contact@example.com",
            ),
            tickers=[t.strip().upper() for t in tickers_raw.split(",") if t.strip()],
            lookback_days=int(os.getenv("LOOKBACK_DAYS", "30")),
            schedule_hour=int(os.getenv("SCHEDULE_HOUR", "6")),
            fmp_api_key=os.getenv("FMP_API_KEY", ""),
        )
