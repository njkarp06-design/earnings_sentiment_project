'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import ScoreBar from './ScoreBar';
import ReturnBadge from './ReturnBadge';
import MiniSparkline from './MiniSparkline';
import InspectModal from './InspectModal';
import { usePortfolio } from '@/context/PortfolioContext';

function SparkleIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function accentBorder(item) {
  if (!item.has_data) return 'border-t-slate-600';
  const score = item.confidence_score;
  if (score >= 70) return 'border-t-emerald-500/70';
  if (score >= 45) return 'border-t-amber-500/70';
  return 'border-t-red-500/70';
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function BookmarkIcon({ filled }) {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
    </svg>
  );
}

export default function SearchOverlay({ item, onClose }) {
  const { watchlist, add, remove, isLoggedIn } = usePortfolio();
  const [saving, setSaving] = useState(false);
  const [portfolioError, setPortfolioError] = useState(null);
  const [inspecting, setInspecting] = useState(false);

  const saved      = watchlist.includes(item.ticker);
  const hasData    = !!item.has_data;
  const isPositive = item.return_7d != null ? item.return_7d >= 0 : null;

  // ESC key to close — skip when InspectModal is layered on top
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !inspecting) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, inspecting]);

  // Prevent body scroll while overlay is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handlePortfolioToggle = async () => {
    setSaving(true);
    setPortfolioError(null);
    try {
      if (saved) await remove(item.ticker);
      else await add(item.ticker);
    } catch (err) {
      setPortfolioError(err.message || 'Failed — try signing in again');
      setTimeout(() => setPortfolioError(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    {/* Backdrop — click outside to close */}
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Panel — stop clicks propagating to backdrop */}
      <div
        className={clsx(
          'w-full max-w-lg bg-slate-800 border border-slate-700 border-t-[3px] rounded-2xl overflow-hidden shadow-2xl',
          accentBorder(item),
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-slate-100">{item.ticker}</span>
              {item.model_used && (
                <span className="text-[10px] text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full shrink-0">
                  {item.model_used.replace('claude-', '')}
                </span>
              )}
            </div>
            {item.company_name && (
              <p className="text-slate-400 text-sm mt-0.5">{item.company_name}</p>
            )}
            <p className="text-slate-500 text-xs mt-1">{fmtDate(item.call_date)}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 mt-0.5"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {hasData ? (
          <>
            {/* ── Sparkline ────────────────────────────────────────── */}
            {item.price_series?.length > 0 && (
              <div className="px-3 pb-2">
                <MiniSparkline data={item.price_series} positive={isPositive} height={100} />
              </div>
            )}

            {/* ── Returns ──────────────────────────────────────────── */}
            <div className="flex gap-8 px-6 py-4 border-t border-slate-700/50">
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

            {/* ── CEO Confidence + Key Phrases ─────────────────────── */}
            <div className="flex flex-col gap-3 px-6 py-4 border-t border-slate-700/50">
              <div>
                <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1.5">CEO Confidence</div>
                <ScoreBar score={item.confidence_score} />
              </div>
              {item.key_phrases?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.key_phrases.map((phrase, i) => (
                    <span
                      key={i}
                      className="text-[11px] bg-slate-700/80 text-slate-300 px-2.5 py-0.5 rounded-full"
                    >
                      {phrase}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── No earnings data yet ──────────────────────────────── */
          <div className="px-6 py-6 border-t border-slate-700/50">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">No earnings data yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  {item.ticker} is in our universe and will appear in the feed automatically
                  once an earnings filing is detected and scored.
                  {isLoggedIn && ' Save it to your portfolio to get notified first.'}
                </p>
                {item.sector && (
                  <span className="inline-block mt-2 text-[11px] bg-slate-700 text-slate-400 px-2.5 py-0.5 rounded-full">
                    {item.sector}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer CTAs ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 px-6 py-4 border-t border-slate-700/50 bg-slate-800/60">
          <div className="flex items-center justify-between gap-3">
            <Link
              href={`/companies/${item.ticker}`}
              onClick={onClose}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
            >
              {hasData ? 'View full history →' : 'View company page →'}
            </Link>

            <div className="flex items-center gap-2">
              {hasData && (
                <button
                  onClick={() => setInspecting(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                >
                  <SparkleIcon />
                  Deep Analysis
                </button>
              )}

              {isLoggedIn ? (
                <button
                  onClick={handlePortfolioToggle}
                  disabled={saving}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50',
                    saved
                      ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
                      : 'bg-blue-600 hover:bg-blue-500 text-white',
                  )}
                >
                  <BookmarkIcon filled={saved} />
                  {saving ? '…' : saved ? 'Saved' : 'Add to Portfolio'}
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={onClose}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                >
                  <BookmarkIcon filled={false} />
                  Sign in to save
                </Link>
              )}
            </div>
          </div>
          {portfolioError && (
            <p className="text-xs text-red-400 text-right">{portfolioError}</p>
          )}
        </div>
      </div>
    </div>

    {hasData && inspecting && (
      <InspectModal item={item} onClose={() => setInspecting(false)} />
    )}
    </>
  );
}
