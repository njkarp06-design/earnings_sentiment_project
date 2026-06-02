'use client';
import { useEffect, useState } from 'react';
import { getCompanyHistory, getAccuracy } from '@/lib/api';
import ScoreBar from '@/components/ScoreBar';
import ReturnBadge from '@/components/ReturnBadge';
import ScoreChart from '@/components/ScoreChart';
import MiniSparkline from '@/components/MiniSparkline';
import InspectModal from '@/components/InspectModal';

function fmtDate(str) {
  if (!str) return '—';
  // Append noon local time so timezone offsets never shift the displayed date.
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function CompanyPage({ params }) {
  const ticker = params.ticker.toUpperCase();
  const [history, setHistory] = useState([]);
  const [accuracy, setAccuracy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getCompanyHistory(ticker), getAccuracy(ticker)])
      .then(([hist, acc]) => { setHistory(hist); setAccuracy(acc); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return <div className="text-center py-20 text-slate-400 animate-pulse">Loading {ticker}…</div>;
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">No data found for <span className="text-white">{ticker}</span></p>
      </div>
    );
  }

  const companyName = history[0].company_name || ticker;

  // Chart uses chronological order (history is newest-first from the API)
  const chartData = [...history].reverse().map((item) => ({
    date: fmtDate(item.call_date),
    score: item.confidence_score,
    return_7d: item.return_7d ?? null,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">{ticker}</h1>
        <p className="text-slate-400 text-sm mt-0.5">{companyName}</p>
      </div>

      {history.length >= 2 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Confidence Score + 7d Return History
          </h2>
          <ScoreChart data={chartData} />
        </div>
      )}

      {accuracy?.buckets?.length > 0 && (
        <TrackRecord accuracy={accuracy} />
      )}

      <div className="space-y-4">
        {history.map((item, i) => (
          <CallCard key={item.filing_id ?? i} item={item} />
        ))}
      </div>
    </div>
  );
}

function fmtReturn(val) {
  if (val == null) return <span className="text-slate-600">—</span>;
  const pos = val >= 0;
  return (
    <span className={pos ? 'text-green-400' : 'text-red-400'}>
      {pos ? '+' : ''}{val.toFixed(2)}%
    </span>
  );
}

function TrackRecord({ accuracy }) {
  const BUCKET_LABELS = { high: 'Score ≥70', mid: 'Score 45–70', low: 'Score <45' };
  const BUCKET_COLORS = { high: 'text-emerald-400', mid: 'text-amber-400', low: 'text-red-400' };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          Track Record
        </h2>
        <span className="text-[11px] text-slate-600">{accuracy.total} calls with returns</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-slate-500 uppercase tracking-wide">
              <th className="text-left pb-2 font-medium">Score Range</th>
              <th className="text-center pb-2 font-medium">Calls</th>
              <th className="text-center pb-2 font-medium">Avg 1d</th>
              <th className="text-center pb-2 font-medium">Avg 3d</th>
              <th className="text-center pb-2 font-medium">Avg 7d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {accuracy.buckets.map(b => (
              <tr key={b.bucket} className="text-sm">
                <td className={`py-2 font-medium ${BUCKET_COLORS[b.bucket] || 'text-slate-300'}`}>
                  {BUCKET_LABELS[b.bucket] || b.range}
                </td>
                <td className="py-2 text-center text-slate-400 tabular-nums">{b.count}</td>
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
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="font-medium text-slate-200">{fmtDate(item.call_date)}</span>
        <div className="flex items-center gap-2">
          {item.model_used && (
            <span className="text-[11px] text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full">
              {item.model_used.replace('claude-', '')}
            </span>
          )}
          <button
            onClick={() => setInspecting(true)}
            className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded-full transition-colors"
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

      {item.price_series?.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-2">Price Reaction (7-day window)</div>
          <MiniSparkline
            data={item.price_series}
            positive={item.return_7d != null ? item.return_7d >= 0 : null}
            height={80}
          />
        </div>
      )}

      <div className="mb-4">
        <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1.5">CEO Confidence</div>
        <ScoreBar score={item.confidence_score} />
      </div>

      {item.key_phrases?.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-2">Key Phrases</div>
          <div className="flex flex-wrap gap-1.5">
            {item.key_phrases.map((phrase, i) => (
              <span
                key={i}
                className="text-[11px] bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full"
              >
                {phrase}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-6 pt-3 border-t border-slate-700/70">
        <ReturnBadge value={item.return_1d} label="1-day" />
        <ReturnBadge value={item.return_3d} label="3-day" />
        <ReturnBadge value={item.return_7d} label="7-day" />
        {item.call_date_close != null && (
          <div className="text-center ml-auto">
            <div className="text-xs font-semibold text-slate-300 tabular-nums">
              ${Number(item.call_date_close).toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Close</div>
          </div>
        )}
      </div>
    </div>
  );
}
