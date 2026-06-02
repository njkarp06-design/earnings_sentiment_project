"""
Seed script: inserts demo earnings-call records for 24 well-known companies.

Each company gets:
  - 1 "recent" call  (Q4 2024 / Q1 FY2025 earnings, reported Jan-Feb 2025)
  - 1 "historical" call (Q3 2024 / Q2 FY2025 earnings, reported Oct-Nov 2024)

The 24 recent calls fill the dashboard feed (limit=24, sorted by correlated_at DESC).
The historical calls appear only in per-company history pages.

Run:
    python tools/seed_demo_data.py [--mongo mongodb://localhost:27017]
"""

import argparse
import sys
from datetime import datetime, timedelta, timezone

# ── Helpers ──────────────────────────────────────────────────────────────────

def make_series(base, r1, r3, r7):
    """
    Build an 8-point price series (day 0–7) by anchoring at the known returns
    and linearly interpolating the missing days with small deterministic offsets.
    """
    r1 = r1 or 0.0
    r3 = r3 or 0.0
    r7 = r7 or 0.0

    anchors = {
        0: 0.0,
        1: r1,
        3: r3,
        7: r7,
        # Interpolated days — realistic curve, not just straight lines
        2: (r1 + r3) / 2 + (r3 - r1) * 0.05,
        4: r3 + (r7 - r3) * 0.28,
        5: r3 + (r7 - r3) * 0.55,
        6: r3 + (r7 - r3) * 0.80,
    }

    series = []
    for day in range(8):
        pct = round(anchors[day], 4)
        series.append({
            "day": day,
            "close": round(base * (1 + pct / 100), 2),
            "pct": pct,
        })
    return series


def ts(date_str, hour=20):
    """UTC ISO timestamp for a given date at `hour` (simulates after-market reporting)."""
    dt = datetime.fromisoformat(date_str).replace(hour=hour, minute=0, second=0, tzinfo=timezone.utc)
    return dt.isoformat()


def filing(company, call_date, score, phrases, close, r1, r3, r7, suffix, trend=None, corr_offset_days=1):
    """Build a full price_reactions document."""
    corr_ts = (datetime.fromisoformat(call_date) + timedelta(days=corr_offset_days)).replace(
        hour=2, minute=0, second=0, tzinfo=timezone.utc
    ).isoformat()

    return {
        "filing_id":        f"seed_{company['ticker']}_{call_date}_{suffix}",
        "ticker":           company["ticker"],
        "company_name":     company["name"],
        "sector":           company["sector"],
        "call_date":        call_date,
        "confidence_score": score,
        "key_phrases":      phrases,
        "model_used":       "claude-sonnet-4-6",
        "scored_at":        ts(call_date),
        "correlated_at":    corr_ts,
        "call_date_close":  close,
        "return_1d":        r1,
        "return_3d":        r3,
        "return_7d":        r7,
        "price_series":     make_series(close, r1, r3, r7),
        "trend":            trend,   # "up" | "down" | "neutral" | None
    }


# ── Company master list ───────────────────────────────────────────────────────

