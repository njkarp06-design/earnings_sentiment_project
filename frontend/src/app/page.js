'use client';
import { useEffect, useRef, useState } from 'react';
import { getFeed, getFeedSince } from '@/lib/api';
import { usePortfolio } from '@/context/PortfolioContext';
import FeedCard from '@/components/FeedCard';
import SearchBar from '@/components/SearchBar';
import SearchOverlay from '@/components/SearchOverlay';
import PulseBar from '@/components/PulseBar';

export default function DashboardPage() {
  const { watchlist, isLoggedIn } = usePortfolio();
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [overlayItem, setOverlayItem] = useState(null);
  const [filter, setFilter]         = useState('all'); // 'all' | 'portfolio'
  const lastFetchRef = useRef(null);

  useEffect(() => {
    getFeed()
      .then(data => { setItems(data); lastFetchRef.current = new Date().toISOString(); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      const since = lastFetchRef.current;
      const fetcher = since ? getFeedSince(since) : getFeed();
      fetcher
        .then(fresh => {
          lastFetchRef.current = new Date().toISOString();
          if (fresh.length > 0) {
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

  // Reset to 'all' if user logs out
  useEffect(() => {
    if (!isLoggedIn) setFilter('all');
  }, [isLoggedIn]);

  const displayed = filter === 'portfolio'
    ? items.filter(i => watchlist.includes(i.ticker))
    : items;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Recent Earnings Calls</h1>
        <p className="text-slate-400 mt-1 text-sm">
          CEO confidence scores and post-call stock reactions
        </p>
      </div>

      <PulseBar />

      <div className="mb-8">
        <SearchBar onResult={setOverlayItem} />
      </div>

      {/* ── Feed filter toggle ───────────────────────────────────── */}
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

      {loading && <SkeletonGrid />}

      {error && (
        <div className="text-center py-16">
          <p className="text-slate-400">Could not load feed</p>
          <p className="text-red-400 text-sm mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && displayed.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          {filter === 'portfolio' ? (
            <>
              <p className="text-lg mb-1">No portfolio companies in the feed yet</p>
              <p className="text-sm">Your saved companies will appear here when they report.</p>
            </>
          ) : (
            <>
              <p className="text-lg mb-1">No earnings calls yet</p>
              <p className="text-sm">Run the ingestor or inject a test transcript to get started.</p>
            </>
          )}
        </div>
      )}

      {!loading && !error && displayed.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map((item) => (
            <FeedCard
              key={item.filing_id ?? `${item.ticker}-${item.call_date}`}
              item={item}
            />
          ))}
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
