'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getToken, clearToken } from '@/lib/auth';
import { getPortfolioItems, addToPortfolio, removeFromPortfolio } from '@/lib/api';

const PortfolioContext = createContext({
  watchlist: [],
  add: async () => {},
  remove: async () => {},
  refresh: async () => {},
  isLoggedIn: false,
  loading: false,
});

export function PortfolioProvider({ children }) {
  const [watchlist, setWatchlist] = useState([]);   // array of ticker strings
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    const token = getToken();
    setIsLoggedIn(!!token);
    if (!token) { setWatchlist([]); return; }
    setLoading(true);
    try {
      const items = await getPortfolioItems();
      setWatchlist(items.map((i) => i.ticker));
    } catch {
      setWatchlist([]);
      // apiFetch clears the token on 401 — re-evaluate isLoggedIn so the UI
      // immediately shows as logged-out if the session expired.
      setIsLoggedIn(!!getToken());
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-check auth + reload watchlist on every navigation (handles login/logout).
  useEffect(() => { refresh(); }, [pathname, refresh]);

  const add = async (ticker) => {
    await addToPortfolio(ticker);
    setWatchlist((prev) => [...new Set([...prev, ticker])]);
  };

  const remove = async (ticker) => {
    await removeFromPortfolio(ticker);
    setWatchlist((prev) => prev.filter((t) => t !== ticker));
  };

  return (
    <PortfolioContext.Provider value={{ watchlist, add, remove, isLoggedIn, loading, refresh }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export const usePortfolio = () => useContext(PortfolioContext);
