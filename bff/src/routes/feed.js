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

    // Aggregate instead of find so we can deduplicate by (ticker, call_date).
    // A ticker can have two records for the same date when EDGAR and FMP both
    // ingest the same call (FMP runs concurrently with EDGAR in the scheduler).
    // Winner is decided by the $sort below: prefer the record with a real
    // company name (EDGAR over FMP), then the most recent correlated_at.
    const rawItems = await PriceReaction.aggregate([
      { $match: query },
      // Rank each record so EDGAR records (real company name) beat FMP records
      // (ticker-as-name).  Within the same source quality, prefer the most
      // recently correlated document.
      {
        $addFields: {
          _name_quality: {
            $cond: [{ $ne: ['$company_name', '$ticker'] }, 1, 0],
          },
        },
      },
      { $sort: { call_date: -1, _name_quality: -1, correlated_at: -1 } },
      {
        $group: {
          _id: { ticker: '$ticker', call_date: '$call_date' },
          doc: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { call_date: -1 } },
      { $limit: 50 },
      { $project: { _id: 0, __v: 0, _name_quality: 0 } },
    ]);
    const items = rawItems;

    // Historical stats — deduplicate by (ticker, call_date) first so that any
    // EDGAR+FMP duplicate records for the same call don't inflate counts.
    const tickers = [...new Set(items.map(i => i.ticker))];
    const histStats = tickers.length
      ? await PriceReaction.aggregate([
          { $match: { ticker: { $in: tickers }, return_7d: { $ne: null } } },
          { $sort: { correlated_at: -1 } },
          { $group: {
            _id:       { ticker: '$ticker', call_date: '$call_date' },
            return_7d: { $first: '$return_7d' },
          }},
          { $group: {
            _id:   '$_id.ticker',
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
