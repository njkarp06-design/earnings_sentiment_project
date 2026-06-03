'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { getLeaderboard } from '@/lib/api';

function ReturnCell({ value }) {
  if (value == null) return <span className="text-slate-700">—</span>;
  const pct = value.toFixed(2);
  return (
    <span className={clsx('font-mono font-medium tabular-nums', value >= 0 ? 'text-emerald-400' : 'text-red-400')}>
      {value >= 0 ? '+' : ''}{pct}%
    </span>
  );
}

function scoreClass(score) {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 45) return 'text-amber-400';
  return 'text-red-400';
}

function RankCell({ rank }) {
  if (rank === 1) return (
    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-400/10 text-yellow-400 font-mono font-bold text-xs">
      1
    </span>
  );
  if (rank === 2) return (
    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-300/10 text-slate-300 font-mono font-semibold text-xs">
      2
    </span>
  );
  if (rank === 3) return (
    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/10 text-amber-600 font-mono font-semibold text-xs">
      3
    </span>
  );
  return <span className="font-mono text-slate-600 text-xs">{rank}</span>;
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getLeaderboard()
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Leaderboard</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Companies ranked by average 7-day post-call return — only calls with a full 7-day window shown
        </p>
      </div>

      {loading && <SkeletonTable />}

      {error && (
        <p className="text-center py-12 text-red-400">{error}</p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-center py-16 text-slate-600">
          No data yet — 7-day return windows must have elapsed for entries to appear here.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800">
                <th className="px-4 py-3 text-left text-[10px] text-slate-600 uppercase tracking-widest w-12">#</th>
                <th className="px-4 py-3 text-left text-[10px] text-slate-600 uppercase tracking-widest">Company</th>
                <th className="px-4 py-3 text-center text-[10px] text-slate-600 uppercase tracking-widest">Calls</th>
                <th className="px-4 py-3 text-center text-[10px] text-slate-600 uppercase tracking-widest">Avg Score</th>
                <th className="px-4 py-3 text-center text-[10px] text-slate-600 uppercase tracking-widest">Avg 1d</th>
                <th className="px-4 py-3 text-center text-[10px] text-slate-600 uppercase tracking-widest">Avg 3d</th>
                <th className="px-4 py-3 text-center text-[10px] text-slate-600 uppercase tracking-widest">Avg 7d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {rows.map((row, i) => (
                <tr
                  key={row.ticker}
                  className={clsx(
                    'transition-colors',
                    i === 0 ? 'bg-yellow-400/[0.03] hover:bg-yellow-400/[0.06]' :
                    i === 1 ? 'bg-slate-300/[0.02] hover:bg-slate-300/[0.04]' :
                    i === 2 ? 'bg-amber-700/[0.03] hover:bg-amber-700/[0.05]' :
                    'hover:bg-slate-800/40',
                  )}
                >
                  <td className="px-4 py-3">
                    <RankCell rank={i + 1} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/companies/${row.ticker}`}
                      className="font-mono font-bold text-cyan-400 hover:text-cyan-300 transition-colors tracking-tight"
                    >
                      {row.ticker}
                    </Link>
                    {row.company_name && (
                      <span className="text-slate-600 text-xs ml-2">{row.company_name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-mono tabular-nums text-slate-400">{row.call_count}</td>
                  <td className={clsx('px-4 py-3 text-center font-mono font-semibold tabular-nums', scoreClass(row.avg_confidence))}>
                    {row.avg_confidence}
                  </td>
                  <td className="px-4 py-3 text-center"><ReturnCell value={row.avg_return_1d} /></td>
                  <td className="px-4 py-3 text-center"><ReturnCell value={row.avg_return_3d} /></td>
                  <td className="px-4 py-3 text-center"><ReturnCell value={row.avg_return_7d} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border-b border-slate-800 px-4 py-3 flex gap-6 animate-pulse">
          <div className="h-4 bg-slate-800 rounded w-6" />
          <div className="h-4 bg-slate-800 rounded w-36" />
          <div className="h-4 bg-slate-800 rounded w-16 ml-auto" />
          <div className="h-4 bg-slate-800 rounded w-16" />
          <div className="h-4 bg-slate-800 rounded w-16" />
        </div>
      ))}
    </div>
  );
}
