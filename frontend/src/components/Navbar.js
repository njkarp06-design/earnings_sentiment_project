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
            ? 'text-cyan-400 font-medium'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {label}
        {active && (
          <span className="absolute -bottom-[1px] left-0 right-0 h-[1.5px] bg-cyan-400 rounded-full" />
        )}
      </Link>
    );
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#080d1a]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">

        {/* Brand mark */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-6 h-6 rounded-md bg-cyan-500 flex items-center justify-center font-bold text-[10px] text-slate-900 group-hover:bg-cyan-400 transition-colors shrink-0">
            ES
          </div>
          <span className="font-semibold text-slate-100 tracking-tight text-sm">
            EarningsSentiment
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-6">
          {navLink('/', 'Feed')}
          {navLink('/leaderboard', 'Leaderboard')}
          {navLink('/calendar', 'Calendar')}
          {authed && navLink('/portfolio', 'Portfolio')}

          {authed ? (
            <button
              onClick={logout}
              className="text-sm text-slate-500 hover:text-slate-200 transition-colors"
            >
              Logout
            </button>
          ) : (
            <>
              {navLink('/login', 'Login')}
              <Link
                href="/register"
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold px-3.5 py-1.5 rounded-lg text-sm transition-colors"
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
