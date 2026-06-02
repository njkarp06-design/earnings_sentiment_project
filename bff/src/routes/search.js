const router        = require('express').Router();
const PriceReaction = require('../models/PriceReaction');

const FIELDS = {
  _id: 0, __v: 0,
};

// GET /search?q=:query
// Case-insensitive search on ticker (prefix) or company name (contains).
// Returns the most recent call for each matching company, up to 5 results.
router.get('/', async (req, res, next) => {
  try {
    const raw = (req.query.q || '').trim();
    if (!raw) return res.json([]);

    const upper = raw.toUpperCase();

    const results = await PriceReaction.aggregate([
      {
        $match: {
          $or: [
            { ticker: upper },
            { ticker: { $regex: `^${upper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } },
            { company_name: { $regex: raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
          ],
        },
      },
      { $sort: { call_date: -1 } },
      { $group: { _id: '$ticker', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $project: FIELDS },
      { $limit: 5 },
    ]);

    res.json(results);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