COMPANIES = {
    "AAPL":  {"ticker": "AAPL",  "name": "Apple Inc.",             "sector": "Technology"},
    "MSFT":  {"ticker": "MSFT",  "name": "Microsoft Corporation",  "sector": "Technology"},
    "NVDA":  {"ticker": "NVDA",  "name": "NVIDIA Corporation",     "sector": "Technology"},
    "META":  {"ticker": "META",  "name": "Meta Platforms Inc.",    "sector": "Technology"},
    "GOOGL": {"ticker": "GOOGL", "name": "Alphabet Inc.",          "sector": "Technology"},
    "AMZN":  {"ticker": "AMZN",  "name": "Amazon.com Inc.",        "sector": "Technology"},
    "TSLA":  {"ticker": "TSLA",  "name": "Tesla Inc.",             "sector": "Technology"},
    "AMD":   {"ticker": "AMD",   "name": "Advanced Micro Devices", "sector": "Technology"},
    "JPM":   {"ticker": "JPM",   "name": "JPMorgan Chase & Co.",   "sector": "Finance"},
    "V":     {"ticker": "V",     "name": "Visa Inc.",              "sector": "Finance"},
    "BAC":   {"ticker": "BAC",   "name": "Bank of America Corp.",  "sector": "Finance"},
    "GS":    {"ticker": "GS",    "name": "Goldman Sachs Group",    "sector": "Finance"},
    "WMT":   {"ticker": "WMT",   "name": "Walmart Inc.",           "sector": "Consumer"},
    "KO":    {"ticker": "KO",    "name": "Coca-Cola Company",      "sector": "Consumer"},
    "MCD":   {"ticker": "MCD",   "name": "McDonald's Corporation", "sector": "Consumer"},
    "NKE":   {"ticker": "NKE",   "name": "Nike Inc.",              "sector": "Consumer"},
    "DIS":   {"ticker": "DIS",   "name": "Walt Disney Company",    "sector": "Media"},
    "NFLX":  {"ticker": "NFLX",  "name": "Netflix Inc.",           "sector": "Media"},
    "SPOT":  {"ticker": "SPOT",  "name": "Spotify Technology",     "sector": "Media"},
    "JNJ":   {"ticker": "JNJ",   "name": "Johnson & Johnson",      "sector": "Healthcare"},
    "UNH":   {"ticker": "UNH",   "name": "UnitedHealth Group",     "sector": "Healthcare"},
    "PFE":   {"ticker": "PFE",   "name": "Pfizer Inc.",            "sector": "Healthcare"},
    "XOM":   {"ticker": "XOM",   "name": "Exxon Mobil Corporation","sector": "Energy"},
    "CVX":   {"ticker": "CVX",   "name": "Chevron Corporation",    "sector": "Energy"},
}

# ── Earnings records ──────────────────────────────────────────────────────────
# Format: filing(company, call_date, confidence, [phrases], close, r1d, r3d, r7d, suffix)
# Prices and returns approximate actual Q4 2024 / Q3 2024 earnings events.

