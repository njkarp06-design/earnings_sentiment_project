'use client';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { getFeed, getFeedSince } from '@/lib/api';
import { usePortfolio } from '@/context/PortfolioContext';
import FeedRow from '@/components/FeedRow';
import LiveDot from '@/components/LiveDot';
import SearchBar from '@/components/SearchBar';
import SearchOverlay from '@/components/SearchOverlay';
import PulseBar from '@/components/PulseBar';

function getSectionKey(callDate) {
  if (!callDate) return 'earlier';
  const callMs  = new Date(callDate + 'T12:00:00').getTime();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (Date.now() - callMs < 24 * 60 * 60 * 1000) return 'live';
  if (callDate >= weekAgo) return 'week';
  return 'earlier';
}

function FeedList({ items }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center border-b border-slate-200 bg-slate-50">
        <div className="w-7 shrink-0" />
        <div className="w-36 shrink-0 py-2.5 pr-3">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">Company</span>
        </div>
        <div className="w-[88px] shrink-0 py-2.5 text-center">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">7d chart</span>
        </div>
        <div className="w-28 shrink-0 py-2.5 px-3">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">CEO Confidence</span>
        </div>
        <div className="flex shrink-0">
          {['1d', '3d', '7d'].map(label => (
            <div key={label} className="w-[70px] py-2.5 text-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest">{label}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 hidden xl:block" />
        <div className="w-[168px] shrink-0 py-2.5 pr-4 flex items-center justify-end">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">Actions</span>
        </div>
      </div>
      {items.map((item, i) => (
        <FeedRow
          key={item.filing_id ?? `${item.ticker}-${item.call_date}`}
          item={item}
          index={i}
        />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { watchlist, isLoggedIn } = usePortfolio();
  const [items, setItems]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [overlayItem, setOverlayItem] = useState(null);
  const [filter, setFilter]           = useState('all');
  const [timeFilter, setTimeFilter]   = useState('earlier');
  const initializedRef = useRef(false);
  const lastFetchRef   = useRef(null);
  const [, setTick]    = useState(0);
  const pollCountRef   = useRef(0);

  useEffect(() => {
    // Stamp the cursor with the time the request was *sent*, not when the
    // response lands, so items created mid-flight aren't skipped next poll.
    const initialReqTime = new Date().toISOString();
    getFeed()
      .then(data => { setItems(data); lastFetchRef.current = initialReqTime; })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      setTick(t => t + 1);
      pollCountRef.current += 1;
      const isFull = pollCountRef.current % 5 === 0;
      const reqTime = new Date().toISOString();
      const fetcher = isFull
        ? getFeed()
        : (lastFetchRef.current ? getFeedSince(lastFetchRef.current) : getFeed());

      fetcher
        .then(fresh => {
          lastFetchRef.current = reqTime;
          if (isFull) {
            setItems(fresh);
          } else if (fresh.length > 0) {
            setItems(prev => {
              const existingIds = new Set(prev.map(i => i.filing_id ?? `${i.ticker}-${i.call_date}`));
              const newItems = fresh.filter(i => !existingIds.has(i.filing_id ?? `${i.ticker}-${i.call_date}`));
              return newItems.length > 0 ? [...newItems, ...prev] : prev;
            });
          }
        })
        .catch(() => {});
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  // Auto-select the most relevant tab once data arrives
  useEffect(() => {
    if (loading || initializedRef.current || items.length === 0) return;
    initializedRef.current = true;
    const hasLive = items.some(i => getSectionKey(i.call_date) === 'live');
    const hasWeek = items.some(i => getSectionKey(i.call_date) === 'week');
    if (hasLive) setTimeFilter('live');
    else if (hasWeek) setTimeFilter('week');
    // else stay on 'earlier'
  }, [loading, items]);

  useEffect(() => {
    if (!isLoggedIn) setFilter('all');
  }, [isLoggedIn]);

  const displayed = filter === 'portfolio'
    ? items.filter(i => watchlist.includes(i.ticker))
    : items;

  const liveItems    = displayed.filter(i => getSectionKey(i.call_date) === 'live');
  const weekItems    = displayed.filter(i => getSectionKey(i.call_date) === 'week');
  const earlierItems = displayed.filter(i => getSectionKey(i.call_date) === 'earlier');

  const activeItems =
    timeFilter === 'live' ? liveItems :
    timeFilter === 'week' ? weekItems :
    earlierItems;

  const tabs = [
    { key: 'live',    label: 'Live',      count: liveItems.length,    dot: true  },
    { key: 'week',    label: 'This Week', count: weekItems.length,    dot: false },
    { key: 'earlier', label: 'Earlier',   count: earlierItems.length, dot: false },
  ];

  const emptyMsg = {
    live: {
      primary:   filter === 'portfolio' ? 'No portfolio companies reporting live'    : 'No live reports right now',
      secondary: 'Companies appear here within 24 hours of an earnings call.',
    },
    week: {
      primary:   filter === 'portfolio' ? 'No portfolio companies reported this week' : 'Nothing reported this week',
      secondary: 'Earnings calls from the last 7 days appear here.',
    },
    earlier: {
      primary:   filter === 'portfolio' ? 'No earlier portfolio reports'              : 'No earnings calls yet',
      secondary: filter === 'portfolio'
        ? 'Your saved companies will appear here once they have historical data.'
        : 'The ingestor will populate this feed automatically.',
    },
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Earnings Feed</h1>
        <p className="text-slate-500 mt-1 text-sm">
          CEO confidence scores and post-call stock reactions
        </p>
      </div>

      <PulseBar />

      <div className="mb-8">
        <SearchBar onResult={setOverlayItem} />
      </div>

      {/* ── Filter row: portfolio toggle (left) + time tabs (right) ── */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">

        {isLoggedIn ? (
          <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1">
            {['all', 'portfolio'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  'px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  filter === f
                    ? 'bg-blue-700 text-white font-semibold shadow-sm'
                    : 'text-slate-500 hover:text-slate-900',
                )}
              >
                {f === 'all' ? 'All' : 'My Portfolio'}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1">
          {tabs.map(({ key, label, count, dot }) => {
            const isActive = timeFilter === key;
            const isEmpty  = count === 0;
            return (
              <button
                key={key}
                onClick={() => setTimeFilter(key)}
                className={clsx(
                  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-700 text-white font-semibold shadow-sm'
                    : isEmpty
                      ? 'text-slate-400'
                      : 'text-slate-500 hover:text-slate-900',
                )}
              >
                {dot && (
                  <LiveDot
                    color={isActive ? 'bg-white/80' : !isEmpty ? 'bg-emerald-500' : 'bg-slate-300'}
                    ping={!isEmpty}
                  />
                )}
                {label}
                <span className={clsx(
                  'text-[10px] font-mono tabular-nums leading-none',
                  isActive ? 'text-white/60' : 'text-slate-400',
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && <SkeletonGrid />}

      {/* ── Error ── */}
      {error && (
        <div className="text-center py-16">
          <p className="text-slate-500">Could not load feed</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* ── Feed or empty ── */}
      {!loading && !error && (
        activeItems.length > 0 ? (
          <FeedList items={activeItems} />
        ) : (
          <div className="text-center py-20">
            <p className="text-sm font-medium text-slate-700 mb-1">{emptyMsg[timeFilter].primary}</p>
            <p className="text-sm text-slate-500">{emptyMsg[timeFilter].secondary}</p>
          </div>
        )
      )}

      {overlayItem && (
        <SearchOverlay item={overlayItem} onClose={() => setOverlayItem(null)} />
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm animate-pulse">
      <div className="h-9 bg-slate-50 border-b border-slate-200" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center border-b border-slate-200 last:border-b-0 border-l-[3px] border-l-slate-200">
          <div className="w-7 shrink-0" />
          <div className="w-36 shrink-0 py-3 pr-3 space-y-1.5">
            <div className="h-3 bg-slate-200 rounded w-14" />
            <div className="h-2 bg-slate-100 rounded w-24" />
          </div>
          <div className="w-[88px] shrink-0 py-1 px-1">
            <div className="h-[38px] bg-slate-100 rounded" />
          </div>
          <div className="w-28 shrink-0 py-3 px-3">
            <div className="h-1.5 bg-slate-200 rounded-full" />
          </div>
          <div className="flex shrink-0">
            {[0, 1, 2].map(j => (
              <div key={j} className="w-[70px] py-3 flex justify-center">
                <div className="h-3 bg-slate-200 rounded w-12" />
              </div>
            ))}
          </div>
          <div className="flex-1 hidden xl:block px-3">
            <div className="h-5 bg-slate-100 rounded-full w-36" />
          </div>
          <div className="w-[168px] shrink-0 py-3 pr-4 flex justify-end gap-2">
            <div className="h-6 bg-slate-100 rounded-lg w-16" />
            <div className="h-6 bg-blue-50 rounded-lg w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
