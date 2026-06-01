'use client';
import { useEffect, useState } from 'react';
import { getFeed } from '@/lib/api';
import FeedCard from '@/components/FeedCard';
import SearchBar from '@/components/SearchBar';
import SearchOverlay from '@/components/SearchOverlay';

export default function DashboardPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overlayItem, setOverlayItem] = useState(null);

  useEffect(() => {
    getFeed()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Recent Earnings Calls</h1>
        <p className="text-slate-400 mt-1 text-sm">
          CEO confidence scores and post-call stock reactions
        </p>
      </div>

      <div className="mb-8">
        <SearchBar onResult={setOverlayItem} />
      </div>

      {loading && <SkeletonGrid />}

      {error && (
        <div className="text-center py-16">
          <p className="text-slate-400">Could not load feed</p>
          <p className="text-red-400 text-sm mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <p className="text-lg mb-1">No earnings calls yet</p>
          <p className="text-sm">Run the ingestor or inject a test transcript to get started.</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <FeedCard
              key={item.filing_id ?? `${item.ticker}-${item.call_date}`}
              item={item}
              onSearchSelect={setOverlayItem}
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
        <div
          key={i}
          className="bg-slate-800 border border-slate-700 rounded-xl p-5 animate-pulse space-y-3"
        >
          <div className="h-4 bg-slate-700 rounded w-1/3" />
          <div className="h-2 bg-slate-700 rounded w-full" />
          <div className="h-2 bg-slate-700 rounded w-2/3" />
          <div className="h-8 bg-slate-700 rounded w-full" />
        </div>
      ))}
    </div>
  );
}
