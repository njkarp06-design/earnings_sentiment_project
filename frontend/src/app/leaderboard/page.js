'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { getLeaderboard } from '@/lib/api';
import SearchOverlay from '@/components/SearchOverlay';

function ReturnCell({ value }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  return (
    <span className={clsx('font-mono font-medium tabular-nums', value >= 0 ? 'text-emerald-600' : 'text-red-600')}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

function scoreClass(score) {
  if (score >= 70) return 'text-emerald-600';
  if (score >= 45) return 'text-amber-600';
  return 'text-red-600';
}

function RankCell({ rank }) {
  if (rank === 1) return <span className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-50 text-yellow-600 font-mono font-bold text-xs border border-yellow-200">1</span>;
  if (rank === 2) return <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-mono font-semibold text-xs border border-slate-200">2</span>;
  if (rank === 3) return <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-700 font-mono font-semibold text-xs border border-amber-200">3</span>;
  return <span className="font-mono text-slate-400 text-xs">{rank}</span>;
}

export default function LeaderboardPage() {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [overlayItem, setOverlayItem] = useState(null);

  useEffect(() => {
    getLeaderboard()
      .then(setRows)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openOverlay = (row) => setOverlayItem({
    ticker:           row.ticker,
    company_name:     row.company_name,
    confidence_score: row.avg_confidence,
    has_data:         true,
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Leaderboard</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Companies ranked by average 7-day post-call return · click any row for drift chart
        </p>
      </div>

      {loading && <SkeletonTable />}
      {error && <p className="text-center py-12 text-red-600">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <div className="text-center py-16 flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-slate-700">No data yet</p>
          <p className="text-sm text-slate-500">7-day return windows must have elapsed for entries to appear here.</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-[10px] text-slate-400 uppercase tracking-widest w-12">#</th>
                <th className="px-4 py-3 text-left text-[10px] text-slate-400 uppercase tracking-widest">Company</th>
                <th className="px-4 py-3 text-center text-[10px] text-slate-400 uppercase tracking-widest">Calls</th>
                <th className="px-4 py-3 text-center text-[10px] text-slate-400 uppercase tracking-widest">Avg Score</th>
                <th className="px-4 py-3 text-center text-[10px] text-slate-400 uppercase tracking-widest">Avg 1d</th>
                <th className="px-4 py-3 text-center text-[10px] text-slate-400 uppercase tracking-widest">Avg 3d</th>
                <th className="px-4 py-3 text-center text-[10px] text-slate-400 uppercase tracking-widest">Avg 7d</th>
                <th className="px-4 py-3 text-center text-[10px] text-slate-400 uppercase tracking-widest">Win Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {rows.map((row, i) => (
                <tr
                  key={row.ticker}
                  onClick={() => openOverlay(row)}
                  className={clsx(
                    'cursor-pointer transition-colors',
                    i === 0 ? 'bg-yellow-50/60 hover:bg-yellow-50' :
                    i === 1 ? 'bg-slate-50/60 hover:bg-slate-50' :
                    i === 2 ? 'bg-amber-50/60 hover:bg-amber-50' :
                    'hover:bg-slate-50',
                  )}
                >
                  <td className="px-4 py-3"><RankCell rank={i + 1} /></td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-blue-700 tracking-tight">{row.ticker}</span>
                    {row.company_name && (
                      <span className="text-slate-500 text-xs ml-2">{row.company_name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-mono tabular-nums text-slate-500">{row.call_count}</td>
                  <td className={clsx('px-4 py-3 text-center font-mono font-semibold tabular-nums', scoreClass(row.avg_confidence))}>
                    {row.avg_confidence}
                  </td>
                  <td className="px-4 py-3 text-center"><ReturnCell value={row.avg_return_1d} /></td>
                  <td className="px-4 py-3 text-center"><ReturnCell value={row.avg_return_3d} /></td>
                  <td className="px-4 py-3 text-center"><ReturnCell value={row.avg_return_7d} /></td>
                  <td className="px-4 py-3 text-center">
                    {row.win_rate != null ? (
                      <span className={clsx('font-mono font-semibold tabular-nums', row.win_rate >= 0.5 ? 'text-emerald-600' : 'text-red-600')}>
                        {Math.round(row.win_rate * 100)}%
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {overlayItem && (
        <SearchOverlay item={overlayItem} onClose={() => setOverlayItem(null)} />
      )}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border-b border-slate-200 px-4 py-3 flex gap-6 animate-pulse bg-white">
          <div className="h-4 bg-slate-200 rounded w-6" />
          <div className="h-4 bg-slate-200 rounded w-36" />
          <div className="h-4 bg-slate-200 rounded w-16 ml-auto" />
          <div className="h-4 bg-slate-200 rounded w-16" />
          <div className="h-4 bg-slate-200 rounded w-16" />
        </div>
      ))}
    </div>
  );
}
