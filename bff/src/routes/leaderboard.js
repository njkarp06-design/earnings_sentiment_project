const router       = require('express').Router();
const PriceReaction = require('../models/PriceReaction');

// GET /leaderboard
// Aggregates all tickers with at least one fully-windowed call (return_7d != null).
// Ranked by average 7-day post-call return, descending.
router.get('/', async (_req, res, next) => {
  try {
    const rows = await PriceReaction.aggregate([
      { $match: { return_7d: { $ne: null } } },
      {
        $group: {
          _id:             '$ticker',
          company_name:    { $last: '$company_name' },
          call_count:      { $sum: 1 },
          avg_confidence:  { $avg: '$confidence_score' },
          avg_return_1d:   { $avg: '$return_1d' },
          avg_return_3d:   { $avg: '$return_3d' },
          avg_return_7d:   { $avg: '$return_7d' },
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
          avg_return_1d:  { $round: ['$avg_return_1d', 4] },
          avg_return_3d:  { $round: ['$avg_return_3d', 4] },
          avg_return_7d:  { $round: ['$avg_return_7d', 4] },
        },
      },
    ]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
