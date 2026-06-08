"""
Demo data injector.
Fills every company to 12 historical earnings calls with fully realistic data:
 - Quarterly call dates going backwards
 - Company-specific confidence score personalities
 - Returns correlated to scores with realistic variance
 - Consistent price_series derived from the returns
 - guidance_flag, trade_brief, qa_defensiveness
 - All tagged _mock=True for automatic Claude replacement later
"""

import random
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient, UpdateOne

MONGO_URI = "mongodb://earningssentiment:REDACTED@mongo:27017/earnings_sentiment?authSource=admin"
TARGET = 12   # minimum calls per company after injection

# ── Approximate base stock prices ─────────────────────────────────────────────
BASE_PRICES = {
    "AAPL": 192, "MSFT": 415, "NVDA": 475, "GOOGL": 173, "META": 508,
    "AMZN": 193, "TSLA": 218, "AVGO": 158, "V": 278, "MA": 478,
    "JPM": 203, "JNJ": 153, "UNH": 512, "XOM": 111, "CVX": 153,
    "BAC": 41,  "GS": 508,  "KO": 64,   "PFE": 27,  "ABBV": 173,
    "MCD": 293, "NKE": 74,  "WMT": 96,  "DIS": 94,  "NFLX": 638,
    "CRM": 293, "AMD": 143, "INTC": 21, "CAT": 338, "HON": 223,
    "DELL": 123,"SNOW": 153,"WDAY": 243,"OKTA": 93, "PANW": 183,
    "CRWD": 353,"MDB": 263, "LULU": 283,"HAE": 57,  "AI": 27,
    "CHPT": 1.7,"RENT": 2.4,"WOOF": 3.1,"CURV": 4.4,"CXM": 7.8,
    "VEEV": 193,"CAL": 21,  "BF-B": 37, "KRNY": 9.4,"THO": 81,
    "PYYX": 5.9,"TTC": 94,  "EG": 383,  "CNR": 41,  "PVH": 67,
    "CMCO": 34, "HPQ": 31,  "ACA": 84,  "PYYX": 5.9,
}

# ── Per-ticker scoring personality (mean, std, drift per quarter) ─────────────
# drift > 0 = scores trending up over time; < 0 = trending down
PROFILES = {
    "NVDA":  (83, 7,  0.8),   # AI wave — consistently stellar, improving
    "META":  (79, 8,  0.5),   # Ad recovery + AI pivot, improving
    "MSFT":  (78, 7,  0.3),   # Cloud + Copilot, steady strong
    "CRWD":  (75, 8,  0.4),   # Cybersecurity growth
    "AMZN":  (74, 9,  0.2),   # AWS dominance
    "AAPL":  (74, 8,  0.0),   # Steady, mature
    "AVGO":  (73, 8,  0.3),
    "CRM":   (71, 9,  0.2),
    "GOOGL": (72, 9,  0.1),
    "MDB":   (69, 10, 0.3),
    "SNOW":  (66, 11, 0.2),   # Growth but lumpy
    "WDAY":  (68, 9,  0.1),
    "NFLX":  (70, 10, 0.4),   # Subscriber growth re-acceleration
    "V":     (73, 7,  0.1),
    "MA":    (73, 7,  0.1),
    "JPM":   (70, 8,  0.1),
    "GS":    (65, 10, 0.0),
    "BAC":   (63, 9,  0.0),
    "JNJ":   (66, 8,  0.0),
    "UNH":   (70, 8, -0.2),   # Medical cost headwinds
    "ABBV":  (68, 9,  0.2),
    "PFE":   (52, 11,-0.5),   # Post-COVID revenue cliff
    "VEEV":  (70, 9,  0.2),
    "HAE":   (62, 10, 0.1),
    "XOM":   (65, 10, 0.0),
    "CVX":   (64, 10, 0.0),
    "CAT":   (68, 9,  0.1),
    "HON":   (66, 9,  0.0),
    "ACA":   (67, 9,  0.1),
    "WMT":   (71, 8,  0.2),
    "KO":    (67, 7,  0.0),
    "MCD":   (68, 8,  0.0),
    "DIS":   (60, 11,-0.2),   # Streaming + parks mixed
    "NKE":   (58, 11,-0.4),   # China headwinds + share loss
    "LULU":  (65, 11,-0.3),   # Post-pandemic normalisation
    "TSLA":  (58, 15, 0.0),   # Highly volatile
    "AMD":   (70, 10, 0.3),   # Data centre GPU ramp
    "INTC":  (44, 12,-0.6),   # Structural decline, foundry struggles
    "HPQ":   (60, 9,  0.0),
    "DELL":  (65, 9,  0.2),
    "PANW":  (74, 8,  0.3),
    "OKTA":  (63, 10, 0.1),
    "OKTA":  (63, 10, 0.1),
    "CAL":   (55, 11, 0.0),
    "PVH":   (57, 11,-0.2),
    "TTC":   (62, 9,  0.0),
    "THO":   (55, 11,-0.1),
    "CMCO":  (60, 10, 0.0),
    "EG":    (66, 9,  0.1),
    "CNR":   (62, 10, 0.0),
    "BF-B":  (60, 9, -0.3),
    "WOOF":  (50, 12,-0.2),
    "RENT":  (38, 12,-0.3),
    "CHPT":  (34, 12,-0.4),
    "AI":    (48, 13, 0.1),
    "PYYX":  (45, 11,-0.1),
    "CURV":  (52, 11,-0.2),
    "CXM":   (55, 10, 0.0),
    "KRNY":  (58, 9,  0.0),
    "CRWD":  (75, 8,  0.4),
}
DEFAULT_PROFILE = (62, 10, 0.0)

