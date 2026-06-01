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


def filing(company, call_date, score, phrases, close, r1, r3, r7, suffix, corr_offset_days=1):
    """Build a full price_reactions document."""
    corr_ts = (datetime.fromisoformat(call_date) + timedelta(days=corr_offset_days)).replace(
        hour=2, minute=0, second=0, tzinfo=timezone.utc
    ).isoformat()

    return {
        "filing_id":        f"seed_{company['ticker']}_{call_date}_{suffix}",
        "ticker":           company["ticker"],
        "company_name":     company["name"],
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
    }


# ── Company master list ───────────────────────────────────────────────────────

COMPANIES = {
    "AAPL":  {"ticker": "AAPL",  "name": "Apple Inc."},
    "MSFT":  {"ticker": "MSFT",  "name": "Microsoft Corporation"},
    "NVDA":  {"ticker": "NVDA",  "name": "NVIDIA Corporation"},
    "META":  {"ticker": "META",  "name": "Meta Platforms Inc."},
    "GOOGL": {"ticker": "GOOGL", "name": "Alphabet Inc."},
    "AMZN":  {"ticker": "AMZN",  "name": "Amazon.com Inc."},
    "TSLA":  {"ticker": "TSLA",  "name": "Tesla Inc."},
    "AMD":   {"ticker": "AMD",   "name": "Advanced Micro Devices"},
    "JPM":   {"ticker": "JPM",   "name": "JPMorgan Chase & Co."},
    "V":     {"ticker": "V",     "name": "Visa Inc."},
    "BAC":   {"ticker": "BAC",   "name": "Bank of America Corp."},
    "GS":    {"ticker": "GS",    "name": "Goldman Sachs Group"},
    "WMT":   {"ticker": "WMT",   "name": "Walmart Inc."},
    "KO":    {"ticker": "KO",    "name": "Coca-Cola Company"},
    "MCD":   {"ticker": "MCD",   "name": "McDonald's Corporation"},
    "NKE":   {"ticker": "NKE",   "name": "Nike Inc."},
    "DIS":   {"ticker": "DIS",   "name": "Walt Disney Company"},
    "NFLX":  {"ticker": "NFLX",  "name": "Netflix Inc."},
    "JNJ":   {"ticker": "JNJ",   "name": "Johnson & Johnson"},
    "UNH":   {"ticker": "UNH",   "name": "UnitedHealth Group"},
    "PFE":   {"ticker": "PFE",   "name": "Pfizer Inc."},
    "XOM":   {"ticker": "XOM",   "name": "Exxon Mobil Corporation"},
    "CVX":   {"ticker": "CVX",   "name": "Chevron Corporation"},
    "SPOT":  {"ticker": "SPOT",  "name": "Spotify Technology"},
}

# ── Earnings records ──────────────────────────────────────────────────────────
# Format: filing(company, call_date, confidence, [phrases], close, r1d, r3d, r7d, suffix)
# Prices and returns approximate actual Q4 2024 / Q3 2024 earnings events.

