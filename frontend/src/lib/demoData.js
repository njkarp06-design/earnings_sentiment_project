// ─── Dynamic date helpers (run in the browser at page-load time) ──────────────
// new Date() here evaluates when the JS bundle is executed client-side,
// so these always reflect the visitor's current date — not the build date.
const _now      = Date.now();
const _day      = 864e5;
const today     = new Date(_now).toISOString().slice(0, 10);
const daysAgo   = n => new Date(_now - n * _day).toISOString().slice(0, 10);
const daysAhead = n => new Date(_now + n * _day).toISOString().slice(0, 10);

// ─── Seeded PRNG ─────────────────────────────────────────────────────────────

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

function mkRng(seed) {
  let s = (seed >>> 0) || 1;
  function next() {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  }
  function gauss(mean, std) {
    const u1 = Math.max(next(), 1e-10), u2 = next();
    return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  function randInt(min, max) { return min + Math.floor(next() * (max - min + 1)); }
  function choice(arr) { return arr[Math.floor(next() * arr.length)]; }
  return { next, gauss, randInt, choice };
}

// ─── Key-phrase templates (ported from inject_demo_data.py) ──────────────────

const HIGH_PHRASES = [
  ['record revenue driven by exceptional product demand',
   'operating margin expansion of 200 basis points year-over-year',
   'raising full-year guidance on strong execution'],
  ['double-digit growth across all geographic segments',
   'free cash flow generation hit an all-time high this quarter',
   "we're very confident in our pipeline heading into next year"],
  ['significant momentum in our enterprise customer base',
   'gross margin improvement reflects our disciplined cost structure',
   'we are increasing our full-year revenue and EPS outlook'],
  ['best quarter in company history by virtually every metric',
   'accelerating adoption in our highest-margin product lines',
   'strong demand signals give us clear visibility into next year'],
  ['exceptional execution across all business units',
   'cash returned to shareholders at record levels this quarter',
   'our competitive moat has never been stronger'],
];
const MID_PHRASES = [
  ['results in line with our guidance range',
   'some macro headwinds offset by operational improvements',
   'we are reaffirming our full-year outlook'],
  ['steady performance in our core business segments',
   'foreign exchange created a modest headwind this quarter',
   'management remains focused on disciplined capital allocation'],
  ['revenue growth met expectations despite softer consumer demand',
   'margin pressure from elevated input costs was partially mitigated',
   'we maintained our full-year guidance with a cautious outlook'],
  ['solid execution in a challenging macro environment',
   'inventory levels normalising toward healthy range',
   'we expect sequential improvement through the back half'],
  ['in-line results with mixed signals by geography',
   'cost optimisation programme delivering expected savings',
   'reiterating guidance as uncertainty remains elevated'],
];
const LOW_PHRASES = [
  ['revenue missed our own guidance range by a meaningful margin',
   'gross margin compression reflects ongoing pricing pressure',
   'we are reducing our full-year outlook due to macro uncertainty'],
  ['demand deterioration was steeper than anticipated this quarter',
   'elevated inventory levels will pressure margins into next quarter',
   'withdrawing annual guidance given the visibility challenges'],
  ['significant headwinds from customer spending pullbacks',
   'we are taking decisive restructuring actions to reduce costs',
   'near-term outlook remains challenging and uncertain'],
  ['disappointing top-line performance driven by competitive pressure',
   'customers are deferring purchases in the current environment',
   'we are lowering expectations for the remainder of the fiscal year'],
  ['market conditions deteriorated faster than management expected',
   'working capital challenges limiting our operational flexibility',
   'guidance cut reflects reduced confidence in near-term recovery'],
];

const HIGH_BRIEFS = [
  ['Beat-and-raise quarter — tone was decisive and management showed high conviction in the forward outlook, pointing to near-term upside.',
   'The key catalyst for {t} is the raised full-year revenue and EPS guidance, which gives bulls a concrete re-rating story to run with over the next week.'],
  ['Strong execution across the board with confident language from the CEO, signalling the stock should hold gains or build on them short-term.',
   'For {t}, the single most important forward statement was the guidance raise — watch for institutional accumulation as the market prices in the upward revision.'],
  ['Exceptional results paired with forward confidence create a clear near-term tailwind for {t}; the risk-reward skews positive heading into the next few sessions.',
   "Management's raised guidance and record free cash flow are the two key signals traders should anchor on — both point to continued momentum in the stock."],
  ["Management delivered a convincing beat with no signs of hedging; the stock is likely to attract momentum buyers in the sessions following this call.",
   "The standout forward-looking signal for {t} is the explicit raise in full-year targets, removing a key overhang and opening the door to multiple expansion."],
  ['Confident tone, strong numbers, raised bar — everything a short-term bull needs to take a position into the next earnings cycle.',
   'Key tailwind for {t}: double-digit growth paired with margin expansion signals the business is scaling efficiently, which the market typically rewards with a re-rating.'],
];
const MID_BRIEFS = [
  ['In-line quarter with neutral tone — the stock is unlikely to make a large directional move without a fresh catalyst beyond what was presented.',
   '{t} maintained guidance but hedged on macro, which caps near-term upside while limiting sharp downside risk; expect range-bound price action this week.'],
  ['Steady but uninspiring results — no beat-and-raise to excite bulls, no major miss to trigger a sell-off; the stock should trade close to its pre-earnings level.',
   'The most important signal for {t} was the unchanged guidance range — watch for analysts revising estimates modestly, which could drive small drift in either direction.'],
  ['Neutral print with mixed signals by segment; traders should wait for clarity before taking a directional view on {t} after this call.',
   "Management's cautious-but-steady language on the outlook suggests the stock is fairly valued here — any surprise in the next macro print could be the swing factor."],
  ['Results met the bar but did not raise it; sentiment is likely to be indifferent post-call unless a key metric surprises on the next leg of analysis.',
   'For {t}, the maintained revenue outlook is the anchor — the stock needs a positive macro shift or product catalyst to break out of its current range.'],
];
const LOW_BRIEFS = [
  ['Weak quarter with defensive language — management is in risk-control mode, and short-term traders should treat {t} as a fade-the-bounce opportunity.',
   'The critical headwind is the guidance cut; with visibility poor, the stock faces multiple-compression risk that could take 1–2 weeks to fully price in.'],
  ['Disappointing results paired with evasive Q&A point to execution risk at {t}; the stock likely heads lower in the near term as expectations reset.',
   'The most important forward risk is the withdrawn guidance — when management loses confidence in their own numbers, the market loses confidence in the stock.'],
  ['Below-consensus numbers and a cautious tone signal the stock needs a proper reset before it becomes interesting again; any near-term bounce is a sell.',
   'For {t}, the guidance reduction is the defining signal — the magnitude of the cut versus current estimates will determine how far the stock reprices this week.'],
  ['Miss-and-cut quarter — the CEO tone was noticeably more defensive than the prepared remarks suggested, a classic warning sign for further downside.',
   "{t}'s lowered outlook removes the near-term earnings support; watch for institutional selling into any strength over the next 5 trading sessions."],
];

// ─── Company definitions ─────────────────────────────────────────────────────
// anchor = most-recent call date (index 0 in history)
// Live tab  → anchor = today      (call within last 24h)
// Week tab  → anchor = daysAgo(2–6)  (call within last 7 days)
// Earlier   → anchor = fixed past date (>7 days ago)
const COMPANY_DEFS = [
  // Live
  { ticker: 'NVDA',  name: 'NVIDIA Corporation',      sector: 'Technology',             basePrice: 475, mean: 83, std: 7,  drift: 0.8,  anchor: today },
  { ticker: 'META',  name: 'Meta Platforms',           sector: 'Technology',             basePrice: 508, mean: 79, std: 8,  drift: 0.5,  anchor: today },
  { ticker: 'MSFT',  name: 'Microsoft Corporation',    sector: 'Technology',             basePrice: 415, mean: 78, std: 7,  drift: 0.3,  anchor: today },
  // This Week
  { ticker: 'GOOGL', name: 'Alphabet Inc.',            sector: 'Technology',             basePrice: 173, mean: 72, std: 9,  drift: 0.1,  anchor: daysAgo(2) },
  { ticker: 'AAPL',  name: 'Apple Inc.',               sector: 'Technology',             basePrice: 192, mean: 74, std: 8,  drift: 0.0,  anchor: daysAgo(3) },
  { ticker: 'JPM',   name: 'JPMorgan Chase',           sector: 'Financial Services',     basePrice: 203, mean: 70, std: 8,  drift: 0.1,  anchor: daysAgo(4) },
  { ticker: 'TSLA',  name: 'Tesla',                    sector: 'Consumer Discretionary', basePrice: 218, mean: 58, std: 15, drift: 0.0,  anchor: daysAgo(5) },
  { ticker: 'NFLX',  name: 'Netflix',                  sector: 'Consumer Discretionary', basePrice: 638, mean: 70, std: 10, drift: 0.4,  anchor: daysAgo(6) },
  // Earlier
  { ticker: 'AMD',   name: 'Advanced Micro Devices',   sector: 'Technology',             basePrice: 143, mean: 70, std: 10, drift: 0.3,  anchor: '2026-02-04' },
  { ticker: 'INTC',  name: 'Intel Corporation',        sector: 'Technology',             basePrice: 21,  mean: 44, std: 12, drift: -0.6, anchor: '2026-01-28' },
  { ticker: 'CRWD',  name: 'CrowdStrike Holdings',     sector: 'Technology',             basePrice: 353, mean: 75, std: 8,  drift: 0.4,  anchor: '2026-03-04' },
  { ticker: 'GS',    name: 'Goldman Sachs',            sector: 'Financial Services',     basePrice: 508, mean: 65, std: 10, drift: 0.0,  anchor: '2026-04-14' },
  { ticker: 'BAC',   name: 'Bank of America',          sector: 'Financial Services',     basePrice: 41,  mean: 63, std: 9,  drift: 0.0,  anchor: '2026-04-15' },
  { ticker: 'JNJ',   name: 'Johnson & Johnson',        sector: 'Healthcare',             basePrice: 153, mean: 66, std: 8,  drift: 0.0,  anchor: '2026-04-15' },
  { ticker: 'UNH',   name: 'UnitedHealth Group',       sector: 'Healthcare',             basePrice: 512, mean: 70, std: 8,  drift: -0.2, anchor: '2026-04-15' },
  { ticker: 'PFE',   name: 'Pfizer',                   sector: 'Healthcare',             basePrice: 27,  mean: 52, std: 11, drift: -0.5, anchor: '2026-04-29' },
  { ticker: 'NKE',   name: 'Nike',                     sector: 'Consumer Discretionary', basePrice: 74,  mean: 58, std: 11, drift: -0.4, anchor: '2026-03-18' },
  { ticker: 'MCD',   name: "McDonald's",               sector: 'Consumer Discretionary', basePrice: 293, mean: 68, std: 8,  drift: 0.0,  anchor: '2026-04-29' },
  { ticker: 'XOM',   name: 'ExxonMobil',               sector: 'Energy',                 basePrice: 111, mean: 65, std: 10, drift: 0.0,  anchor: '2026-04-25' },
  { ticker: 'CVX',   name: 'Chevron',                  sector: 'Energy',                 basePrice: 153, mean: 64, std: 10, drift: 0.0,  anchor: '2026-04-25' },
];

// ─── Data generation helpers ─────────────────────────────────────────────────

function quarterlyDates(anchorStr, n) {
  const anchor = new Date(anchorStr + 'T12:00:00');
  const dates = [];
  for (let i = 1; i <= n + 15; i++) {
    const d = new Date(anchor.getTime() - i * 91 * 24 * 60 * 60 * 1000);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    dates.push(d.toISOString().slice(0, 10));
    if (dates.length >= n) break;
  }
  return dates;
}

function scoreForQuarter(mean, std, drift, quartersAgo, rng) {
  const adjusted = mean - drift * quartersAgo;
  return Math.max(5, Math.min(96, Math.round(rng.gauss(adjusted, std))));
}

function genReturns(score, rng) {
  const exp7d = (score - 50) * 0.18;
  const exp1d = (score - 50) * 0.08;
  const exp3d = (score - 50) * 0.13;
  const vol = Math.max(1.5, (80 - Math.abs(score - 60)) * 0.08);
  return [
    +rng.gauss(exp1d, vol * 0.6).toFixed(2),
    +rng.gauss(exp3d, vol * 0.85).toFixed(2),
    +rng.gauss(exp7d, vol * 1.2).toFixed(2),
  ];
}

function buildPriceSeries(base, r1, r3, r7, rng) {
  const series = [];
  for (let day = 0; day <= 7; day++) {
    let pct;
    if (day === 0)      pct = 0;
    else if (day === 1) pct = r1;
    else if (day === 2) pct = r1 + (r3 - r1) * 0.5 + rng.gauss(0, 0.3);
    else if (day === 3) pct = r3;
    else if (day === 4) pct = r3 + (r7 - r3) * 0.25 + rng.gauss(0, 0.25);
    else if (day === 5) pct = r3 + (r7 - r3) * 0.5  + rng.gauss(0, 0.25);
    else if (day === 6) pct = r3 + (r7 - r3) * 0.75 + rng.gauss(0, 0.25);
    else                pct = r7;
    series.push({ day, close: +(base * (1 + pct / 100)).toFixed(4), pct: +pct.toFixed(4) });
  }
  return series;
}

function pickFields(score, ticker, rng) {
  let phrases, guidanceFlag, qaDefensiveness, briefPair;
  if (score >= 70) {
    phrases          = rng.choice(HIGH_PHRASES);
    guidanceFlag     = score >= 78 ? 'raised' : 'maintained';
    qaDefensiveness  = rng.randInt(0, 3);
    briefPair        = rng.choice(HIGH_BRIEFS);
  } else if (score >= 48) {
    phrases          = rng.choice(MID_PHRASES);
    guidanceFlag     = 'maintained';
    qaDefensiveness  = rng.randInt(3, 6);
    briefPair        = rng.choice(MID_BRIEFS);
  } else {
    phrases          = rng.choice(LOW_PHRASES);
    guidanceFlag     = score >= 35 ? 'lowered' : 'withdrawn';
    qaDefensiveness  = rng.randInt(6, 9);
    briefPair        = rng.choice(LOW_BRIEFS);
  }
  return {
    keyPhrases:      phrases,
    guidanceFlag,
    qaDefensiveness,
    tradeBrief:      briefPair[0] + ' ' + briefPair[1].replace('{t}', ticker),
  };
}

function genCalls(def) {
  const { ticker, name, sector, basePrice, mean, std, drift, anchor } = def;
  // anchor = most recent call date (index 0), then quarterly going back
  const pastDates = quarterlyDates(anchor, 11);
  const allDates  = [anchor, ...pastDates]; // 12 calls total

  return allDates.map((callDate, i) => {
    const quartersAgo = i;
    const seed = hashCode(`${ticker}_${callDate}`);
    const rng  = mkRng(seed);

    const score       = scoreForQuarter(mean, std, drift, quartersAgo, rng);
    const [r1, r3, r7]= genReturns(score, rng);
    const priceVar    = 0.85 + rng.next() * 0.3; // 0.85–1.15
    const base        = +(basePrice * priceVar).toFixed(4);
    const series      = buildPriceSeries(base, r1, r3, r7, rng);
    const fields      = pickFields(score, ticker, rng);

    return {
      filing_id:        `mock_${ticker}_${callDate.replace(/-/g, '')}`,
      ticker,
      company_name:     name,
      sector,
      call_date:        callDate,
      call_date_close:  base,
      confidence_score: score,
      key_phrases:      fields.keyPhrases,
      guidance_flag:    fields.guidanceFlag,
      trade_brief:      fields.tradeBrief,
      qa_defensiveness: fields.qaDefensiveness,
      return_1d:        r1,
      return_3d:        r3,
      return_7d:        r7,
      price_series:     series,
      model_used:       'claude-haiku-4-5-20251001',
      scored_at:        new Date(callDate + 'T10:00:00').toISOString(),
      _mock:            true,
    };
  });
}

// ─── Generate everything ──────────────────────────────────────────────────────

const ALL_CALLS = COMPANY_DEFS.flatMap(genCalls);

// Index by ticker, newest-first
const BY_TICKER = {};
for (const call of ALL_CALLS) {
  if (!BY_TICKER[call.ticker]) BY_TICKER[call.ticker] = [];
  BY_TICKER[call.ticker].push(call);
}
for (const t of Object.keys(BY_TICKER)) {
  BY_TICKER[t].sort((a, b) => b.call_date.localeCompare(a.call_date));
}

// ─── Computation helpers ──────────────────────────────────────────────────────

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function computeAccuracy(calls) {
  const buckets = { high: [], mid: [], low: [] };
  for (const c of calls) {
    if      (c.confidence_score >= 70) buckets.high.push(c);
    else if (c.confidence_score >= 45) buckets.mid.push(c);
    else                                buckets.low.push(c);
  }
  const result = [];
  for (const [bucket, bcalls] of Object.entries(buckets)) {
    if (!bcalls.length) continue;
    const wins   = bcalls.filter(c => c.return_7d >= 0);
    const losses = bcalls.filter(c => c.return_7d < 0);
    const wr     = wins.length / bcalls.length * 100;
    const avgWin = wins.length   ? avg(wins.map(c => c.return_7d))   : 0;
    const avgLoss= losses.length ? avg(losses.map(c => c.return_7d)) : 0;
    result.push({
      bucket,
      count:         bcalls.length,
      avg_return_1d: +avg(bcalls.map(c => c.return_1d)).toFixed(2),
      avg_return_3d: +avg(bcalls.map(c => c.return_3d)).toFixed(2),
      avg_return_7d: +avg(bcalls.map(c => c.return_7d)).toFixed(2),
      win_rate_7d:   +wr.toFixed(1),
      ev_7d:         +((wr / 100) * avgWin + (1 - wr / 100) * avgLoss).toFixed(2),
    });
  }
  return { total: calls.length, buckets: result };
}

function computeSectorDetail(calls) {
  // avg_path: average price path across all calls in the sector
  const byDay = {};
  for (let d = 0; d <= 7; d++) byDay[d] = [];
  for (const call of calls) {
    for (const pt of call.price_series || []) {
      if (byDay[pt.day] !== undefined) byDay[pt.day].push(pt.pct);
    }
  }
  const avg_path = [];
  for (let d = 0; d <= 7; d++) {
    const vals = byDay[d];
    if (!vals.length) { avg_path.push({ day: d, mean: 0, lower: 0, bandHeight: 0 }); continue; }
    const m   = avg(vals);
    const std = Math.sqrt(avg(vals.map(v => (v - m) ** 2)));
    avg_path.push({ day: d, mean: +m.toFixed(3), lower: +(m - std).toFixed(3), bandHeight: +(2 * std).toFixed(3) });
  }

  // Company rankings within sector
  const byTickerMap = {};
  for (const c of calls) {
    if (!byTickerMap[c.ticker]) byTickerMap[c.ticker] = { ticker: c.ticker, company_name: c.company_name, calls: [] };
    byTickerMap[c.ticker].calls.push(c);
  }
  const companies = Object.values(byTickerMap).map(({ ticker, company_name, calls: cs }) => ({
    ticker,
    company_name,
    call_count: cs.length,
    avg_1d:     +avg(cs.map(c => c.return_1d)).toFixed(2),
    avg_3d:     +avg(cs.map(c => c.return_3d)).toFixed(2),
    avg_7d:     +avg(cs.map(c => c.return_7d)).toFixed(2),
    win_rate:   +(cs.filter(c => c.return_7d >= 0).length / cs.length).toFixed(3),
  })).sort((a, b) => b.avg_7d - a.avg_7d);

  return { avg_path, companies };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const TICKER_LIST = COMPANY_DEFS.map(d => d.ticker);

// Feed: most recent 2 calls per company, newest-first
export const FEED = COMPANY_DEFS
  .flatMap(def => (BY_TICKER[def.ticker] || []).slice(0, 2))
  .sort((a, b) => b.call_date.localeCompare(a.call_date));

// Leaderboard: all companies sorted by avg 7d return
export const LEADERBOARD = COMPANY_DEFS.map(def => {
  const calls = BY_TICKER[def.ticker] || [];
  return {
    ticker:          def.ticker,
    company_name:    def.name,
    call_count:      calls.length,
    avg_confidence:  Math.round(avg(calls.map(c => c.confidence_score))),
    avg_return_1d:   +avg(calls.map(c => c.return_1d)).toFixed(2),
    avg_return_3d:   +avg(calls.map(c => c.return_3d)).toFixed(2),
    avg_return_7d:   +avg(calls.map(c => c.return_7d)).toFixed(2),
    win_rate:        +(calls.filter(c => c.return_7d >= 0).length / calls.length).toFixed(3),
  };
}).sort((a, b) => b.avg_return_7d - a.avg_return_7d);

// Companies: full history + accuracy + info keyed by ticker
export const COMPANIES = {};
for (const def of COMPANY_DEFS) {
  const calls = BY_TICKER[def.ticker] || [];
  COMPANIES[def.ticker] = {
    history:  calls,
    info:     { name: def.name, sector: def.sector },
    accuracy: computeAccuracy(calls),
  };
}

// Sectors: aggregate stats per sector
const SECTOR_CALLS = {};
for (const call of ALL_CALLS) {
  if (!SECTOR_CALLS[call.sector]) SECTOR_CALLS[call.sector] = [];
  SECTOR_CALLS[call.sector].push(call);
}

export const SECTORS = Object.entries(SECTOR_CALLS).map(([sector, calls]) => ({
  sector,
  avg_1d:         +avg(calls.map(c => c.return_1d)).toFixed(2),
  avg_3d:         +avg(calls.map(c => c.return_3d)).toFixed(2),
  avg_7d:         +avg(calls.map(c => c.return_7d)).toFixed(2),
  win_rate:       +(calls.filter(c => c.return_7d >= 0).length / calls.length).toFixed(3),
  call_count:     calls.length,
  company_count:  [...new Set(calls.map(c => c.ticker))].length,
})).sort((a, b) => b.avg_7d - a.avg_7d);

export const SECTOR_DETAIL = {};
for (const [sector, calls] of Object.entries(SECTOR_CALLS)) {
  SECTOR_DETAIL[sector] = computeSectorDetail(calls);
}

// Pulse: sector-level avg confidence + avg 7d return
export const PULSE = SECTORS.map(s => ({
  sector:         s.sector,
  avg_confidence: Math.round(avg(SECTOR_CALLS[s.sector].map(c => c.confidence_score))),
  avg_return_7d:  s.avg_7d,
}));

// Search index: one entry per company with latest call data
export const SEARCH_INDEX = COMPANY_DEFS.map(def => {
  const latest = BY_TICKER[def.ticker]?.[0];
  return {
    ticker:           def.ticker,
    company_name:     def.name,
    sector:           def.sector,
    confidence_score: latest?.confidence_score ?? null,
    has_data:         true,
    call_date:        latest?.call_date ?? null,
    return_1d:        latest?.return_1d ?? null,
    return_3d:        latest?.return_3d ?? null,
    return_7d:        latest?.return_7d ?? null,
    price_series:     latest?.price_series ?? null,
    key_phrases:      latest?.key_phrases ?? [],
    guidance_flag:    latest?.guidance_flag ?? null,
    trade_brief:      latest?.trade_brief ?? null,
    qa_defensiveness: latest?.qa_defensiveness ?? null,
    model_used:       'claude-haiku-4-5-20251001',
    call_date_close:  latest?.call_date_close ?? null,
  };
});

// Calendar: always relative to today so the demo stays current no matter when it's visited
export const CALENDAR = [
  { date: daysAhead(3),  ticker: 'ORCL', company_name: 'Oracle Corporation',      source: 'system', tracked: false, eps_estimate: 1.67, revenue_estimate: 14.3e9, avg_score: null, avg_return_7d: null, win_rate_7d: null },
  { date: daysAhead(8),  ticker: 'ADBE', company_name: 'Adobe Inc.',               source: null,     tracked: false, eps_estimate: 4.97, revenue_estimate: 5.8e9,  avg_score: null, avg_return_7d: null, win_rate_7d: null },
  { date: daysAhead(12), ticker: 'FDX',  company_name: 'FedEx Corporation',        source: null,     tracked: false, eps_estimate: 5.22, revenue_estimate: 22.1e9, avg_score: null, avg_return_7d: null, win_rate_7d: null },
  { date: daysAhead(14), ticker: 'NKE',  company_name: 'Nike',                     source: 'system', tracked: true,  eps_estimate: 0.79, revenue_estimate: 12.3e9, avg_score: 58,   avg_return_7d: -1.2, win_rate_7d: 42  },
  { date: daysAhead(21), ticker: 'WBA',  company_name: 'Walgreens Boots Alliance', source: null,     tracked: false, eps_estimate: 0.62, revenue_estimate: 35.8e9, avg_score: null, avg_return_7d: null, win_rate_7d: null },
  { date: daysAhead(26), ticker: 'DAL',  company_name: 'Delta Air Lines',          source: null,     tracked: false, eps_estimate: 1.82, revenue_estimate: 14.7e9, avg_score: null, avg_return_7d: null, win_rate_7d: null },
  { date: daysAhead(29), ticker: 'JPM',  company_name: 'JPMorgan Chase',           source: 'system', tracked: true,  eps_estimate: 4.51, revenue_estimate: 44.2e9, avg_score: 70,   avg_return_7d: 1.8,  win_rate_7d: 67  },
];