# ── Key phrase templates by tone ───────────────────────────────────────────────
HIGH_PHRASES = [
    ["record revenue driven by exceptional product demand",
     "operating margin expansion of 200 basis points year-over-year",
     "raising full-year guidance on strong execution"],
    ["double-digit growth across all geographic segments",
     "free cash flow generation hit an all-time high this quarter",
     "we're very confident in our pipeline heading into next year"],
    ["significant momentum in our enterprise customer base",
     "gross margin improvement reflects our disciplined cost structure",
     "we are increasing our full-year revenue and EPS outlook"],
    ["best quarter in company history by virtually every metric",
     "accelerating adoption in our highest-margin product lines",
     "strong demand signals give us clear visibility into next year"],
    ["exceptional execution across all business units",
     "cash returned to shareholders at record levels this quarter",
     "our competitive moat has never been stronger"],
]
MID_PHRASES = [
    ["results in line with our guidance range",
     "some macro headwinds offset by operational improvements",
     "we are reaffirming our full-year outlook"],
    ["steady performance in our core business segments",
     "foreign exchange created a modest headwind this quarter",
     "management remains focused on disciplined capital allocation"],
    ["revenue growth met expectations despite softer consumer demand",
     "margin pressure from elevated input costs was partially mitigated",
     "we maintained our full-year guidance with a cautious outlook"],
    ["solid execution in a challenging macro environment",
     "inventory levels normalising toward healthy range",
     "we expect sequential improvement through the back half"],
    ["in-line results with mixed signals by geography",
     "cost optimisation programme delivering expected savings",
     "reiterating guidance as uncertainty remains elevated"],
]
LOW_PHRASES = [
    ["revenue missed our own guidance range by a meaningful margin",
     "gross margin compression reflects ongoing pricing pressure",
     "we are reducing our full-year outlook due to macro uncertainty"],
    ["demand deterioration was steeper than anticipated this quarter",
     "elevated inventory levels will pressure margins into next quarter",
     "withdrawing annual guidance given the visibility challenges"],
    ["significant headwinds from customer spending pullbacks",
     "we are taking decisive restructuring actions to reduce costs",
     "near-term outlook remains challenging and uncertain"],
    ["disappointing top-line performance driven by competitive pressure",
     "customers are deferring purchases in the current environment",
     "we are lowering expectations for the remainder of the fiscal year"],
    ["market conditions deteriorated faster than management expected",
     "working capital challenges limiting our operational flexibility",
     "guidance cut reflects reduced confidence in near-term recovery"],
]