RECORDS = [
    # ── Tech ──────────────────────────────────────────────────────────────────
    # AAPL  Q4 2024 (FY Q1 2025) — Jan 30 2025 — recent: +8 vs prev → up
    filing(COMPANIES["AAPL"], "2025-01-30", 84,
           ["services revenue hit an all-time high", "strong developer ecosystem momentum",
            "cautious on near-term iPhone upgrade cycle"],
           229.87, 0.93, 1.59, 2.95, "001", trend="up"),
    # AAPL  Q3 2024 — Oct 31 2024 — historical (no prior to compare)
    filing(COMPANIES["AAPL"], "2024-10-31", 76,
           ["China recovery remains uneven", "Vision Pro demand tracking our expectations",
            "record services attach rate per device"],
           225.91, -0.35, 0.48, 1.22, "002", trend=None),

    # MSFT  Q2 FY2025 — Jan 29 2025 — recent: +12 vs prev → up
    filing(COMPANIES["MSFT"], "2025-01-29", 91,
           ["Azure growth re-accelerated to 31 percent", "Copilot monthly actives tripled year-over-year",
            "operating leverage expanding ahead of plan"],
           440.22, 1.82, 3.41, 4.67, "001", trend="up"),
    # MSFT  Q1 FY2025 — Oct 30 2024 — historical
    filing(COMPANIES["MSFT"], "2024-10-30", 79,
           ["cloud bookings at record levels", "AI infrastructure investment will weigh on margins near-term",
            "commercial remaining performance obligations up 22 percent"],
           432.11, 0.55, -0.28, 1.10, "002", trend=None),

    # NVDA  Q3 FY2025 — Nov 20 2024 — recent: +7 vs prev → up
    filing(COMPANIES["NVDA"], "2024-11-20", 95,
           ["Blackwell demand is insatiable", "data centre revenue growing triple digits year-over-year",
            "every hyperscaler building next-generation AI infrastructure"],
           141.06, 4.87, 6.21, 8.43, "001", trend="up"),
    # NVDA  Q2 FY2025 — Aug 28 2024 — historical
    filing(COMPANIES["NVDA"], "2024-08-28", 88,
           ["demand far exceeds our ability to supply", "Hopper still shipping at full velocity",
            "networking revenue doubled sequentially"],
           125.61, -6.38, -2.14, 1.55, "002", trend=None),

    # META  Q4 2024 — Jan 29 2025 — recent: +2 vs prev → neutral
    filing(COMPANIES["META"], "2025-01-29", 88,
           ["ad impressions up 6 percent across the family", "Llama adoption growing faster than anticipated",
            "Reality Labs losses narrowing as hardware scales"],
           617.35, 2.14, 3.78, 5.92, "001", trend="neutral"),
    # META  Q3 2024 — Oct 30 2024 — historical
    filing(COMPANIES["META"], "2024-10-30", 86,
           ["daily active people reached 3.29 billion", "Threads surpassed 275 million monthly actives",
            "infrastructure efficiency driving margin expansion"],
           568.49, 1.98, 2.55, 4.12, "002", trend=None),

    # GOOGL Q4 2024 — Feb 4 2025 — recent: +5 vs prev → neutral
    filing(COMPANIES["GOOGL"], "2025-02-04", 86,
           ["Search revenue grew 13 percent, highest in two years", "Google Cloud operating margin expanded 700 bps",
            "Gemini integration accelerating across all surfaces"],
           192.25, 3.52, 4.81, 7.14, "001", trend="neutral"),
    # GOOGL Q3 2024 — Oct 29 2024 — historical
    filing(COMPANIES["GOOGL"], "2024-10-29", 81,
           ["Cloud growth accelerated to 35 percent", "YouTube ad revenue beat by three percent",
            "operating margins at highest in company history"],
           178.93, 1.27, 2.65, 3.89, "002", trend=None),

    # AMZN  Q4 2024 — Feb 6 2025 — recent: +6 vs prev → up
    filing(COMPANIES["AMZN"], "2025-02-06", 89,
           ["AWS revenue grew 19 percent year-over-year", "advertising services surpassed 17 billion in the quarter",
            "operating income more than doubled year-over-year"],
           232.15, 2.88, 5.14, 6.73, "001", trend="up"),
    # AMZN  Q3 2024 — Oct 31 2024 — historical
    filing(COMPANIES["AMZN"], "2024-10-31", 83,
           ["same-day delivery now available in over 100 metro areas", "AWS backlog at record 158 billion",
            "operating income exceeded guidance by 27 percent"],
           195.40, 1.63, 3.22, 5.41, "002", trend=None),

    # TSLA  Q4 2024 — Jan 29 2025 — recent: +6 vs prev → up
    filing(COMPANIES["TSLA"], "2025-01-29", 71,
           ["vehicle gross margin recovered to 17.9 percent", "energy storage deployments up 244 percent",
            "FSD miles driven exceeding 3 billion cumulative"],
           402.38, 2.45, -1.83, -4.21, "001", trend="up"),
    # TSLA  Q3 2024 — Oct 23 2024 — historical
    filing(COMPANIES["TSLA"], "2024-10-23", 65,
           ["Cybertruck becoming top-selling EV above 50 thousand dollars", "margin pressure from price cuts persisting",
            "Optimus robot on track for limited production in 2025"],
           250.85, 21.92, 18.47, 15.33, "002", trend=None),

    # AMD   Q4 2024 — Feb 4 2025 — recent: +3 vs prev → neutral
    filing(COMPANIES["AMD"], "2025-02-04", 82,
           ["MI300 data centre GPU revenue exceeded 5 billion in full year 2024", "PC market recovery driving client growth",
            "embedded segment showing early signs of inventory normalisation"],
           119.49, -7.24, -9.87, -12.34, "001", trend="neutral"),
    # AMD   Q3 2024 — Oct 29 2024 — historical
    filing(COMPANIES["AMD"], "2024-10-29", 79,
           ["MI300 on track to exceed 5 billion in 2024", "gaming revenue declined as expected",
            "EPYC share gains continuing against competition"],
           158.41, 1.14, -2.33, -0.87, "002", trend=None),

    # ── Finance ───────────────────────────────────────────────────────────────
    # JPM   Q4 2024 — Jan 15 2025 — recent: +9 vs prev → up
    filing(COMPANIES["JPM"], "2025-01-15", 87,
           ["record full-year net income of 58 billion dollars", "investment banking fees up 49 percent in the quarter",
            "net interest income guidance raised for 2025"],
           241.52, 1.87, 2.34, 3.12, "001", trend="up"),
    # JPM   Q3 2024 — Oct 11 2024 — historical
    filing(COMPANIES["JPM"], "2024-10-11", 78,
           ["net interest income approaching near-term peak", "credit card net charge-off rate normalising",
            "markets revenue up 8 percent year-over-year"],
           218.45, -0.87, 0.54, 1.23, "002", trend=None),

    # V     Q1 FY2025 — Jan 28 2025 — recent: +2 vs prev → neutral
    filing(COMPANIES["V"], "2025-01-28", 85,
           ["payments volume grew 9 percent year-over-year", "cross-border volume up 16 percent",
            "value-added services now approaching 30 percent of revenue"],
           329.68, 0.64, 1.18, 2.05, "001", trend="neutral"),
    # V     Q4 FY2024 — Oct 22 2024 — historical
    filing(COMPANIES["V"], "2024-10-22", 83,
           ["tap-to-pay penetration exceeded 75 percent globally", "debit volume growth outpacing credit",
            "tokenisation milestone of 10 billion tokens exceeded"],
           290.36, 0.33, 0.71, 1.44, "002", trend=None),

    # BAC   Q4 2024 — Jan 16 2025 — no prior call → neutral
    filing(COMPANIES["BAC"], "2025-01-16", 80,
           ["net interest income inflecting positively", "investment banking revenue up 44 percent year-over-year",
            "consumer credit quality remains broadly stable"],
           46.22, 1.25, 1.87, 2.44, "001", trend="neutral"),
    # GS    Q4 2024 — Jan 15 2025 — no prior call → neutral
    filing(COMPANIES["GS"], "2025-01-15", 88,
           ["equities revenue highest since 2021", "asset and wealth management fees grew 16 percent",
            "platform solutions narrowing losses ahead of schedule"],
           548.92, 2.41, 3.15, 4.28, "001", trend="neutral"),

    # ── Consumer / Retail ─────────────────────────────────────────────────────
    # WMT   Q3 FY2025 — Nov 19 2024 — recent: +2 vs prev → neutral
    filing(COMPANIES["WMT"], "2024-11-19", 86,
           ["US comparable sales grew 5.3 percent, best in years", "global advertising business surpassed 4 billion",
            "private label penetration at record levels"],
           88.72, 2.78, 3.41, 4.87, "001", trend="neutral"),
    # WMT   Q2 FY2025 — Aug 15 2024 — historical
    filing(COMPANIES["WMT"], "2024-08-15", 84,
           ["full-year guidance raised twice in three months", "e-commerce profitability improving sequentially",
            "Flipkart outperforming broader Indian e-commerce market"],
           78.34, 1.55, 2.11, 3.28, "002", trend=None),

    # KO    Q4 2024 — Feb 5 2025 — recent: +4 vs prev → neutral
    filing(COMPANIES["KO"], "2025-02-05", 82,
           ["organic revenue grew 6 percent driven by price and mix", "emerging market volume recovering strongly",
            "free cash flow conversion above 95 percent"],
           63.15, 0.34, -0.12, 0.87, "001", trend="neutral"),
    # KO    Q3 2024 — Oct 23 2024 — historical
    filing(COMPANIES["KO"], "2024-10-23", 78,
           ["unit case volume declined 1 percent globally", "North America volume normalising post price increases",
            "emerging and developing markets showing volume recovery"],
           66.40, -1.22, -0.85, 0.33, "002", trend=None),

    # MCD   Q4 2024 — Feb 5 2025 — no prior call → neutral
    filing(COMPANIES["MCD"], "2025-02-05", 76,
           ["5-dollar value meal drove outsized traffic in the US", "comparable sales returned to positive in Q4",
            "international markets outperforming domestic recovery"],
           292.40, 0.55, 1.12, 2.34, "001", trend="neutral"),
    # NKE   Q2 FY2025 — Dec 19 2024 — no prior call → neutral
    filing(COMPANIES["NKE"], "2024-12-19", 62,
           ["revenue declined 8 percent as expected during repositioning", "direct-to-consumer normalisation continuing",
            "new product pipeline beginning to show traction in wholesale"],
           76.25, -2.14, -3.87, -2.45, "001", trend="neutral"),

    # ── Media / Entertainment ─────────────────────────────────────────────────
    # DIS   Q1 FY2025 — Feb 5 2025 — recent: +3 vs prev → neutral
    filing(COMPANIES["DIS"], "2025-02-05", 83,
           ["combined streaming reached profitability two years ahead of schedule", "ESPN standalone launch on track for fall 2025",
            "parks and experiences margins expanding despite macro caution"],
           111.45, 1.88, 2.45, 3.21, "001", trend="neutral"),
    # DIS   Q4 FY2024 — Nov 14 2024 — historical
    filing(COMPANIES["DIS"], "2024-11-14", 80,
           ["Disney Plus subscriber base exceeding original targets", "linear TV monetisation strategy in transition",
            "Box Office recovery supporting franchise IP value"],
           99.72, 0.91, 1.44, 2.17, "002", trend=None),

    # NFLX  Q4 2024 — Jan 21 2025 — recent: +6 vs prev → up
    filing(COMPANIES["NFLX"], "2025-01-21", 92,
           ["19 million net adds in Q4, largest quarter since pandemic", "ad-supported tier growing faster than expected",
            "operating margin guidance raised to 29 percent for 2025"],
           843.22, 9.69, 11.34, 14.87, "001", trend="up"),
    # NFLX  Q3 2024 — Oct 15 2024 — historical
    filing(COMPANIES["NFLX"], "2024-10-15", 86,
           ["paid sharing driving sustained net add momentum", "advertising revenue nearly doubled year-over-year",
            "content slate performing above subscriber satisfaction benchmarks"],
           733.81, 1.78, 3.12, 5.44, "002", trend=None),

    # SPOT  Q4 2024 — Feb 4 2025 — recent: +3 vs prev → neutral
    filing(COMPANIES["SPOT"], "2025-02-04", 87,
           ["monthly active users reached 678 million, ahead of guide", "gross margin expanded to 32 percent",
            "audiobooks and video podcasts driving premium conversion"],
           596.34, 4.21, 6.87, 9.12, "001", trend="neutral"),
    # SPOT  Q3 2024 — Nov 12 2024 — historical
    filing(COMPANIES["SPOT"], "2024-11-12", 84,
           ["first full year of operating profitability confirmed", "podcast monetisation ahead of internal targets",
            "creator marketplace expanding advertiser demand"],
           411.27, 2.88, 4.15, 6.33, "002", trend=None),

    # ── Healthcare ────────────────────────────────────────────────────────────
    # JNJ   Q4 2024 — Jan 22 2025 — recent: +3 vs prev → neutral
    filing(COMPANIES["JNJ"], "2025-01-22", 80,
           ["MedTech segment grew 6.8 percent organically", "innovative medicine pipeline has 16 Phase 3 readouts in 2025",
            "talc litigation resolution reducing balance-sheet uncertainty"],
           147.72, 0.42, 0.88, 1.65, "001", trend="neutral"),
    # JNJ   Q3 2024 — Oct 15 2024 — historical
    filing(COMPANIES["JNJ"], "2024-10-15", 77,
           ["Kenvue separation costs now fully behind us", "oncology pipeline momentum building",
            "MedTech recovery led by electrophysiology"],
           158.45, -0.33, 0.22, 0.97, "002", trend=None),

    # UNH   Q4 2024 — Jan 16 2025 — recent: -3 vs prev → neutral
    filing(COMPANIES["UNH"], "2025-01-16", 72,
           ["medical cost ratio elevated, management actions underway", "Optum Health revenue growing double digits",
            "guidance range wider than normal reflecting macro uncertainty"],
           484.91, -6.21, -7.84, -5.33, "001", trend="neutral"),
    # UNH   Q3 2024 — Oct 15 2024 — historical
    filing(COMPANIES["UNH"], "2024-10-15", 75,
           ["Medicare Advantage star ratings impacting 2025 revenue outlook", "Optum Insight backlog at record 34 billion",
            "medical cost management initiatives showing early results"],
           555.80, -0.88, 0.44, 1.12, "002", trend=None),

    # PFE   Q4 2024 — Jan 28 2025 — no prior call → neutral
    filing(COMPANIES["PFE"], "2025-01-28", 65,
           ["Paxlovid revenue declining as expected", "oncology pipeline advancing with 20 Phase 3 trials",
            "cost realignment programme delivering ahead of schedule"],
           26.88, -1.45, -2.33, -0.87, "001", trend="neutral"),

    # ── Energy ────────────────────────────────────────────────────────────────
    # XOM   Q4 2024 — Jan 31 2025 — recent: +3 vs prev → neutral
    filing(COMPANIES["XOM"], "2025-01-31", 83,
           ["Pioneer integration delivering 1.5 billion in synergies ahead of schedule", "Permian production at record 1.5 million BOE per day",
            "structural cost savings of 11.3 billion vs 2019 baseline"],
           106.27, 0.74, 1.22, 2.08, "001", trend="neutral"),
    # XOM   Q3 2024 — Nov 1 2024 — historical
    filing(COMPANIES["XOM"], "2024-11-01", 80,
           ["Guyana project adding barrels ahead of schedule", "product solutions margins normalising from elevated 2023",
            "shareholder distributions at record 19 billion in nine months"],
           121.07, 0.33, -0.55, 0.88, "002", trend=None),

    # CVX   Q4 2024 — Jan 31 2025 — recent: +2 vs prev → neutral
    filing(COMPANIES["CVX"], "2025-01-31", 74,
           ["Hess arbitration proceeding as expected, resolution anticipated mid-2025", "TCO expansion achieving nameplate capacity",
            "Permian performance tracking record production trajectory"],
           152.59, -0.55, 0.22, 1.14, "001", trend="neutral"),
    # CVX   Q3 2024 — Nov 1 2024 — historical
    filing(COMPANIES["CVX"], "2024-11-01", 72,
           ["Tengizchevroil first oil milestone achieved", "buyback programme maintained at 17 billion annual pace",
            "downstream margins compressing with crack spreads"],
           148.77, 0.21, -0.33, 0.65, "002", trend=None),
]


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    from pymongo import MongoClient, errors

    parser = argparse.ArgumentParser(description="Seed demo earnings data into MongoDB.")
    parser.add_argument("--mongo", default="mongodb://localhost:27017", help="MongoDB connection URI")
    args = parser.parse_args()

    client = MongoClient(args.mongo, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
    except errors.ConnectionFailure as exc:
        print(f"[ERROR] Cannot connect to MongoDB at {args.mongo}: {exc}", file=sys.stderr)
        sys.exit(1)

    db = client.earnings_sentiment
    collection = db.price_reactions

    inserted = updated = skipped = 0

    for doc in RECORDS:
        fid = doc["filing_id"]
        result = collection.update_one(
            {"filing_id": fid},
            {"$set": doc},
            upsert=True,
        )
        if result.upserted_id:
            print(f"  [inserted] {fid}")
            inserted += 1
        elif result.modified_count:
            print(f"  [updated]  {fid}")
            updated += 1
        else:
            print(f"  [skipped]  {fid}  (unchanged)")
            skipped += 1

    total = len(RECORDS)
    print(
        f"\nDone. {total} records processed: "
        f"{inserted} inserted, {updated} updated, {skipped} unchanged."
    )

    client.close()


if __name__ == "__main__":
    main()
