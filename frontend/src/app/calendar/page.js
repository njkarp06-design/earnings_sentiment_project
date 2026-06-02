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
  const diff = new Date(dateStr + 'T12:00:00') - new Date();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
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
  }, [isLoggedIn]); // re-fetch when auth state changes so portfolio items appear immediately on login

  const portfolio = events.filter(e => e.source === 'portfolio');
  const system    = events.filter(e => e.source === 'system');
  const rest      = events.filter(e => !e.source);

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
        <div className="text-center py-20 text-slate-500">No upcoming earnings found.</div>
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
            <div className="flex items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-4">
              <div className="w-1.5 h-8 rounded-full bg-blue-500/60 shrink-0" />
              <div>
                <p className="text-sm text-slate-300 font-medium">See your portfolio companies here</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors">Sign in</Link>
                  {' '}and save companies to your portfolio — they'll appear at the top of this calendar.
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
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{title}</h2>
      {subtitle && <p className="text-[11px] text-slate-600 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function SourceBadge({ source }) {
  if (source === 'portfolio') {
    return (
      <span className="ml-2 text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">
        portfolio
      </span>
    );
  }
  if (source === 'system') {
    return (
      <span className="ml-2 text-[10px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
        tracked
      </span>
    );
  }
  return null;
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
          {events.map((e, i) => {
            const countdown = daysUntil(e.date);
            return (
              <tr key={i} className="hover:bg-slate-700/30 transition-colors">
                <td className="px-5 py-3 text-slate-400 tabular-nums">
                  <span>{fmtDate(e.date)}</span>
                  {countdown && (
                    <span className="ml-2 text-[10px] text-slate-600">{countdown}</span>
                  )}
                </td>
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
                  <SourceBadge source={e.source} />
                </td>
                <td className="px-5 py-3 text-right text-slate-400 tabular-nums">
                  {e.eps_estimate != null ? e.eps_estimate.toFixed(2) : '—'}
                </td>
                <td className="px-5 py-3 text-right text-slate-400 tabular-nums">
                  {fmtNum(e.revenue_estimate)}
                </td>
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
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-5 py-3 border-b border-slate-700/50">
          <div className="h-3 bg-slate-700 rounded w-24" />
          <div className="h-3 bg-slate-700 rounded w-14" />
          <div className="h-3 bg-slate-700 rounded w-12 ml-auto" />
          <div className="h-3 bg-slate-700 rounded w-16" />
        </div>
      ))}
    </div>
  );
}
