const router       = require('express').Router();
const PriceReaction = require('../models/PriceReaction');

// GET /companies/:ticker/history
// All scored+correlated calls for a ticker, newest first.
router.get('/:ticker/history', async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const items = await PriceReaction
      .find({ ticker })
      .sort({ call_date: -1 })
      .select('-_id -__v');
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
    const items = await PriceReaction
      .find({ ticker, return_7d: { $ne: null } })
      .select('confidence_score return_1d return_3d return_7d');

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

module.exports = router;
