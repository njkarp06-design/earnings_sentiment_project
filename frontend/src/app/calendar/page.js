'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCalendar } from '@/lib/api';

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function fmtNum(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return n.toFixed(2);
}

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getCalendar()
      .then(setEvents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const tracked   = events.filter(e => e.tracked);
  const untracked = events.filter(e => !e.tracked);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Earnings Calendar</h1>
        <p className="text-slate-400 mt-1 text-sm">Upcoming earnings reports — next 30 days</p>
      </div>

      {loading && <Skeleton />}

      {error && (
        <div className="text-center py-16">
          <p className="text-slate-400">Could not load calendar</p>
          <p className="text-red-400 text-sm mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          No upcoming earnings found. Check back soon.
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <>
          {tracked.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Tracked Companies
              </h2>
              <EventTable events={tracked} />
            </section>
          )}

          {untracked.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                All Upcoming
              </h2>
              <EventTable events={untracked} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function EventTable({ events }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-[10px] text-slate-500 uppercase tracking-wide">
            <th className="text-left px-5 py-3 font-medium">Date</th>
            <th className="text-left px-5 py-3 font-medium">Ticker</th>
            <th className="text-right px-5 py-3 font-medium">EPS Est.</th>
            <th className="text-right px-5 py-3 font-medium">Rev. Est.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {events.map((e, i) => (
            <tr key={i} className="hover:bg-slate-700/30 transition-colors">
              <td className="px-5 py-3 text-slate-400 tabular-nums">{fmtDate(e.date)}</td>
              <td className="px-5 py-3">
                {e.tracked ? (
                  <Link
                    href={`/companies/${e.ticker}`}
                    className="font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {e.ticker}
                  </Link>
                ) : (
                  <span className="text-slate-300">{e.ticker}</span>
                )}
                {e.tracked && (
                  <span className="ml-2 text-[10px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                    tracked
                  </span>
                )}
              </td>
              <td className="px-5 py-3 text-right text-slate-400 tabular-nums">
                {e.eps_estimate != null ? e.eps_estimate.toFixed(2) : '—'}
              </td>
              <td className="px-5 py-3 text-right text-slate-400 tabular-nums">
                {fmtNum(e.revenue_estimate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-5 py-3 border-b border-slate-700/50">
          <div className="h-3 bg-slate-700 rounded w-20" />
          <div className="h-3 bg-slate-700 rounded w-14" />
          <div className="h-3 bg-slate-700 rounded w-12 ml-auto" />
          <div className="h-3 bg-slate-700 rounded w-16" />
        </div>
      ))}
    </div>
  );
}
