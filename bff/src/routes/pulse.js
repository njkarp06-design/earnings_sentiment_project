const router        = require('express').Router();
const PriceReaction = require('../models/PriceReaction');

// GET /pulse
// Public. Returns average confidence + 7d return per sector, sorted by avg confidence desc.
router.get('/', async (_req, res, next) => {
  try {
    const rows = await PriceReaction.aggregate([
      { $match: { sector: { $exists: true, $ne: null } } },
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
