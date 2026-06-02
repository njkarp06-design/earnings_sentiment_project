'use client';
import { useEffect, useRef, useState } from 'react';
import { getFeed, getFeedSince } from '@/lib/api';
import { usePortfolio } from '@/context/PortfolioContext';
import FeedCard from '@/components/FeedCard';
import SearchBar from '@/components/SearchBar';
import SearchOverlay from '@/components/SearchOverlay';
import PulseBar from '@/components/PulseBar';

// ── Section helpers ───────────────────────────────────────────────────────────

function getSectionKey(callDate) {
  if (!callDate) return 'earlier';
  const today   = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (callDate >= today)    return 'live';
  if (callDate >= weekAgo)  return 'week';
  return 'earlier';
}

function SectionHeader({ label, count, isLive = false }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="flex items-center gap-2 shrink-0">
        {isLive && (
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        )}
        <span className={`text-[11px] font-semibold uppercase tracking-widest ${
          isLive ? 'text-emerald-400' : 'text-slate-400'
        }`}>
          {label}
        </span>
        <span className="text-[11px] text-slate-600 font-medium tabular-nums">
          {count} {count === 1 ? 'report' : 'reports'}
        </span>
      </div>
      <div className="flex-1 h-px bg-slate-700/50" />
    </div>
  );
}

function CardGrid({ items, onOverlay }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <FeedCard
          key={item.filing_id ?? `${item.ticker}-${item.call_date}`}
          item={item}
        />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { watchlist, isLoggedIn } = usePortfolio();
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [overlayItem, setOverlayItem] = useState(null);
  const [filter, setFilter]         = useState('all'); // 'all' | 'portfolio'
  const lastFetchRef = useRef(null);

  // Tick every 60 s — keeps section boundaries (Live / This Week / Earlier) current
  // even when no new feed items arrive, so cards cross date thresholds automatically.
  const [, setTick] = useState(0);
  const pollCountRef = useRef(0);

  useEffect(() => {
    getFeed()
      .then(data => { setItems(data); lastFetchRef.current = new Date().toISOString(); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      // Force a re-render so getSectionKey() uses the current date on every tick.
      setTick(t => t + 1);

      pollCountRef.current += 1;
      const isFull = pollCountRef.current % 5 === 0; // full refresh every 5 min

      const fetcher = isFull
        ? getFeed()                                         // replaces all items (picks up backfilled returns)
        : (lastFetchRef.current ? getFeedSince(lastFetchRef.current) : getFeed());

      fetcher
        .then(fresh => {
          lastFetchRef.current = new Date().toISOString();
          if (isFull) {
            setItems(fresh);
          } else if (fresh.length > 0) {
            setItems(prev => {
              const existingIds = new Set(prev.map(i => i.filing_id));
              const newItems = fresh.filter(i => !existingIds.has(i.filing_id));
              return newItems.length > 0 ? [...newItems, ...prev] : prev;
            });
          }
        })
        .catch(() => {});
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) setFilter('all');
  }, [isLoggedIn]);

  const displayed = filter === 'portfolio'
    ? items.filter(i => watchlist.includes(i.ticker))
    : items;

  // Bucket items into sections by call_date
  const liveItems    = displayed.filter(i => getSectionKey(i.call_date) === 'live');
  const weekItems    = displayed.filter(i => getSectionKey(i.call_date) === 'week');
  const earlierItems = displayed.filter(i => getSectionKey(i.call_date) === 'earlier');

  const hasSections = liveItems.length + weekItems.length + earlierItems.length > 0;

  return (
    <div>
      {/* ── Page header ───────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Earnings Feed</h1>
        <p className="text-slate-400 mt-1 text-sm">
          CEO confidence scores and post-call stock reactions
        </p>
      </div>

      <PulseBar />

      <div className="mb-8">
        <SearchBar onResult={setOverlayItem} />
      </div>

      {/* ── Portfolio filter toggle ───────────────────────────── */}
      {isLoggedIn && (
        <div className="flex items-center gap-1 mb-6 bg-slate-800 border border-slate-700 rounded-lg p-1 w-fit">
          {['all', 'portfolio'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f === 'all' ? 'All' : 'My Portfolio'}
            </button>
          ))}
        </div>
      )}

      {/* ── Loading skeleton ──────────────────────────────────── */}
      {loading && <SkeletonGrid />}

      {/* ── Error state ───────────────────────────────────────── */}
      {error && (
        <div className="text-center py-16">
          <p className="text-slate-400">Could not load feed</p>
          <p className="text-red-400 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────── */}
      {!loading && !error && !hasSections && (
        <div className="text-center py-20 text-slate-500">
          {filter === 'portfolio' ? (
            <>
              <p className="text-lg mb-1">No portfolio companies in the feed yet</p>
              <p className="text-sm">Your saved companies will appear here when they report.</p>
            </>
          ) : (
            <>
              <p className="text-lg mb-1">No earnings calls yet</p>
              <p className="text-sm">The ingestor will populate this feed automatically.</p>
            </>
          )}
        </div>
      )}

      {/* ── Sectioned feed ────────────────────────────────────── */}
      {!loading && !error && hasSections && (
        <div className="space-y-10">

          {liveItems.length > 0 && (
            <section aria-label="Live earnings reports">
              <SectionHeader label="Live" count={liveItems.length} isLive />
              <CardGrid items={liveItems} />
            </section>
          )}

          {weekItems.length > 0 && (
            <section aria-label="This week's earnings reports">
              <SectionHeader label="This Week" count={weekItems.length} />
              <CardGrid items={weekItems} />
            </section>
          )}

          {earlierItems.length > 0 && (
            <section aria-label="Earlier earnings reports">
              <SectionHeader label="Earlier" count={earlierItems.length} />
              <CardGrid items={earlierItems} />
            </section>
          )}

        </div>
      )}

      {overlayItem && (
        <SearchOverlay item={overlayItem} onClose={() => setOverlayItem(null)} />
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-5 animate-pulse space-y-3">
          <div className="h-4 bg-slate-700 rounded w-1/3" />
          <div className="h-2 bg-slate-700 rounded w-full" />
          <div className="h-2 bg-slate-700 rounded w-2/3" />
          <div className="h-8 bg-slate-700 rounded w-full" />
        </div>
      ))}
    </div>
  );
}
