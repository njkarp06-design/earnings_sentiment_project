'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { getPortfolioItems, getSuggestions } from '@/lib/api';
import FeedCard from '@/components/FeedCard';
import SuggestionCard from '@/components/SuggestionCard';
import SearchOverlay from '@/components/SearchOverlay';
import { usePortfolio } from '@/context/PortfolioContext';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isRecent(callDate) {
  if (!callDate) return false;
  return Date.now() - new Date(callDate + 'T12:00:00').getTime() < SEVEN_DAYS_MS;
}

export default function PortfolioPage() {
  const router = useRouter();
  const { watchlist } = usePortfolio();
  const [items, setItems]           = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [overlayItem, setOverlayItem] = useState(null);

  useEffect(() => {
    if (!getToken()) router.push('/login');
  }, [router]);

  useEffect(() => {
    if (!getToken()) return;
    setLoading(true);
    getPortfolioItems()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [watchlist.length]);

  useEffect(() => {
    if (!getToken()) return;
    getSuggestions().then(setSuggestions).catch(() => setSuggestions([]));
  }, [watchlist.length]);

  if (!getToken()) return null;

  const justReported = items.filter(i => isRecent(i.call_date));
  const rest         = items.filter(i => !isRecent(i.call_date));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">My Portfolio</h1>
        <p className="text-slate-400 mt-1 text-sm">
          {items.length > 0
            ? `${items.length} saved ${items.length === 1 ? 'company' : 'companies'} — bookmark any card on the feed to add more`
            : 'Bookmark any card on the feed to build your portfolio'}
        </p>
      </div>

      {loading && <SkeletonGrid />}

      {!loading && items.length === 0 && (
        <div className="text-center py-16 flex flex-col items-center gap-3">
          <div className="text-slate-600">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <p className="text-slate-400 font-medium">No companies saved yet</p>
          <p className="text-slate-500 text-sm max-w-xs text-center">
            Search for a company on the feed and click the bookmark icon to add it here.
          </p>
          <a href="/" className="mt-2 text-blue-400 hover:text-blue-300 text-sm transition-colors font-medium">
            Browse the feed →
          </a>
        </div>
      )}

      {/* ── Just Reported ────────────────────────────────────────── */}
      {!loading && justReported.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-widest">
              Just Reported
            </h2>
            <span className="text-[11px] text-slate-600">— last 7 days</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {justReported.map(item => (
              <FeedCard
                key={item.filing_id ?? `${item.ticker}-${item.call_date}`}
                item={item}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Rest of portfolio ────────────────────────────────────── */}
      {!loading && rest.length > 0 && (
        <section className="mb-12">
          {justReported.length > 0 && (
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
              Your Portfolio
            </h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map(item => (
              <FeedCard
                key={item.filing_id ?? `${item.ticker}-${item.call_date}`}
                item={item}
                showNextCall
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Suggestions ──────────────────────────────────────────── */}
      {!loading && suggestions.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-200">
              {items.length > 0 ? 'You might also like' : 'Suggested companies'}
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">
              {items.length > 0 ? 'Based on the sectors you follow' : 'Top-rated companies across all sectors'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map(item => (
              <SuggestionCard
                key={item.filing_id ?? item.ticker}
                item={item}
                onInspect={setOverlayItem}
              />
            ))}
          </div>
        </section>
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
