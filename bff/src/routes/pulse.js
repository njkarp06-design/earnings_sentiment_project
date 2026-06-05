const router        = require('express').Router();
const PriceReaction = require('../models/PriceReaction');

// GET /pulse
// Public. Returns average confidence + 7d return per sector, sorted by avg confidence desc.
router.get('/', async (_req, res, next) => {
  try {
    const rows = await PriceReaction.aggregate([
      { $match: { sector: { $exists: true, $ne: null } } },
      // Deduplicate by (ticker, call_date) before aggregating by sector so that
      // EDGAR+FMP duplicates for the same call don't inflate count or skew averages.
      { $sort: { correlated_at: -1 } },
      {
        $group: {
          _id:              { ticker: '$ticker', call_date: '$call_date' },
          sector:           { $first: '$sector' },
          confidence_score: { $first: '$confidence_score' },
          return_7d:        { $first: '$return_7d' },
        },
      },
      {
        $group: {
          _id:            '$sector',
          avg_confidence: { $avg: '$confidence_score' },
          avg_return_7d:  { $avg: '$return_7d' },
          count:          { $sum: 1 },
        },
      },
      { $sort: { avg_confidence: -1 } },
      {
        $project: {
          _id:            0,
          sector:         '$_id',
          avg_confidence: { $round: ['$avg_confidence', 1] },
          avg_return_7d:  { $round: ['$avg_return_7d',  2] },
          count:          1,
        },
      },
    ]);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
