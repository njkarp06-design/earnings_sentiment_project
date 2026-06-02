const router     = require('express').Router();
const Anthropic  = require('@anthropic-ai/sdk');
const requireAuth = require('../middleware/auth');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.use(requireAuth);

// POST /inspect
// Streams a structured Claude analysis of an earnings call via SSE.
// Body: { ticker, company_name, call_date, confidence_score, key_phrases[], return_1d, return_3d, return_7d }
router.post('/', async (req, res, next) => {
  const {
    ticker, company_name, call_date,
    confidence_score, key_phrases = [],
    return_1d, return_3d, return_7d,
  } = req.body;

  if (!ticker || !call_date) {
    return res.status(400).json({ error: 'ticker and call_date are required' });
  }

  const fmtDate = (str) =>
    new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

  const fmtPct = (v) =>
    v != null ? `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%` : 'not yet available';

  const phraseList = key_phrases.length
    ? key_phrases.map((p, i) => `${i + 1}. "${p}"`).join('\n')
    : 'No key phrases extracted.';

  const prompt = `You are a senior financial analyst specialising in earnings call analysis. Provide an accurate, in-depth, and genuinely useful breakdown of the following earnings call, drawing on your knowledge of this specific company and earnings period.

Company: ${company_name || ticker} (${ticker})
Earnings Date: ${fmtDate(call_date)}
AI Sentiment Score: ${confidence_score}/100
Key Phrases extracted from the call:
${phraseList}

Post-call stock performance:
  1-day:  ${fmtPct(return_1d)}
  3-day:  ${fmtPct(return_3d)}
  7-day:  ${fmtPct(return_7d)}

Provide a structured analysis using exactly these five sections. Be specific, accurate, and write for a sophisticated investor who wants depth and insight — not a generic summary.

## What Happened
Summarise the headline results from this specific earnings call — revenue, EPS relative to consensus, key business segment performance, and management's headline message to investors.

## Key Signals
Analyse each extracted phrase in the context of this company's specific business model and competitive position. Explain what each phrase signals to investors, whether it is bullish, bearish, or nuanced, and why it matters.

## What Drove the Price
Given the ${fmtPct(return_7d)} 7-day return, provide your analysis of the specific factors from this call that drove the price action. Consider both the immediate after-hours reaction and any re-rating over the following week as analysts digested the results.

## Red Flags & Green Flags
List the specific signals from this call that sophisticated investors would note — linguistic patterns, guidance tone, strategic concerns, or structural strengths that historically predict future stock performance. Be direct and opinionated.

## Bottom Line
A sharp 2-3 sentence analyst take on what this earnings call means for the company's near-term trajectory and how investors should position around it.`;

  // Set SSE headers before streaming begins
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = client.messages.stream({
      model: process.env.INSPECT_MODEL || 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta'
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Analysis stream failed' })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;
