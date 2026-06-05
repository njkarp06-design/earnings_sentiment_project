'use client';
import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import ScoreBar from './ScoreBar';
import ReturnBadge from './ReturnBadge';
import MiniSparkline from './MiniSparkline';
import SearchOverlay from './SearchOverlay';
import { usePortfolio } from '@/context/PortfolioContext';

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function accentBorder(score) {
  if (score >= 70) return 'border-t-emerald-500/80';
  if (score >= 45) return 'border-t-amber-500/80';
  return 'border-t-red-500/80';
}

function BookmarkIcon({ filled }) {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 20 20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

function isLive(callDateStr) {
  if (!callDateStr) return false;
  return Date.now() - new Date(callDateStr + 'T12:00:00').getTime() < 24 * 60 * 60 * 1000;
}

function fmtCallDateRelative(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const callDay = new Date(dateStr + 'T12:00:00');
  const diffDays = Math.round((today - callDay) / 86_400_000);
  if (diffDays <= 0)  return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)   return `${diffDays}d ago`;
  return null;
}

function TimeLabel({ live, callDate }) {
  const relative = fmtCallDateRelative(callDate);
  if (live) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Live
      </span>
    );
  }
  if (relative) {
    return <span className="text-slate-600 text-[11px] font-mono">{relative}</span>;
  }
  return <span className="text-slate-700 text-[11px]">{fmtDate(callDate)}</span>;
}

function estimateNextCall(callDateStr) {
  const d = new Date(callDateStr + 'T12:00:00');
  d.setDate(d.getDate() + 91);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FeedCard({ item, showNextCall = false }) {
  const { watchlist, add, remove, isLoggedIn } = usePortfolio();
  const [saving, setSaving]           = useState(false);
  const [bookmarkError, setBookmarkError] = useState(null);
  const [overlayOpen, setOverlayOpen] = useState(false);

  const saved      = watchlist.includes(item.ticker);
  const isPositive = item.return_7d != null ? item.return_7d >= 0 : null;
  const live       = isLive(item.call_date);

  const handleBookmark = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSaving(true);
    setBookmarkError(null);
    try {
      if (saved) await remove(item.ticker);
      else await add(item.ticker);
    } catch (err) {
      setBookmarkError(err.message || 'Failed');
      setTimeout(() => setBookmarkError(null), 6000);
    } finally {
      setSaving(false);
    }
  };

  const handleCardClick = (e) => {
    if (e.target.closest('a, button')) return;
    setOverlayOpen(true);
  };

  return (
    <>
      <div
        onClick={handleCardClick}
        className={clsx(
          'bg-slate-900 border border-slate-800 border-t-[3px] rounded-xl overflow-hidden',
          'flex flex-col cursor-pointer',
          'hover:border-slate-700 hover:shadow-card-hover transition-all duration-200',
          accentBorder(item.confidence_score),
        )}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-2 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <Link
              href={`/companies/${item.ticker}`}
              onClick={(e) => e.stopPropagation()}
              className="font-mono font-bold text-cyan-400 hover:text-cyan-300 transition-colors tracking-tight"
            >
              {item.ticker}
            </Link>
            {item.company_name && (
              <span className="ml-2 text-slate-500 text-xs truncate">{item.company_name}</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            <TimeLabel live={live} callDate={item.call_date} />
            {isLoggedIn && (
              <div className="flex flex-col items-end gap-0.5">
                <button
                  onClick={handleBookmark}
                  disabled={saving}
                  aria-label={saved ? 'Remove from portfolio' : 'Add to portfolio'}
                  className={clsx(
                    'transition-colors disabled:opacity-50',
                    saved ? 'text-cyan-400 hover:text-cyan-300' : 'text-slate-700 hover:text-slate-400',
                  )}
                >
                  <BookmarkIcon filled={saved} />
                </button>
                {bookmarkError && (
                  <span className="text-xs text-red-400 leading-none max-w-[120px] text-right">{bookmarkError}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 7-day price sparkline ────────────────────────────── */}
        {item.price_series?.filter(p => p.pct != null).length >= 3 && (
          <div className="px-2 pb-1">
            <MiniSparkline data={item.price_series} positive={isPositive} height={64} />
          </div>
        )}

        {/* ── Post-call returns ────────────────────────────────── */}
        <div className="flex gap-6 px-5 py-3 border-t border-slate-800/60">
          <ReturnBadge value={item.return_1d} label="1d" pending={item.pending} />
          <ReturnBadge value={item.return_3d} label="3d" pending={item.pending} />
          <ReturnBadge value={item.return_7d} label="7d" pending={item.pending} />
        </div>

        {/* ── Historical context ──────────────────────────────── */}
        {(item.hist_avg_7d != null || item.hist_win_rate != null) && (
          <div className="flex items-center gap-3 px-5 py-2.5 border-t border-slate-800/40">
            <span className="text-[10px] text-slate-600 uppercase tracking-widest shrink-0">Hist avg</span>
            {item.hist_avg_7d != null && (
              <span className={`text-xs font-mono font-semibold tabular-nums ${
                item.hist_avg_7d >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {item.hist_avg_7d >= 0 ? '+' : ''}{item.hist_avg_7d.toFixed(1)}%
              </span>
            )}
            {item.hist_avg_7d != null && item.hist_win_rate != null && (
              <span className="text-slate-700">·</span>
            )}
            {item.hist_win_rate != null && (
              <span className={`text-xs font-mono tabular-nums ${
                item.hist_win_rate >= 0.5 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {Math.round(item.hist_win_rate * 100)}% win
              </span>
            )}
            {item.hist_call_count > 0 && (
              <span className="text-[10px] text-slate-700 font-mono ml-auto">
                {item.hist_call_count} call{item.hist_call_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* ── CEO confidence + key phrases ─────────────────────── */}
        <div className="flex flex-col gap-3 px-5 pt-3 pb-3 border-t border-slate-800/60">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-600 mb-2 uppercase tracking-widest">
              CEO Confidence
              {item.trend === 'up'   && <span className="text-emerald-400 normal-case tracking-normal text-xs">↑</span>}
              {item.trend === 'down' && <span className="text-red-400 normal-case tracking-normal text-xs">↓</span>}
            </div>
            <ScoreBar score={item.confidence_score} />
          </div>

          {item.key_phrases?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.key_phrases.slice(0, 3).map((phrase, i) => (
                <span
                  key={i}
                  className="text-[10px] bg-slate-800 border border-slate-700/50 text-slate-400 px-2.5 py-0.5 rounded-full"
                >
                  {phrase}
                </span>
              ))}
            </div>
          )}

          {showNextCall && item.call_date && (
            <p className="text-[10px] text-slate-700 font-mono">
              ~Next: {estimateNextCall(item.call_date)}
            </p>
          )}
        </div>

        {/* ── Inspect footer hint ──────────────────────────────── */}
        <div className="flex items-center gap-1.5 px-5 py-2.5 border-t border-slate-800/40 text-slate-700 hover:text-cyan-400/60 transition-colors">
          <SparkleIcon />
          <span className="text-[10px] uppercase tracking-widest font-medium">Inspect</span>
        </div>
      </div>

      {overlayOpen && (
        <SearchOverlay item={item} onClose={() => setOverlayOpen(false)} />
      )}
    </>
  );
}