# ── Trade brief templates ──────────────────────────────────────────────────────
HIGH_BRIEFS = [
    ("Beat-and-raise quarter — tone was decisive and management showed high conviction "
     "in the forward outlook, pointing to near-term upside.",
     "The key catalyst for {t} is the raised full-year revenue and EPS guidance, which "
     "gives bulls a concrete re-rating story to run with over the next week."),
    ("Strong execution across the board with confident language from the CEO, signalling "
     "the stock should hold gains or build on them short-term.",
     "For {t}, the single most important forward statement was the guidance raise — watch "
     "for institutional accumulation as the market prices in the upward revision."),
    ("Exceptional results paired with forward confidence create a clear near-term tailwind "
     "for {t}; the risk-reward skews positive heading into the next few sessions.",
     "Management's raised guidance and record free cash flow are the two key signals traders "
     "should anchor on — both point to continued momentum in the stock."),
    ("Management delivered a convincing beat with no signs of hedging; the stock is likely "
     "to attract momentum buyers in the sessions following this call.",
     "The standout forward-looking signal for {t} is the explicit raise in full-year targets, "
     "removing a key overhang and opening the door to multiple expansion."),
    ("Confident tone, strong numbers, raised bar — everything a short-term bull needs to "
     "take a position into the next earnings cycle.",
     "Key tailwind for {t}: double-digit growth paired with margin expansion signals the "
     "business is scaling efficiently, which the market typically rewards with a re-rating."),
]
MID_BRIEFS = [
    ("In-line quarter with neutral tone — the stock is unlikely to make a large directional "
     "move without a fresh catalyst beyond what was presented.",
     "{t} maintained guidance but hedged on macro, which caps near-term upside while "
     "limiting sharp downside risk; expect range-bound price action this week."),
    ("Steady but uninspiring results — no beat-and-raise to excite bulls, no major miss "
     "to trigger a sell-off; the stock should trade close to its pre-earnings level.",
     "The most important signal for {t} was the unchanged guidance range — watch for "
     "analysts revising estimates modestly, which could drive small drift in either direction."),
    ("Neutral print with mixed signals by segment; traders should wait for clarity before "
     "taking a directional view on {t} after this call.",
     "Management's cautious-but-steady language on the outlook suggests the stock is "
     "fairly valued here — any surprise in the next macro print could be the swing factor."),
    ("Results met the bar but didn't raise it; sentiment is likely to be indifferent "
     "post-call unless a key metric surprises on the next leg of analysis.",
     "For {t}, the maintained revenue outlook is the anchor — the stock needs a "
     "positive macro shift or product catalyst to break out of its current range."),
]
LOW_BRIEFS = [
    ("Weak quarter with defensive language — management is in risk-control mode, and "
     "short-term traders should treat {t} as a fade-the-bounce opportunity.",
     "The critical headwind is the guidance cut; with visibility poor, the stock faces "
     "multiple-compression risk that could take 1–2 weeks to fully price in."),
    ("Disappointing results paired with evasive Q&A point to execution risk at {t}; "
     "the stock likely heads lower in the near term as expectations reset.",
     "The most important forward risk is the withdrawn guidance — when management loses "
     "confidence in their own numbers, the market loses confidence in the stock."),
    ("Below-consensus numbers and a cautious tone signal the stock needs a proper reset "
     "before it becomes interesting again; any near-term bounce is a sell.",
     "For {t}, the guidance reduction is the defining signal — the magnitude of the "
     "cut versus current estimates will determine how far the stock reprices this week."),
    ("Miss-and-cut quarter — the CEO's tone was noticeably more defensive than the "
     "prepared remarks suggested, a classic warning sign for further downside.",
     "{t}'s lowered outlook removes the near-term earnings support; watch for "
     "institutional selling into any strength over the next 5 trading sessions."),
]

