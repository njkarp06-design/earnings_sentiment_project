"""
Calls the Claude API to score CEO language confidence (0-100) and extract
the top 3 key phrases that most influenced the score.

The system prompt is sent with cache_control so repeated calls for different
transcripts re-use the cached prompt, cutting latency and cost.
"""

import json
import logging
from typing import TypedDict

import anthropic

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are an expert financial analyst specialising in executive communication.

Task: analyse an earnings call transcript and score CEO/executive language \
confidence on a 0-100 scale.

Return ONLY a JSON object — no markdown, no preamble — with exactly this shape:
{
  "confidence_score": <integer 0–100>,
  "key_phrases": [<string>, <string>, <string>]
}

Scoring rubric:
  90–100  Exceptionally confident — specific targets, clear forward guidance, \
grounded optimism
  70–89   Confident — positive tone, reasonable projections, minimal hedging
  50–69   Neutral — balanced language, equal caution and optimism
  30–49   Cautious — significant hedging, vague guidance, defensive posture
   0–29   Very uncertain — withdrawn guidance, heavy qualifiers, crisis language

key_phrases: the 3 verbatim or near-verbatim phrases (≤12 words each) that \
most influenced your score.\
"""


class ScoreResult(TypedDict):
    confidence_score: int
    key_phrases: list[str]


class Scorer:
    def __init__(self, api_key: str, model: str, max_chars: int) -> None:
        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model
        self._max_chars = max_chars

    def score(self, raw_text: str, ticker: str) -> ScoreResult:
        text = raw_text[: self._max_chars]

        response = self._client.messages.create(
            model=self._model,
            max_tokens=256,
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

        logger.info(
            "Scored %s → %d/100  cache=%s  phrases=%s",
            ticker,
            score,
            _cache_info(response),
            phrases,
        )
        return ScoreResult(confidence_score=score, key_phrases=phrases)


def _cache_info(response: anthropic.types.Message) -> str:
    usage = response.usage
    created = getattr(usage, "cache_creation_input_tokens", 0) or 0
    read = getattr(usage, "cache_read_input_tokens", 0) or 0
    if created:
        return f"created({created}tok)"
    if read:
        return f"hit({read}tok)"
    return "off"
