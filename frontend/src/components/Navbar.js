'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, clearToken } from '@/lib/auth';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!getToken());
  }, [pathname]);

  const logout = () => {
    clearToken();
    setAuthed(false);
    router.push('/');
  };

  const linkClass = (path) =>
    pathname === path
      ? 'text-white font-medium'
      : 'text-slate-400 hover:text-white transition-colors';

  return (
    <nav className="sticky top-0 z-10 border-b border-slate-700 bg-slate-900/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="text-blue-400 font-semibold text-lg tracking-tight">
          EarningsSentiment
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <Link href="/" className={linkClass('/')}>Feed</Link>
          <Link href="/leaderboard" className={linkClass('/leaderboard')}>Leaderboard</Link>
          <Link href="/calendar" className={linkClass('/calendar')}>Calendar</Link>

          {authed && (
            <Link href="/portfolio" className={linkClass('/portfolio')}>Portfolio</Link>
          )}

          {authed ? (
            <button
              onClick={logout}
              className="text-slate-400 hover:text-white transition-colors"
            >
              Logout
            </button>
          ) : (
            <>
              <Link href="/login" className={linkClass('/login')}>Login</Link>
              <Link
                href="/register"
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
