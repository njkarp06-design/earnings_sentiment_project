const router       = require('express').Router();
const PriceReaction = require('../models/PriceReaction');

// GET /leaderboard
// Aggregates all tickers with at least one fully-windowed call (return_7d != null).
// Ranked by average 7-day post-call return, descending.
router.get('/', async (_req, res, next) => {
  try {
    const rows = await PriceReaction.aggregate([
      { $match: { return_7d: { $ne: null } } },
      // Deduplicate by (ticker, call_date) first so that any EDGAR+FMP
      // duplicates for the same call don't inflate call_count or skew averages.
      // Prefer EDGAR records (real company name) over FMP fallbacks (ticker-as-name).
      { $addFields: { _name_quality: { $cond: [{ $ne: ['$company_name', '$ticker'] }, 1, 0] } } },
      { $sort: { call_date: -1, _name_quality: -1, correlated_at: -1 } },
      {
        $group: {
          _id:              { ticker: '$ticker', call_date: '$call_date' },
          company_name:     { $first: '$company_name' },
          confidence_score: { $first: '$confidence_score' },
          return_1d:        { $first: '$return_1d' },
          return_3d:        { $first: '$return_3d' },
          return_7d:        { $first: '$return_7d' },
        },
      },
      // Sort by call_date descending before the ticker group so $first picks
      // the company_name from the most recent call (most likely to be populated).
      { $sort: { '_id.call_date': -1 } },
      {
        $group: {
          _id:            '$_id.ticker',
          company_name:   { $first: '$company_name' },
          call_count:     { $sum: 1 },
          avg_confidence: { $avg: '$confidence_score' },
          avg_return_1d:  { $avg: '$return_1d' },
          avg_return_3d:  { $avg: '$return_3d' },
          avg_return_7d:  { $avg: '$return_7d' },
          wins:           { $sum: { $cond: [{ $gt: ['$return_7d', 0] }, 1, 0] } },
        },
      },
      { $sort: { avg_return_7d: -1 } },
      {
        $project: {
          _id:            0,
          ticker:         '$_id',
          company_name:   1,
          call_count:     1,
          avg_confidence: { $round: ['$avg_confidence', 1] },
          avg_return_1d:  { $round: ['$avg_return_1d', 2] },
          avg_return_3d:  { $round: ['$avg_return_3d', 2] },
          avg_return_7d:  { $round: ['$avg_return_7d', 2] },
          win_rate:       { $round: [{ $divide: ['$wins', '$call_count'] }, 2] },
        },
      },
    ]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
