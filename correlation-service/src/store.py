"""MongoDB helpers for the correlation service."""


def already_correlated(db, filing_id: str) -> bool:
    return db.price_reactions.find_one({"filing_id": filing_id}) is not None


def upsert_price_reaction(db, doc: dict) -> None:
    db.price_reactions.update_one(
        {"filing_id": doc["filing_id"]},
        {"$set": doc},
        upsert=True,
    )


def upsert_raw_price(db, doc: dict) -> None:
    """Cache raw OHLCV records from the raw-prices topic for BFF price charts.

    The raw-prices message shape is:
      {"ticker": str, "call_date": str, "prices": {date_str: {open,high,low,close,volume}}, ...}
    We flatten it into one document per (ticker, date) for efficient chart queries.
    """
    for date_str, ohlcv in doc.get("prices", {}).items():
        db.raw_prices.update_one(
            {"ticker": doc["ticker"], "date": date_str},
            {"$set": {"ticker": doc["ticker"], "date": date_str, **ohlcv}},
            upsert=True,
        )