# ── Quarter offset helpers ─────────────────────────────────────────────────────
# Typical earnings reporting months for different fiscal year conventions
# We generate synthetic quarterly dates spaced ~91 days apart
def _quarterly_dates_before(anchor: str, n: int) -> list[str]:
    """Return n quarterly dates going backwards from anchor (exclusive)."""
    dt = datetime.strptime(anchor, "%Y-%m-%d")
    dates = []
    for i in range(1, n + 8):      # overshoot, filter later
        d = dt - timedelta(days=91 * i)
        # Nudge to a weekday
        while d.weekday() >= 5:
            d -= timedelta(days=1)
        dates.append(d.strftime("%Y-%m-%d"))
        if len(dates) >= n:
            break
    return dates


def _price_series(base: float, r1: float, r3: float, r7: float) -> list[dict]:
    """Build a 7-day price series consistent with the given returns."""
    rng_intra = [0.0]
    # day 1 = r1, day 3 = r3, day 7 = r7; interpolate others with small noise
    day_pcts = {0: 0.0, 1: r1, 3: r3, 7: r7}
    series = []
    for day in range(8):
        if day in day_pcts:
            pct = day_pcts[day]
        elif day == 2:
            pct = r1 + (r3 - r1) * 0.5 + random.gauss(0, 0.3)
        elif day in (4, 5, 6):
            pct = r3 + (r7 - r3) * ((day - 3) / 4) + random.gauss(0, 0.25)
        else:
            pct = 0.0
        series.append({"day": day, "close": round(base * (1 + pct / 100), 4), "pct": round(pct, 4)})
    return series


def _gen_returns(score: int, rng: random.Random) -> tuple[float, float, float]:
    """Generate correlated 1d/3d/7d returns based on confidence score."""
    # Expected return ~ linear function of score
    exp_7d = (score - 50) * 0.18       # score 80 → ~+5.4%, score 30 → ~-3.6%
    exp_1d = (score - 50) * 0.08
    exp_3d = (score - 50) * 0.13
    vol = max(1.5, (80 - abs(score - 60)) * 0.08)   # higher near 50 = more uncertain
    r1 = round(rng.gauss(exp_1d, vol * 0.6), 2)
    r3 = round(rng.gauss(exp_3d, vol * 0.85), 2)
    r7 = round(rng.gauss(exp_7d, vol * 1.2), 2)
    return r1, r3, r7


def _pick_fields(score: int, ticker: str, rng: random.Random) -> dict:
    if score >= 70:
        phrases = rng.choice(HIGH_PHRASES)
        guidance = "raised" if score >= 78 else "maintained"
        qa_def = rng.randint(0, 3)
        brief_pair = rng.choice(HIGH_BRIEFS)
    elif score >= 48:
        phrases = rng.choice(MID_PHRASES)
        guidance = "maintained"
        qa_def = rng.randint(3, 6)
        brief_pair = rng.choice(MID_BRIEFS)
    else:
        phrases = rng.choice(LOW_PHRASES)
        guidance = "lowered" if score >= 35 else "withdrawn"
        qa_def = rng.randint(6, 9)
        brief_pair = rng.choice(LOW_BRIEFS)

    brief = brief_pair[0] + " " + brief_pair[1].format(t=ticker)
    return {
        "key_phrases":      phrases,
        "guidance_flag":    guidance,
        "qa_defensiveness": qa_def,
        "trade_brief":      brief,
    }


def _score_for_quarter(mean: float, std: float, drift: float,
                       quarters_ago: int, rng: random.Random) -> int:
    """Score drifts over time: recent = higher offset if drift > 0."""
    adjusted_mean = mean - drift * quarters_ago   # further back = lower if drift > 0
    raw = rng.gauss(adjusted_mean, std)
    return max(5, min(96, int(round(raw))))


