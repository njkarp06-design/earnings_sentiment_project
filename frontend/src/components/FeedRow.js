'use client';
import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import MiniSparkline from './MiniSparkline';
import SearchOverlay from './SearchOverlay';
import LiveDot from './LiveDot';
import { usePortfolio } from '@/context/PortfolioContext';

function isLive(callDateStr) {
  if (!callDateStr) return false;
  return Date.now() - new Date(callDateStr + 'T12:00:00').getTime() < 24 * 60 * 60 * 1000;
}

function fmtDateShort(str) {
  if (!str) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const d = new Date(str + 'T12:00:00');
  const diff = Math.round((today - d) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function scoreColor(score) {
  if (score >= 70) return 'text-emerald-600';
  if (score >= 45) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBg(score) {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 45) return 'bg-amber-500';
  return 'bg-red-500';
}

function accentLeft(score) {
  if (score >= 70) return 'border-l-emerald-400';
  if (score >= 45) return 'border-l-amber-400';
  return 'border-l-red-400';
}

function SparkleIcon() {
  return (
    <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function ReturnVal({ value, pending }) {
  if (value == null) {
    return (
      <span className={clsx('text-xs font-mono tabular-nums', pending ? 'text-amber-600 animate-pulse' : 'text-slate-400')}>
        {pending ? '···' : '—'}
      </span>
    );
  }
  return (
    <span className={clsx('text-xs font-mono font-semibold tabular-nums', value >= 0 ? 'text-emerald-600' : 'text-red-600')}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

export default function FeedRow({ item, index = 0 }) {
  const { watchlist, add, remove, isLoggedIn } = usePortfolio();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const saved = watchlist.includes(item.ticker);
  const live = isLive(item.call_date);
  const isPositive = item.return_7d != null ? item.return_7d >= 0 : null;
  const dateLabel = fmtDateShort(item.call_date);

  const handleBookmark = async (e) => {
    e.stopPropagation();
    setSaving(true);
    try {
      if (saved) await remove(item.ticker);
      else await add(item.ticker);
    } catch {}
    finally { setSaving(false); }
  };

  const openInspect = (e) => {
    e.stopPropagation();
    setOverlayOpen(true);
  };

  return (
    <>
      <div
        onClick={() => setOverlayOpen(true)}
        style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
        className={clsx(
          'group flex items-center border-b border-slate-200 last:border-b-0',
          'border-l-[3px] cursor-pointer transition-colors hover:bg-slate-50 animate-slide-up',
          accentLeft(item.confidence_score),
        )}
      >
        {/* Live dot */}
        <div className="w-7 shrink-0 flex items-center justify-center self-stretch">
          {live && <LiveDot />}
        </div>

        {/* Ticker + company name + date */}
        <div className="w-36 shrink-0 py-2.5 pr-3">
          <Link
            href={`/companies/${item.ticker}`}
            onClick={e => e.stopPropagation()}
            className="font-mono font-bold text-blue-700 hover:text-blue-600 text-sm tracking-tight block leading-none"
          >
            {item.ticker}
          </Link>
          {item.company_name && (
            <span className="text-slate-400 text-[11px] truncate block mt-0.5 leading-none">
              {item.company_name}
            </span>
          )}
          {dateLabel && (
            <span className="text-slate-400 text-[10px] font-mono block mt-1 leading-none">
              {dateLabel}
            </span>
          )}
        </div>

        {/* Sparkline */}
        <div className="w-[88px] shrink-0 py-1">
          {item.price_series?.filter(p => p.pct != null).length >= 2 ? (
            <MiniSparkline data={item.price_series} positive={isPositive} height={38} />
          ) : (
            <div className="h-[38px]" />
          )}
        </div>

        {/* Score bar + number */}
        <div className="w-28 shrink-0 py-3 px-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div
                className={clsx('h-full rounded-full', scoreBg(item.confidence_score))}
                style={{ width: `${item.confidence_score}%` }}
              />
            </div>
            <span className={clsx('text-xs font-mono font-bold tabular-nums w-6 text-right shrink-0', scoreColor(item.confidence_score))}>
              {item.confidence_score}
            </span>
          </div>
        </div>

        {/* 1d / 3d / 7d returns */}
        <div className="flex shrink-0">
          {[
            { label: '1d', value: item.return_1d },
            { label: '3d', value: item.return_3d },
            { label: '7d', value: item.return_7d },
          ].map(({ label, value }) => (
            <div key={label} className="w-[70px] py-3 text-center">
              <ReturnVal value={value} pending={item.pending} />
            </div>
          ))}
        </div>

        {/* Key phrase — xl+ only */}
        <div className="flex-1 min-w-0 py-3 px-3 hidden xl:flex items-center">
          {item.key_phrases?.[0] && (
            <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-0.5 rounded-full inline-block max-w-full truncate">
              {item.key_phrases[0]}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="w-[168px] shrink-0 py-3 pr-4 flex items-center justify-end gap-2">
          <Link
            href={`/companies/${item.ticker}`}
            onClick={e => e.stopPropagation()}
            title="Full company page — history, charts, all calls"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-800 bg-transparent hover:bg-slate-100 border border-slate-200 hover:border-slate-300 transition-colors shrink-0"
          >
            <ChartIcon />
            Company
          </Link>
          <button
            onClick={openInspect}
            title="Quick inspect — returns, drift chart, deep analysis"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 transition-colors shrink-0"
          >
            <SparkleIcon />
            Inspect
          </button>
          {isLoggedIn && (
            <button
              onClick={handleBookmark}
              disabled={saving}
              aria-label={saved ? 'Remove from portfolio' : 'Add to portfolio'}
              className={clsx(
                'shrink-0 transition-all disabled:opacity-30',
                'opacity-0 group-hover:opacity-100',
                saved ? 'text-blue-700' : 'text-slate-400 hover:text-slate-700',
              )}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={saved ? 0 : 1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {overlayOpen && (
        <SearchOverlay item={item} onClose={() => setOverlayOpen(false)} />
      )}
    </>
  );
}
