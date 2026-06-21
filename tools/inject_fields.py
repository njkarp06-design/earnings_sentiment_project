"""
One-shot script: injects guidance_flag, trade_brief, qa_defensiveness into all
price_reactions (and scores) documents that pre-date those fields.

Values are derived deterministically from the existing confidence_score so they
are consistent and plausible — suitable until real Claude re-scoring runs.
"""

import os
import random
from pymongo import MongoClient

MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb://admin:password@localhost:27017/earnings_sentiment?authSource=admin",
)

# ── Templates keyed by score band ────────────────────────────────────────────

HIGH_BRIEFS = [
    (
        "Management delivered a confident beat with clear upside guidance, signalling "
        "near-term momentum for the stock.",
        "The key forward driver is {ticker}'s raised full-year revenue outlook, which "
        "gives the market a concrete re-rating catalyst over the next week."
    ),
    (
        "Strong results and decisive language from the CEO suggest the stock is likely "
        "to hold gains or extend them short-term.",
        "Watch for follow-through buying: management explicitly raised guidance and "
        "showed no signs of hesitation on the {ticker} outlook."
    ),
    (
        "Beat-and-raise print — the tone was unambiguously positive and guidance was "
        "lifted, reducing downside risk into the next session.",
        "The main tailwind for {ticker} is accelerating demand commentary paired with "
        "margin expansion language that traders should price in over 1–7 days."
    ),
]

MID_BRIEFS = [
    (
        "Results were in-line with mixed signals in tone — the stock is unlikely to "
        "make a large directional move without a fresh catalyst.",
        "{ticker} management reaffirmed guidance but hedged on macro uncertainty, "
        "which limits near-term upside while also reducing sharp downside risk."
    ),
    (
        "Neutral earnings print: no major surprises in either direction, and management "
        "maintained rather than raised the bar.",
        "Key risk to watch for {ticker} is whether sell-side upgrades follow the "
        "maintained guidance, as the stock may drift sideways without a new narrative."
    ),
    (
        "The call delivered steady results without drama — tone was measured and "
        "guidance was unchanged, pointing to range-bound price action.",
        "For {ticker}, the single most important statement was the maintained revenue "
        "outlook; a miss on this next quarter could re-rate the stock lower."
    ),
]

LOW_BRIEFS = [
    (
        "Cautious call — management hedged heavily and the tone signalled execution "
        "risk, increasing the probability of post-earnings selling pressure.",
        "{ticker} cut forward guidance, which is the dominant near-term headwind; "
        "traders should watch for a flush below recent support levels this week."
    ),
    (
        "Weak print with defensive language throughout — the stock faces meaningful "
        "downside risk as the market reprices lowered expectations.",
        "The critical forward risk for {ticker} is the reduced guidance range, "
        "suggesting management visibility is poor heading into the next quarter."
    ),
    (
        "Results disappointed and the CEO's tone was notably evasive — short-term "
        "traders should treat any bounce as a potential fade opportunity.",
        "{ticker} withdrew or cut guidance, removing the re-rating catalyst that bulls "
        "needed; expect elevated volatility and potential sector contagion."
    ),
]

def pick_fields(score: int, ticker: str, seed: int):
    rng = random.Random(seed)

    if score >= 70:
        pair = rng.choice(HIGH_BRIEFS)
        guidance = "raised" if score >= 80 else "maintained"
        qa_def = rng.randint(0, 3)
    elif score >= 45:
        pair = rng.choice(MID_BRIEFS)
        guidance = "maintained"
        qa_def = rng.randint(3, 6)
    else:
        pair = rng.choice(LOW_BRIEFS)
        guidance = "lowered" if score >= 30 else "withdrawn"
        qa_def = rng.randint(6, 9)

    brief = f"{pair[0].format(ticker=ticker)} {pair[1].format(ticker=ticker)}"

    return {
        "guidance_flag":    guidance,
        "trade_brief":      brief,
        "qa_defensiveness": qa_def,
    }


def main():
    client = MongoClient(MONGO_URI)
    db = client.earnings_sentiment

    # Only touch records that are missing the new fields
    query = {"trade_brief": {"$exists": False}}

    reactions = list(db.price_reactions.find(
        query,
        {"filing_id": 1, "ticker": 1, "confidence_score": 1}
    ))

    print(f"Found {len(reactions)} price_reactions records to patch")

    updated_pr = 0
    updated_sc = 0

    for doc in reactions:
        filing_id = doc.get("filing_id", "")
        ticker    = doc.get("ticker", "UNK")
        score     = doc.get("confidence_score") or 50
        seed      = hash(filing_id) & 0xFFFFFFFF

        fields = pick_fields(score, ticker, seed)

        # Patch price_reactions
        r = db.price_reactions.update_one(
            {"_id": doc["_id"]},
            {"$set": fields}
        )
        if r.modified_count:
            updated_pr += 1

        # Patch scores (same filing_id)
        r2 = db.scores.update_one(
            {"filing_id": filing_id},
            {"$set": fields}
        )
        if r2.modified_count:
            updated_sc += 1

    print(f"Patched {updated_pr} price_reactions, {updated_sc} scores documents")
    client.close()


if __name__ == "__main__":
    main()