def main():
    client = MongoClient(MONGO_URI)
    db = client.earnings_sentiment

    # Fetch all companies with their existing call dates
    pipeline = [
        {"$addFields": {"_nq": {"$cond": [{"$ne": ["$company_name", "$ticker"]}, 1, 0]}}},
        {"$sort": {"call_date": -1, "_nq": -1}},
        {"$group": {
            "_id": {"$concat": ["$ticker", "|", {"$ifNull": ["$call_date", ""]}]},
            "ticker":       {"$first": "$ticker"},
            "company_name": {"$first": "$company_name"},
            "sector":       {"$first": "$sector"},
            "call_date":    {"$first": "$call_date"},
        }},
        {"$group": {
            "_id":          "$ticker",
            "company_name": {"$first": "$company_name"},
            "sector":       {"$first": "$sector"},
            "call_dates":   {"$push": "$call_date"},
            "latest_date":  {"$max": "$call_date"},
        }},
    ]
    companies = {r["_id"]: r for r in db.price_reactions.aggregate(pipeline)}

    now_iso = datetime.now(timezone.utc).isoformat()
    ops = []
    total_new = 0

    for ticker, info in companies.items():
        existing_dates = set(info["call_dates"])
        call_count = len(existing_dates)
        if call_count >= TARGET:
            continue

        needed = TARGET - call_count
        company_name = info["company_name"] or ticker
        sector = info["sector"] or "Technology"
        base_price = BASE_PRICES.get(ticker, 45.0)
        mean, std, drift = PROFILES.get(ticker, DEFAULT_PROFILE)
        anchor = info["latest_date"] or "2026-04-30"

        candidate_dates = _quarterly_dates_before(anchor, needed + 20)

        inserted = 0
        for i, call_date in enumerate(candidate_dates):
            if inserted >= needed:
                break
            # Skip if within 45 days of any existing call
            cd = datetime.strptime(call_date, "%Y-%m-%d")
            too_close = any(
                abs((cd - datetime.strptime(ed, "%Y-%m-%d")).days) <= 45
                for ed in existing_dates if ed
            )
            if too_close:
                continue

            quarters_ago = i + 1
            rng = random.Random(hash(f"{ticker}_{call_date}") & 0xFFFFFFFF)
            score = _score_for_quarter(mean, std, drift, quarters_ago, rng)
            r1, r3, r7 = _gen_returns(score, rng)

            # Small random price variation per quarter
            price_variation = rng.uniform(0.82, 1.18)
            base = round(base_price * price_variation, 4)

            fields = _pick_fields(score, ticker, rng)
            filing_id = f"mock_{ticker}_{call_date.replace('-', '')}"

            scored_dt = (cd - timedelta(hours=rng.randint(2, 6))).replace(
                tzinfo=timezone.utc).isoformat()

            doc = {
                "filing_id":        filing_id,
                "ticker":           ticker,
                "company_name":     company_name,
                "sector":           sector,
                "call_date":        call_date,
                "call_date_close":  base,
                "confidence_score": score,
                "key_phrases":      fields["key_phrases"],
                "guidance_flag":    fields["guidance_flag"],
                "trade_brief":      fields["trade_brief"],
                "qa_defensiveness": fields["qa_defensiveness"],
                "return_1d":        r1,
                "return_3d":        r3,
                "return_7d":        r7,
                "price_series":     _price_series(base, r1, r3, r7),
                "model_used":       "claude-haiku-4-5-20251001",
                "scored_at":        scored_dt,
                "correlated_at":    now_iso,
                "trend":            None,
                "source":           "edgar",
                "_mock":            True,
            }

            ops.append(UpdateOne(
                {"filing_id": filing_id},
                {"$setOnInsert": doc},
                upsert=True,
            ))
            existing_dates.add(call_date)
            inserted += 1
            total_new += 1

    if ops:
        result = db.price_reactions.bulk_write(ops, ordered=False)
        print(f"Inserted {result.upserted_count} new call records across {len(companies)} companies")
    else:
        print("Nothing to insert — all companies already at target")

    # Verify
    pipeline2 = [
        {"$group": {"_id": "$ticker", "n": {"$sum": 1}}},
        {"$sort": {"n": 1}},
    ]
    counts = list(db.price_reactions.aggregate(pipeline2))
    under = [r for r in counts if r["n"] < TARGET]
    if under:
        print(f"Still under {TARGET} calls: {[(r['_id'], r['n']) for r in under]}")
    else:
        print(f"All {len(counts)} companies now have {TARGET}+ calls")

    client.close()


if __name__ == "__main__":
    main()
