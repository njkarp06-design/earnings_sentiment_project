const router        = require('express').Router();
const PriceReaction = require('../models/PriceReaction');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// GET /feed
// ?since=<ISO timestamp>  — only return items correlated after that time
// Each item gets a computed `pending` flag: call < 7 days old + has null returns.
router.get('/', async (req, res, next) => {
  try {
    const query = {};
    const since = req.query.since;
    if (typeof since === 'string' && since) {
      query.correlated_at = { $gt: since };
    }

    // Only show calls from the last 12 months — keeps the feed current and
    // prevents historical backfill from flooding it with old data.
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    query.call_date = { $gte: twelveMonthsAgo.toISOString().slice(0, 10) };

    const items = await PriceReaction
      .find(query)
      .sort({ call_date: -1 })
      .limit(50)
      .select('-_id filing_id ticker company_name sector call_date confidence_score trend key_phrases model_used return_1d return_3d return_7d call_date_close price_series correlated_at');

    // Single aggregation to get historical stats for all tickers in one round-trip
    const tickers = [...new Set(items.map(i => i.ticker))];
    const histStats = tickers.length
      ? await PriceReaction.aggregate([
          { $match: { ticker: { $in: tickers }, return_7d: { $ne: null } } },
          { $group: {
            _id:   '$ticker',
            avg7d: { $avg: '$return_7d' },
            total: { $sum: 1 },
            wins:  { $sum: { $cond: [{ $gt: ['$return_7d', 0] }, 1, 0] } },
          }},
        ])
      : [];

    const statsMap = Object.fromEntries(
      histStats.map(s => [s._id, {
        hist_avg_7d:     parseFloat(s.avg7d.toFixed(2)),
        hist_win_rate:   parseFloat((s.wins / s.total).toFixed(2)),
        hist_call_count: s.total,
      }])
    );

    const now = Date.now();
    const enriched = items.map(item => {
      const obj = item.toObject ? item.toObject() : item;
      const callAge = now - new Date(obj.call_date + 'T12:00:00').getTime();
      obj.pending  = callAge < SEVEN_DAYS_MS &&
        (obj.return_1d == null || obj.return_3d == null || obj.return_7d == null);
      obj.has_data = true;
      const s = statsMap[obj.ticker];
      if (s) {
        obj.hist_avg_7d     = s.hist_avg_7d;
        obj.hist_win_rate   = s.hist_win_rate;
        obj.hist_call_count = s.hist_call_count;
      }
      return obj;
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
