'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCalendar } from '@/lib/api';
import { usePortfolio } from '@/context/PortfolioContext';

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function daysUntil(dateStr) {
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const eventMidnight = new Date(dateStr + 'T00:00:00');
  const days = Math.round((eventMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 0)  return null;
  return `in ${days}d`;
}

function fmtNum(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(2)}`;
}

function fmtReturn(val) {
  if (val == null) return '—';
  const pos = val >= 0;
  return (
    <span className={`font-mono tabular-nums ${pos ? 'text-emerald-600' : 'text-red-600'}`}>
      {pos ? '+' : ''}{val.toFixed(2)}%
    </span>
  );
}

function fmtScore(val) {
  if (val == null) return '—';
  const cls = val >= 70 ? 'text-emerald-600' : val >= 45 ? 'text-amber-600' : 'text-red-600';
  return <span className={`font-mono font-semibold tabular-nums ${cls}`}>{val}</span>;
}

export default function CalendarPage() {
  const { isLoggedIn } = usePortfolio();
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    getCalendar()
      .then(setEvents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isLoggedIn]);

  const portfolio = events.filter(e => e.source === 'portfolio');
  const system    = events.filter(e => e.source === 'system');
  const rest      = events.filter(e => !e.source);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Earnings Calendar</h1>
        <p className="text-slate-500 mt-1 text-sm">Upcoming earnings reports — next 30 days</p>
      </div>

      {loading && <Skeleton />}

      {error && (
        <div className="text-center py-16">
          <p className="text-slate-500">Could not load calendar</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="text-center py-20 flex flex-col items-center gap-3">
          <div className="text-slate-400">
            <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 9v7.5" />
            </svg>
          </div>
          <p className="text-slate-700 font-medium">No upcoming earnings found</p>
          <p className="text-slate-500 text-sm">Check back as earnings season approaches.</p>
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="space-y-8">

          {/* ── Your Portfolio ─────────────────────────────────────── */}
          {portfolio.length > 0 && (
            <section>
              <SectionHeader
                title="Your Portfolio"
                subtitle={`${portfolio.length} saved ${portfolio.length === 1 ? 'company' : 'companies'} reporting soon`}
              />
              <EventTable events={portfolio} />
            </section>
          )}

          {/* ── Logged-out nudge ───────────────────────────────────── */}
          {!isLoggedIn && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
              <div className="w-1.5 h-8 rounded-full bg-blue-300 shrink-0" />
              <div>
                <p className="text-sm text-slate-700 font-medium">See your portfolio companies here</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  <Link href="/login" className="text-blue-700 hover:text-blue-600 transition-colors font-medium">Sign in</Link>
                  {' '}and save companies to your portfolio — they&apos;ll appear at the top of this calendar.
                </p>
              </div>
            </div>
          )}

          {/* ── System tracked ─────────────────────────────────────── */}
          {system.length > 0 && (
            <section>
              <SectionHeader
                title="Tracked by System"
                subtitle="Companies the pipeline monitors automatically"
              />
              <EventTable events={system} />
            </section>
          )}

          {/* ── Everything else ────────────────────────────────────── */}
          {rest.length > 0 && (
            <section>
              <SectionHeader
                title="All Upcoming"
                subtitle={`${rest.length} other ${rest.length === 1 ? 'report' : 'reports'} this month`}
              />
              <EventTable events={rest} />
            </section>
          )}

        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{title}</h2>
      {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function SourceBadge({ source }) {
  if (source === 'portfolio') {
    return (
      <span className="ml-2 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
        portfolio
      </span>
    );
  }
  if (source === 'system') {
    return (
      <span className="ml-2 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
        tracked
      </span>
    );
  }
  return null;
}

function EventTable({ events }) {
  const hasHistory = events.some(e => e.avg_score != null);
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[10px] text-slate-400 uppercase tracking-widest">
            <th className="text-left px-5 py-3 font-medium">Date</th>
            <th className="text-left px-5 py-3 font-medium">Ticker</th>
            <th className="text-right px-5 py-3 font-medium">EPS Est.</th>
            <th className="text-right px-5 py-3 font-medium">Rev. Est.</th>
            {hasHistory && <>
              <th className="text-right px-5 py-3 font-medium">Avg Score</th>
              <th className="text-right px-5 py-3 font-medium">Avg 7d</th>
              <th className="text-right px-5 py-3 font-medium">Win %</th>
            </>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {events.map((e) => {
            const countdown = daysUntil(e.date);
            return (
              <tr key={`${e.ticker}-${e.date}`} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 text-slate-600">
                  <span className="font-mono tabular-nums">{fmtDate(e.date)}</span>
                  {countdown && (
                    <span className="ml-2 text-[10px] text-slate-400 font-mono">{countdown}</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {e.tracked ? (
                    <Link
                      href={`/companies/${e.ticker}`}
                      className="font-mono font-bold text-blue-700 hover:text-blue-600 transition-colors tracking-tight"
                    >
                      {e.ticker}
                    </Link>
                  ) : (
                    <span className="font-mono text-slate-600">{e.ticker}</span>
                  )}
                  <SourceBadge source={e.source} />
                </td>
                <td className="px-5 py-3 text-right text-slate-600 font-mono tabular-nums">
                  {e.eps_estimate != null ? e.eps_estimate.toFixed(2) : '—'}
                </td>
                <td className="px-5 py-3 text-right text-slate-600 font-mono tabular-nums">
                  {fmtNum(e.revenue_estimate)}
                </td>
                {hasHistory && <>
                  <td className="px-5 py-3 text-right">{fmtScore(e.avg_score)}</td>
                  <td className="px-5 py-3 text-right">{fmtReturn(e.avg_return_7d)}</td>
                  <td className="px-5 py-3 text-right text-slate-600 font-mono tabular-nums">
                    {e.win_rate_7d != null ? `${e.win_rate_7d}%` : '—'}
                  </td>
                </>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-5 py-3 border-b border-slate-200">
          <div className="h-3 bg-slate-200 rounded w-24" />
          <div className="h-3 bg-slate-200 rounded w-14" />
          <div className="h-3 bg-slate-200 rounded w-12 ml-auto" />
          <div className="h-3 bg-slate-200 rounded w-16" />
        </div>
      ))}
    </div>
  );
}
