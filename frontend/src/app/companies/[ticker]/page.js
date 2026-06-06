'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { getCompanyHistory, getAccuracy, getCompanyInfo } from '@/lib/api';
import { usePortfolio } from '@/context/PortfolioContext';
import ScoreBar from '@/components/ScoreBar';
import ReturnBadge from '@/components/ReturnBadge';
import ScoreChart from '@/components/ScoreChart';
import MiniSparkline from '@/components/MiniSparkline';
import InspectModal from '@/components/InspectModal';
import PostEarningsProfile from '@/components/PostEarningsProfile';

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function BookmarkIcon({ filled }) {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
    </svg>
  );
}

function scoreTextColor(score) {
  if (score >= 70) return 'text-emerald-600';
  if (score >= 45) return 'text-amber-600';
  return 'text-red-600';
}

function StatChip({ label, value, scoreColored, positive }) {
  let valueClass = 'text-slate-800 font-mono tabular-nums';
  if (scoreColored && value != null) valueClass = clsx('font-mono font-semibold tabular-nums', scoreTextColor(value));
  if (positive === true)  valueClass = 'text-emerald-600 font-mono font-semibold tabular-nums';
  if (positive === false) valueClass = 'text-red-600 font-mono font-semibold tabular-nums';
  return (
    <div>
      <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">{label}</div>
      <div className={clsx('text-sm', valueClass)}>{value ?? '—'}</div>
    </div>
  );
}

