'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import ScoreBar from './ScoreBar';
import ReturnBadge from './ReturnBadge';
import MiniSparkline from './MiniSparkline';
import InspectModal from './InspectModal';
import PostEarningsProfile from './PostEarningsProfile';
import { usePortfolio } from '@/context/PortfolioContext';
import { triggerIngest, getCompanyLatest, getCompanyHistory } from '@/lib/api';

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
  if (!hasData) return 'border-t-slate-700';
  if (score >= 70) return 'border-t-emerald-500/80';
  if (score >= 45) return 'border-t-amber-500/80';
  return 'border-t-red-500/80';
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

  const [fetchedItem, setFetchedItem] = useState(null);
  const [fetchState, setFetchState] = useState('idle');
  const pollCancelledRef = useRef(false);
  useEffect(() => () => { pollCancelledRef.current = true; }, []);

  const [history, setHistory]               = useState([]);
  const [buildingHistory, setBuildingHistory] = useState(false);
  const historyPollRef                        = useRef(null);

  // Auto-fetch latest call when overlay is opened from a lean item
  // (e.g. leaderboard / sectors row) that has no single-call data.
  useEffect(() => {
    if (!item.ticker) return;
    if (item.price_series || item.return_1d != null || item.call_date) return;
    getCompanyLatest(item.ticker)
      .then(data => { if (data?.confidence_score != null) setFetchedItem({ ...data, has_data: true }); })
      .catch(() => {});
  }, [item.ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!item.ticker) return;

    getCompanyHistory(item.ticker).then(data => {
      const calls = Array.isArray(data) ? data : [];
      setHistory(calls);

      // Trigger backfill for logged-in users — is_processed makes it a no-op
      // for fully enriched companies, cheap for all others.
      if (isLoggedIn) triggerIngest(item.ticker).catch(() => {});

      if (calls.length === 0) {
        setBuildingHistory(true);
        let elapsed = 0;
        historyPollRef.current = setInterval(async () => {
          elapsed += 10;
          if (elapsed >= 60) {
            clearInterval(historyPollRef.current);
            setBuildingHistory(false);
            return;
          }
          try {
            const updated = await getCompanyHistory(item.ticker);
            if (Array.isArray(updated)) {
              setHistory(updated);
              if (updated.length >= 1) {
                clearInterval(historyPollRef.current);
                setBuildingHistory(false);
              }
            }
          } catch {}
        }, 10_000);
      }
    }).catch(() => setHistory([]));

    return () => { if (historyPollRef.current) clearInterval(historyPollRef.current); };
  }, [item.ticker, isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const saved      = watchlist.includes(item.ticker);
  const activeItem = fetchedItem ?? item;
  const hasData    = !!(activeItem.has_data ?? (activeItem.confidence_score != null));
  const isPositive = activeItem.return_7d != null ? activeItem.return_7d >= 0 : null;

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const isPending = activeItem.call_date
    ? Date.now() - new Date(activeItem.call_date + 'T12:00:00').getTime() < SEVEN_DAYS_MS
    : false;

  const handleFetch = async () => {
    pollCancelledRef.current = false;
    setFetchState('loading');
    try {
      await triggerIngest(item.ticker);
    } catch {
      // keep polling anyway
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

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !inspecting) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, inspecting]);

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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080d1a]/85 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* Panel */}
        <div
          className={clsx(
            'w-full max-w-2xl bg-slate-900 border border-slate-800 border-t-[3px] rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.7)]',
            'max-h-[90vh] overflow-y-auto',
            accentBorder(activeItem.confidence_score, hasData),
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold font-mono text-slate-100 tracking-tight">
                  {activeItem.ticker}
                </span>
                {activeItem.model_used && (
                  <span className="text-[10px] text-slate-600 bg-slate-800 border border-slate-700/50 px-2 py-0.5 rounded-full shrink-0">
                    {activeItem.model_used.replace('claude-', '')}
                  </span>
                )}
              </div>
              {activeItem.company_name && (
                <p className="text-slate-400 text-sm mt-0.5">{activeItem.company_name}</p>
              )}
              <p className="text-slate-600 text-xs mt-1">{fmtDate(activeItem.call_date)}</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-600 hover:text-slate-300 transition-colors shrink-0 mt-0.5"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>

          {hasData ? (
            <>
              {/* ── Sparkline ────────────────────────────────────────── */}
              {activeItem.price_series?.filter(p => p.pct != null).length >= 3 && (
                <div className="px-3 pb-2">
                  <MiniSparkline data={activeItem.price_series} positive={isPositive} height={100} />
                </div>
              )}

              {/* ── Returns ──────────────────────────────────────────── */}
              <div className="flex gap-8 px-6 py-4 border-t border-slate-800/60">
                <ReturnBadge value={activeItem.return_1d} label="1d" pending={isPending} />
                <ReturnBadge value={activeItem.return_3d} label="3d" pending={isPending} />
                <ReturnBadge value={activeItem.return_7d} label="7d" pending={isPending} />
                {activeItem.call_date_close != null && (
                  <div className="text-center ml-auto">
                    <div className="text-sm font-semibold font-mono text-slate-300 tabular-nums">
                      ${Number(activeItem.call_date_close).toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider">Close</div>
                  </div>
                )}
              </div>

              {/* ── Post-earnings drift chart ────────────────────────── */}
              {history.length >= 1 ? (
                <div className="px-4 pt-2 pb-2">
                  <PostEarningsProfile calls={history} showCurrentStats={false} />
                </div>
              ) : buildingHistory ? (
                <div className="flex items-start gap-3 px-6 py-4 border-t border-slate-800/60">
                  <div className="w-4 h-4 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Building call history</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Fetching historical earnings calls for {item.ticker} — the drift chart will appear here once enough data has been processed.
                    </p>
                  </div>
                </div>
              ) : null}

              {/* ── CEO Confidence + Key Phrases ─────────────────────── */}
              <div className="flex flex-col gap-3 px-6 py-4 border-t border-slate-800/60">
                <div>
                  <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">CEO Confidence</div>
                  <ScoreBar score={activeItem.confidence_score} />
                </div>
                {activeItem.key_phrases?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeItem.key_phrases.map((phrase, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-slate-800 border border-slate-700/50 text-slate-400 px-2.5 py-0.5 rounded-full"
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
            <div className="px-6 py-6 border-t border-slate-800/60">
              {fetchState === 'loading' ? (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Fetching from SEC EDGAR…</p>
                    <p className="text-xs text-slate-500 mt-0.5">This usually takes 30–60 seconds</p>
                  </div>
                </div>
              ) : fetchState === 'not_found' ? (
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">No recent earnings calls found</p>
                    <p className="text-xs text-slate-500 mt-1">
                      No transcript was found on SEC EDGAR or FMP for {item.ticker} in the last 30 days.
                      {isLoggedIn && ' Add it to your portfolio and it will be monitored automatically.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">No earnings data yet</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {item.ticker} is in our universe but hasn&apos;t been scored yet.
                    </p>
                    {item.sector && (
                      <span className="inline-block mt-2 text-[10px] bg-slate-800 border border-slate-700/50 text-slate-500 px-2.5 py-0.5 rounded-full">
                        {item.sector}
                      </span>
                    )}
                    {isLoggedIn && (
                      <button
                        onClick={handleFetch}
                        className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-900 transition-colors"
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
          <div className="flex flex-col gap-2 px-6 py-4 border-t border-slate-800/60 bg-slate-900/60">
            <div className="flex items-center justify-between gap-3">
              <div />

              <div className="flex items-center gap-2">
                {hasData && (
                  <button
                    onClick={() => setInspecting(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors"
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
                        ? 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold',
                    )}
                  >
                    <BookmarkIcon filled={saved} />
                    {saving ? '…' : saved ? 'Saved' : 'Add to Portfolio'}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={onClose}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700/50 text-slate-400 hover:bg-slate-700 transition-colors"
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
