const router        = require('express').Router();
const PriceReaction = require('../models/PriceReaction');

// GET /sectors
// Summary stats per sector, sorted by avg 7d return descending.
router.get('/', async (_req, res, next) => {
  try {
    const rows = await PriceReaction.aggregate([
      { $match: { return_7d: { $ne: null }, sector: { $nin: [null, ''] } } },
      // Deduplicate by (ticker, call_date) so EDGAR+FMP duplicates for the same
      // call don't inflate call_count or skew averages and win rates.
      { $sort: { correlated_at: -1 } },
      {
        $group: {
          _id:     { ticker: '$ticker', call_date: '$call_date' },
          sector:  { $first: '$sector' },
          return_7d: { $first: '$return_7d' },
          return_1d: { $first: '$return_1d' },
          return_3d: { $first: '$return_3d' },
        },
      },
      {
        $group: {
          _id:            '$sector',
          avg_7d:         { $avg: '$return_7d' },
          avg_1d:         { $avg: '$return_1d' },
          avg_3d:         { $avg: '$return_3d' },
          call_count:     { $sum: 1 },
          wins:           { $sum: { $cond: [{ $gt: ['$return_7d', 0] }, 1, 0] } },
          tickers:        { $addToSet: '$_id.ticker' },
        },
      },
      {
        $project: {
          _id:            0,
          sector:         '$_id',
          avg_7d:         { $round: ['$avg_7d', 2] },
          avg_1d:         { $round: ['$avg_1d', 2] },
          avg_3d:         { $round: ['$avg_3d', 2] },
          call_count:     1,
          company_count:  { $size: '$tickers' },
          win_rate:       { $round: [{ $divide: ['$wins', '$call_count'] }, 2] },
        },
      },
      { $sort: { avg_7d: -1 } },
    ]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /sectors/:sector
// Aggregate drift path + company rankings for a single sector.
router.get('/:sector', async (req, res, next) => {
  try {
    const sector = req.params.sector;

    // Aggregate drift path across all calls in this sector.
    // Uses E[X²] - E[X]² for std dev without storing all values.
    const pathRows = await PriceReaction.aggregate([
      { $match: { sector, 'price_series.0': { $exists: true } } },
      { $unwind: '$price_series' },
      {
        $group: {
          _id:    '$price_series.day',
          mean:   { $avg: '$price_series.pct' },
          meanSq: { $avg: { $multiply: ['$price_series.pct', '$price_series.pct'] } },
          count:  { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const avg_path = pathRows.map(r => {
      const variance = Math.max(0, r.meanSq - r.mean * r.mean);
      const std      = Math.sqrt(variance);
      return {
        day:        r._id,
        mean:       parseFloat(r.mean.toFixed(4)),
        lower:      parseFloat((r.mean - std).toFixed(4)),
        bandHeight: parseFloat((std * 2).toFixed(4)),
        count:      r.count,
      };
    });

    // Company rankings within this sector.
    // Deduplicate by (ticker, call_date) so EDGAR+FMP duplicates don't inflate
    // call_count or skew averages.  Prefer the EDGAR record (real name) over FMP.
    const companies = await PriceReaction.aggregate([
      { $match: { sector, return_7d: { $ne: null } } },
      {
        $addFields: {
          _name_quality: { $cond: [{ $ne: ['$company_name', '$ticker'] }, 1, 0] },
        },
      },
      { $sort: { call_date: -1, _name_quality: -1, correlated_at: -1 } },
      {
        $group: {
          _id:          { ticker: '$ticker', call_date: '$call_date' },
          company_name: { $first: '$company_name' },
          return_7d:    { $first: '$return_7d' },
          return_1d:    { $first: '$return_1d' },
          return_3d:    { $first: '$return_3d' },
        },
      },
      {
        $group: {
          _id:          '$_id.ticker',
          company_name: { $first: '$company_name' },
          avg_7d:       { $avg: '$return_7d' },
          avg_1d:       { $avg: '$return_1d' },
          avg_3d:       { $avg: '$return_3d' },
          call_count:   { $sum: 1 },
          wins:         { $sum: { $cond: [{ $gt: ['$return_7d', 0] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id:          0,
          ticker:       '$_id',
          company_name: 1,
          avg_7d:       { $round: ['$avg_7d', 2] },
          avg_1d:       { $round: ['$avg_1d', 2] },
          avg_3d:       { $round: ['$avg_3d', 2] },
          call_count:   1,
          win_rate:     { $round: [{ $divide: ['$wins', '$call_count'] }, 2] },
        },
      },
      { $sort: { avg_7d: -1 } },
    ]);

    res.json({ sector, avg_path, companies });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
