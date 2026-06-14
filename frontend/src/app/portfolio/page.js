'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { getPortfolioItems, getSuggestions, getMe, updatePreferences } from '@/lib/api';
import FeedCard from '@/components/FeedCard';
import SuggestionCard from '@/components/SuggestionCard';
import SearchOverlay from '@/components/SearchOverlay';
import Link from 'next/link';
import { usePortfolio } from '@/context/PortfolioContext';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isRecent(callDate) {
  if (!callDate) return false;
  return Date.now() - new Date(callDate + 'T12:00:00').getTime() < SEVEN_DAYS_MS;
}

export default function PortfolioPage() {
  const router = useRouter();
  const { watchlist, isLoggedIn } = usePortfolio();
  const [items, setItems]               = useState([]);
  const [suggestions, setSuggestions]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [overlayItem, setOverlayItem]   = useState(null);
  const [notifPrefs, setNotifPrefs]     = useState(null);
  const [notifForm, setNotifForm]       = useState(false);
  const [notifEmail, setNotifEmail]     = useState('');
  const [notifSaving, setNotifSaving]   = useState(false);
  const [notifError, setNotifError]     = useState(null);

  useEffect(() => {
    if (!isLoggedIn && !getToken()) router.push('/login');
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (!isLoggedIn) return;
    setLoading(true);
    getPortfolioItems()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [isLoggedIn, watchlist.length]);

  useEffect(() => {
    if (!isLoggedIn) return;
    getSuggestions().then(setSuggestions).catch(() => setSuggestions([]));
  }, [isLoggedIn, watchlist.length]);

  useEffect(() => {
    if (!isLoggedIn) return;
    getMe()
      .then(me => setNotifPrefs({ enabled: me.notifications_enabled, email: me.notifications_email || me.email }))
      .catch(() => router.push('/login'));
  }, [isLoggedIn, router]);

  if (!isLoggedIn) return null;

  const handleEnableNotifications = async () => {
    setNotifSaving(true);
    setNotifError(null);
    try {
      const updated = await updatePreferences({ notifications_enabled: true, notifications_email: notifEmail });
      setNotifPrefs({ enabled: updated.notifications_enabled, email: updated.notifications_email || updated.email });
      setNotifForm(false);
    } catch (err) {
      setNotifError(err.message || 'Failed to save');
    } finally {
      setNotifSaving(false);
    }
  };

  const handleDisableNotifications = async () => {
    setNotifSaving(true);
    try {
      const updated = await updatePreferences({ notifications_enabled: false });
      setNotifPrefs({ enabled: false, email: updated.notifications_email || updated.email });
    } catch {
    } finally {
      setNotifSaving(false);
    }
  };

  const openNotifForm = () => {
    setNotifEmail(notifPrefs?.email || '');
    setNotifError(null);
    setNotifForm(true);
  };

  const justReported = items.filter(i => isRecent(i.call_date));
  const rest         = items.filter(i => !isRecent(i.call_date));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">My Portfolio</h1>
        <p className="text-slate-500 mt-1 text-sm">
          {items.length > 0
            ? `${items.length} saved ${items.length === 1 ? 'company' : 'companies'} — bookmark any card on the feed to add more`
            : 'Bookmark any card on the feed to build your portfolio'}
        </p>
      </div>

      {/* ── Notification toggle ──────────────────────────────────── */}
      {notifPrefs && (
        <div className="mb-8">
          {notifPrefs.enabled ? (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-emerald-700 font-medium">Notifications on</span>
                <span className="text-slate-400 text-sm mx-2">·</span>
                <span className="text-slate-600 text-sm truncate">{notifPrefs.email}</span>
              </div>
              <button
                onClick={handleDisableNotifications}
                disabled={notifSaving}
                className="text-xs text-slate-500 hover:text-red-600 transition-colors shrink-0 disabled:opacity-50"
              >
                Turn off
              </button>
            </div>
          ) : notifForm ? (
            <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
              <p className="text-sm text-slate-700 font-medium mb-3">
                Get emailed when your portfolio companies report
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={notifEmail}
                  onChange={e => setNotifEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/15 transition-all"
                />
                <button
                  onClick={handleEnableNotifications}
                  disabled={notifSaving || !notifEmail.trim()}
                  className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors shrink-0"
                >
                  {notifSaving ? 'Saving…' : 'Enable'}
                </button>
                <button
                  onClick={() => setNotifForm(false)}
                  className="text-slate-500 hover:text-slate-700 px-3 py-2 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
              {notifError && <p className="text-red-600 text-xs mt-2">{notifError}</p>}
            </div>
          ) : (
            <button
              onClick={openNotifForm}
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-5 py-3 transition-all shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Turn on notifications
            </button>
          )}
        </div>
      )}

      {loading && <SkeletonGrid />}

      {!loading && items.length === 0 && (
        <div className="text-center py-16 flex flex-col items-center gap-3">
          <div className="text-slate-400">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <p className="text-slate-700 font-medium">No companies saved yet</p>
          <p className="text-slate-500 text-sm max-w-xs text-center">
            Search for a company on the feed and click the bookmark icon to add it here.
          </p>
          <Link href="/" className="mt-2 text-blue-700 hover:text-blue-600 text-sm transition-colors font-medium">
            Browse the feed →
          </Link>
        </div>
      )}

      {/* ── Just Reported ────────────────────────────────────────── */}
      {!loading && justReported.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-[10px] font-semibold text-emerald-600 uppercase tracking-widest">
              Just Reported
            </h2>
            <span className="text-[10px] text-slate-400 font-mono">— last 7 days</span>
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
            <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-4">
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
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
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
        <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse space-y-3 shadow-sm">
          <div className="h-4 bg-slate-200 rounded w-1/3" />
          <div className="h-2 bg-slate-200 rounded w-full" />
          <div className="h-2 bg-slate-200 rounded w-2/3" />
          <div className="h-8 bg-slate-200 rounded w-full" />
        </div>
      ))}
    </div>
  );
}
