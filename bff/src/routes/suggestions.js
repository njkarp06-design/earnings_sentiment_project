const router        = require('express').Router();
const User          = require('../models/User');
const PriceReaction = require('../models/PriceReaction');
const requireAuth   = require('../middleware/auth');

const FIELDS = { _id: 0, __v: 0 };

router.use(requireAuth);

// GET /suggestions
// Returns up to 6 companies the user hasn't saved, prioritised by sector match.
// Falls back to highest confidence_score when watchlist is empty.
router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub).select('watchlist');
    const watchlist = user?.watchlist ?? [];

    // Most recent call per ticker, excluding already-saved tickers.
    // Sort by _name_quality so EDGAR records (real company name) are preferred
    // over FMP duplicates (ticker-as-name) when both cover the same call_date.
    const candidates = await PriceReaction.aggregate([
      { $match: { ticker: { $nin: watchlist } } },
      {
        $addFields: {
          _name_quality: { $cond: [{ $ne: ['$company_name', '$ticker'] }, 1, 0] },
        },
      },
      { $sort: { call_date: -1, _name_quality: -1, correlated_at: -1 } },
      { $group: { _id: '$ticker', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $project: FIELDS },
    ]);

    // Determine user's preferred sectors from saved companies
    let savedSectors = new Set();
    if (watchlist.length > 0) {
      const saved = await PriceReaction.find(
        { ticker: { $in: watchlist } },
        { sector: 1, _id: 0 },
      );
      saved.forEach((r) => { if (r.sector) savedSectors.add(r.sector); });
    }

    // Sort: sector-match first, then by confidence score
    candidates.sort((a, b) => {
      const aMatch = savedSectors.has(a.sector) ? 1 : 0;
      const bMatch = savedSectors.has(b.sector) ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
      return (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
    });

    res.json(candidates.slice(0, 6));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
