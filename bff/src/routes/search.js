const router        = require('express').Router();
const mongoose      = require('mongoose');
const PriceReaction = require('../models/PriceReaction');

// GET /search?q=:query
//
// Two-phase search against the full company universe:
//   Phase 1 — Query the `companies` collection (seeded from EDGAR on ingestor
//              startup, ~10 000 listed US companies).  Matches ticker prefix or
//              company name substring, case-insensitive.
//   Phase 2 — Look up the most recent price_reaction for each matched ticker.
//
// Each result carries `has_data: true/false` so the frontend can show a "no
// earnings data yet" state for companies that exist in the universe but haven't
// had a scored filing ingested yet.
//
// Results are sorted: data-bearing results first (exact ticker match floated
// to the top), then data-less universe hits.
router.get('/', async (req, res, next) => {
  try {
    const raw = (req.query.q || '').trim();
    if (!raw) return res.json([]);

    const upper   = raw.toUpperCase();
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // ── Phase 1: search company universe ─────────────────────────────────────
    const db = mongoose.connection.db;
    const companyMatches = await db.collection('companies').find({
      $or: [
        { ticker: upper },
        { ticker: { $regex: `^${escaped}`, $options: 'i' } },
        { name:   { $regex: escaped,        $options: 'i' } },
      ],
    }).limit(10).toArray();

    if (companyMatches.length === 0) return res.json([]);

    // ── Phase 2: fetch most recent price_reaction for each matched ticker ─────
    const tickers = companyMatches.map(c => c.ticker);
    const latestReactions = await PriceReaction.aggregate([
      { $match: { ticker: { $in: tickers } } },
      // Prefer EDGAR records (real company name) over FMP fallbacks (ticker-as-name),
      // then deduplicate by call_date before picking the latest call per ticker.
      { $addFields: { _name_quality: { $cond: [{ $ne: ['$company_name', '$ticker'] }, 1, 0] } } },
      { $sort: { call_date: -1, _name_quality: -1, correlated_at: -1 } },
      { $group: { _id: { ticker: '$ticker', call_date: '$call_date' }, doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { call_date: -1 } },
      { $group: { _id: '$ticker', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $project: { _id: 0, __v: 0, _name_quality: 0 } },
    ]);
    const reactionMap = Object.fromEntries(latestReactions.map(r => [r.ticker, r]));

    // ── Merge results ─────────────────────────────────────────────────────────
    const results = companyMatches.map(company => {
      const reaction = reactionMap[company.ticker];
      if (reaction) {
        return { ...reaction, has_data: true };
      }
      return {
        ticker:       company.ticker,
        company_name: company.name,
        sector:       company.sector  ?? null,
        exchange:     company.exchange ?? null,
        cik:          company.cik     ?? null,
        has_data:     false,
      };
    });

    // Sort: data-bearing first, exact ticker match floated within each group
    results.sort((a, b) => {
      const aHas = a.has_data ? 1 : 0;
      const bHas = b.has_data ? 1 : 0;
      if (bHas !== aHas) return bHas - aHas;
      const aExact = a.ticker === upper ? 1 : 0;
      const bExact = b.ticker === upper ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;
      return a.ticker.localeCompare(b.ticker);
    });

    res.json(results);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
