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

  const navLink = (href, label) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`relative pb-0.5 text-sm transition-colors ${
          active
            ? 'text-blue-700 font-semibold'
            : 'text-slate-500 hover:text-slate-900'
        }`}
      >
        {label}
        {active && (
          <span className="absolute -bottom-[1px] left-0 right-0 h-[1.5px] bg-blue-700 rounded-full" />
        )}
      </Link>
    );
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">

        {/* Brand mark */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-6 h-6 rounded-md bg-blue-700 flex items-center justify-center font-bold text-[10px] text-white group-hover:bg-blue-600 transition-colors shrink-0">
            ES
          </div>
          <span className="font-semibold text-slate-900 tracking-tight text-sm">
            EarningsSentiment
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-6">
          {navLink('/', 'Feed')}
          {navLink('/leaderboard', 'Leaderboard')}
          {navLink('/sectors', 'Sectors')}
          {navLink('/calendar', 'Calendar')}
          {authed && navLink('/portfolio', 'Portfolio')}

          {authed ? (
            <button
              onClick={logout}
              className="text-sm text-slate-400 hover:text-slate-700 transition-colors"
            >
              Logout
            </button>
          ) : (
            <>
              {navLink('/login', 'Login')}
              <Link
                href="/register"
                className="bg-blue-700 hover:bg-blue-600 text-white font-semibold px-3.5 py-1.5 rounded-lg text-sm transition-colors"
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