RECORDS = [
    # ── Tech ──────────────────────────────────────────────────────────────────
    # AAPL  Q4 2024 (FY Q1 2025) — Jan 30 2025 — beat on services, soft hardware guide
    filing(COMPANIES["AAPL"], "2025-01-30", 84,
           ["services revenue hit an all-time high", "strong developer ecosystem momentum",
            "cautious on near-term iPhone upgrade cycle"],
           229.87, 0.93, 1.59, 2.95, "001"),
    # AAPL  Q3 2024 — Oct 31 2024 — modest beat, China headwinds
    filing(COMPANIES["AAPL"], "2024-10-31", 76,
           ["China recovery remains uneven", "Vision Pro demand tracking our expectations",
            "record services attach rate per device"],
           225.91, -0.35, 0.48, 1.22, "002"),

    # MSFT  Q2 FY2025 — Jan 29 2025 — Azure growth re-accelerated
    filing(COMPANIES["MSFT"], "2025-01-29", 91,
           ["Azure growth re-accelerated to 31 percent", "Copilot monthly actives tripled year-over-year",
            "operating leverage expanding ahead of plan"],
           440.22, 1.82, 3.41, 4.67, "001"),
    # MSFT  Q1 FY2025 — Oct 30 2024 — solid Azure, capex commentary cautious
    filing(COMPANIES["MSFT"], "2024-10-30", 79,
           ["cloud bookings at record levels", "AI infrastructure investment will weigh on margins near-term",
            "commercial remaining performance obligations up 22 percent"],
           432.11, 0.55, -0.28, 1.10, "002"),

    # NVDA  Q3 FY2025 — Nov 20 2024 — Blackwell ramp confirmation
    filing(COMPANIES["NVDA"], "2024-11-20", 95,
           ["Blackwell demand is insatiable", "data centre revenue growing triple digits year-over-year",
            "every hyperscaler building next-generation AI infrastructure"],
           141.06, 4.87, 6.21, 8.43, "001"),
    # NVDA  Q2 FY2025 — Aug 28 2024 — strong but guidance shy
    filing(COMPANIES["NVDA"], "2024-08-28", 88,
           ["demand far exceeds our ability to supply", "Hopper still shipping at full velocity",
            "networking revenue doubled sequentially"],
           125.61, -6.38, -2.14, 1.55, "002"),

    # META  Q4 2024 — Jan 29 2025 — ad revenue and Llama adoption strong
    filing(COMPANIES["META"], "2025-01-29", 88,
           ["ad impressions up 6 percent across the family", "Llama adoption growing faster than anticipated",
            "Reality Labs losses narrowing as hardware scales"],
           617.35, 2.14, 3.78, 5.92, "001"),
    # META  Q3 2024 — Oct 30 2024 — beat across the board
    filing(COMPANIES["META"], "2024-10-30", 86,
           ["daily active people reached 3.29 billion", "Threads surpassed 275 million monthly actives",
            "infrastructure efficiency driving margin expansion"],
           568.49, 1.98, 2.55, 4.12, "002"),

    # GOOGL Q4 2024 — Feb 4 2025 — Search + Cloud both beat
    filing(COMPANIES["GOOGL"], "2025-02-04", 86,
           ["Search revenue grew 13 percent, highest in two years", "Google Cloud operating margin expanded 700 bps",
            "Gemini integration accelerating across all surfaces"],
           192.25, 3.52, 4.81, 7.14, "001"),
    # GOOGL Q3 2024 — Oct 29 2024 — Cloud outperformance
    filing(COMPANIES["GOOGL"], "2024-10-29", 81,
           ["Cloud growth accelerated to 35 percent", "YouTube ad revenue beat by three percent",
            "operating margins at highest in company history"],
           178.93, 1.27, 2.65, 3.89, "002"),

    # AMZN  Q4 2024 — Feb 6 2025 — AWS re-acceleration, strong retail margin
    filing(COMPANIES["AMZN"], "2025-02-06", 89,
           ["AWS revenue grew 19 percent year-over-year", "advertising services surpassed 17 billion in the quarter",
            "operating income more than doubled year-over-year"],
           232.15, 2.88, 5.14, 6.73, "001"),
    # AMZN  Q3 2024 — Oct 31 2024 — logistics efficiency theme
    filing(COMPANIES["AMZN"], "2024-10-31", 83,
           ["same-day delivery now available in over 100 metro areas", "AWS backlog at record 158 billion",
            "operating income exceeded guidance by 27 percent"],
           195.40, 1.63, 3.22, 5.41, "002"),

    # TSLA  Q4 2024 — Jan 29 2025 — deliveries in-line, margin recovery
    filing(COMPANIES["TSLA"], "2025-01-29", 71,
           ["vehicle gross margin recovered to 17.9 percent", "energy storage deployments up 244 percent",
            "FSD miles driven exceeding 3 billion cumulative"],
           402.38, 2.45, -1.83, -4.21, "001"),
    # TSLA  Q3 2024 — Oct 23 2024 — Cybertruck ramp, margin compression
    filing(COMPANIES["TSLA"], "2024-10-23", 65,
           ["Cybertruck becoming top-selling EV above 50 thousand dollars", "margin pressure from price cuts persisting",
            "Optimus robot on track for limited production in 2025"],
           250.85, 21.92, 18.47, 15.33, "002"),

    # AMD   Q4 2024 — Feb 4 2025 — MI300 momentum, data centre beat
    filing(COMPANIES["AMD"], "2025-02-04", 82,
           ["MI300 data centre GPU revenue exceeded 5 billion in full year 2024", "PC market recovery driving client growth",
            "embedded segment showing early signs of inventory normalisation"],
           119.49, -7.24, -9.87, -12.34, "001"),
    # AMD   Q3 2024 — Oct 29 2024 — MI300 ramp confirmation
    filing(COMPANIES["AMD"], "2024-10-29", 79,
           ["MI300 on track to exceed 5 billion in 2024", "gaming revenue declined as expected",
            "EPYC share gains continuing against competition"],
           158.41, 1.14, -2.33, -0.87, "002"),

    # ── Finance ───────────────────────────────────────────────────────────────
    # JPM   Q4 2024 — Jan 15 2025 — record full-year net income
    filing(COMPANIES["JPM"], "2025-01-15", 87,
           ["record full-year net income of 58 billion dollars", "investment banking fees up 49 percent in the quarter",
            "net interest income guidance raised for 2025"],
           241.52, 1.87, 2.34, 3.12, "001"),
    # JPM   Q3 2024 — Oct 11 2024 — NII peak concerns
    filing(COMPANIES["JPM"], "2024-10-11", 78,
           ["net interest income approaching near-term peak", "credit card net charge-off rate normalising",
            "markets revenue up 8 percent year-over-year"],
           218.45, -0.87, 0.54, 1.23, "002"),

    # V     Q1 FY2025 — Jan 28 2025 — payments volume growth solid
    filing(COMPANIES["V"], "2025-01-28", 85,
           ["payments volume grew 9 percent year-over-year", "cross-border volume up 16 percent",
            "value-added services now approaching 30 percent of revenue"],
           329.68, 0.64, 1.18, 2.05, "001"),
    # V     Q4 FY2024 — Oct 22 2024 — steady growth
    filing(COMPANIES["V"], "2024-10-22", 83,
           ["tap-to-pay penetration exceeded 75 percent globally", "debit volume growth outpacing credit",
            "tokenisation milestone of 10 billion tokens exceeded"],
           290.36, 0.33, 0.71, 1.44, "002"),

    # BAC   Q4 2024 — Jan 16 2025 — NII inflection
    filing(COMPANIES["BAC"], "2025-01-16", 80,
           ["net interest income inflecting positively", "investment banking revenue up 44 percent year-over-year",
            "consumer credit quality remains broadly stable"],
           46.22, 1.25, 1.87, 2.44, "001"),
    # GS    Q4 2024 — Jan 15 2025 — strong FICC and equities
    filing(COMPANIES["GS"], "2025-01-15", 88,
           ["equities revenue highest since 2021", "asset and wealth management fees grew 16 percent",
            "platform solutions narrowing losses ahead of schedule"],
           548.92, 2.41, 3.15, 4.28, "001"),

    # ── Consumer / Retail ─────────────────────────────────────────────────────
    # WMT   Q3 FY2025 — Nov 19 2024 — market share gains
    filing(COMPANIES["WMT"], "2024-11-19", 86,
           ["US comparable sales grew 5.3 percent, best in years", "global advertising business surpassed 4 billion",
            "private label penetration at record levels"],
           88.72, 2.78, 3.41, 4.87, "001"),
    # WMT   Q2 FY2025 — Aug 15 2024 — raised guidance
    filing(COMPANIES["WMT"], "2024-08-15", 84,
           ["full-year guidance raised twice in three months", "e-commerce profitability improving sequentially",
            "Flipkart outperforming broader Indian e-commerce market"],
           78.34, 1.55, 2.11, 3.28, "002"),

    # KO    Q4 2024 — Feb 5 2025 — volume recovery, pricing power
    filing(COMPANIES["KO"], "2025-02-05", 82,
           ["organic revenue grew 6 percent driven by price and mix", "emerging market volume recovering strongly",
            "free cash flow conversion above 95 percent"],
           63.15, 0.34, -0.12, 0.87, "001"),
    # KO    Q3 2024 — Oct 23 2024 — volume soft, pricing resilient
    filing(COMPANIES["KO"], "2024-10-23", 78,
           ["unit case volume declined 1 percent globally", "North America volume normalising post price increases",
            "emerging and developing markets showing volume recovery"],
           66.40, -1.22, -0.85, 0.33, "002"),

    # MCD   Q4 2024 — Feb 5 2025 — value messaging resonating
    filing(COMPANIES["MCD"], "2025-02-05", 76,
           ["5-dollar value meal drove outsized traffic in the US", "comparable sales returned to positive in Q4",
            "international markets outperforming domestic recovery"],
           292.40, 0.55, 1.12, 2.34, "001"),
    # NKE   Q2 FY2025 — Dec 19 2024 — turnaround early days
    filing(COMPANIES["NKE"], "2024-12-19", 62,
           ["revenue declined 8 percent as expected during repositioning", "direct-to-consumer normalisation continuing",
            "new product pipeline beginning to show traction in wholesale"],
           76.25, -2.14, -3.87, -2.45, "001"),

    # ── Media / Entertainment ─────────────────────────────────────────────────
    # DIS   Q1 FY2025 — Feb 5 2025 — streaming profitable, parks recovery
    filing(COMPANIES["DIS"], "2025-02-05", 83,
           ["combined streaming reached profitability two years ahead of schedule", "ESPN standalone launch on track for fall 2025",
            "parks and experiences margins expanding despite macro caution"],
           111.45, 1.88, 2.45, 3.21, "001"),
    # DIS   Q4 FY2024 — Nov 14 2024 — streaming milestone
    filing(COMPANIES["DIS"], "2024-11-14", 80,
           ["Disney Plus subscriber base exceeding original targets", "linear TV monetisation strategy in transition",
            "Box Office recovery supporting franchise IP value"],
           99.72, 0.91, 1.44, 2.17, "002"),

    # NFLX  Q4 2024 — Jan 21 2025 — subscriber and ARM both beat
    filing(COMPANIES["NFLX"], "2025-01-21", 92,
           ["19 million net adds in Q4, largest quarter since pandemic", "ad-supported tier growing faster than expected",
            "operating margin guidance raised to 29 percent for 2025"],
           843.22, 9.69, 11.34, 14.87, "001"),
    # NFLX  Q3 2024 — Oct 15 2024 — steady ad growth
    filing(COMPANIES["NFLX"], "2024-10-15", 86,
           ["paid sharing driving sustained net add momentum", "advertising revenue nearly doubled year-over-year",
            "content slate performing above subscriber satisfaction benchmarks"],
           733.81, 1.78, 3.12, 5.44, "002"),

    # SPOT  Q4 2024 — Feb 4 2025 — MAU beat, margin inflection
    filing(COMPANIES["SPOT"], "2025-02-04", 87,
           ["monthly active users reached 678 million, ahead of guide", "gross margin expanded to 32 percent",
            "audiobooks and video podcasts driving premium conversion"],
           596.34, 4.21, 6.87, 9.12, "001"),
    # SPOT  Q3 2024 — Nov 12 2024 — profitability confirmed
    filing(COMPANIES["SPOT"], "2024-11-12", 84,
           ["first full year of operating profitability confirmed", "podcast monetisation ahead of internal targets",
            "creator marketplace expanding advertiser demand"],
           411.27, 2.88, 4.15, 6.33, "002"),

    # ── Healthcare ────────────────────────────────────────────────────────────
    # JNJ   Q4 2024 — Jan 22 2025 — MedTech growth, pharma pipeline
    filing(COMPANIES["JNJ"], "2025-01-22", 80,
           ["MedTech segment grew 6.8 percent organically", "innovative medicine pipeline has 16 Phase 3 readouts in 2025",
            "talc litigation resolution reducing balance-sheet uncertainty"],
           147.72, 0.42, 0.88, 1.65, "001"),
    # JNJ   Q3 2024 — Oct 15 2024 — spin-off benefits visible
    filing(COMPANIES["JNJ"], "2024-10-15", 77,
           ["Kenvue separation costs now fully behind us", "oncology pipeline momentum building",
            "MedTech recovery led by electrophysiology"],
           158.45, -0.33, 0.22, 0.97, "002"),

    # UNH   Q4 2024 — Jan 16 2025 — medical cost pressure flagged
    filing(COMPANIES["UNH"], "2025-01-16", 72,
           ["medical cost ratio elevated, management actions underway", "Optum Health revenue growing double digits",
            "guidance range wider than normal reflecting macro uncertainty"],
           484.91, -6.21, -7.84, -5.33, "001"),
    # UNH   Q3 2024 — Oct 15 2024 — steady, Medicare advantage pressure
    filing(COMPANIES["UNH"], "2024-10-15", 75,
           ["Medicare Advantage star ratings impacting 2025 revenue outlook", "Optum Insight backlog at record 34 billion",
            "medical cost management initiatives showing early results"],
           555.80, -0.88, 0.44, 1.12, "002"),

    # PFE   Q4 2024 — Jan 28 2025 — COVID tailwinds fading, pipeline focus
    filing(COMPANIES["PFE"], "2025-01-28", 65,
           ["Paxlovid revenue declining as expected", "oncology pipeline advancing with 20 Phase 3 trials",
            "cost realignment programme delivering ahead of schedule"],
           26.88, -1.45, -2.33, -0.87, "001"),

    # ── Energy ────────────────────────────────────────────────────────────────
    # XOM   Q4 2024 — Jan 31 2025 — Pioneer integration synergies
    filing(COMPANIES["XOM"], "2025-01-31", 83,
           ["Pioneer integration delivering 1.5 billion in synergies ahead of schedule", "Permian production at record 1.5 million BOE per day",
            "structural cost savings of 11.3 billion vs 2019 baseline"],
           106.27, 0.74, 1.22, 2.08, "001"),
    # XOM   Q3 2024 — Nov 1 2024 — solid upstream
    filing(COMPANIES["XOM"], "2024-11-01", 80,
           ["Guyana project adding barrels ahead of schedule", "product solutions margins normalising from elevated 2023",
            "shareholder distributions at record 19 billion in nine months"],
           121.07, 0.33, -0.55, 0.88, "002"),

    # CVX   Q4 2024 — Jan 31 2025 — Hess arbitration overhang
    filing(COMPANIES["CVX"], "2025-01-31", 74,
           ["Hess arbitration proceeding as expected, resolution anticipated mid-2025", "TCO expansion achieving nameplate capacity",
            "Permian performance tracking record production trajectory"],
           152.59, -0.55, 0.22, 1.14, "001"),
    # CVX   Q3 2024 — Nov 1 2024 — Tengiz project key
    filing(COMPANIES["CVX"], "2024-11-01", 72,
           ["Tengizchevroil first oil milestone achieved", "buyback programme maintained at 17 billion annual pace",
            "downstream margins compressing with crack spreads"],
           148.77, 0.21, -0.33, 0.65, "002"),
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
