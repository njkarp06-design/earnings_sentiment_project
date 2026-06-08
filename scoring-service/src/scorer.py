"""
Calls the Claude API to score CEO language confidence (0-100) and extract
the top 3 key phrases, guidance direction, a plain-English trade brief, and
a Q&A defensiveness score.

The system prompt is sent with cache_control so repeated calls for different
transcripts re-use the cached prompt, cutting latency and cost.
"""

import json
import logging
from typing import Optional, TypedDict

import anthropic

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are an expert financial analyst specialising in executive communication.

Task: analyse an earnings call transcript and return a structured JSON assessment.

Return ONLY a JSON object — no markdown, no preamble — with exactly this shape:
{
  "confidence_score": <integer 0–100>,
  "key_phrases": [<string>, <string>, <string>],
  "guidance_flag": <"raised" | "maintained" | "lowered" | "withdrawn" | null>,
  "trade_brief": <string>,
  "qa_defensiveness": <integer 0–10>
}

confidence_score rubric:
  90–100  Exceptionally confident — specific targets, clear forward guidance, \
grounded optimism
  70–89   Confident — positive tone, reasonable projections, minimal hedging
  50–69   Neutral — balanced language, equal caution and optimism
  30–49   Cautious — significant hedging, vague guidance, defensive posture
   0–29   Very uncertain — withdrawn guidance, heavy qualifiers, crisis language

key_phrases: the 3 verbatim or near-verbatim phrases (≤12 words each) that \
most influenced your score.

guidance_flag: did management change their forward financial outlook?
  "raised"     — explicitly increased revenue, EPS, or full-year guidance
  "maintained" — reaffirmed existing guidance with no material change
  "lowered"    — reduced or cut any element of forward guidance
  "withdrawn"  — pulled guidance entirely (citing uncertainty, macro, etc.)
  null         — no forward guidance was given or detectable

trade_brief: 2 sentences maximum, written for a short-term trader. Sentence 1: \
what the results and tone signal for the stock over the next week. Sentence 2: \
the single most important forward-looking statement — the key guidance, risk, or \
tailwind a trader needs to know. Use plain language, no analyst jargon.

qa_defensiveness: how much more defensive or evasive was management during analyst \
Q&A compared to the prepared remarks? If there is no distinct Q&A section, return 0.
  0   — no Q&A detected, or tone was equally confident throughout
  1–3 — slightly more hedged in Q&A, minor deflections
  4–6 — noticeably more cautious in Q&A, some question-dodging
  7–9 — significantly more defensive, repeated deflections or topic pivots
  10  — stark contrast: confident prepared remarks, evasive or alarmed Q&A\
"""

_GUIDANCE_VALID = {"raised", "maintained", "lowered", "withdrawn"}


class ScoreResult(TypedDict):
    confidence_score: int
    key_phrases: list[str]
    guidance_flag: Optional[str]
    trade_brief: Optional[str]
    qa_defensiveness: Optional[int]


class Scorer:
    def __init__(self, api_key: str, model: str, max_chars: int) -> None:
        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model
        self._max_chars = max_chars

    def score(self, raw_text: str, ticker: str) -> ScoreResult:
        text = raw_text[: self._max_chars]

        response = self._client.messages.create(
            model=self._model,
            max_tokens=512,
            system=[
                {
                    "type": "text",
                    "text": _SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Analyse this earnings call transcript for {ticker}:\n\n{text}"
                    ),
                }
            ],
        )

        raw = response.content[0].text.strip()

        # Strip markdown code fences if the model wraps the JSON
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) >= 2 else raw
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        try:
            parsed = json.loads(raw)
            score = max(0, min(100, int(parsed["confidence_score"])))
            phrases = [str(p) for p in parsed.get("key_phrases", [])][:3]
        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            raise ValueError(f"Malformed Claude response for {ticker}: {exc}") from exc

        # guidance_flag — validate against allowed set, default null
        guidance_raw = parsed.get("guidance_flag")
        guidance_flag = guidance_raw if guidance_raw in _GUIDANCE_VALID else None

        # trade_brief — plain string, normalize to None if absent or blank
        trade_brief_raw = parsed.get("trade_brief", "")
        trade_brief = str(trade_brief_raw).strip() or None

        # qa_defensiveness — clamp to 0–10
        try:
            qa_def_raw = parsed.get("qa_defensiveness")
            qa_defensiveness = max(0, min(10, int(qa_def_raw))) if qa_def_raw is not None else None
        except (TypeError, ValueError):
            qa_defensiveness = None

        logger.info(
            "Scored %s → %d/100  guidance=%s  qa_def=%s  cache=%s",
            ticker,
            score,
            guidance_flag,
            qa_defensiveness,
            _cache_info(response),
        )
        return ScoreResult(
            confidence_score=score,
            key_phrases=phrases,
            guidance_flag=guidance_flag,
            trade_brief=trade_brief,
            qa_defensiveness=qa_defensiveness,
        )


def _cache_info(response: anthropic.types.Message) -> str:
    usage = response.usage
    created = getattr(usage, "cache_creation_input_tokens", 0) or 0
    read = getattr(usage, "cache_read_input_tokens", 0) or 0
    if created:
        return f"created({created}tok)"
    if read:
        return f"hit({read}tok)"
    return "off"
