'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import ScoreBar from './ScoreBar';
import ReturnBadge from './ReturnBadge';
import MiniSparkline from './MiniSparkline';
import InspectModal from './InspectModal';
import { usePortfolio } from '@/context/PortfolioContext';
import { triggerIngest, getCompanyLatest } from '@/lib/api';

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

function accentBorder(score, hasData) {
  if (!hasData) return 'border-t-slate-600';
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

  // On-demand fetch state
  const [fetchedItem, setFetchedItem] = useState(null);
  // 'idle' | 'loading' | 'done' | 'not_found'
  const [fetchState, setFetchState] = useState('idle');
  // Cancellation flag — set to true on unmount so in-flight polling stops
  const pollCancelledRef = useRef(false);
  useEffect(() => () => { pollCancelledRef.current = true; }, []);

  const saved      = watchlist.includes(item.ticker);
  const activeItem = fetchedItem ?? item;
  const hasData    = !!activeItem.has_data;
  const isPositive = activeItem.return_7d != null ? activeItem.return_7d >= 0 : null;

  // On-demand ingest: trigger + poll every 5 s for up to 90 s.
  // Uses pollCancelledRef so the recursive setTimeout stops cleanly if the
  // overlay is closed before data arrives (prevents setState on unmounted component).
  const handleFetch = async () => {
    pollCancelledRef.current = false;
    setFetchState('loading');
    try {
      await triggerIngest(item.ticker);
    } catch {
      // Ingestor unavailable or not authed — keep polling anyway in case
      // a previous trigger is already running.
    }

    const POLL_INTERVAL = 5_000;
    const TIMEOUT = 90_000;
    const start = Date.now();

    const poll = async () => {
      if (pollCancelledRef.current) return;
      if (Date.now() - start > TIMEOUT) {
        setFetchState('not_found');
        return;
      }
      try {
        const data = await getCompanyLatest(item.ticker);
        if (data && data.confidence_score != null) {
          setFetchedItem({ ...data, has_data: true });
          setFetchState('done');
          return;
        }
      } catch {
        // 404 = not ready yet, keep polling
      }
      setTimeout(poll, POLL_INTERVAL);
    };

    setTimeout(poll, POLL_INTERVAL);
  };

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
          accentBorder(activeItem.confidence_score, hasData),
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-slate-100">{activeItem.ticker}</span>
              {activeItem.model_used && (
                <span className="text-[10px] text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full shrink-0">
                  {activeItem.model_used.replace('claude-', '')}
                </span>
              )}
            </div>
            {activeItem.company_name && (
              <p className="text-slate-400 text-sm mt-0.5">{activeItem.company_name}</p>
            )}
            <p className="text-slate-500 text-xs mt-1">{fmtDate(activeItem.call_date)}</p>
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
            {activeItem.price_series?.length > 0 && (
              <div className="px-3 pb-2">
                <MiniSparkline data={activeItem.price_series} positive={isPositive} height={100} />
              </div>
            )}

            {/* ── Returns ──────────────────────────────────────────── */}
            <div className="flex gap-8 px-6 py-4 border-t border-slate-700/50">
              <ReturnBadge value={activeItem.return_1d} label="1-day" />
              <ReturnBadge value={activeItem.return_3d} label="3-day" />
              <ReturnBadge value={activeItem.return_7d} label="7-day" />
              {activeItem.call_date_close != null && (
                <div className="text-center ml-auto">
                  <div className="text-xs font-semibold text-slate-300 tabular-nums">
                    ${Number(activeItem.call_date_close).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Close</div>
                </div>
              )}
            </div>

            {/* ── CEO Confidence + Key Phrases ─────────────────────── */}
            <div className="flex flex-col gap-3 px-6 py-4 border-t border-slate-700/50">
              <div>
                <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1.5">CEO Confidence</div>
                <ScoreBar score={activeItem.confidence_score} />
              </div>
              {activeItem.key_phrases?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {activeItem.key_phrases.map((phrase, i) => (
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
            {fetchState === 'loading' ? (
              /* Fetching */
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-200">Fetching from SEC EDGAR…</p>
                  <p className="text-xs text-slate-500 mt-0.5">This usually takes 30–60 seconds</p>
                </div>
              </div>
            ) : fetchState === 'not_found' ? (
              /* Nothing found after timeout */
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">No recent earnings calls found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    No earnings call transcript was found on SEC EDGAR or FMP for {item.ticker} in the last {30} days.
                    {isLoggedIn && ' Add it to your portfolio and it will be monitored automatically going forward.'}
                  </p>
                </div>
              </div>
            ) : (
              /* Idle — show fetch prompt */
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-200">No earnings data yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {item.ticker} is in our universe but hasn&apos;t been scored yet.
                  </p>
                  {item.sector && (
                    <span className="inline-block mt-2 text-[11px] bg-slate-700 text-slate-400 px-2.5 py-0.5 rounded-full">
                      {item.sector}
                    </span>
                  )}
                  {isLoggedIn && (
                    <button
                      onClick={handleFetch}
                      className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Fetch latest earnings
                    </button>
                  )}
                </div>
              </div>
            )}
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
      <InspectModal item={activeItem} onClose={() => setInspecting(false)} />
    )}
    </>
  );
}
