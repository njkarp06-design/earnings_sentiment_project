'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { getLeaderboard } from '@/lib/api';

function ReturnCell({ value }) {
  if (value == null) return <span className="text-slate-600">—</span>;
  const pct = value.toFixed(2);
  return (
    <span className={clsx('font-medium tabular-nums', value >= 0 ? 'text-green-400' : 'text-red-400')}>
      {value >= 0 ? '+' : ''}{pct}%
    </span>
  );
}

function scoreClass(score) {
  if (score >= 70) return 'text-green-400';
  if (score >= 45) return 'text-yellow-400';
  return 'text-red-400';
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
        <h1 className="text-2xl font-bold text-slate-100">Leaderboard</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Companies ranked by average 7-day post-call return — only calls with a full 7-day window shown
        </p>
      </div>

      {loading && <SkeletonTable />}

      {error && (
        <p className="text-center py-12 text-red-400">{error}</p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-center py-16 text-slate-500">
          No data yet — 7-day return windows must have elapsed for entries to appear here.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700">
                <th className="px-4 py-3 text-left text-xs text-slate-500 uppercase tracking-wide w-10">#</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 uppercase tracking-wide">Company</th>
                <th className="px-4 py-3 text-center text-xs text-slate-500 uppercase tracking-wide">Calls</th>
                <th className="px-4 py-3 text-center text-xs text-slate-500 uppercase tracking-wide">Avg Score</th>
                <th className="px-4 py-3 text-center text-xs text-slate-500 uppercase tracking-wide">Avg 1d</th>
                <th className="px-4 py-3 text-center text-xs text-slate-500 uppercase tracking-wide">Avg 3d</th>
                <th className="px-4 py-3 text-center text-xs text-slate-500 uppercase tracking-wide">Avg 7d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {rows.map((row, i) => (
                <tr key={row.ticker} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/companies/${row.ticker}`}
                      className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                    >
                      {row.ticker}
                    </Link>
                    {row.company_name && (
                      <span className="text-slate-500 text-xs ml-2">{row.company_name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-300 tabular-nums">{row.call_count}</td>
                  <td className={clsx('px-4 py-3 text-center font-semibold tabular-nums', scoreClass(row.avg_confidence))}>
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
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border-b border-slate-700 px-4 py-3 flex gap-6 animate-pulse">
          <div className="h-4 bg-slate-700 rounded w-6" />
          <div className="h-4 bg-slate-700 rounded w-36" />
          <div className="h-4 bg-slate-700 rounded w-16 ml-auto" />
          <div className="h-4 bg-slate-700 rounded w-16" />
          <div className="h-4 bg-slate-700 rounded w-16" />
        </div>
      ))}
    </div>
  );
}