export default function CompanyPage({ params }) {
  const ticker = params.ticker.toUpperCase();
  const { watchlist, add, remove, isLoggedIn } = usePortfolio();
  const [history, setHistory]       = useState([]);
  const [accuracy, setAccuracy]     = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [saving, setSaving]         = useState(false);

  const saved = watchlist.includes(ticker);

  useEffect(() => {
    Promise.all([
      getCompanyHistory(ticker),
      getAccuracy(ticker),
      getCompanyInfo(ticker).catch(() => null),
    ])
      .then(([hist, acc, info]) => {
        setHistory(hist);
        setAccuracy(acc);
        setCompanyInfo(info);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticker]);

  const handlePortfolioToggle = async () => {
    setSaving(true);
    try {
      if (saved) await remove(ticker);
      else await add(ticker);
    } catch { } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-slate-400 animate-pulse font-mono">
        Loading {ticker}…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const companyName = history[0]?.company_name || companyInfo?.name || ticker;
  const sector = companyInfo?.sector;
  const latestCall = history[0] ?? null;

  if (history.length === 0) {
    return (
      <div>
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-6 group">
          <svg className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Feed
        </Link>

        <div className="py-10 max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold font-mono text-slate-900 tracking-tight mb-1">{ticker}</h1>
          {companyName !== ticker && (
            <p className="text-slate-500 text-sm mb-4">{companyName}</p>
          )}
          {sector && (
            <span className="inline-block mb-6 text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-0.5 rounded-full">
              {sector}
            </span>
          )}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              </svg>
            </div>
            <p className="text-slate-700 font-medium mb-1">No earnings data yet</p>
            <p className="text-slate-500 text-sm">
              {companyName} is tracked in our universe. Earnings filings will appear here automatically once they are detected and scored.
            </p>
            {isLoggedIn && (
              <button
                onClick={handlePortfolioToggle}
                disabled={saving}
                className={clsx(
                  'mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 mx-auto',
                  saved
                    ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 hover:border-blue-300'
                    : 'bg-blue-700 hover:bg-blue-600 text-white font-semibold',
                )}
              >
                <BookmarkIcon filled={saved} />
                {saving ? '…' : saved ? 'Watching' : 'Watch this company'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const chartData = [...history].reverse().map((item) => ({
    date: fmtDate(item.call_date),
    score: item.confidence_score,
    return_7d: item.return_7d ?? null,
  }));

  return (
    <div>
      {/* ── Back link ────────────────────────────────────────────── */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-5 group">
        <svg className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Feed
      </Link>

      {/* ── Company header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-3xl font-bold font-mono text-slate-900 tracking-tight">{ticker}</h1>
            {sector && (
              <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-0.5 rounded-full">
                {sector}
              </span>
            )}
          </div>
          <p className="text-slate-500 text-sm">{companyName}</p>
        </div>

        {isLoggedIn && (
          <button
            onClick={handlePortfolioToggle}
            disabled={saving}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0',
              saved
                ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                : 'bg-blue-700 hover:bg-blue-600 text-white font-semibold',
            )}
          >
            <BookmarkIcon filled={saved} />
            {saving ? '…' : saved ? 'Watching' : 'Watch'}
          </button>
        )}
      </div>

      {/* ── Quick stats strip ────────────────────────────────────── */}
      <div className="flex items-center gap-8 py-4 mb-6 border-y border-slate-200">
        <StatChip label="Latest Score" value={latestCall?.confidence_score} scoreColored />
        <StatChip label="Calls Tracked" value={history.length} />
        <StatChip label="Last Report" value={fmtDate(latestCall?.call_date)} />
        {latestCall?.return_7d != null && (
          <StatChip
            label="Last 7d Return"
            value={`${latestCall.return_7d >= 0 ? '+' : ''}${latestCall.return_7d.toFixed(2)}%`}
            positive={latestCall.return_7d >= 0}
          />
        )}
      </div>

      {/* ── Score history chart ──────────────────────────────────── */}
      {history.length >= 2 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-4">
            Confidence Score + 7d Return History
          </h2>
          <ScoreChart data={chartData} />
        </div>
      )}

      {/* ── Post-earnings drift ──────────────────────────────────── */}
      {history.length >= 2 && (
        <PostEarningsProfile calls={history} />
      )}

      {/* ── Track record ─────────────────────────────────────────── */}
      {accuracy?.buckets?.length > 0 && (
        <TrackRecord accuracy={accuracy} />
      )}

      {/* ── Call cards ───────────────────────────────────────────── */}
      <div className="space-y-4">
        {history.map((item, i) => (
          <CallCard key={item.filing_id ?? i} item={item} />
        ))}
      </div>
    </div>
  );
}

function fmtReturn(val) {
  if (val == null) return <span className="text-slate-400">—</span>;
  const pos = val >= 0;
  return (
    <span className={`font-mono tabular-nums ${pos ? 'text-emerald-600' : 'text-red-600'}`}>
      {pos ? '+' : ''}{val.toFixed(2)}%
    </span>
  );
}

function TrackRecord({ accuracy }) {
  const BUCKET_LABELS = { high: 'Score ≥70', mid: 'Score 45–70', low: 'Score <45' };
  const BUCKET_COLORS = { high: 'text-emerald-600', mid: 'text-amber-600', low: 'text-red-600' };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
          Track Record
        </h2>
        <span className="text-[10px] text-slate-400 font-mono">{accuracy.total} calls with returns</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-200">
              <th className="text-left py-2.5 pr-3 font-medium">Score Range</th>
              <th className="text-center py-2.5 font-medium">Calls</th>
              <th className="text-center py-2.5 font-medium">Avg 1d</th>
              <th className="text-center py-2.5 font-medium">Avg 3d</th>
              <th className="text-center py-2.5 font-medium">Avg 7d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {accuracy.buckets.map(b => (
              <tr key={b.bucket} className="text-sm">
                <td className={`py-2 font-medium ${BUCKET_COLORS[b.bucket] || 'text-slate-700'}`}>
                  {BUCKET_LABELS[b.bucket] || b.range}
                </td>
                <td className="py-2 text-center text-slate-500 font-mono tabular-nums">{b.count}</td>
                <td className="py-2 text-center tabular-nums">{fmtReturn(b.avg_return_1d)}</td>
                <td className="py-2 text-center tabular-nums">{fmtReturn(b.avg_return_3d)}</td>
                <td className="py-2 text-center tabular-nums">{fmtReturn(b.avg_return_7d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CallCard({ item }) {
  const [inspecting, setInspecting] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <span className="font-medium text-slate-800">{fmtDate(item.call_date)}</span>
        <div className="flex items-center gap-2">
          {item.model_used && (
            <span className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
              {item.model_used.replace('claude-', '')}
            </span>
          )}
          <button
            onClick={() => setInspecting(true)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 px-2.5 py-1 rounded-lg transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
            </svg>
            Inspect
          </button>
        </div>
      </div>

      {inspecting && (
        <InspectModal item={item} onClose={() => setInspecting(false)} />
      )}

      {item.price_series?.some(p => p.pct != null) && (
        <div className="mb-4">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Price Reaction (7-day window)</div>
          <MiniSparkline
            data={item.price_series}
            positive={item.return_7d != null ? item.return_7d >= 0 : null}
            height={80}
          />
        </div>
      )}

      <div className="mb-4">
        <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">CEO Confidence</div>
        <ScoreBar score={item.confidence_score} />
      </div>

      {item.key_phrases?.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Key Phrases</div>
          <div className="flex flex-wrap gap-1.5">
            {item.key_phrases.map((phrase, i) => (
              <span
                key={i}
                className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-0.5 rounded-full"
              >
                {phrase}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-6 pt-3 border-t border-slate-200">
        <ReturnBadge value={item.return_1d} label="1d" />
        <ReturnBadge value={item.return_3d} label="3d" />
        <ReturnBadge value={item.return_7d} label="7d" />
        {item.call_date_close != null && (
          <div className="text-center ml-auto">
            <div className="text-sm font-semibold font-mono text-slate-700 tabular-nums">
              ${Number(item.call_date_close).toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">Close</div>
          </div>
        )}
      </div>
    </div>
  );
}
