const router        = require('express').Router();
const mongoose      = require('mongoose');
const PriceReaction = require('../models/PriceReaction');
const requireAuth   = require('../middleware/auth');

const INGESTOR_URL = process.env.INGESTOR_URL || 'http://ingestor:8001';
const TICKER_RE    = /^[A-Z]{1,10}$/;

// GET /companies/:ticker/history
// All scored+correlated calls for a ticker, newest first.
// Deduplicates by call_date so EDGAR and FMP records for the same quarter
// don't appear as separate entries.
router.get('/:ticker/history', async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    if (!TICKER_RE.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker — must be 1–10 uppercase letters' });
    }
    const items = await PriceReaction.aggregate([
      { $match: { ticker } },
      { $sort: { call_date: -1, correlated_at: -1 } },
      {
        $group: {
          _id: '$call_date',
          doc: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { call_date: -1 } },
      { $project: { _id: 0, __v: 0 } },
    ]);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// GET /companies/:ticker/latest
// Most recent scored+correlated call for a ticker.
router.get('/:ticker/latest', async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    if (!TICKER_RE.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker — must be 1–10 uppercase letters' });
    }
    const item = await PriceReaction
      .findOne({ ticker })
      .sort({ call_date: -1 })
      .select('-_id -__v');
    if (!item) return res.status(404).json({ error: `No data found for ${ticker}` });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

// GET /companies/:ticker/accuracy
// Returns score-bucket stats vs. avg returns — the "track record" feature.
router.get('/:ticker/accuracy', async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    if (!TICKER_RE.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker — must be 1–10 uppercase letters' });
    }
    // Deduplicate by call_date before bucketing so cross-source duplicates
    // don't inflate counts or skew averages.
    const rawItems = await PriceReaction.aggregate([
      { $match: { ticker, return_7d: { $ne: null } } },
      { $sort: { correlated_at: -1 } },
      {
        $group: {
          _id: '$call_date',
          confidence_score: { $first: '$confidence_score' },
          return_1d:        { $first: '$return_1d' },
          return_3d:        { $first: '$return_3d' },
          return_7d:        { $first: '$return_7d' },
        },
      },
    ]);
    const items = rawItems.map(r => ({
      confidence_score: r.confidence_score,
      return_1d: r.return_1d,
      return_3d: r.return_3d,
      return_7d: r.return_7d,
    }));

    if (items.length === 0) {
      return res.json({ buckets: [], total: 0 });
    }

    const buckets = { high: [], mid: [], low: [] };
    for (const item of items) {
      const s = item.confidence_score;
      if (s >= 70) buckets.high.push(item);
      else if (s >= 45) buckets.mid.push(item);
      else buckets.low.push(item);
    }

    const avg = (arr, field) => {
      const vals = arr.map(i => i[field]).filter(v => v != null);
      if (!vals.length) return null;
      return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
    };

    const result = [
      { bucket: 'high', range: '≥70',   ...summarise(buckets.high,  avg) },
      { bucket: 'mid',  range: '45–70', ...summarise(buckets.mid,   avg) },
      { bucket: 'low',  range: '<45',   ...summarise(buckets.low,   avg) },
    ].filter(b => b.count > 0);

    res.json({ buckets: result, total: items.length });
  } catch (err) {
    next(err);
  }
});

function summarise(arr, avg) {
  return {
    count:         arr.length,
    avg_return_1d: avg(arr, 'return_1d'),
    avg_return_3d: avg(arr, 'return_3d'),
    avg_return_7d: avg(arr, 'return_7d'),
  };
}

// POST /companies/:ticker/ingest
// Auth-protected. Triggers an on-demand EDGAR + FMP scan for a single ticker
// via the ingestor's HTTP API. Returns immediately; the caller should poll
// GET /companies/:ticker/latest every few seconds until data appears.
router.post('/:ticker/ingest', requireAuth, async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    if (!TICKER_RE.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker — must be 1–10 uppercase letters' });
    }
    const response = await fetch(`${INGESTOR_URL}/trigger/${ticker}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return res.status(502).json({ error: 'Ingestor trigger failed' });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    // Ingestor not reachable (e.g. running outside Docker) — fail gracefully.
    if (err.name === 'TimeoutError' || err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Ingestor unavailable' });
    }
    next(err);
  }
});

// GET /companies/:ticker
// Returns basic company info (name, sector, exchange, cik) from the companies
// collection.  Works for any listed company, even those with no earnings data.
router.get('/:ticker', async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    if (!TICKER_RE.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker — must be 1–10 uppercase letters' });
    }
    const db     = mongoose.connection.db;
    const company = await db.collection('companies').findOne({ ticker });
    if (!company) return res.status(404).json({ error: `No company found for ${ticker}` });
    const { _id, ...info } = company;
    res.json(info);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
