'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { getPortfolioItems } from '@/lib/api';
import FeedCard from '@/components/FeedCard';
import SearchOverlay from '@/components/SearchOverlay';
import { usePortfolio } from '@/context/PortfolioContext';

export default function PortfolioPage() {
  const router = useRouter();
  const { watchlist } = usePortfolio();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [overlayItem, setOverlayItem] = useState(null);

  // Auth guard
  useEffect(() => {
    if (!getToken()) router.push('/login');
  }, [router]);

  // Load portfolio data
  useEffect(() => {
    if (!getToken()) return;
    setLoading(true);
    getPortfolioItems()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [watchlist.length]);  // re-fetch when watchlist size changes

  if (!getToken()) return null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">My Portfolio</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Companies you&apos;ve saved — bookmark any card on the feed to add more
        </p>
      </div>

      {loading && <SkeletonGrid />}

      {!loading && items.length === 0 && (
        <div className="text-center py-24 flex flex-col items-center gap-3">
          <div className="text-slate-600">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <p className="text-slate-400 font-medium">No companies saved yet</p>
          <p className="text-slate-500 text-sm max-w-xs text-center">
            Search for a company on the feed and click the bookmark icon to add it here.
          </p>
          <a
            href="/"
            className="mt-2 text-blue-400 hover:text-blue-300 text-sm transition-colors font-medium"
          >
            Browse the feed →
          </a>
        </div>
      )}

      {!loading && items.length > 0 && (
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
      {Array.from({ length: 3 }).map((_, i) => (
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
